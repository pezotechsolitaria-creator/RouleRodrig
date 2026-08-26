-- ── M142 — three more readers that could not see a Deliver Anything job ────
--
-- The same class of defect as M136 and M138, found by the same audit, in the
-- three places nobody had checked yet. A delivery born from a quote has
-- store_id NULL and order_id NULL, and each of these dereferenced one of them.
--
--   ensure_trip_tracking()   the LIVE TRIP had no collection point at all.
--                            It reads pickup solely from `stores`, so a job
--                            whose entire content is "collect from Port
--                            Mathurin market" produced a trip with a null
--                            pickup label and null coordinates — the driver's
--                            own tracking screen could not draw where he was
--                            being sent.
--
--   admin_live_map()         the owner watching a driver who had gone quiet
--                            mid-delivery saw the drop-off and an em dash
--                            where the collection point belongs, and the map
--                            drew no pickup marker. It also passed
--                            customerName/customerPhone as literal nulls, so
--                            the owner could not ring the person waiting.
--
--   admin_operations_feed()  BOTH delivery loops inner-joined orders, so a
--                            direct delivery in requires_admin,
--                            driver_unresponsive or failed_delivery never
--                            reached the Command Centre alert list — the
--                            surface whose entire job is to be the place
--                            nothing gets missed. A driver could vanish with
--                            somebody's package and the feed would stay empty.
--
-- Every fix is the same shape: LEFT JOIN delivery_requests and coalesce onto
-- it. Nothing about the store-order path changes.
--
-- ── One addition ───────────────────────────────────────────────────────────
-- The feed gains "Quoted but not booked": a request that has had prices sitting
-- on it for six hours and has not been booked. The owner cannot act for the
-- customer, but a marketplace where prices arrive and nobody books is failing
-- at the last step, and this is the only place that would ever say so.

create or replace function public.ensure_trip_tracking(p_trip_kind text, p_trip_id uuid)
returns trip_tracking
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_t public.trip_tracking%rowtype;
  v_r ride_requests%rowtype;
  v_d deliveries%rowtype;
  v_s stores%rowtype;
  v_q delivery_requests%rowtype;
begin
  select * into v_t from trip_tracking where trip_kind = p_trip_kind and trip_id = p_trip_id;
  if found then return v_t; end if;
  if p_trip_kind = 'ride' then
    select * into v_r from ride_requests where id = p_trip_id;
    if not found then return v_t; end if;
    insert into trip_tracking (trip_kind, trip_id, driver_kind, driver_id,
      pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_label, dropoff_label)
    values ('ride', p_trip_id, 'taxi', v_r.driver_id,
      v_r.pickup_lat, v_r.pickup_lng, v_r.dropoff_lat, v_r.dropoff_lng,
      v_r.pickup_label, v_r.dropoff_label)
    on conflict (trip_kind, trip_id) do nothing;
  elsif p_trip_kind = 'delivery' then
    select * into v_d from deliveries where id = p_trip_id;
    if not found then return v_t; end if;
    select * into v_s from stores where id = v_d.store_id;
    -- A direct job's pickup lives on the request. Without this the driver's own
    -- tracking screen had nowhere to send him.
    select * into v_q from delivery_requests where id = v_d.request_id;
    insert into trip_tracking (trip_kind, trip_id, driver_kind, driver_id,
      pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_label, dropoff_label)
    values ('delivery', p_trip_id, 'delivery', v_d.driver_id,
      coalesce(v_s.lat, v_q.pickup_lat), coalesce(v_s.lng, v_q.pickup_lng),
      v_d.dropoff_lat, v_d.dropoff_lng,
      coalesce(v_s.name, v_q.pickup_text, 'Collection point'),
      coalesce(v_d.dropoff_note, v_q.dropoff_text, 'Delivery address'))
    on conflict (trip_kind, trip_id) do nothing;
  else
    return v_t;
  end if;
  select * into v_t from trip_tracking where trip_kind = p_trip_kind and trip_id = p_trip_id;
  return v_t;
end;
$fn$;

