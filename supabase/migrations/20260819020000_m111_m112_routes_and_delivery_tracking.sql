-- ══════════════════════════════════════════════════════════════════════════
-- M111 / M112 — MEASURED ROADS, AND A DELIVERY CUSTOMER WHO CAN WATCH
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied to production as m111_road_factor_measured and
-- m112_delivery_customer_can_watch, captured here in that order.

-- ── M111 · road_factor, measured instead of guessed ───────────────────────
-- dispatch_settings.road_factor has been 1.35 since the dispatch engine was
-- built. It turns straight-line distance into road distance, and it feeds BOTH
-- the driver ranking and every approximate ETA.
--
-- Measured against a real router on 2026-08-19, on the run this platform sells
-- most often — Port Mathurin to Plaine Corail Airport:
--
--   straight line (haversine_km)   10.21 km
--   actual driving route (OSRM)    18.90 km
--   ratio                          1.85
--
-- 1.35 was optimistic by about a third. Rodrigues is a ridge with a coast road:
-- almost nothing here is driven in anything like a straight line.
--
-- 1.8 rather than 1.85 because one sample is one sample, and this run crosses
-- the island end to end — the least direct journey available. A hop inside Port
-- Mathurin is closer to straight. 1.8 is honest for the long runs and only
-- slightly pessimistic for the short ones, and pessimistic is the right
-- direction for an ETA somebody is waiting on.
--
-- Safe for dispatch: road_factor scales every candidate identically, so the
-- ORDER drivers rank in does not change. Radius stages (3/8/18 km) now bite
-- slightly earlier, which is the correction — a driver "8 km away" was really
-- 11 km away by road.
update public.dispatch_settings
   set road_factor = 1.80, updated_at = now()
 where id = 'main' and road_factor <> 1.80;

do $$
declare v_factor numeric; v_straight double precision;
begin
  select road_factor into v_factor from dispatch_settings where id = 'main';
  if v_factor <> 1.80 then
    raise exception 'road_factor is % — the update did not take', v_factor;
  end if;
  -- The measurement this change rests on, asserted so a future edit that
  -- "tidies" haversine_km cannot silently invalidate the reasoning above.
  select haversine_km(-19.6836, 63.4186, -19.7577, 63.3610) into v_straight;
  if abs(v_straight - 10.21) > 0.05 then
    raise exception 'straight-line airport run is now % km, not 10.21 — re-measure road_factor',
      round(v_straight::numeric, 2);
  end if;
  raise notice 'M111: road_factor 1.35 -> 1.80 (measured 18.90/10.21 = 1.85).';
end $$;

-- ── M112 · a delivery customer gets the same map as a taxi customer ───────
-- The owner's instruction: pickup keeps the tracking it has; delivery, taxi and
-- transfer all move to the new live view. Taxi and transfer already have it via
-- lookup_ride (M109c/M110). This is the delivery half.
--
-- delivery_view_for_customer is already the door — a signed-in owner, or a guest
-- proving the order with the address it was placed under. It decides WHO may
-- look. This makes it also hand over what is needed to WATCH, on the same terms.
--
-- Every field the deployed DeliveryStatusCard reads is returned unchanged, the
-- PIN keeps its existing treatment, and the driver's FIRST NAME ONLY rule is
-- kept — a delivery driver is not put on a map with their full identity
-- attached just because tracking arrived.
create or replace function public.delivery_view_for_customer(p_order_id uuid, p_email text default null)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_o     orders%rowtype;
  v_d     deliveries%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text;
  v_phone text;
  v_photo text;
  v_vehicle text;
  v_done  integer;
  v_key   text;
  v_tt    trip_tracking%rowtype;
