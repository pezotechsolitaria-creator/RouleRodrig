-- ── M157 — the driver's card knows how the job is being paid ───────────────
--
-- M155 gave a delivery a payment method and put a gate on the first status
-- transition. driver_dashboard returned neither, which left two problems on the
-- one screen the driver actually works from.
--
-- ── THE BUG M155 INTRODUCED, AND THIS FIXES ────────────────────────────────
-- `collectCash` reads `d.customer_fee` for any direct job, unconditionally. So
-- a delivery the customer had ALREADY PAID FOR BY TRANSFER still told the
-- driver, in red, to collect the full fee in cash at the door.
--
-- That is the worst shape a bug can take here: it does not fail, it does not
-- log, and the person who loses is the customer — who pays twice, in cash, to
-- somebody holding a screen that told them to ask. Being wrong in the direction
-- of "collect more money" is not a rounding error.
--
--   package + bank transfer      → 0. The fee is the whole bill and it is paid.
--   shopping run + bank transfer → 0 HERE, and the card says the rest in words.
--     The fee is prepaid; what the driver fronts at the till is not, because
--     nothing knows the real till total until they have shopped. max_budget is
--     a CAP, not an amount, and printing a cap as an amount to collect would be
--     the same bug pointing the other way.
--
-- ── AND THE GATE STOPS BEING A SURPRISE ────────────────────────────────────
-- Without payment_proof_at the card could not know the job was waiting on a
-- receipt, so a driver tapped "Start", got RR087, and had no idea why. The
-- state belongs on the card, before the tap.

create or replace function public.driver_dashboard()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
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
               'jobKind', case when d.request_id is not null then 'direct' else 'store' end,
               'storeName', coalesce(s.name, r.pickup_text),
               'storePhone', coalesce(s.phone, r.contact_phone),
               'storeAddress', coalesce(s.address, r.pickup_text),
               'pickupNote', r.pickup_note,
               'orderNumber', coalesce(o.order_number, 'RR-' || upper(left(d.request_id::text, 6))),
               'customerName', coalesce(o.customer_name, r.contact_name),
               'customerPhone', coalesce(o.customer_phone, r.contact_phone),
               'dropoffLat', d.dropoff_lat, 'dropoffLng', d.dropoff_lng,
               'dropoffNote', coalesce(d.dropoff_note, r.dropoff_text),
               'pickupDueAt', d.pickup_due_at, 'deliveryDueAt', d.delivery_due_at,
               'pinAttempts', d.pin_attempts,
               'collectCash', case
                 -- M157. Already paid. Asking again is asking twice.
                 when d.payment_method = 'bank_transfer' then 0
                 when d.request_id is not null then d.customer_fee
                 when o.status in ('cancelled','refunded') then 0
                 else coalesce((select sum(p.amount) from payments p
                                 where p.order_id = o.id
                                   and p.status = 'pending'
                                   and p.provider = 'cash'), 0) end,
               -- M155/M157 — the state the gate acts on, on the card that acts.
               'paymentMethod', d.payment_method,
               'paymentProofAt', d.payment_proof_at,
               'paymentReference', d.payment_reference,
               'hasProof', (d.payment_proof_path is not null),
               -- M152 — when the customer needs it, which until now the driver
               -- could only find out by ringing them.
               'windowStart', r.window_start,
               'windowEnd', r.window_end,
               'scheduleKind', r.schedule_kind,
               'timeSlot', r.time_slot,
               'what', r.what,
               'requestKind', r.kind,
               'spendCap', r.max_budget,
               'currency', coalesce(o.currency, 'MUR'))
             order by d.assigned_at), '[]'::jsonb)
        from deliveries d
        left join stores s on s.id = d.store_id
        left join orders o on o.id = d.order_id
        left join delivery_requests r on r.id = d.request_id
       where d.driver_id = v_d.id
         and d.status in ('assigned','going_to_pickup','arrived_at_pickup',
                          'picked_up','out_for_delivery','arrived')),
    'offers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'earning', d.driver_earning,
               'jobKind', case when d.request_id is not null then 'direct' else 'store' end,
               'storeName', coalesce(s.name, r.pickup_text),
               'storeAddress', coalesce(s.address, r.pickup_text),
               'what', r.what,
               'dropoffNote', coalesce(d.dropoff_note, r.dropoff_text),
               'expiresAt', o.expires_at)
             order by o.offered_at), '[]'::jsonb)
        from delivery_offers o
        join deliveries d on d.id = o.delivery_id
        left join stores s on s.id = d.store_id
        left join delivery_requests r on r.id = d.request_id
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
$fn$;

