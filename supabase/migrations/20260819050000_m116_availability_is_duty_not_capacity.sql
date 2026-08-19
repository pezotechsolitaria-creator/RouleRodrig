-- ══════════════════════════════════════════════════════════════════════════
-- M116 — availability is DUTY. Capacity is a COUNT. They are not the same word.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE REPORT ────────────────────────────────────────────────────────────
-- "A driver in 'busy' shows as online in the app but dispatch requires
--  'available', so they get nothing."
--
-- True, and the UI is the innocent half. The real defect is that ONE question
-- was being answered by TWO mechanisms that disagreed.
--
-- ── WHAT delivery_drivers.availability IS FOR ─────────────────────────────
-- It answers exactly one thing: HAS THIS DRIVER ASKED FOR WORK?
--
--   offline    no. Stop sending me jobs.
--   available  yes, and I am holding nothing.
--   busy       yes, and I am holding something.
--
-- 'busy' is DERIVED, never chosen. set_driver_availability takes a boolean —
-- the driver has two intents, on and off — and the third value is computed from
-- whether they currently hold a delivery. So 'busy' is not a second kind of
-- "off". It is "on duty, with a job in hand".
--
-- ── THE BUG ───────────────────────────────────────────────────────────────
-- dispatch_candidates filtered:
--
--     and d.availability = 'available'
--
-- while, four lines later, in the same WHERE clause, it ALSO filtered:
--
--     and (select count(*) from deliveries dl where dl.driver_id = d.id
--           and dl.status in (...)) < v_dset.max_active_deliveries
--
-- Two capacity gates, at different numbers, and the stricter one wins silently.
-- accept_delivery writes 'busy' on the FIRST job, so `= 'available'` capped
-- every driver at one delivery no matter what the second line said.
--
-- Production has max_active_deliveries = 2. That setting has therefore never
-- done anything. The owner can set it to 2, or 5, and every driver still gets
-- exactly one job at a time.
--
-- ── THE PROOF THAT THIS IS A BUG AND NOT A DESIGN ─────────────────────────
-- Two independent pieces of evidence, both already in the deployed code:
--
-- 1. The ranking term in dispatch_candidates itself:
--
--      + v_set.weight_workload * greatest(0, 1 - (w.jobs / max_active_deliveries))
--
--    Every row that survives `= 'available'` has jobs = 0, so this term is the
--    constant 20/100 for every candidate. Twenty percent of the ranking weight
--    is dead arithmetic. Nobody writes a workload score for a pool that can
--    only ever contain the unloaded.
--
-- 2. driver_dashboard — the driver's OWN screen — already gets it right:
--
--      and v_d.availability <> 'offline'
--      and (select count(*) ...) < v_set.max_active_deliveries
--
--    Duty, then capacity, as two separate questions. The dashboard was written
--    to the correct model. dispatch_candidates is the outlier, not the standard,
--    and this migration brings the outlier into line rather than inventing
--    something new.
--
-- ── THE WORSE HALF: DRIVERS STUCK IN 'busy' FOREVER ───────────────────────
-- sweep_delivery_escalations runs every 60s and contains NO `update
-- delivery_drivers` at all. Two of its branches move a delivery to a status
-- OUTSIDE the six-status active set:
--
--   branch 2 (else)  -> 'driver_unresponsive'
--   branch 3         -> 'requires_admin'
--
-- The driver keeps availability = 'busy' and now counts zero active jobs. Under
-- the old predicate that made them permanently invisible to dispatch, while
-- their own app cheerfully rendered a green dot and "Online — taking
-- deliveries" — because the job had also vanished from their screen, which
-- filters on the same six statuses.
--
-- Timing, from live settings: delivery_window_minutes 90 + unresponsive_after
-- 25 = branch 3 fires 115 minutes after acceptance. A slow afternoon on
-- Rodrigues, not an edge case. It has not bitten yet only because no delivery
-- has ever been accepted.
--
-- ── THE SHAPE OF THE FIX ──────────────────────────────────────────────────
--   ONE function computes the derived value.       sync_driver_availability
--   Readers ask about DUTY.                        <> 'offline'
--   Capacity stays a count against the owner's setting.
--
-- Six call sites each had their own inline rule for recomputing availability
-- and three of them were wrong in different directions. Now there is one.
--
-- ── EXPLICITLY NOT THE TAXI SIDE ──────────────────────────────────────────
-- taxi_drivers.availability uses the same word for the OPPOSITE meaning:
-- there 'busy' is a lockout the office sets by hand, which the driver cannot
-- clear and dispatch must obey (see set_taxi_availability_by_token, whose own
-- comment says so). Applying this change there would silently defeat it. The
-- two domains also differ in type (text + CHECK {available,busy,off} vs the
-- enum {offline,available,busy} — 'offline' is not even legal in taxi_drivers)
-- and in actor. They stay separate. See lib/delivery/availability.ts.