create or replace function public.admin_live_map()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_stale integer; v_out jsonb;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  select stale_location_minutes * 60 into v_stale from dispatch_settings where id='main';
  select jsonb_build_object(
    'ok', true, 'staleAfterSeconds', v_stale, 'at', now(),
    'drivers', coalesce(jsonb_agg(d order by d->>'name'), '[]'::jsonb))
    into v_out
  from (
    select jsonb_build_object(
      'kind','taxi', 'id', t.id, 'name', t.name, 'phone', coalesce(t.whatsapp, t.phone),
      'vehicle', t.vehicle, 'vehicleType', t.vehicle_type,
      'availability', case when not t.active then 'off' else t.availability end,
      'services', array_remove(array[
        case when t.handles_taxi     then 'taxi'     end,
        case when t.handles_airport  then 'airport'  end,
        case when t.handles_transfer then 'transfer' end], null),
      'lat', coalesce(l.lat, t.base_lat), 'lng', coalesce(l.lng, t.base_lng),
      'positionSource', case when l.driver_id is not null then 'live'
                             when t.base_lat is not null then 'base' else null end,
      'heading', l.heading, 'speedKmh', l.speed_kmh,
      'ageSeconds', case when l.recorded_at is null then null
                         else extract(epoch from (now() - l.recorded_at))::integer end,
      'trackingStatus', coalesce(l.tracking_status, 'offline'),
      'job', case when r.id is null then null else jsonb_build_object(
        'kind','ride', 'id', r.id, 'status', r.status,
        'ref', 'RR-' || upper(substring(replace(r.id::text,'-',''), 1, 6)),
        'customerName', r.customer_name, 'customerPhone', r.customer_phone,
        'pickup', r.pickup_label, 'dropoff', r.dropoff_label,
        'dropoffLat', r.dropoff_lat, 'dropoffLng', r.dropoff_lng,
        'pickupLat', r.pickup_lat, 'pickupLng', r.pickup_lng,
        'channelKey', tt.channel_key) end) as d
    from taxi_drivers t
    left join driver_locations l on l.driver_kind='taxi' and l.driver_id = t.id
    left join lateral (
      select * from ride_requests rr
       where rr.driver_id = t.id
         and rr.status in ('assigned','driver_on_way','arrived','on_trip')
       order by rr.assigned_at desc limit 1) r on true
    left join trip_tracking tt on tt.trip_kind='ride' and tt.trip_id = r.id
    union all
    select jsonb_build_object(
      'kind','delivery', 'id', dd.id, 'name', dd.full_name, 'phone', dd.phone,
      'vehicle', dd.vehicle_details, 'vehicleType', dd.vehicle_type,
      'availability', case when dd.status <> 'approved' then 'off' else dd.availability::text end,
      'services', array['delivery'],
      'lat', l.lat, 'lng', l.lng,
      'positionSource', case when l.driver_id is not null then 'live' else null end,
      'heading', l.heading, 'speedKmh', l.speed_kmh,
      'ageSeconds', case when l.recorded_at is null then null
                         else extract(epoch from (now() - l.recorded_at))::integer end,
      'trackingStatus', coalesce(l.tracking_status, 'offline'),
      'job', case when dl.id is null then null else jsonb_build_object(
        'kind','delivery', 'id', dl.id, 'status', dl.status::text,
        'ref', 'RR-' || upper(substring(replace(dl.id::text,'-',''), 1, 6)),
        -- Were literal nulls. On a direct job the request knows who is waiting,
        -- and an owner watching a stalled driver needs to be able to ring them.
        'customerName', dq.contact_name, 'customerPhone', dq.contact_phone,
        'pickup', coalesce(st.name, dq.pickup_text),
        'dropoff', coalesce(dl.dropoff_note, dq.dropoff_text),
        'dropoffLat', dl.dropoff_lat, 'dropoffLng', dl.dropoff_lng,
        'pickupLat', coalesce(st.lat, dq.pickup_lat),
        'pickupLng', coalesce(st.lng, dq.pickup_lng),
        'channelKey', tt2.channel_key) end) as d
    from delivery_drivers dd
    left join driver_locations l on l.driver_kind='delivery' and l.driver_id = dd.id
    left join lateral (
      select * from deliveries d2
       where d2.driver_id = dd.id
         and d2.status in ('assigned','going_to_pickup','arrived_at_pickup',
                           'picked_up','out_for_delivery','arrived')
       order by d2.assigned_at desc limit 1) dl on true
    left join stores st on st.id = dl.store_id
    left join delivery_requests dq on dq.id = dl.request_id
    left join trip_tracking tt2 on tt2.trip_kind='delivery' and tt2.trip_id = dl.id
  ) s;
  return v_out;
end;
$fn$;

