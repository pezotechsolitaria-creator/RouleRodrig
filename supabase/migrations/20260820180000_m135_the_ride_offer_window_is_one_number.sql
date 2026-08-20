-- ══════════════════════════════════════════════════════════════════════════
-- M135 — the ride offer window is one number, and the owner can turn it
-- ══════════════════════════════════════════════════════════════════════════
--
-- auto_dispatch_rides carried the same timing constant twice:
--
--     v_res := offer_ride(v_r.id, 10);                     -- how long an offer lives
--     ... or updated_at <= now() - interval '10 minutes'   -- M132's pacing wait
--
-- They MUST agree. If the pacing wait is shorter than the offer window, an empty
-- round is retried while the previous round's offers are still live; if it is
-- longer, the ladder stalls with nobody deciding. Nothing enforced that — two
-- literals a few lines apart, and M132 is what added the second one.
--
-- delivery_settings has carried accept_window_minutes since the delivery engine
-- was built, and sweep_delivery_escalations reads it. dispatch_settings never got
-- the equivalent, so the rides window was unreachable from anywhere: not from
-- /admin, and not from SQL without editing a function body.
--
-- One column, read once, used in both places. Same name and default as the
-- delivery side, because it is the same idea and a second vocabulary for it is
-- how the two drift apart.

alter table public.dispatch_settings
  add column if not exists accept_window_minutes integer not null default 10;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.dispatch_settings'::regclass
                    and conname  = 'dispatch_settings_accept_window_check') then
    -- A zero or negative window would make offer_ride's own
    -- greatest(coalesce(p_minutes,10),1) silently rescue it while the pacing
    -- clause used the raw value — and the two would disagree again, which is
    -- exactly what this migration removes.
    alter table public.dispatch_settings
      add constraint dispatch_settings_accept_window_check
        check (accept_window_minutes between 1 and 120);
  end if;
end $$;