-- ── 1 · the one place the derived value is computed ────────────────────────
create or replace function public.sync_driver_availability(p_driver_id uuid)
returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  if p_driver_id is null then return; end if;

  update delivery_drivers d
     set availability = case
           -- DUTY IS THE DRIVER'S CHOICE AND NOTHING HERE MAY OVERRIDE IT.
           -- A driver who signed off and then finishes their last drop stays
           -- signed off. Being handed fresh offers at midnight because you
           -- finally delivered the last parcel is not a reward.
           when d.availability = 'offline' then 'offline'::driver_availability
           when exists (
             select 1 from deliveries dl
              where dl.driver_id = d.id
                and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                  'picked_up','out_for_delivery','arrived')
           ) then 'busy'::driver_availability
           else 'available'::driver_availability
         end
   where d.id = p_driver_id;
end;
$function$;

-- Internal helper, called only from SECURITY DEFINER bodies owned by postgres.
-- Supabase's default grants reach anon, so an explicit revoke is the boundary —
-- omitting it does not leave it locked, it leaves it open.
revoke all on function public.sync_driver_availability(uuid) from public, anon, authenticated;

-- ── 2 · the driver's own switch ────────────────────────────────────────────
-- Body unchanged except that the derivation moves out. It used to inline the
-- same three-way CASE that five other functions each spelled differently.
create or replace function public.set_driver_availability(p_online boolean)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_d delivery_drivers%rowtype;
  v_active int;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    raise exception using errcode = 'RR083', message = 'Your account is not active for deliveries.';
  end if;

  select count(*) into v_active from deliveries
   where driver_id = v_d.id
     and status in ('assigned','going_to_pickup','arrived_at_pickup','picked_up','out_for_delivery','arrived');

  -- Going offline does NOT abandon work in hand. It stops new offers; jobs
  -- already accepted stay theirs, because releasing them silently is how a
  -- customer's delivery disappears.
  --
  -- This writes DUTY only. Whether that reads as 'available' or 'busy' is
  -- derived, in the one function that derives it.
  update delivery_drivers
     set availability = (case when p_online then 'available' else 'offline' end)::driver_availability
   where id = v_d.id;
  perform sync_driver_availability(v_d.id);

  return jsonb_build_object('ok', true,
    'availability', (select availability from delivery_drivers where id = v_d.id),
    'activeDeliveries', v_active);
end;
$function$;

-- ── 3 · dispatch asks about DUTY, and counts capacity separately ───────────
-- ONE line changes. The 7-arg signature (p_size_class, from M103) is preserved
-- byte-for-byte: a differing signature would create a competing OVERLOAD rather
-- than replacing this, and vehicle matching would silently stop working.
create or replace function public.dispatch_candidates(
  p_lat double precision, p_lng double precision, p_zone_id uuid default null,
  p_stage integer default 1, p_limit integer default 20,
  p_exclude uuid[] default '{}'::uuid[], p_size_class text default null)
returns table(driver_id uuid, full_name text, distance_km double precision,
              eta_minutes integer, active_jobs integer, accept_rate numeric,
              idle_minutes integer, score numeric, location_age_seconds integer)
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_set    dispatch_settings%rowtype;
  v_dset   delivery_settings%rowtype;
  v_radius double precision;
  v_lat    double precision := p_lat;
  v_lng    double precision := p_lng;
  v_deg    double precision;
  v_wsum   numeric;