begin
  select * into v_o from orders where id = p_order_id;
  if not found then return null; end if;

  if auth.uid() is not null and v_o.customer_id = auth.uid() then
    null;
  elsif v_email <> '' and lower(btrim(coalesce(v_o.customer_email, ''))) = v_email then
    null;
  else
    return null;
  end if;

  select * into v_d from deliveries where order_id = p_order_id;
  if not found then return null; end if;

  if v_d.driver_id is not null then
    select split_part(btrim(dd.full_name), ' ', 1), dd.phone, dd.photo_url,
           dd.vehicle_details,
           coalesce((select deliveries_completed from driver_metrics dm where dm.driver_id = dd.id), 0)
      into v_name, v_phone, v_photo, v_vehicle, v_done
      from delivery_drivers dd where dd.id = v_d.driver_id;
  end if;

  -- The watch. Only while the delivery is genuinely in motion AND has a driver:
  -- one sitting in 'created' has nothing to plot, and a delivered one must stop
  -- being watchable, which is what withdraws the capability.
  if v_d.driver_id is not null
     and v_d.status in ('assigned','going_to_pickup','arrived_at_pickup',
                        'picked_up','out_for_delivery','arrived') then
    perform ensure_trip_tracking('delivery', v_d.id);
    select * into v_tt from trip_tracking
     where trip_kind = 'delivery' and trip_id = v_d.id and ended_at is null;
    v_key := v_tt.channel_key;
  end if;

  return jsonb_build_object(
    'status',      v_d.status,
    'pin',         v_d.pin,
    'driverName',  v_name,
    'driverPhone', v_phone,
    'pickedUpAt',  v_d.picked_up_at,
    'deliveredAt', v_d.delivered_at,
    'dueAt',       v_d.delivery_due_at,
    'driverPhoto',   v_photo,
    'driverVehicle', v_vehicle,
    -- No review table exists for delivery drivers, so there is no rating and
    -- none is invented. Completed deliveries is the honest number.
    'driverCompleted', coalesce(v_done, 0),
    'tripKind',   'delivery',
    'tripId',     v_d.id,
    'channelKey', v_key,
    'pickupLabel',  v_tt.pickup_label,
    'dropoffLabel', v_tt.dropoff_label,
    'orderNumber',  v_o.order_number);
end;
$function$;

-- STABLE removed: this now WRITES via ensure_trip_tracking on first call. Left
-- STABLE, the planner may run it in a read-only snapshot and the insert fails at
-- runtime — the trap documented in dispatch_geography.sql.
revoke all on function public.delivery_view_for_customer(uuid, text) from public, anon;
grant execute on function public.delivery_view_for_customer(uuid, text) to authenticated, service_role;

do $$
declare v jsonb; v_n integer; v_oid uuid;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='delivery_view_for_customer';
  if v_n <> 1 then raise exception 'delivery_view_for_customer has % overloads', v_n; end if;

  if delivery_view_for_customer('00000000-0000-0000-0000-000000000000', 'nobody@example.com') is not null then
    raise exception 'delivery_view_for_customer answered for an unknown order';
  end if;

  select order_id into v_oid from deliveries limit 1;
  if v_oid is not null then
    v := delivery_view_for_customer(v_oid,
           (select lower(btrim(customer_email)) from orders where id = v_oid));
    if v is not null then
      if not (v ? 'status' and v ? 'pin' and v ? 'driverName' and v ? 'driverPhone'
              and v ? 'pickedUpAt' and v ? 'deliveredAt' and v ? 'dueAt') then
        raise exception 'delivery_view_for_customer dropped a field the card depends on';
      end if;
      if not (v ? 'tripId' and v ? 'channelKey' and v ? 'tripKind'
              and v ? 'driverPhoto' and v ? 'driverCompleted') then
        raise exception 'delivery_view_for_customer is missing the new tracking fields';
      end if;
    end if;
    if delivery_view_for_customer(v_oid, 'definitely-not-the-buyer@example.com') is not null then
      raise exception 'SECURITY: a wrong email saw a delivery';
    end if;
  end if;

  if has_function_privilege('anon', 'public.delivery_view_for_customer(uuid,text)', 'EXECUTE') then
    raise exception 'SECURITY: delivery_view_for_customer is anon-callable';
  end if;
  raise notice 'M112 verified.';
end $$;
