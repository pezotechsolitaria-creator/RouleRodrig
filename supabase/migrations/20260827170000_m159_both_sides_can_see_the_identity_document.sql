-- ── M159 — both sides can see the identity document ──────────────────
--
-- M158 stored it and gated on it. Neither surface could read it, so the
-- customer's screen could not say whether theirs had arrived and the driver's
-- card could not say one was waiting to be checked.
--
-- WHAT IS EXPOSED IS A TIMESTAMP AND A BOOLEAN. Not the path. The path is the
-- one thing about this document that must not travel: it goes out only as a
-- five-minute signed URL, minted server-side, for the driver currently holding
-- the job.

create or replace function public.delivery_request_view(
  p_id uuid,
  p_email text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_r     delivery_requests%rowtype;
  v_del   deliveries%rowtype;
  v_drv   delivery_drivers%rowtype;
  v_key   text;
  v_cash  integer;
begin
  select * into v_r from delivery_requests where id = p_id;
  if not found then
    return null;
  end if;

  -- Null rather than an error: a distinguishable "exists but not yours" is an
  -- oracle for probing which request ids are real.
  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return null; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return null; end if;
  end if;

  select * into v_del from deliveries where request_id = v_r.id;
  if v_del.driver_id is not null then
    select * into v_drv from delivery_drivers where id = v_del.driver_id;
  end if;
  if v_del.id is not null then
    select t.channel_key into v_key
      from trip_tracking t where t.trip_kind = 'delivery' and t.trip_id = v_del.id;
  end if;

  -- M155. The screen has to know the cap BEFORE offering cash, or the choice
  -- is offered and then refused, which is the worst order to do it in.
  select cash_limit_cents into v_cash from delivery_settings where id = 'main';

  return jsonb_build_object(
    'id', v_r.id,
    'kind', v_r.kind,
    'what', v_r.what,
    'sizeClass', v_r.size_class,
    'cargoKind', v_r.cargo_kind,
    'photoPath', v_r.photo_url,
    'status', v_r.status,
    -- M152.
    'scheduleKind', v_r.schedule_kind,
    'timeSlot', v_r.time_slot,
    'windowStart', v_r.window_start,
    'windowEnd', v_r.window_end,
    'cashLimit', v_cash,
    'pickupText', v_r.pickup_text,
    'pickupNote', v_r.pickup_note,
    'pickupLat', v_r.pickup_lat,
    'pickupLng', v_r.pickup_lng,
    'dropoffText', v_r.dropoff_text,
    'dropoffNote', v_r.dropoff_note,
    'dropoffLat', v_r.dropoff_lat,
    'dropoffLng', v_r.dropoff_lng,
    'spendCap', v_r.max_budget,
    'contactName', v_r.contact_name,
    'contactPhone', v_r.contact_phone,
    'createdAt', v_r.created_at,
    'expiresAt', v_r.expires_at,
    'cancelReason', v_r.cancel_reason,
    'quotes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id, 'fee', q.fee, 'note', q.note, 'status', q.status,
               'createdAt', q.created_at,
               'driverName', d.full_name,
               'vehicleType', d.vehicle_type,
               'driverPhone', case when q.status = 'accepted' then d.phone end,
               'completed', coalesce(m.deliveries_completed, 0),
               'rating', case when coalesce(m.rating_count, 0) = 0 then null
                              else round(m.rating_sum::numeric / m.rating_count, 1) end,
               'ratingCount', coalesce(m.rating_count, 0))
             order by q.fee, q.created_at), '[]'::jsonb)
        from delivery_quotes q
        join delivery_drivers d on d.id = q.driver_id
        left join driver_metrics m on m.driver_id = q.driver_id
       where q.request_id = v_r.id
         and q.status in ('offered', 'accepted')),
    'delivery', case when v_del.id is null then null else jsonb_build_object(
      'id', v_del.id,
      'status', v_del.status,
      'fee', v_del.customer_fee,
      'pin', v_del.pin,
      'assignedAt', v_del.assigned_at,
      'pickedUpAt', v_del.picked_up_at,
      'deliveredAt', v_del.delivered_at,
      'driverId', v_del.driver_id,
      'driverName', v_drv.full_name,
      'driverPhone', v_drv.phone,
      'vehicleType', v_drv.vehicle_type,
      -- M155. The PATH is never returned: it is a private object, and the
      -- customer already knows what they uploaded. Only whether it landed.
      'paymentMethod', v_del.payment_method,
      'paymentProofAt', v_del.payment_proof_at,
      'paymentReference', v_del.payment_reference,
      -- M158. WHETHER the ID landed, never where it is. The path is the one
      -- thing about this document that must not travel.
      'idDocumentAt', v_del.id_document_at,
      'tripId', v_del.id,
      'channelKey', v_key) end
  );
end;
$fn$;

revoke all on function public.delivery_request_view(uuid, text) from public, anon, authenticated;
grant execute on function public.delivery_request_view(uuid, text) to authenticated;

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
               -- M158. The driver checks this AT THE DOOR, so the card has to
               -- know it exists before they set off.
               'idDocumentAt', d.id_document_at,
               'hasIdDocument', (d.id_document_path is not null),
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

do $assert$
begin
  if delivery_request_view(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M159: invented a request';
  end if;
  if has_function_privilege('anon','public.delivery_request_view(uuid, text)','execute')
     or has_function_privilege('anon','public.driver_dashboard()','execute') then
    raise exception 'M159: a surface is reachable by anon';
  end if;
end;
$assert$;