begin
  select * into v_set  from dispatch_settings where id = 'main';
  select * into v_dset from delivery_settings where id = 'main';

  v_radius := case
    when p_stage is null or p_stage < 1 then v_set.radius_stages_km[1]
    when p_stage > cardinality(v_set.radius_stages_km) then null
    else v_set.radius_stages_km[p_stage]
  end;

  v_deg := case when v_radius is null then null
                else (v_radius * v_set.road_factor) / 111.0 end;

  v_wsum := greatest(
    v_set.weight_proximity + v_set.weight_reliability
      + v_set.weight_workload + v_set.weight_idle,
    0.0001);

  return query
  with eligible as (
    select
      d.id, d.full_name,
      case when l.lat is null or v_lat is null then null
           else 111.045 * sqrt(
                  power(l.lat - v_lat, 2)
                + power((l.lng - v_lng) * cos(radians((l.lat + v_lat) / 2)), 2))
      end as raw_km,
      case when l.recorded_at is null then null
           else extract(epoch from (now() - l.recorded_at))::integer end as loc_age,
      (select count(*)::integer from deliveries dl
        where dl.driver_id = d.id
          and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                            'picked_up','out_for_delivery','arrived')) as jobs,
      case
        when coalesce(m.offers_received, 0) = 0 then 0.70::numeric
        else greatest(0::numeric, round(
          (coalesce(m.offers_accepted, 0)::numeric
             / greatest(coalesce(m.offers_received, 0), 1)::numeric)
          - least(0.4, coalesce(m.driver_cancellations, 0)::numeric * 0.05)
          - least(0.3, coalesce(m.unresponsive_events, 0)::numeric * 0.05)
        , 3))
      end as reliability,
      coalesce(extract(epoch from (now() - (
        select max(o.offered_at) from delivery_offers o where o.driver_id = d.id
      )))::integer / 60, 1440)::integer as idle_min
    from delivery_drivers d
    left join driver_locations l on l.driver_kind = 'delivery' and l.driver_id = d.id
    left join driver_metrics   m on m.driver_id = d.id
    where d.status = 'approved'
      -- ── M116 ─────────────────────────────────────────────────────────────
      -- DUTY, not capacity. This used to read `= 'available'`, which excluded
      -- every driver already holding one job — making the capacity subquery
      -- below unreachable, max_active_deliveries a dead setting, and the
      -- workload term in the score a constant.
      and d.availability <> 'offline'
      and not (d.id = any (coalesce(p_exclude, '{}'::uuid[])))
      and (cardinality(d.service_zone_ids) = 0
           or p_zone_id is null
           or p_zone_id = any (d.service_zone_ids))
      -- THE capacity authority, and always was.
      and (select count(*) from deliveries dl
            where dl.driver_id = d.id
              and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                'picked_up','out_for_delivery','arrived'))
          < v_dset.max_active_deliveries
      and vehicle_can_carry(d.vehicle_type, p_size_class)
      and (v_deg is null or l.driver_id is null
           or (l.lat between v_lat - v_deg and v_lat + v_deg
               and l.lng between v_lng - v_deg and v_lng + v_deg))
  ),
  within as (
    select e.*, (e.raw_km * v_set.road_factor)::numeric as road_km
      from eligible e
     where v_radius is null or e.raw_km is null or e.raw_km <= v_radius
  )
  select
    w.id, w.full_name,
    round(w.road_km, 2)::double precision,
    case when w.road_km is null then null
         else ceil(w.road_km / v_set.avg_speed_kmh * 60)::integer end,
    w.jobs, w.reliability, w.idle_min,
    round((
        v_set.weight_proximity * coalesce(greatest(0::numeric, 1 - (w.road_km / 18)), 0.25)
      + v_set.weight_reliability * w.reliability
      + v_set.weight_workload * greatest(0::numeric, 1 - (w.jobs::numeric
          / greatest(v_dset.max_active_deliveries, 1)))
      + v_set.weight_idle * least(1::numeric, w.idle_min::numeric / 120)
    ) / v_wsum, 4)::numeric,
    w.loc_age
  from within w
  order by 8 desc, 3 asc nulls last, w.idle_min desc
  limit greatest(coalesce(p_limit, 20), 1);
end;
$function$;

-- ── 4 · the alert channels follow dispatch ─────────────────────────────────
-- An offer row only EXISTS because dispatch_candidates already applied the
-- capacity cap. Re-checking `= 'available'` here second-guessed that and
-- silently swallowed the notification for a legitimate second job: the offer
-- appeared in the app, but no phone ever rang.
create or replace function public.driver_push_targets(p_delivery_id uuid)
returns table(endpoint text, p256dh text, auth text, driver_name text)
language sql security definer set search_path to 'public','pg_temp'
as $function$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_offers o
    join delivery_drivers d on d.id = o.driver_id
    join push_subscriptions s on s.user_id = d.user_id
   where o.delivery_id = p_delivery_id
     and o.status = 'offered'
     and o.expires_at > now()
     and d.status = 'approved'
     and d.availability <> 'offline';
