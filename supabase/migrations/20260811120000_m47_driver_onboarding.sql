-- M47 — Driver onboarding: apply, approve, go online, and the driver's own
--       read model.
--
-- Applied to production as `m47_driver_onboarding` plus a follow-up
-- `m47b_fix_availability_cast`. This file carries the FINAL state of both, so a
-- fresh database gets the corrected definitions in one pass.
--
-- THE RULE: a driver is NEVER active by submitting a form. apply_as_driver()
-- can only produce `pending`; only an admin moves it forward. That is enforced
-- by the M45 column grant (UPDATE on `status` is revoked from every client
-- role) — not by the UI, and not by these functions alone.
--
-- VERIFIED AS THE REAL ROLE, not just by reading grants. Probing with
-- `set_config('request.jwt.claims', …)` alone is worthless here: it changes
-- auth.uid() but leaves the connection privileged, so a self-approval appears
-- to SUCCEED. Re-run under `set local role authenticated` the answers were:
--   driver approves themselves  -> refused 42501
--   driver edits own profile    -> allowed
--   driver reads a delivery PIN -> refused 42501
--
-- A BUG THIS FILE ALREADY CONTAINS THE FIX FOR: every branch of
-- set_driver_availability()'s CASE was a bare string literal, so Postgres typed
-- the expression as `text` and refused to assign it to a driver_availability
-- column — 42804 on the first tap of the online/offline toggle. plpgsql does
-- not type-check embedded SQL until it runs, so the function created cleanly
-- and only exercising the flow found it.

create or replace function public.apply_as_driver(
  p_full_name        text,
  p_phone            text,
  p_vehicle_type     text,
  p_vehicle_details  text default null,
  p_licence_reference text default null,
  p_service_zone_ids uuid[] default '{}',
  p_preferred_hours  text default null,
  p_experience_note  text default null,
  p_emergency_contact text default null,
  p_accept_terms     boolean default false
)
returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_id    uuid;
  v_status driver_status;
begin
  if v_uid is null then
    raise exception using errcode = 'RR080', message = 'Sign in to apply.';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception using errcode = 'RR089', message = 'You must accept the driver terms to apply.';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception using errcode = 'RR089', message = 'Please give your full name.';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if left(v_phone, 1) <> '+' then v_phone := '+' || v_phone; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,15}$' then
    raise exception using errcode = 'RR089', message = 'Use your full number with country code, e.g. +230 5835 5588.';
  end if;

  select id, status into v_id, v_status from delivery_drivers where user_id = v_uid;

  -- A rejected or suspended driver cannot quietly re-apply their way back in.
  if v_status in ('rejected', 'suspended') then
    raise exception using errcode = 'RR090',
      message = 'Your application was not approved. Contact Roulé Rodrigues if you think this is wrong.';
  end if;

  -- Idempotent: re-submitting updates the existing application rather than
  -- failing on the unique user_id. Somebody fixing a typo in their phone
  -- number should not hit a wall.
  if v_id is null then
    insert into delivery_drivers (user_id, full_name, phone, vehicle_type, vehicle_details,
                                  licence_reference, service_zone_ids, preferred_hours,
                                  experience_note, emergency_contact, terms_accepted_at, status)
    values (v_uid, btrim(p_full_name), v_phone, coalesce(nullif(btrim(p_vehicle_type), ''), 'scooter'),
            p_vehicle_details, p_licence_reference, coalesce(p_service_zone_ids, '{}'),
            p_preferred_hours, p_experience_note, p_emergency_contact, now(), 'pending')
    returning id into v_id;
    insert into driver_metrics (driver_id) values (v_id) on conflict do nothing;
  else
    update delivery_drivers
       set full_name = btrim(p_full_name), phone = v_phone,
           vehicle_type = coalesce(nullif(btrim(p_vehicle_type), ''), 'scooter'),
           vehicle_details = p_vehicle_details, licence_reference = p_licence_reference,
           service_zone_ids = coalesce(p_service_zone_ids, '{}'),
           preferred_hours = p_preferred_hours, experience_note = p_experience_note,
           emergency_contact = p_emergency_contact, terms_accepted_at = now()
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'driverId', v_id, 'status', coalesce(v_status, 'pending'));
end;
$function$;
revoke all on function public.apply_as_driver(text,text,text,text,text,uuid[],text,text,text,boolean) from public, anon;
grant execute on function public.apply_as_driver(text,text,text,text,text,uuid[],text,text,text,boolean) to authenticated, service_role;