create or replace function public.admin_operations_feed()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_items jsonb := '[]'::jsonb;
  r record;
  v_set delivery_settings%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = '42501', message = 'Not permitted.';
  end if;

  select * into v_set from delivery_settings where id = 'main';

  for r in
    select d.id, d.status::text as status,
           coalesce(o.order_number, 'RR-' || upper(left(d.request_id::text, 6))) as order_number,
           extract(epoch from (now() - d.created_at))/60 as mins
      from deliveries d
      left join orders o on o.id = d.order_id
     where d.status in ('requires_admin', 'driver_unresponsive', 'failed_delivery')
     order by d.created_at asc limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','critical','kind','delivery',
      'title', case r.status
                 when 'requires_admin' then 'Delivery needs you'
                 when 'driver_unresponsive' then 'Driver unresponsive'
                 else 'Failed delivery' end,
      'detail', format('Order %s, %s min old', r.order_number, round(r.mins)),
      'link','/admin/deliveries','id', r.id);
  end loop;

  for r in
    select d.id,
           coalesce(o.order_number, 'RR-' || upper(left(d.request_id::text, 6))) as order_number,
           d.offer_rounds,
           extract(epoch from (now() - d.created_at))/60 as mins
      from deliveries d
      left join orders o on o.id = d.order_id
     where d.status = 'searching_driver'
       and d.created_at < now() - make_interval(mins => coalesce(v_set.accept_window_minutes, 10) * 2)
     limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','critical','kind','delivery','title','No driver yet',
      'detail', format('Order %s, %s min, %s rounds', r.order_number, round(r.mins), r.offer_rounds),
      'link','/admin/deliveries','id', r.id);
  end loop;

  for r in
    select h.name, extract(epoch from (now() - h.last_ok_at))/60 as mins
      from system_heartbeats h where h.last_ok_at < now() - interval '15 minutes'
  loop
    v_items := v_items || jsonb_build_object(
      'severity','critical','kind','system','title','Notification worker is down',
      'detail', format('No run for %s min. WhatsApp and delivery escalation have stopped.', round(r.mins)),
      'link','/admin/notifications','id', r.name);
  end loop;

  for r in
    select o.id, o.order_number, extract(epoch from (now() - o.created_at))/3600 as hours
      from orders o where o.status = 'awaiting_payment_confirmation'
     order by o.created_at asc limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','high','kind','payment','title','Payment proof to check',
      'detail', format('Order %s, waiting %s h', r.order_number, round(r.hours)),
      'link','/admin','id', r.id);
  end loop;

  for r in
    select oa.id, coalesce(oa.listing_type, 'listing') as kind_label,
           coalesce(nullif(btrim(oa.business_name), ''), oa.owner_name, 'Someone') as who,
           extract(epoch from (now() - oa.created_at))/3600 as hours
      from owner_applications oa
     where oa.status = 'pending'
     order by oa.created_at asc limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity', case when r.hours > 48 then 'critical' else 'high' end,
      'kind','application',
      'title', format('New %s application', r.kind_label),
      'detail', format('%s, waiting %s h', r.who, round(r.hours)),
      'link','/admin#owners','id', r.id);
  end loop;

  for r in
    select m.id, m.display_name, extract(epoch from (now() - m.created_at))/3600 as hours
      from merchants m
     where m.status = 'pending' and m.system_key is null
     order by m.created_at asc limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','high','kind','merchant','title','Merchant awaiting approval',
      'detail', format('%s, waiting %s h', coalesce(r.display_name,'A business'), round(r.hours)),
      'link','/admin/subscriptions','id', r.id);
  end loop;

  for r in
    select dd.id, dd.full_name, extract(epoch from (now() - dd.created_at))/3600 as hours
      from delivery_drivers dd where dd.status = 'pending' limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','high','kind','driver','title','Driver application',
      'detail', format('%s, waiting %s h', r.full_name, round(r.hours)),
      'link','/admin/deliveries','id', r.id);
  end loop;

  -- A Deliver Anything request that has been quoted and left unbooked. The
  -- owner cannot act on the customer's behalf, but a marketplace where prices
  -- arrive and nobody books is failing at the last step, and this is the only
  -- place that would ever tell them.
  for r in
    select dr.id, dr.what,
           extract(epoch from (now() - dr.created_at))/3600 as hours,
           (select count(*) from delivery_quotes q
             where q.request_id = dr.id and q.status = 'offered') as quotes
      from delivery_requests dr
     where dr.status = 'open'
       and (dr.expires_at is null or dr.expires_at > now())
       and dr.created_at < now() - interval '6 hours'
       and exists (select 1 from delivery_quotes q
                    where q.request_id = dr.id and q.status = 'offered')
     order by dr.created_at asc limit 10
  loop
    v_items := v_items || jsonb_build_object(
      'severity','notice','kind','delivery','title','Quoted but not booked',
      'detail', format('%s — %s price(s), waiting %s h', left(r.what, 40), r.quotes, round(r.hours)),
      'link','/admin/deliveries','id', r.id);
  end loop;

  for r in
    select nj.id, nj.type, nj.error
      from notification_jobs nj
     where nj.status = 'failed' and nj.created_at > now() - interval '3 days'
     order by nj.created_at desc limit 10
  loop
    v_items := v_items || jsonb_build_object(
      'severity','notice','kind','system','title','Message never sent',
      'detail', format('%s — %s', r.type, coalesce(left(r.error, 80), 'no reason recorded')),
      'link','/admin/notifications','id', r.id);
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'counts', jsonb_build_object(
      'critical', (select count(*) from jsonb_array_elements(v_items) e where e->>'severity'='critical'),
      'high',     (select count(*) from jsonb_array_elements(v_items) e where e->>'severity'='high'),
      'notice',   (select count(*) from jsonb_array_elements(v_items) e where e->>'severity'='notice')),
    'generatedAt', now());