$function$;

create or replace function public.driver_whatsapp_targets(p_delivery_id uuid)
returns table(phone text, api_key text, driver_name text)
language sql security definer set search_path to 'public','pg_temp'
as $function$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_offers o
    join delivery_drivers d on d.id = o.driver_id
    join driver_contact_channels c on c.driver_id = d.id
   where o.delivery_id = p_delivery_id
     and o.status = 'offered'
     and o.expires_at > now()
     and d.status = 'approved'
     and d.availability <> 'offline'
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> '';
$function$;

-- ── 5 · every place that used to recompute availability by hand ────────────
create or replace function public.accept_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_driver delivery_drivers%rowtype;
  v_set    delivery_settings%rowtype;
  v_active integer;
  v_d      deliveries%rowtype;
begin
  v_driver := current_driver();
  if v_driver.status <> 'approved' then
    raise exception using errcode = 'RR083', message = 'Your account is not active for deliveries.';
  end if;

  select * into v_set from delivery_settings where id = 'main';
  select count(*) into v_active from deliveries
   where driver_id = v_driver.id
     and status in ('assigned','going_to_pickup','arrived_at_pickup','picked_up','out_for_delivery','arrived');
  if v_active >= v_set.max_active_deliveries then
    raise exception using errcode = 'RR084',
      message = format('You already have %s active deliveries.', v_active);
  end if;

  -- Must have been offered it: a driver cannot accept a job they were never
  -- shown by guessing its id.
  if not exists (select 1 from delivery_offers
                  where delivery_id = p_delivery_id and driver_id = v_driver.id
                    and status = 'offered') then
    raise exception using errcode = 'RR085', message = 'This delivery is no longer available.';
  end if;

  update deliveries
     set driver_id = v_driver.id,
         status = 'assigned',
         assigned_at = now(),
         pickup_due_at = now() + make_interval(mins => v_set.pickup_window_minutes),
         delivery_due_at = now() + make_interval(mins => v_set.delivery_window_minutes)
   where id = p_delivery_id
     and driver_id is null
     and status = 'searching_driver'
  returning * into v_d;

  if not found then
    -- Somebody else won. A safe, honest message, not an error.
    return jsonb_build_object('ok', false, 'reason', 'taken',
                              'message', 'This delivery is no longer available.');
  end if;

  update delivery_offers set status = 'accepted', responded_at = now()
   where delivery_id = p_delivery_id and driver_id = v_driver.id;
  update delivery_offers set status = 'withdrawn', responded_at = now()
   where delivery_id = p_delivery_id and driver_id <> v_driver.id and status = 'offered';
  -- M116: was `set availability = 'busy'`. Same result on the first job, but it
  -- is now derived rather than asserted — and it no longer means "stop offering
  -- me work", which is what that literal had come to mean downstream.
  perform sync_driver_availability(v_driver.id);
  update driver_metrics set offers_accepted = offers_accepted + 1, updated_at = now()
   where driver_id = v_driver.id;

  perform log_delivery_event(p_delivery_id, 'driver', auth.uid(), 'delivery.accepted',
                             'searching_driver', 'assigned');

  return jsonb_build_object('ok', true, 'deliveryId', p_delivery_id,
                            'pickupDueAt', v_d.pickup_due_at,
                            'earning', v_d.driver_earning);
end;
$function$;

create or replace function public.complete_delivery_with_pin(p_delivery_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_driver delivery_drivers%rowtype;
  v_d      deliveries%rowtype;
  v_norm   text;
begin
  v_driver := current_driver();
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found or v_d.driver_id is distinct from v_driver.id then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if v_d.status = 'delivered' then
    -- Idempotent: a double tap on a flaky connection must not read as failure.
    return jsonb_build_object('ok', true, 'alreadyDelivered', true);
  end if;
  if v_d.status not in ('out_for_delivery', 'arrived') then
    raise exception using errcode = 'RR086',
      message = 'Mark the order out for delivery before completing it.';
  end if;
  if v_d.pin_attempts >= 5 then
    raise exception using errcode = 'RR087',
      message = 'Too many wrong codes. Contact the office to complete this delivery.';
  end if;

  v_norm := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  if v_norm <> v_d.pin then
    update deliveries set pin_attempts = pin_attempts + 1 where id = p_delivery_id;
    perform log_delivery_event(p_delivery_id, 'driver', auth.uid(), 'delivery.pin_failed',
                               v_d.status, v_d.status, 'wrong code');
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin',
                              'message', 'That code is not right. Ask the customer to read it again.',
                              'attemptsLeft', 5 - (v_d.pin_attempts + 1));
  end if;

  update deliveries set status = 'delivered', delivered_at = now() where id = p_delivery_id;
  -- M116: was an unconditional `= 'available'`, which quietly put a driver who
  -- had signed OFF back on duty, and also cleared 'busy' while they still held
  -- their second delivery. Both are now impossible.
  perform sync_driver_availability(v_driver.id);
  update driver_metrics
     set deliveries_completed = deliveries_completed + 1,
         on_time_deliveries = on_time_deliveries
           + case when v_d.delivery_due_at is null or now() <= v_d.delivery_due_at then 1 else 0 end,
         updated_at = now()
   where driver_id = v_driver.id;

  perform log_delivery_event(p_delivery_id, 'customer', null, 'delivery.pin_verified',
                             v_d.status, 'delivered', 'customer confirmed with PIN');
  return jsonb_build_object('ok', true, 'status', 'delivered');