-- One round trip for the whole dashboard. A driver on a Rodrigues mobile
-- signal should not wait on four sequential requests to learn whether they
-- have a job.
create or replace function public.driver_dashboard()
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d   delivery_drivers%rowtype;
  v_set delivery_settings%rowtype;
  v_m   driver_metrics%rowtype;
begin
  v_d := current_driver();
  select * into v_set from delivery_settings where id = 'main';
  select * into v_m from driver_metrics where driver_id = v_d.id;

  return jsonb_build_object(
    'driver', jsonb_build_object(
      'id', v_d.id, 'name', v_d.full_name, 'phone', v_d.phone,
      'status', v_d.status, 'availability', v_d.availability,
      'vehicleType', v_d.vehicle_type, 'statusReason', v_d.status_reason,
      'serviceZoneIds', v_d.service_zone_ids),
    'limits', jsonb_build_object('maxActive', v_set.max_active_deliveries),
    -- Counts, not a grade. The reliability score is an admin tool; the driver
    -- sees the facts behind it so it never feels arbitrary.
    'metrics', jsonb_build_object(
      'completed', coalesce(v_m.deliveries_completed, 0),
      'accepted', coalesce(v_m.offers_accepted, 0),
      'offers', coalesce(v_m.offers_received, 0),
      'cancellations', coalesce(v_m.driver_cancellations, 0),
      'onTime', coalesce(v_m.on_time_deliveries, 0),
      'rating', case when coalesce(v_m.rating_count,0) = 0 then null
                     else round(v_m.rating_sum::numeric / v_m.rating_count, 1) end),
    'today', jsonb_build_object(
      'completed', (select count(*) from deliveries
                     where driver_id = v_d.id and status = 'delivered'
                       and delivered_at >= date_trunc('day', now() at time zone 'Indian/Mauritius')),
      'earned', (select coalesce(sum(driver_earning), 0) from deliveries
                  where driver_id = v_d.id and status = 'delivered'
                    and delivered_at >= date_trunc('day', now() at time zone 'Indian/Mauritius'))),
    'active', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'status', d.status, 'earning', d.driver_earning,
               'storeName', s.name, 'storePhone', s.phone, 'storeAddress', s.address,
               'orderNumber', o.order_number,
               'customerName', o.customer_name, 'customerPhone', o.customer_phone,
               'dropoffLat', d.dropoff_lat, 'dropoffLng', d.dropoff_lng,
               'dropoffNote', d.dropoff_note,
               'pickupDueAt', d.pickup_due_at, 'deliveryDueAt', d.delivery_due_at,
               'pinAttempts', d.pin_attempts)
             order by d.assigned_at), '[]'::jsonb)
        from deliveries d
        join stores s on s.id = d.store_id
        join orders o on o.id = d.order_id
       where d.driver_id = v_d.id
         and d.status in ('assigned','going_to_pickup','arrived_at_pickup',
                          'picked_up','out_for_delivery','arrived')),
    -- Only what they may actually take. An offer a driver cannot accept is
    -- worse than no offer at all.
    'offers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'earning', d.driver_earning,
               'storeName', s.name, 'storeAddress', s.address,
               'dropoffNote', d.dropoff_note, 'expiresAt', o.expires_at)
             order by o.offered_at), '[]'::jsonb)
        from delivery_offers o
        join deliveries d on d.id = o.delivery_id
        join stores s on s.id = d.store_id
       where o.driver_id = v_d.id
         and o.status = 'offered'
         and d.status = 'searching_driver'
         and (o.expires_at is null or o.expires_at > now())
         and v_d.status = 'approved'
         and v_d.availability <> 'offline'
         and (select count(*) from deliveries dl
               where dl.driver_id = v_d.id
                 and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                   'picked_up','out_for_delivery','arrived'))
             < v_set.max_active_deliveries));