create or replace function public.auto_dispatch_rides(p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_r        record;
  v_offered  integer := 0;
  v_rounds   integer := 0;
  v_failed   integer := 0;
  v_ids      jsonb := '[]'::jsonb;
  v_res      jsonb;
  v_max      integer;
  v_window   integer;
begin
  -- M135 · One read, used by BOTH the offer window and the pacing wait below.
  -- They have to agree: a pacing wait shorter than the window retries an empty
  -- round while the last round's offers are still live; longer, and the ladder
  -- stalls with nobody deciding.
  select cardinality(radius_stages_km) + 1, accept_window_minutes
    into v_max, v_window
    from dispatch_settings where id = 'main';

  for v_r in
    select id, status, offer_rounds, when_kind, scheduled_at
      from ride_requests
     where status in ('new','dispatching')
       -- A scheduled ride is not dispatched the moment it is booked. Thirty
       -- minutes before pickup is the preparation window the brief asked for;
       -- earlier and the driver forgets, later and nobody is free.
       and (when_kind = 'now'
            or scheduled_at is null
            or scheduled_at <= now() + interval '30 minutes')
       -- 'dispatching' only becomes actionable once every live offer is gone.
       -- Until then the drivers we already asked are still deciding.
       and (status = 'new'
            or not exists (select 1 from ride_offers o
                            where o.request_id = ride_requests.id
                              and o.status = 'offered'
                              and o.expires_at > now()))
       -- ── M132 · AN EMPTY ROUND MUST STILL COST THE FULL WINDOW ──────────
       -- The guard above delegates ALL pacing to the existence of a live offer.
       -- A round that reached nobody creates no offer, so that guard is
       -- vacuously true and the ladder gets paced by the cron tick instead.
       --
       -- Only empty rounds are paced. coalesce(...,1) means "assume it reached
       -- someone": a missing event must never freeze a ride.
       and (offer_rounds = 0
            or coalesce((select (e.detail->>'drivers')::int
                           from ride_events e
                          where e.request_id = ride_requests.id
                            and e.action = 'ride.offered'
                          order by e.created_at desc, e.id desc
                          limit 1), 1) > 0
            or updated_at <= now() - make_interval(mins => v_window))
     order by
       -- Somebody standing by a road outranks a booking for Thursday.
       (when_kind = 'now') desc, created_at asc
     limit greatest(coalesce(p_limit, 20), 1)
     for update skip locked
  loop
    -- Expire this ride's dead offers first, so the next round can re-ask anybody
    -- who simply never looked at their phone.
    update ride_offers set status = 'expired', responded_at = now()
     where request_id = v_r.id and status = 'offered' and expires_at <= now();

    if v_r.offer_rounds >= v_max then
      update ride_requests set status = 'no_driver', updated_at = now() where id = v_r.id;
      perform log_ride_event(v_r.id, 'system', null, 'ride.no_driver',
                             v_r.status, 'no_driver',
                             jsonb_build_object('rounds', v_r.offer_rounds));
      v_failed := v_failed + 1;
      v_ids := v_ids || jsonb_build_object('rideId', v_r.id, 'outcome', 'no_driver');
      continue;
    end if;

    v_res := offer_ride(v_r.id, v_window);
    v_rounds := v_rounds + 1;
    v_offered := v_offered + coalesce((v_res->>'offered')::int, 0);
    v_ids := v_ids || jsonb_build_object(
      'rideId', v_r.id,
      'stage', (v_res->>'stage')::int,
      'offered', (v_res->>'offered')::int);
  end loop;

  return jsonb_build_object('rounds', v_rounds, 'offered', v_offered,
                            'exhausted', v_failed, 'rides', v_ids);
end;
$function$;

-- ── VERIFICATION ──────────────────────────────────────────────────────────
do $$
declare v_ride uuid; v_n integer; v_rounds integer; v_res jsonb; v_def text;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='auto_dispatch_rides';
  if v_n <> 1 then raise exception 'M135: auto_dispatch_rides has % overloads', v_n; end if;

  if (select accept_window_minutes from dispatch_settings where id='main') <> 10 then
    raise exception 'M135: the rides window did not default to 10 like the delivery side';
  end if;

  -- The literal is gone from BOTH places. That is the whole point: if somebody
  -- re-introduces one, the two can silently disagree again.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='auto_dispatch_rides';
  if v_def ~ 'interval ''10 minutes''' then
    raise exception 'M135: the pacing wait is still a literal';
  end if;
  if v_def ~ 'offer_ride\(v_r\.id, 10\)' then
    raise exception 'M135: the offer window is still a literal';
  end if;

  begin
    update dispatch_settings set accept_window_minutes = 0 where id='main';
    raise exception 'M135: a zero-minute window was accepted';
  exception when check_violation then null;
  end;

  -- A plpgsql body is not checked until it is called. 60 passengers so no driver
  -- on earth qualifies and the sweep provably cannot reach a real one — the
  -- probe shape M133 exists to remember.
  insert into public.ride_requests (service, pickup_label, customer_name, customer_phone,
                                    status, passengers, when_kind)
  values ('taxi', 'M135 probe', 'M135 probe', '+2305550135', 'new', 60, 'now')
  returning id into v_ride;

  v_res := public.auto_dispatch_rides(50);
  select offer_rounds into v_rounds from public.ride_requests where id = v_ride;
  if v_rounds < 1 then raise exception 'M135: the first round did not run'; end if;

  -- M132's pacing still holds, now driven by the column.
  v_res := public.auto_dispatch_rides(50);
  if (select offer_rounds from public.ride_requests where id = v_ride) <> v_rounds then
    raise exception 'M135: an empty round was retried immediately';
  end if;

  delete from public.ride_offers where request_id = v_ride;
  delete from public.ride_events where request_id = v_ride;
  delete from public.ride_requests where id = v_ride;
  if exists (select 1 from public.ride_requests where id = v_ride) then
    raise exception 'M135: the probe was left behind';
  end if;

  raise notice 'M135 verified: one window, read once, and the owner can turn it.';
end $$;