end;
$function$;

create or replace function public.driver_cannot_complete(p_delivery_id uuid, p_reason text, p_note text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_driver delivery_drivers%rowtype;
  v_d      deliveries%rowtype;
  v_after  boolean;
  v_to     delivery_status;
begin
  v_driver := current_driver();
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found or v_d.driver_id is distinct from v_driver.id then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_note), '') = '' then
    raise exception using errcode = 'RR088', message = 'Tell us briefly what happened.';
  end if;

  v_after := v_d.status in ('picked_up', 'out_for_delivery', 'arrived');
  v_to := case when v_after then 'requires_admin' else 'searching_driver' end;

  update deliveries
     set status = v_to,
         driver_id = case when v_after then driver_id else null end,
         failure_reason = p_reason,
         admin_note = p_note,
         reassignment_count = reassignment_count + case when v_after then 0 else 1 end,
         offer_expires_at = case when v_after then offer_expires_at
                                 else now() + interval '10 minutes' end
   where id = p_delivery_id;

  -- M116: same reasoning as complete_delivery_with_pin. Note this one matters
  -- more, because after pickup the delivery keeps the driver_id and moves to
  -- 'requires_admin' — outside the active set — so the old unconditional
  -- 'available' was ALSO the only thing accidentally rescuing them.
  perform sync_driver_availability(v_driver.id);
  update driver_metrics
     set driver_cancellations = driver_cancellations + 1, updated_at = now()
   where driver_id = v_driver.id;
  update delivery_offers set status = 'withdrawn'
   where delivery_id = p_delivery_id and status = 'offered';

  perform log_delivery_event(p_delivery_id, 'driver', auth.uid(), 'delivery.driver_cannot_complete',
                             v_d.status, v_to, p_reason,
                             jsonb_build_object('afterPickup', v_after, 'note', p_note));

  return jsonb_build_object('ok', true, 'status', v_to, 'afterPickup', v_after);
end;
$function$;

create or replace function public.admin_force_delivery_status(p_delivery_id uuid, p_status delivery_status, p_note text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_d deliveries%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if p_status = 'delivered' then
    raise exception using errcode = 'RR092',
      message = 'Only the customer''s PIN can mark a delivery delivered. Use "returned to merchant" or "failed" to close it out honestly.';
  end if;
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  update deliveries
     set status = p_status,
         admin_note = coalesce(p_note, admin_note),
         failure_reason = coalesce(failure_reason, p_note),
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_delivery_id;

  if p_status in ('cancelled','failed_delivery','returned_to_merchant') and v_d.driver_id is not null then
    -- M116: the hand-rolled CASE here excluded p_delivery_id from its own count
    -- because it ran before... nothing, actually — the UPDATE above has already
    -- landed, so the exclusion was redundant. It also preserved 'offline' only
    -- by accident of the `else availability` branch. Both are now explicit.
    perform sync_driver_availability(v_d.driver_id);
    update driver_metrics set deliveries_failed = deliveries_failed + 1, updated_at = now()
     where driver_id = v_d.driver_id and p_status = 'failed_delivery';
  end if;

  perform log_delivery_event(p_delivery_id, 'admin', auth.uid(), 'delivery.forced',
                             v_d.status, p_status, p_note);
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'delivery.force_status', 'delivery', p_delivery_id::text,
          jsonb_build_object('from', v_d.status, 'to', p_status, 'note', p_note));

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$function$;

