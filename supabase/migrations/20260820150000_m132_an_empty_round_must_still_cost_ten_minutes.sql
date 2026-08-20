-- ══════════════════════════════════════════════════════════════════════════
-- M132 — an empty round must still cost ten minutes
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE MEASUREMENT ───────────────────────────────────────────────────────
-- Ride RR-26A506, 2026-08-14, from its own ride_events:
--
--   12:12:34  ride.requested
--   12:13:10  ride.offered  {"stage":1,"drivers":0}
--   12:14:14  ride.offered  {"stage":2,"drivers":0}
--   12:15:27  ride.offered  {"stage":3,"drivers":0}
--   12:16:14  ride.offered  {"stage":4,"drivers":0}
--   12:17:10  ride.no_driver {"rounds":4}
--
-- Four rounds in three minutes four seconds, one per cron tick. A ride that DID
-- reach drivers takes about thirty-four minutes for the same four rounds. Same
-- ladder, two completely different pacings.
--
-- ── WHY ───────────────────────────────────────────────────────────────────
-- All pacing is delegated to one clause:
--
--     and (status = 'new'
--          or not exists (select 1 from ride_offers o
--                          where o.request_id = ride_requests.id
--                            and o.status = 'offered'
--                            and o.expires_at > now()))
--
-- "Wait until the drivers we asked have stopped deciding." That is exactly
-- right — when somebody was asked. A round that reached NOBODY writes no
-- ride_offers row at all, so the subquery finds nothing, the guard is vacuously
-- true, and the ride is picked up again on the very next tick. Sixty seconds
-- instead of ten minutes.
--
-- The counter was never wrong. An empty round was simply free.
--
-- ── WHAT THAT COSTS ───────────────────────────────────────────────────────
-- The ladder is sized 4 rounds x 10 minutes = forty minutes: long enough for
-- the owner to read the roster alarm, ring somebody and get him on shift. When
-- every round is empty — which is precisely the case where nobody is on shift —
-- it collapses to three minutes and the ride is dead before the owner has
-- looked at his phone. The one situation the window exists for is the one
-- situation it does not happen in.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
-- One clause. Pace ONLY the empty rounds, from the last round's own event.
--
-- A round that reached somebody keeps today's behaviour exactly: a decline that
-- empties the board still re-offers at once (decline_ride_by_token moves
-- dispatching -> new). And coalesce(..., 1) reads a missing event as "it
-- reached someone", because a lost log line must never freeze a ride.
--
-- No counter is touched. v_max and radius_stages_km are untouched.

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
begin
  select cardinality(radius_stages_km) + 1 into v_max from dispatch_settings where id = 'main';

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
       -- ── M132 · AN EMPTY ROUND MUST STILL COST TEN MINUTES ──────────────
       -- The guard above delegates ALL pacing to the existence of a live offer.
       -- A round that reached nobody creates no offer, so that guard is
       -- vacuously true and the ladder gets paced by the cron tick instead of
       -- by the ten-minute window it was sized for.
       --
       -- Only empty rounds are paced. A round that reached somebody keeps the
       -- old behaviour. coalesce(...,1) means "assume it reached someone": a
       -- missing event must never freeze a ride.
       --
       -- The ten minutes matches the window offer_ride is called with below.
       and (offer_rounds = 0
            or coalesce((select (e.detail->>'drivers')::int
                           from ride_events e
                          where e.request_id = ride_requests.id
                            and e.action = 'ride.offered'
                          order by e.created_at desc, e.id desc
                          limit 1), 1) > 0
            or updated_at <= now() - interval '10 minutes')
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

    v_res := offer_ride(v_r.id, 10);
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
declare
  v_ride uuid; v_n integer; v_res jsonb; v_rounds integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='auto_dispatch_rides';
  if v_n <> 1 then raise exception 'M132: auto_dispatch_rides has % overloads', v_n; end if;

  -- 60 passengers (the CHECK ceiling) so NO driver can serve it:
  -- ride_candidates skips everybody with 'seats N < 60 passengers'. Every
  -- round is then genuinely empty — the case this migration is about — and the
  -- probe never touches a real driver's counters or creates a real offer.
  insert into public.ride_requests (service, pickup_label, customer_name, customer_phone,
                                    status, passengers, when_kind)
  values ('taxi', 'M132 probe', 'M132 probe', '+2305550132', 'new', 60, 'now')
  returning id into v_ride;

  -- Round one runs: offer_rounds is 0, so the new clause lets it straight through.
  v_res := public.auto_dispatch_rides(50);
  select offer_rounds into v_rounds from public.ride_requests where id = v_ride;
  if v_rounds < 1 then
    raise exception 'M132: the first round did not run — the pacing clause blocks a new ride';
  end if;

  -- THE POINT. That round reached nobody, so before this migration the next
  -- cron tick would have advanced the ladder again immediately.
  v_res := public.auto_dispatch_rides(50);
  if (select offer_rounds from public.ride_requests where id = v_ride) <> v_rounds then
    raise exception 'M132: a second sweep one second later advanced the ladder from % to %',
      v_rounds, (select offer_rounds from public.ride_requests where id = v_ride);
  end if;

  -- ...and once the ten minutes have passed, it moves again. Rewinding
  -- updated_at is the only way to test a clock without waiting for one.
  update public.ride_requests set updated_at = now() - interval '11 minutes' where id = v_ride;
  update public.ride_offers set status='expired', expires_at = now() - interval '1 minute'
   where request_id = v_ride and status='offered';
  v_res := public.auto_dispatch_rides(50);
  if (select offer_rounds from public.ride_requests where id = v_ride) <= v_rounds then
    raise exception 'M132: the ladder never resumed after the window elapsed';
  end if;

  delete from public.ride_offers where request_id = v_ride;
  delete from public.ride_events where request_id = v_ride;
  delete from public.ride_requests where id = v_ride;
  if exists (select 1 from public.ride_requests where id = v_ride) then
    raise exception 'M132: the probe was left behind';
  end if;

  raise notice 'M132 verified: an empty round now waits its ten minutes.';
end $$;