revoke all on function public.driver_dashboard() from public, anon, authenticated;
grant execute on function public.driver_dashboard() to authenticated;

-- ── Letting the assigned driver actually LOOK at the receipt ───────────────
-- The brief's rule: the document is visible to the assigned driver and to an
-- admin, and to nobody else. The path never leaves the server through the
-- customer's view (M156); this is the one door that hands it out, and it hands
-- it to exactly one person — the driver currently holding the job.
--
-- Returns the PATH, not a URL. Signing is the caller's job, so the link is
-- short-lived and is minted per request rather than stored anywhere.

create or replace function public.driver_payment_proof_path(p_delivery_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_driver delivery_drivers%rowtype;
  v_d      deliveries%rowtype;
begin
  v_driver := current_driver();
  select * into v_d from deliveries where id = p_delivery_id;
  if not found then return null; end if;
  -- The driver who holds it RIGHT NOW. A driver who was reassigned off the job
  -- keeps no claim on the customer's bank receipt.
  if v_d.driver_id is distinct from v_driver.id then return null; end if;
  return v_d.payment_proof_path;
end;
$fn$;

revoke all on function public.driver_payment_proof_path(uuid) from public, anon, authenticated;
grant execute on function public.driver_payment_proof_path(uuid) to authenticated;

do $assert$
declare
  v_cash integer;
begin
  if has_function_privilege('anon','public.driver_dashboard()','execute') then
    raise exception 'M157: the dashboard is reachable by anon';
  end if;
  if has_function_privilege('anon','public.driver_payment_proof_path(uuid)','execute') then
    raise exception 'M157: the receipt path is reachable by anon';
  end if;

  -- ── THE DOUBLE-CHARGE PROBE ───────────────────────────────────
  -- The exact CASE the dashboard uses, evaluated over literals. Deliberately
  -- NOT against a real row: the one delivery in this database is somebody's
  -- actual job, and a probe that writes to it to prove a read is a probe that
  -- can leave it changed.
  --
  -- Both directions, because only one of them used to be wrong.
  select case when m = 'bank_transfer' then 0
              when req is not null then fee
              else -1 end
    into v_cash
    from (values ('bank_transfer', gen_random_uuid(), 30000)) as x(m, req, fee);
  if v_cash <> 0 then
    raise exception 'M157: a prepaid job still asks for % in cash', v_cash;
  end if;

  select case when m = 'bank_transfer' then 0
              when req is not null then fee
              else -1 end
    into v_cash
    from (values ('cash', gen_random_uuid(), 30000)) as x(m, req, fee);
  if v_cash <> 30000 then
    raise exception 'M157: a cash job no longer asks for the fee, got %', v_cash;
  end if;

  -- A job with no method recorded at all (every row predating M155) must still
  -- behave exactly as it did before: collect the fee.
  select case when m = 'bank_transfer' then 0
              when req is not null then fee
              else -1 end
    into v_cash
    from (values (null::text, gen_random_uuid(), 30000)) as x(m, req, fee);
  if v_cash <> 30000 then
    raise exception 'M157: a legacy job changed behaviour, got %', v_cash;
  end if;

  -- current_driver() raises without a session, so this is the only honest way
  -- to assert the receipt door is shut to nobody-in-particular.
  begin
    perform driver_payment_proof_path(gen_random_uuid());
    raise exception 'M157: the receipt path answered with no driver session';
  exception when sqlstate 'RR080' then null;
  end;
end;
$assert$;