create or replace function public.admin_reassign_delivery(p_delivery_id uuid, p_force boolean default false, p_note text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_d      deliveries%rowtype;
  v_after  boolean;
  v_old    uuid;
  v_set    delivery_settings%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_set from delivery_settings where id = 'main';

  v_after := v_d.status in ('picked_up','out_for_delivery','arrived','requires_admin');
  if v_after and not coalesce(p_force, false) then
    raise exception using errcode = 'RR091',
      message = 'This driver already has the package. Confirm where it is before reassigning — the new driver cannot collect it from the shop.';
  end if;

  v_old := v_d.driver_id;

  update deliveries
     set driver_id = null,
         status = 'searching_driver',
         reassignment_count = reassignment_count + 1,
         admin_note = coalesce(p_note, admin_note),
         offer_expires_at = now() + make_interval(mins => v_set.accept_window_minutes),
         pickup_due_at = null, delivery_due_at = null
   where id = p_delivery_id;

  -- Old offers are dead; a stale card in someone's app that 409s on tap is
  -- worse than no card.
  update delivery_offers set status = 'withdrawn', responded_at = now()
   where delivery_id = p_delivery_id and status in ('offered','accepted');

  -- M116: sync_driver_availability is null-safe, so the `if v_old is not null`
  -- wrapper is gone rather than duplicated.
  perform sync_driver_availability(v_old);

  perform log_delivery_event(p_delivery_id, 'admin', auth.uid(), 'delivery.reassigned',
                             v_d.status, 'searching_driver', p_note,
                             jsonb_build_object('previousDriver', v_old, 'forced', coalesce(p_force,false)));
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'delivery.reassign', 'delivery', p_delivery_id::text,
          jsonb_build_object('from', v_d.status, 'previousDriver', v_old,
                             'forced', coalesce(p_force,false), 'note', p_note));

  perform offer_delivery(p_delivery_id);
  return jsonb_build_object('ok', true, 'status', 'searching_driver');
end;
$function$;

-- ── 6 · the sweep stops stranding drivers ──────────────────────────────────
-- Body identical to the deployed one except for the two `perform
-- sync_driver_availability(r.driver_id)` calls. Branch 1 is untouched: those
-- deliveries have no driver.
create or replace function public.sweep_delivery_escalations()
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_set        delivery_settings%rowtype;
  r            record;
  v_released   int := 0;
  v_admin      int := 0;
  v_reoffered  int := 0;
  v_reoffer_ids uuid[] := '{}';
  v_stranded_ids uuid[] := '{}';
  v_released_ids uuid[] := '{}';
  v_n          int;
