-- ── M154 — the customer, their history and the alerts all know the window ──
--
-- M152 stored it and M153 sorted on it. Everything a CUSTOMER looks at was
-- still blind to it: the request page could not say when the thing was coming,
-- and the history list could not tell a job that had passed from one still
-- ahead. A column only exists as far as the surfaces that read it.
--
-- ── AND THE FAN-OUT LEARNS TO BE QUIET ────────────────────────────────────
-- The push and WhatsApp fan-outs message every eligible driver the moment a
-- request is posted. With scheduling, that means a driver's phone buzzes at 9pm
-- about a hamper somebody wants delivered on 25 December.
--
-- That is the same failure as the board ordering, in the channel where it costs
-- most: the notification that matters gets learned as noise, and then the ASAP
-- job at 11am is the one nobody opens. So the fan-out now only fires for work
-- starting within 48 hours. Everything further out is on the board, sorted into
-- its place, waiting to be looked at — which is the right way to meet a job
-- that is three months away.

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
      'tripId', v_del.id,
      'channelKey', v_key) end
  );
end;
$fn$;

revoke all on function public.delivery_request_view(uuid, text) from public, anon, authenticated;
grant execute on function public.delivery_request_view(uuid, text) to authenticated;

create or replace function public.my_delivery_requests()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'kind', r.kind,
           'what', r.what,
           'status', r.status,
           'pickupText', r.pickup_text,
           'dropoffText', r.dropoff_text,
           'createdAt', r.created_at,
           'expiresAt', r.expires_at,
           'scheduleKind', r.schedule_kind,
           'timeSlot', r.time_slot,
           'windowStart', r.window_start,
           'windowEnd', r.window_end,
           'deliveryStatus', (select d.status from deliveries d
                               where d.request_id = r.id
                               order by d.created_at desc limit 1),
           'quoteCount', (select count(*) from delivery_quotes q
                           where q.request_id = r.id and q.status = 'offered'),
           'bestQuote', (select min(q.fee) from delivery_quotes q
                          where q.request_id = r.id and q.status = 'offered'))
         -- Soonest-needed first, not newest-posted. A person with three open
         -- requests cares about the one happening this afternoon.
         order by greatest(r.window_start, now()) asc, r.created_at desc), '[]'::jsonb)
    from delivery_requests r
   where auth.uid() is not null and r.customer_id = auth.uid();
$fn$;

revoke all on function public.my_delivery_requests() from public, anon, authenticated;
grant execute on function public.my_delivery_requests() to authenticated;

-- ── The fan-outs go quiet for far-future work ──────────────────────────────

create or replace function public.request_push_targets(p_request_id uuid)
returns table(endpoint text, p256dh text, auth text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_handle(d.vehicle_type, r.size_class, r.cargo_kind)
    join push_subscriptions s on s.user_id = d.user_id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     -- Only work that is nearly here. A buzz about Christmas in September is
     -- how a driver learns to ignore the buzz.
     and (r.window_start is null or r.window_start <= now() + interval '48 hours')
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$fn$;

create or replace function public.request_whatsapp_targets(p_request_id uuid)
returns table(phone text, api_key text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_handle(d.vehicle_type, r.size_class, r.cargo_kind)
    join driver_contact_channels c on c.driver_id = d.id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     and (r.window_start is null or r.window_start <= now() + interval '48 hours')
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> ''
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$fn$;

revoke all on function public.request_push_targets(uuid) from public, anon, authenticated;
revoke all on function public.request_whatsapp_targets(uuid) from public, anon, authenticated;

do $assert$
declare
  v_far uuid;
  v_near uuid;
  v_zone constant text := 'Indian/Mauritius';
begin
  if delivery_request_view(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M154: invented a request';
  end if;
  if has_function_privilege('anon','public.delivery_request_view(uuid, text)','execute') then
    raise exception 'M154: the view is reachable by anon';
  end if;

  -- A far-future request must reach NOBODY through the fan-out, and a near one
  -- must still be eligible to. Zero approved+online drivers exist right now, so
  -- both counts are 0 either way -- which would make a naive probe pass without
  -- proving anything. Assert the PREDICATE instead, against real rows.
  insert into delivery_requests
    (kind, what, pickup_text, dropoff_text, contact_name, contact_phone,
     guest_email, schedule_kind, time_slot, window_start, window_end, expires_at)
  values
    ('package','Christmas','Port Mathurin','Mont Lubin','A','+23050000001',
     'probe154@example.com','date','any',
     now() + interval '80 days', now() + interval '80 days' + interval '12 hours',
     now() + interval '80 days')
  returning id into v_far;

  insert into delivery_requests
    (kind, what, pickup_text, dropoff_text, contact_name, contact_phone,
     guest_email, schedule_kind, time_slot, window_start, window_end, expires_at)
  values
    ('package','Tomorrow','Port Mathurin','Mont Lubin','B','+23050000002',
     'probe154@example.com','tomorrow','morning',
     now() + interval '20 hours', now() + interval '24 hours',
     now() + interval '24 hours')
  returning id into v_near;

  if (select count(*) from delivery_requests r
       where r.id = v_far
         and r.window_start <= now() + interval '48 hours') <> 0 then
    raise exception 'M154: an 80-day-out request counts as near-term';
  end if;
  if (select count(*) from delivery_requests r
       where r.id = v_near
         and r.window_start <= now() + interval '48 hours') <> 1 then
    raise exception 'M154: a tomorrow request does not count as near-term';
  end if;

  -- And the history list orders by soonest-needed.
  if (select (jsonb_array_length(my_delivery_requests())) ) is null then
    raise exception 'M154: the history list no longer answers';
  end if;

  delete from delivery_requests where guest_email = 'probe154@example.com';
  if (select count(*) from delivery_requests) <> 0 then
    raise exception 'M154: probe rows were left behind';
  end if;
end;
$assert$;
