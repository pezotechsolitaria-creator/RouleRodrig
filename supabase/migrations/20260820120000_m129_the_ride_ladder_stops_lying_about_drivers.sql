-- ══════════════════════════════════════════════════════════════════════════
-- M129 — the ride ladder stops lying about the driver
-- ══════════════════════════════════════════════════════════════════════════
--
-- ride_candidates ranks a driver on `rides_accepted / rides_offered`, with a
-- 0.70 newcomer floor that disappears once rides_offered reaches 3. Three
-- separate things were feeding that ratio wrongly, all in the same direction:
-- down, for behaviour that was blameless.
--
-- ── 1 · AN OFFER THAT WAS NEVER WRITTEN STILL COUNTED ─────────────────────
-- offer_ride upserts, and the revive clause is guarded:
--
--     on conflict (request_id, driver_id) do update
--       set status='offered', ..., token = <fresh>
--       where ride_offers.status in ('expired','withdrawn');
--
-- If the driver's row is ALREADY 'offered', that WHERE matches nothing. No card,
-- no new token, nothing written. The old code then did two wrong things anyway:
-- it bumped rides_offered, and it emitted a target carrying the OLD token —
-- re-sending a WhatsApp with the link he already has.
--
-- So every extra "Widen the search" charged the driver a denominator for a
-- message that was a duplicate. RETURNING now says whether the row was actually
-- written, and a driver who was not really offered anything is skipped.
--
-- ── 2 · A PHONED ACCEPTANCE WAS NEVER CREDITED ────────────────────────────
-- admin_assign_ride never touched rides_accepted — verified against the
-- deployed body. But on a one-driver island the NORMAL rescue is exactly that:
-- the ladder fails, the owner rings Sam, Sam says yes, the owner presses Assign.
-- Every round already fired bumped rides_offered and nothing ever bumped
-- rides_accepted, so the rescue drove his accept rate toward zero — and once
-- past the `rides_offered < 3` floor he lost the newcomer 0.70 for good, making
-- him rank BELOW a driver who has never been asked.
--
-- The offer was accepted. It was accepted by phone instead of by tap.
--
-- ── 3 · A REOPENED RIDE HAD NO ROUNDS LEFT ────────────────────────────────
-- offer_rounds is a RADIUS CURSOR as much as a budget: ride_candidates indexes
-- radius_stages_km[p_stage]. A ride that exhausted the ladder and is reopened by
-- the owner kept its old count, so it resumed at the island-wide sweep that had
-- just failed — instead of searching NEAR again, which is where a driver who has
-- only now come on shift actually is.
--
-- This is the ONLY reset of offer_rounds anywhere, and it is deliberately gated
-- on an explicit human reopen. Nothing is lost: how many times this ride has
-- stranded is immutable in ride_events (action='ride.no_driver'), and it costs a
-- click every time, so it cannot loop.
--
-- ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────
-- deliveries.offer_rounds is NOT reset, ever. dispatch_candidates sets
-- v_radius := null once the stage passes the last ring, so a reset would rewind
-- a reassigned delivery from an island-wide search back to 3 km. And
-- deliveries.reassignment_count is untouched: M117 keys the stall alert on it,
-- and zeroing it would re-collide exactly the alerts M117 exists to separate.
--
-- driver_cancellations and unresponsive_events keep no decay. They cap at -0.4
-- and -0.3, dispatch_candidates only ranks and never filters on them, and they
-- are the evidence behind deactivating a driver.

-- ── 1 · offer_ride: only charge for an offer that was actually written ─────
create or replace function public.offer_ride(p_request_id uuid, p_minutes integer default 10)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_r     ride_requests%rowtype;
  v_stage integer;
  v_row   record;
  v_out   jsonb := '[]'::jsonb;
  v_n     integer := 0;
  v_exp   timestamptz;
  v_token text;
