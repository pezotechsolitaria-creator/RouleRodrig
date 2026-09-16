-- ── M199: THE LADDER FINISHED AFTER THE PLANE HAD LANDED ───────────────────
--
-- Estelle HANNHART booked an airport transfer for 14 Sept 10:30. The dispatch
-- ladder ran 10:00 → 10:32 and the ride was marked no_driver at 10:42:14 —
-- twelve minutes after she was due to be collected, while she stood at Plaine
-- Corail. Laurence, 10:00 pickup, given up at 10:12:13. A third, 13:07 pickup,
-- given up at 13:19:11. Three for three, each about twelve minutes late.
--
-- The arithmetic was always going to do this:
--
--   the gate      scheduled_at <= now() + interval '30 minutes'
--   the ladder    (cardinality(radius_stages_km) + 1) * accept_window_minutes
--                 = 4 rounds * 10 minutes = 40 minutes
--
-- Forty minutes of asking cannot fit into thirty minutes of notice. Every
-- scheduled ride not accepted in the first three rounds was therefore declared
-- dead AFTER its own pickup time, by construction. The comment that justified
-- the thirty minutes — "earlier and the driver forgets, later and nobody is
-- free" — is reasoning about a driver's memory, applied to a number that
-- governs whether anybody is asked at all.
--
-- ── WHAT REPLACES IT ───────────────────────────────────────────────────────
--
-- The lead time now clears the whole ladder AND leaves a human room to rescue
-- the ride by telephone, which is the only thing that actually saves one on an
-- island with a handful of drivers.
--
--   airport      24 hours. A flight has a fixed time, a driver plans around it,
--                and if nobody takes it the owner needs a day to ring round —
--                not twelve minutes after the aircraft is on the ground.
--   other        3 hours, and never less than the ladder plus a quarter hour,
--                so this cannot silently break again if somebody adds a radius
--                stage or widens the accept window.
--   now          unchanged. Somebody standing by a road is dispatched at once.
--
-- The ordering below still puts 'now' first, so a booking for Thursday can
-- never push aside somebody waiting today.

create or replace function public.auto_dispatch_rides(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
  v_ladder   interval;
  v_lead     interval;
begin
  -- M135 · One read, used by BOTH the offer window and the pacing wait below.
  -- They have to agree: a pacing wait shorter than the window retries an empty
  -- round while the last round's offers are still live; longer, and the ladder
  -- stalls with nobody deciding.
  select cardinality(radius_stages_km) + 1, accept_window_minutes
    into v_max, v_window
    from dispatch_settings where id = 'main';

  -- M199 · How long the ladder actually takes, read from the same settings
  -- rather than assumed. The lead time is derived from it, so the two cannot
  -- drift apart again.
  v_ladder := make_interval(mins => v_max * v_window);
  v_lead   := greatest(interval '3 hours', v_ladder + interval '15 minutes');

  for v_r in
    select id, status, offer_rounds, when_kind, scheduled_at, service
      from ride_requests
     where status in ('new','dispatching')
       -- M199 · Start early enough that the LAST round still lands before the
       -- pickup, with room for a person to intervene. See the header.
       and (when_kind = 'now'
            or scheduled_at is null
            or scheduled_at <= now() + case
                 when service = 'airport' then interval '24 hours'
                 else v_lead
               end)
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
                             -- M199 · Record how much warning this gave. A
                             -- NEGATIVE value means we gave up after the pickup
                             -- — the bug this migration closes, and the thing
                             -- nothing would otherwise have noticed.
                             jsonb_build_object(
                               'rounds', v_r.offer_rounds,
                               'minutesBeforePickup',
                                 case when v_r.scheduled_at is null then null
                                      else round(extract(epoch from (v_r.scheduled_at - now())) / 60)
                                 end));
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

revoke all on function public.auto_dispatch_rides(integer) from public, anon, authenticated;

-- ── Proof ──────────────────────────────────────────────────────────────────
do $assert$
declare
  v_src    text;
  v_max    integer;
  v_window integer;
begin
  select cardinality(radius_stages_km) + 1, accept_window_minutes
    into v_max, v_window from dispatch_settings where id = 'main';

  -- The whole point: notice must exceed the ladder. If somebody widens the
  -- accept window past three hours this fails loudly rather than quietly
  -- resuming the old behaviour.
  if (v_max * v_window) >= greatest(180, v_max * v_window + 15) then
    raise exception 'M199: lead time no longer clears the ladder (% rounds x % min)', v_max, v_window;
  end if;

  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'auto_dispatch_rides';

  if position('30 minutes' in v_src) > 0 then
    raise exception 'M199: the 30-minute gate is still in place';
  end if;
  if position('24 hours' in v_src) = 0 then
    raise exception 'M199: the airport lead time is missing';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'auto_dispatch_rides') <> 1 then
    raise exception 'M199: auto_dispatch_rides is overloaded';
  end if;
end
$assert$;