end;
$fn$;

do $assert$
declare v_feed jsonb; v_map jsonb;
begin
  v_feed := admin_operations_feed();
  if v_feed->'items' is null then raise exception 'M142: the feed lost its items'; end if;
  v_map := admin_live_map();
  if (v_map->>'ok') is distinct from 'true' then raise exception 'M142: the live map broke'; end if;
  raise notice 'M142: feed and map both answer';
end;
$assert$;

-- The three fixes, proved against a real direct delivery in a subtransaction
-- that rolls back. Verified when applied: trip pickup present, live map names
-- "Port Mathurin", and a requires_admin direct delivery reaches the feed.
do $assert$
declare
  v_driver uuid; v_user uuid;
begin
  select id into v_driver from delivery_drivers where status='approved' limit 1;
  select id into v_user from auth.users limit 1;
  if v_driver is null or v_user is null then
    raise notice 'M142: no driver or user to probe with, skipping behavioural check';
    return;
  end if;

  begin
    declare
      v_r uuid; v_q uuid; v_del uuid; v_feed jsonb; v_map jsonb; v_trip trip_tracking%rowtype;
      v_found boolean := false; e jsonb;
    begin
      update delivery_drivers set availability='available', user_id=v_user where id=v_driver;
      insert into driver_metrics (driver_id) values (v_driver) on conflict do nothing;

      v_r := create_delivery_request('package','Probe box','Port Mathurin','Fatima Bay',
               'Probe','+23057000000','standard',null,null,null,-19.68,63.42,-19.75,63.40,'p142@example.com');
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, v_driver, 25000, 'offered', now() + interval '1 day') returning id into v_q;
      v_del := accept_delivery_quote(v_q);

      -- 1. The live trip must have a collection point.
      v_trip := ensure_trip_tracking('delivery', v_del);
      if v_trip.pickup_label is null or v_trip.pickup_lat is null then
        raise exception 'M142_FAIL: the trip has no pickup (label=%, lat=%)',
          v_trip.pickup_label, v_trip.pickup_lat;
      end if;

      -- 2. The live map must name the pickup.
      update deliveries set status='picked_up' where id=v_del;
      v_map := admin_live_map();
      if not exists (
        select 1 from jsonb_array_elements(v_map->'drivers') dd
         where dd->'job'->>'id' = v_del::text
           and dd->'job'->>'pickup' = 'Port Mathurin') then
        raise exception 'M142_FAIL: the live map still shows no pickup for a direct job';
      end if;

      -- 3. A broken direct delivery must reach the operations feed.
      update deliveries set status='requires_admin' where id=v_del;
      v_feed := admin_operations_feed();
      for e in select * from jsonb_array_elements(v_feed->'items') loop
        if e->>'id' = v_del::text then v_found := true; end if;
      end loop;
      if not v_found then
        raise exception 'M142_FAIL: a requires_admin direct delivery never reached the feed';
      end if;

      raise exception 'M142_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M142_FAIL%' then raise; end if;
      if sqlerrm <> 'M142_PROBE_DONE' then
        raise exception 'M142: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M142: trip pickup, live map and operations feed all proved, probe rolled back';
  end;
end;
$assert$;