begin
  select * into v_r from ride_requests where id = p_request_id;
  if not found then raise exception using errcode='RR090', message='Ride not found.'; end if;
  if v_r.status not in ('new','dispatching') then
    raise exception using errcode='RR091', message='This ride is no longer waiting for a driver.';
  end if;

  v_stage := v_r.offer_rounds + 1;
  -- WhatsApp is not a push notification: a driver may not look at their phone for
  -- several minutes. A 30-second window would expire before it was ever read, so
  -- this window is minutes — the one place this deliberately departs from the
  -- brief's timings, because the channel is different.
  v_exp := now() + make_interval(mins => greatest(coalesce(p_minutes, 10), 1));

  for v_row in
    select c.driver_id, c.name, c.whatsapp, c.phone
      from ride_candidates(p_request_id, v_stage, 3) c
     where c.reason_skipped is null
       -- Never ask twice. Declining is a decision; asking again is nagging.
       and not exists (select 1 from ride_offers o
                        where o.request_id = p_request_id and o.driver_id = c.driver_id
                          and o.status in ('declined','withdrawn'))
  loop
    v_token := null;
    insert into ride_offers (request_id, driver_id, expires_at)
    values (p_request_id, v_row.driver_id, v_exp)
    on conflict (request_id, driver_id) do update
      -- Revive an expired row AND mint a fresh token: the old one was printed in
      -- a WhatsApp message that may still be sitting on somebody's screen.
      set status = 'offered', expires_at = excluded.expires_at,
          responded_at = null, offered_at = now(),
          token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
      where ride_offers.status in ('expired','withdrawn')
    returning token into v_token;

    -- M129 · NOTHING WAS WRITTEN.
    -- His row is still 'offered', so the DO UPDATE's WHERE matched nothing: no
    -- card, no fresh token. The old code counted him anyway and re-sent the SAME
    -- link he already has. Skip him, and report honestly.
    if v_token is null then continue; end if;

    update taxi_drivers
       set rides_offered = rides_offered + 1, last_offered_at = now()
     where id = v_row.driver_id;

    v_out := v_out || jsonb_build_object(
      'driverId', v_row.driver_id, 'name', v_row.name,
      'whatsapp', coalesce(v_row.whatsapp, v_row.phone),
      'token', v_token);
    v_n := v_n + 1;
  end loop;

  update ride_requests
     set offer_rounds = v_stage,
         status = case when v_n > 0 then 'dispatching'
                       when v_stage > (select cardinality(radius_stages_km) + 1
                                         from dispatch_settings where id='main')
                         then 'no_driver'
                       else status end,
         updated_at = now()
   where id = p_request_id;

  perform log_ride_event(p_request_id, 'system', null, 'ride.offered',
    v_r.status, (select status from ride_requests where id = p_request_id),
    jsonb_build_object('stage', v_stage, 'drivers', v_n));

  return jsonb_build_object('ok', true, 'stage', v_stage, 'offered', v_n, 'targets', v_out);
end;
$function$;

