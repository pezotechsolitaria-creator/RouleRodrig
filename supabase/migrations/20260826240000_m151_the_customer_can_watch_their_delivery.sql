-- ── M151 — the customer can watch their delivery ───────────────────────────
--
-- The owner asked "does the user see their delivery live?". The answer was no,
-- and the reason was one missing door.
--
-- Everything else already existed: trip_tracking, driver_locations, the
-- tracking snapshot, and components/tracking/LiveTripView, which the TAXI
-- customer has used all along. /api/tracking/trip even has a delivery branch —
-- but it authorises by ORDER id, and a Deliver Anything job has no order. So
-- the one kind of delivery this whole rebuild is about was the one kind nobody
-- could watch. The DRIVER could see the map; the customer could not.
--
-- delivery_request_trip is that door, with the credential every other guest
-- action here uses: own it by session, or prove it with the email it was posted
-- under. Same silence too — null for "no such request" and "not yours" alike.
--
-- delivery_request_view gains channelKey so the screen can decide honestly when
-- to show a map. The key is minted only once a trip row exists with a driver on
-- it, so its presence means "there is genuinely something to plot" — better
-- than inferring it from a status and rendering an empty map.

create or replace function public.delivery_request_trip(p_request_id uuid, p_email text default null)
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
  v_d     deliveries%rowtype;
  v_key   text;
begin
  select * into v_r from delivery_requests where id = p_request_id;
  if not found then return null; end if;

  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return null; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return null; end if;
  end if;

  select * into v_d from deliveries where request_id = v_r.id;
  if not found then return null; end if;

  select t.channel_key into v_key
    from trip_tracking t where t.trip_kind = 'delivery' and t.trip_id = v_d.id;

  return jsonb_build_object('tripId', v_d.id, 'channelKey', v_key, 'status', v_d.status);
end;
$fn$;

revoke all on function public.delivery_request_trip(uuid, text) from public, anon, authenticated;
grant execute on function public.delivery_request_trip(uuid, text) to authenticated;

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
begin
  select * into v_r from delivery_requests where id = p_id;
  if not found then
    return null;
  end if;

  -- The ownership gate. Null rather than an error: a distinguishable "exists
  -- but not yours" is an oracle for probing which request ids are real.
  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return null; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return null; end if;
  end if;

  select * into v_del from deliveries where request_id = v_r.id;
  -- Only when somebody actually holds it (M141).
  if v_del.driver_id is not null then
    select * into v_drv from delivery_drivers where id = v_del.driver_id;
  end if;
  if v_del.id is not null then
    select t.channel_key into v_key
      from trip_tracking t where t.trip_kind = 'delivery' and t.trip_id = v_del.id;
  end if;

  return jsonb_build_object(
    'id', v_r.id,
    'kind', v_r.kind,
    'what', v_r.what,
    'sizeClass', v_r.size_class,
    'cargoKind', v_r.cargo_kind,
    'photoPath', v_r.photo_url,
    'status', v_r.status,
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
               -- Released only to the customer who has already chosen them.
               'driverPhone', case when q.status = 'accepted' then d.phone end,
               'completed', coalesce(m.deliveries_completed, 0),
               -- Real at last: M150 gave rating_sum/rating_count a writer.
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
      -- What the live map needs.
      'tripId', v_del.id,
      'channelKey', v_key) end
  );
end;
$fn$;

revoke all on function public.delivery_request_view(uuid, text) from public, anon, authenticated;
grant execute on function public.delivery_request_view(uuid, text) to authenticated;

do $assert$
begin
  if has_function_privilege('anon','public.delivery_request_trip(uuid, text)','execute') then
    raise exception 'M151: the trip lookup is reachable by anon';
  end if;
  if has_function_privilege('anon','public.delivery_request_view(uuid, text)','execute') then
    raise exception 'M151: the view is reachable by anon';
  end if;
  if delivery_request_trip(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M151: invented a trip';
  end if;
  if delivery_request_view(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M151: invented a request';
  end if;
end;
$assert$;