end;
$function$;
revoke all on function public.driver_dashboard() from public, anon;
grant execute on function public.driver_dashboard() to authenticated, service_role;

create or replace function public.set_driver_availability(p_online boolean)
returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp'
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

  -- Going offline does NOT abandon work in hand. It stops new OFFERS; jobs
  -- already accepted stay theirs, because releasing those silently is exactly
  -- how a customer's delivery disappears.
  --
  -- The ::driver_availability cast is load-bearing — see the header.
  update delivery_drivers
     set availability = (case
       when not p_online then 'offline'
       when v_active > 0 then 'busy'
       else 'available' end)::driver_availability
   where id = v_d.id;

  return jsonb_build_object('ok', true,
    'availability', (select availability from delivery_drivers where id = v_d.id),
    'activeDeliveries', v_active);
end;
$function$;
revoke all on function public.set_driver_availability(boolean) from public, anon;
grant execute on function public.set_driver_availability(boolean) to authenticated, service_role;

create or replace function public.admin_set_driver_status(
  p_driver_id uuid, p_status driver_status, p_reason text default null
)
returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d delivery_drivers%rowtype;
  v_active int;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_d from delivery_drivers where id = p_driver_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select count(*) into v_active from deliveries
   where driver_id = p_driver_id
     and status in ('assigned','going_to_pickup','arrived_at_pickup','picked_up','out_for_delivery','arrived');

  update delivery_drivers
     set status = p_status,
         status_reason = p_reason,
         approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         availability = case when p_status <> 'approved' then 'offline'::driver_availability else availability end
   where id = p_driver_id;

  if p_status <> 'approved' then
    update delivery_offers o set status = 'withdrawn', responded_at = now()
      from deliveries d
     where o.delivery_id = d.id and o.driver_id = p_driver_id and o.status = 'offered';
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'driver.status', 'delivery_driver', p_driver_id::text,
          jsonb_build_object('from', v_d.status, 'to', p_status, 'reason', p_reason,
                             'activeDeliveries', v_active));

  -- Suspending mid-delivery is ALLOWED — the admin may have good reason — but
  -- it is reported, so the control centre forces a handover instead of assuming
  -- the package sorted itself out.
  return jsonb_build_object('ok', true, 'status', p_status, 'activeDeliveries', v_active,
    'warning', case when p_status <> 'approved' and v_active > 0
      then format('This driver still has %s active deliver%s. Reassign them from the delivery board.',
                  v_active, case when v_active = 1 then 'y' else 'ies' end)
      else null end);
end;
$function$;
revoke all on function public.admin_set_driver_status(uuid, driver_status, text) from public, anon, authenticated;
grant execute on function public.admin_set_driver_status(uuid, driver_status, text) to service_role;

do $$
declare v_src text;
begin
  if has_function_privilege('anon', 'public.apply_as_driver(text,text,text,text,text,uuid[],text,text,text,boolean)', 'EXECUTE') then
    raise exception 'M47: anon can apply as a driver.';
  end if;
  if has_function_privilege('authenticated', 'public.admin_set_driver_status(uuid,driver_status,text)', 'EXECUTE') then
    raise exception 'M47: a signed-in user can approve drivers.';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='set_driver_availability';
  if position('::driver_availability' in v_src) = 0 then
    raise exception 'M47: the availability cast is missing — the toggle fails at runtime.';
  end if;
end;
$$;