-- ── 2 · admin_assign_ride: a phoned acceptance is still an acceptance ──────
create or replace function public.admin_assign_ride(p_request_id uuid, p_driver_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_r ride_requests%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if not exists (select 1 from taxi_drivers where id = p_driver_id and active) then
    raise exception using errcode='RR092', message='That driver is not active.';
  end if;

  update ride_requests
     set driver_id = p_driver_id, status='assigned', assigned_at=now(), updated_at=now()
   where id = p_request_id and driver_id is null
     and status in ('new','dispatching','no_driver')
  returning * into v_r;

  if not found then
    return jsonb_build_object('ok', false, 'reason','taken',
      'message','This ride already has a driver.');
  end if;

  update ride_offers set status='withdrawn', responded_at=now()
   where request_id = p_request_id and status='offered';

  -- M129 · The offer WAS accepted — by phone instead of by tap. Every round the
  -- ladder already fired bumped rides_offered and nothing bumped
  -- rides_accepted, so on a one-driver island the ordinary rescue drove his
  -- accept rate toward zero for behaviour that was blameless. The ratio stays
  -- lifetime; it just stops lying.
  update taxi_drivers set rides_accepted = rides_accepted + 1 where id = p_driver_id;

  perform log_ride_event(p_request_id, 'admin', null, 'ride.assigned_manually', null, 'assigned',
                         jsonb_build_object('driverId', p_driver_id));
  return jsonb_build_object('ok', true, 'driverId', p_driver_id);
end;
$function$;

-- ── 3 · admin_set_ride_status: a reopen restarts the ladder ────────────────
create or replace function public.admin_set_ride_status(p_request_id uuid, p_status text, p_reason text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_r ride_requests%rowtype; v_ok boolean;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  select * into v_r from ride_requests where id = p_request_id;
  if not found then raise exception using errcode='RR090', message='Ride not found.'; end if;

  v_ok := case p_status
    when 'driver_on_way' then v_r.status = 'assigned'
    when 'arrived'       then v_r.status in ('assigned','driver_on_way')
    when 'on_trip'       then v_r.status in ('assigned','driver_on_way','arrived')
    when 'completed'     then v_r.status = 'on_trip'
    when 'cancelled'     then v_r.status not in ('completed','cancelled')
    when 'new'           then v_r.status in ('dispatching','no_driver')
    else false end;
  if not v_ok then
    raise exception using errcode='RR093',
      message = format('Cannot go from %s to %s.', v_r.status, p_status);
  end if;

  update ride_requests
     set status = p_status,
         started_at   = case when p_status='on_trip'   then now() else started_at end,
         completed_at = case when p_status='completed' then now() else completed_at end,
         cancelled_at = case when p_status='cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_status='cancelled' then p_reason else cancel_reason end,
         cancelled_by  = case when p_status='cancelled' then 'admin' else cancelled_by end,
         -- Cancelling releases the driver so dispatch can resume without the
         -- customer having to book again.
         driver_id = case when p_status='cancelled' then null else driver_id end,
         -- M129 · THE ONLY RESET OF offer_rounds ANYWHERE.
         -- A reopen is the owner asserting the world changed: a driver came on
         -- shift, or he found one. offer_rounds is a radius cursor as much as a
         -- budget, so restarting it searches NEAR again — where a man who has
         -- just signed on will be — instead of re-running the island-wide sweep
         -- that already failed. The lifetime tally lives in ride_events.
         offer_rounds = case when p_status='new' then 0 else offer_rounds end,
         updated_at = now()
   where id = p_request_id;

  if p_status = 'completed' then
    update taxi_drivers set rides_completed = rides_completed + 1 where id = v_r.driver_id;
  end if;
  if p_status = 'cancelled' then
    update ride_offers set status='withdrawn', responded_at=now()
     where request_id = p_request_id and status='offered';
  end if;

  perform log_ride_event(p_request_id, 'admin', null, 'ride.status', v_r.status, p_status,
                         case when p_reason is null then null else jsonb_build_object('reason', p_reason) end);
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$function$;

-- ── VERIFICATION ──────────────────────────────────────────────────────────
do $$
declare
  v_d uuid; v_ride uuid; v_reopen uuid;
  v_off1 int; v_off2 int; v_acc int; v_rounds int; v_res jsonb;
begin
  for v_off1 in
    select 1 from (values ('offer_ride'),('admin_assign_ride'),('admin_set_ride_status')) t(nm)
     where (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname = t.nm) <> 1
  loop
    raise exception 'M129: a function has the wrong number of overloads';
  end loop;

  insert into public.taxi_drivers (name, phone, vehicle, active, availability,
                                   handles_taxi, handles_airport, handles_transfer)
  values ('M129 probe', '+2305550129', 'probe', true, 'available', true, true, true)
  returning id into v_d;

  insert into public.ride_requests (service, pickup_label, customer_name, customer_phone, status, passengers)
  values ('taxi', 'M129 probe', 'M129 probe', '+2305550129', 'new', 1)
  returning id into v_ride;

  -- Round one really offers him something.
  v_res := public.offer_ride(v_ride, 10);
  if (v_res->>'offered')::int < 1 then
    raise exception 'M129: the probe driver was never offered the ride: %', v_res;
  end if;
  select rides_offered into v_off1 from public.taxi_drivers where id = v_d;

  -- ROUND TWO IS THE FIX. His row is still 'offered', so the upsert writes
  -- nothing — and he must NOT be charged a denominator for it.
  v_res := public.offer_ride(v_ride, 10);
  select rides_offered into v_off2 from public.taxi_drivers where id = v_d;
  if (v_res->>'offered')::int <> 0 then
    raise exception 'M129: a round that wrote nothing still reported % offers', v_res->>'offered';
  end if;
  if v_off2 <> v_off1 then
    raise exception 'M129: rides_offered rose from % to % for an offer that was never written', v_off1, v_off2;
  end if;

  -- A phoned acceptance is credited.
  select rides_accepted into v_acc from public.taxi_drivers where id = v_d;
  v_res := public.admin_assign_ride(v_ride, v_d);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'M129: admin_assign_ride refused: %', v_res;
  end if;
  if (select rides_accepted from public.taxi_drivers where id = v_d) <> v_acc + 1 then
    raise exception 'M129: a phoned acceptance was not credited';
  end if;

  -- A reopen restarts the ladder, and only a reopen.
  insert into public.ride_requests (service, pickup_label, customer_name, customer_phone,
                                    status, passengers, offer_rounds)
  values ('taxi', 'M129 probe', 'M129 probe', '+2305550129', 'no_driver', 1, 4)
  returning id into v_reopen;

  v_res := public.admin_set_ride_status(v_reopen, 'new');
  select offer_rounds into v_rounds from public.ride_requests where id = v_reopen;
  if v_rounds <> 0 then
    raise exception 'M129: a reopened ride kept % rounds', v_rounds;
  end if;

  -- ...and cancelling does NOT reset it.
  update public.ride_requests set status='no_driver', offer_rounds=4 where id = v_reopen;
  v_res := public.admin_set_ride_status(v_reopen, 'cancelled', 'M129 probe');
  select offer_rounds into v_rounds from public.ride_requests where id = v_reopen;
  if v_rounds <> 4 then
    raise exception 'M129: cancelling reset offer_rounds to % — only a reopen may', v_rounds;
  end if;

  delete from public.ride_offers where request_id in (v_ride, v_reopen);
  delete from public.ride_events where request_id in (v_ride, v_reopen);
  delete from public.ride_requests where id in (v_ride, v_reopen);
  delete from public.taxi_drivers where id = v_d;
  if exists (select 1 from public.taxi_drivers where id = v_d)
  or exists (select 1 from public.ride_requests where id in (v_ride, v_reopen)) then
    raise exception 'M129: the probe was left behind';
  end if;

  raise notice 'M129 verified: an unwritten offer costs nothing, a phoned yes counts, a reopen starts near again.';
end $$;
