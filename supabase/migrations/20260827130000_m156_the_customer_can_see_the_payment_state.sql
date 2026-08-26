-- ── M156 — the customer can see the payment state ───────────────────
--
-- M155 gave a delivery a payment method and a place to hang the receipt.
-- delivery_request_view returned neither, so the screen that has to ASK how
-- somebody will pay could not see the answer, and the screen waiting on a
-- transfer receipt could not tell whether one had arrived.
--
-- Two things are added, and one is deliberately withheld:
--
--   cashLimit, at the top level, so the choice can be greyed with a reason
--   instead of offered and then refused by the server.
--
--   paymentMethod / paymentProofAt / paymentReference on the delivery.
--
--   NOT payment_proof_path. The object is private, the customer already knows
--   what they uploaded, and a path in a JSON payload is a path in a log.

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
      'tripId', v_del.id,
      'channelKey', v_key) end
  );
end;
$fn$;

revoke all on function public.delivery_request_view(uuid, text) from public, anon, authenticated;
grant execute on function public.delivery_request_view(uuid, text) to authenticated;

do $assert$
begin
  if delivery_request_view(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M156: invented a request';
  end if;
  if has_function_privilege('anon','public.delivery_request_view(uuid, text)','execute') then
    raise exception 'M156: the view is reachable by anon';
  end if;
end;
$assert$;