begin
  select * into v_set from delivery_settings where id = 'main';

  -- 1. Nobody accepted. Not a driver failing — a supply problem. Re-offer,
  --    because drivers come online continuously and the first batch may simply
  --    have been offline. Bounded, because "keep trying" is not a plan.
  for r in
    select d.id, d.offer_rounds from deliveries d
     where d.status = 'searching_driver'
       and (d.offer_expires_at is null or d.offer_expires_at <= now())
     for update of d
  loop
    if r.offer_rounds + 1 >= v_set.max_offer_rounds then
      -- Out of road. A human has to call somebody, so say so loudly rather than
      -- looping in silence.
      update deliveries set status = 'requires_admin' where id = r.id;
      update delivery_offers set status = 'expired', responded_at = now()
       where delivery_id = r.id and status = 'offered';
      perform log_delivery_event(r.id, 'system', null, 'delivery.no_driver_found',
                                 'searching_driver', 'requires_admin',
                                 format('no driver after %s rounds', r.offer_rounds + 1));
      v_stranded_ids := v_stranded_ids || r.id;
      v_admin := v_admin + 1;
    else
      update deliveries
         set offer_expires_at = now() + make_interval(mins => v_set.accept_window_minutes),
             offer_rounds = offer_rounds + 1
       where id = r.id;
      update delivery_offers set status = 'expired', responded_at = now()
       where delivery_id = r.id and status = 'offered';
      v_n := offer_delivery(r.id);
      perform log_delivery_event(r.id, 'system', null, 'delivery.reoffered',
                                 'searching_driver', 'searching_driver',
                                 format('offer window elapsed; round %s reached %s drivers',
                                        r.offer_rounds + 1, v_n));
      -- Only worth waking phones if the round actually reached anyone.
      if v_n > 0 then v_reoffer_ids := v_reoffer_ids || r.id; end if;
      v_reoffered := v_reoffered + 1;
    end if;
  end loop;

  -- 2. Accepted but stalled BEFORE pickup. The package is still at the shop, so
  --    releasing it is safe and is the fastest route to a delivered order.
  for r in
    select d.id, d.driver_id, d.status from deliveries d
     where d.status in ('assigned','going_to_pickup','arrived_at_pickup')
       and d.pickup_due_at is not null
       and d.pickup_due_at + make_interval(mins => v_set.unresponsive_after_minutes) <= now()
     for update of d
  loop
    if r.driver_id is not null then
      update driver_metrics set unresponsive_events = unresponsive_events + 1, updated_at = now()
       where driver_id = r.driver_id;
    end if;
    perform log_delivery_event(r.id, 'system', null, 'delivery.driver_unresponsive',
                               r.status, 'searching_driver', 'no pickup within the window');
    if v_set.auto_reassign_before_pickup then
      perform admin_reassign_delivery(r.id, false, 'Released automatically: driver did not collect in time.');
      -- The driver who lost it must be told, or he rides to a shop for nothing.
      v_released_ids := v_released_ids || r.id;
      v_released := v_released + 1;
    else
      update deliveries set status = 'driver_unresponsive' where id = r.id;
      -- M116: 'driver_unresponsive' is outside the active set, so without this
      -- the driver keeps 'busy' while counting zero jobs — on duty, holding
      -- nothing, and under the old dispatch predicate, unreachable for ever.
      perform sync_driver_availability(r.driver_id);
      v_admin := v_admin + 1;
    end if;
  end loop;

  -- 3. Stalled AFTER pickup. The goods are in someone's possession. This is the
  --    case that must NEVER auto-reassign — a second driver sent to the shop
  --    finds nothing, and the package is still in the first driver's bag.
  for r in
    select d.id, d.driver_id, d.status from deliveries d
     where d.status in ('picked_up','out_for_delivery','arrived')
       and d.delivery_due_at is not null
       and d.delivery_due_at + make_interval(mins => v_set.unresponsive_after_minutes) <= now()
     for update of d
  loop
    if r.driver_id is not null then
      update driver_metrics set unresponsive_events = unresponsive_events + 1, updated_at = now()
       where driver_id = r.driver_id;
    end if;
    update deliveries set status = 'requires_admin' where id = r.id;
    -- M116: the package stays with him and the delivery stays his, but
    -- 'requires_admin' is outside the active set, so his row must stop claiming
    -- a job the rest of the system no longer counts him as holding. This is the
    -- branch that would have retired a real driver mid-shift, silently.
    perform sync_driver_availability(r.driver_id);
    perform log_delivery_event(r.id, 'system', null, 'delivery.requires_admin',
                               r.status, 'requires_admin',
                               'no delivery within the window; package is with the driver');
    v_stranded_ids := v_stranded_ids || r.id;
    v_admin := v_admin + 1;
  end loop;

  -- The ids travel back so the cron worker can do what SQL cannot: reach a
  -- phone. Counts alone would leave the worker guessing who to notify.
  return jsonb_build_object(
    'reoffered', v_reoffered, 'released', v_released, 'needsAdmin', v_admin,
    'reofferedIds', to_jsonb(v_reoffer_ids),
    'strandedIds', to_jsonb(v_stranded_ids),
    'releasedIds', to_jsonb(v_released_ids));
end;
$function$;

-- ── 7 · repair anybody already stranded ────────────────────────────────────
-- Zero rows today (verified before applying); this exists so the migration is
-- correct whenever it is replayed, not because it has work to do now.
update delivery_drivers d
   set availability = 'available'
 where d.availability = 'busy'
   and not exists (
     select 1 from deliveries dl
      where dl.driver_id = d.id
        and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                          'picked_up','out_for_delivery','arrived'));

-- ── 8 · verification ───────────────────────────────────────────────────────
-- plpgsql bodies are not resolved until first CALL, so a migration that
-- "succeeds" can still ship a function that 42P01s on the first real use. Every
-- function changed here is therefore executed below, as itself.
do $$
declare
  v_n integer; v_id uuid; v_before driver_availability; v_after driver_availability;
  v_rows integer; v_sweep jsonb;
begin
  -- No accidental overloads. dispatch_candidates is the dangerous one: M103
  -- added p_size_class, and a 6-arg copy would take over vehicle matching.
  for v_n in
    select 1 from (values ('sync_driver_availability'),('set_driver_availability'),
                          ('dispatch_candidates'),('accept_delivery'),
                          ('complete_delivery_with_pin'),('driver_cannot_complete'),
                          ('admin_force_delivery_status'),('admin_reassign_delivery'),
                          ('driver_push_targets'),('driver_whatsapp_targets'),
                          ('sweep_delivery_escalations')) t(nm)
     where (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname = t.nm) <> 1
  loop
    raise exception 'a function changed by M116 has the wrong number of overloads';
  end loop;

  if (select pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='dispatch_candidates') <> 7 then
    raise exception 'dispatch_candidates is not the 7-arg (p_size_class) signature';
  end if;

  -- ── sync_driver_availability actually runs, and respects duty ────────────
  select id into v_id from delivery_drivers limit 1;
  if v_id is not null then
    select availability into v_before from delivery_drivers where id = v_id;

    perform sync_driver_availability(v_id);           -- must not raise
    perform sync_driver_availability(null);           -- null-safe

    -- An offline driver with no jobs must STAY offline. This is the assertion
    -- that stops a future edit from "helpfully" putting people back on duty.
    update delivery_drivers set availability = 'offline' where id = v_id;
    perform sync_driver_availability(v_id);
    select availability into v_after from delivery_drivers where id = v_id;
    if v_after <> 'offline' then
      raise exception 'sync_driver_availability overrode a driver''s choice to be offline (got %)', v_after;
    end if;

    -- An on-duty driver holding nothing must read available, not busy.
    update delivery_drivers set availability = 'busy' where id = v_id;
    perform sync_driver_availability(v_id);
    select availability into v_after from delivery_drivers where id = v_id;
    if v_after <> 'available' then
      raise exception 'a driver with no active delivery was left as % ', v_after;
    end if;

    update delivery_drivers set availability = v_before where id = v_id;
  end if;

  -- ── the readers execute ─────────────────────────────────────────────────
  select count(*) into v_rows from dispatch_candidates(-19.6836, 63.4186, null, 1, 10, '{}', null);
  select count(*) into v_rows from dispatch_candidates(-19.6836, 63.4186, null, 3, 10, '{}', 'large');
  select count(*) into v_rows from driver_push_targets(gen_random_uuid());
  select count(*) into v_rows from driver_whatsapp_targets(gen_random_uuid());

  -- ── THE REGRESSION TEST ─────────────────────────────────────────────────
  -- A driver on duty and holding a job must be a dispatch candidate, because
  -- max_active_deliveries is 2. Under the old `= 'available'` predicate this
  -- returned zero rows, which is the entire bug.
  if v_id is not null
     and (select status from delivery_drivers where id = v_id) = 'approved'
     and (select max_active_deliveries from delivery_settings where id='main') > 1 then
    update delivery_drivers set availability = 'busy' where id = v_id;
    select count(*) into v_rows
      from dispatch_candidates(-19.6836, 63.4186, null, 3, 10, '{}', null) c
     where c.driver_id = v_id;
    if v_rows = 0 then
      raise exception 'REGRESSION: an on-duty driver is still invisible to dispatch';
    end if;
    update delivery_drivers set availability = v_before where id = v_id;
  end if;

  -- ── the sweep executes ──────────────────────────────────────────────────
  -- Verified beforehand that all three loops match zero rows, so this exercises
  -- the body without moving a single delivery.
  v_sweep := sweep_delivery_escalations();
  if (v_sweep->>'reoffered')::int <> 0 or (v_sweep->>'released')::int <> 0
     or (v_sweep->>'needsAdmin')::int <> 0 then
    raise exception 'the sweep changed data during verification: %', v_sweep;
  end if;

  -- ── nobody is left stranded ─────────────────────────────────────────────
  select count(*) into v_rows from delivery_drivers d
   where d.availability = 'busy'
     and not exists (select 1 from deliveries dl where dl.driver_id = d.id
       and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                         'picked_up','out_for_delivery','arrived'));
  if v_rows > 0 then
    raise exception '% driver(s) are busy while holding nothing', v_rows;
  end if;

  -- ── the internal helper is not reachable by a client role ───────────────
  if has_function_privilege('anon', 'public.sync_driver_availability(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_driver_availability(uuid)', 'EXECUTE') then
    raise exception 'SECURITY: sync_driver_availability is client-callable';
  end if;

  raise notice 'M116 verified: availability is duty, capacity is a count.';
end $$;
