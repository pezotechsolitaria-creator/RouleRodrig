-- ══════════════════════════════════════════════════════════════════════════
-- M113 / M114 — a driver id for presence, and the fix for "I see nothing"
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied to production as m113_driver_home_returns_id and
-- m114_lookup_ride_starts_the_watch, captured here in that order. M114's body
-- supersedes M110/M109c's version of lookup_ride.

-- ── M113 · the taxi driver's page learns its own id ───────────────────────
-- Fleet presence keys a driver's slot on their id so the admin board can match
-- "somebody is transmitting" to a row in taxi_drivers. taxi_driver_home never
-- returned one: the token WAS the identity and nothing downstream needed more.
--
-- Safe to give the holder of that token. It is their own row's primary key, it
-- is already returned for delivery drivers by delivery_tracking_context, and on
-- its own it grants nothing — every function that acts on a taxi driver
-- resolves them from the token, never from an id a caller supplies.
create or replace function public.taxi_driver_home(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_t taxi_drivers%rowtype; v_offer jsonb; v_job jsonb; v_r ride_requests%rowtype;
        v_key text;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false); end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;

  select jsonb_build_object('token', o.token, 'pickup', r.pickup_label,
                            'dropoff', r.dropoff_label, 'price', r.quoted_price,
                            'passengers', r.passengers, 'expiresAt', o.expires_at)
    into v_offer
    from ride_offers o join ride_requests r on r.id = o.request_id
   where o.driver_id = v_t.id and o.status = 'offered' and o.expires_at > now()
   order by o.offered_at desc limit 1;

  select * into v_r from ride_requests r
   where r.driver_id = v_t.id
     and r.status in ('assigned','driver_on_way','arrived','on_trip')
   order by r.assigned_at desc limit 1;

  if found then
    perform ensure_trip_tracking('ride', v_r.id);
    select channel_key into v_key from trip_tracking
     where trip_kind = 'ride' and trip_id = v_r.id and ended_at is null;

    v_job := jsonb_build_object(
      'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label,
      'customerName', v_r.customer_name, 'customerPhone', v_r.customer_phone,
      'status', v_r.status, 'price', v_r.quoted_price,
      'kind', 'ride', 'id', v_r.id, 'channelKey', v_key,
      'pickupLat', v_r.pickup_lat, 'pickupLng', v_r.pickup_lng,
      'dropoffLat', v_r.dropoff_lat, 'dropoffLng', v_r.dropoff_lng);
  end if;

  return jsonb_build_object('ok', true, 'name', v_t.name,
    'driverId', v_t.id,                      -- M113
    'availability', v_t.availability, 'vehicle', v_t.vehicle,
    'vehicleType', v_t.vehicle_type,
    'whatsappReady', (v_t.whatsapp_api_key is not null and length(v_t.whatsapp_api_key) > 0),
    'ridesCompleted', v_t.rides_completed,
    'offer', v_offer, 'job', v_job);
end;
$function$;
revoke all on function public.taxi_driver_home(text) from public;
grant execute on function public.taxi_driver_home(text) to anon, authenticated, service_role;

-- ── M114 · the customer's door STARTS the watch ───────────────────────────
-- THE BUG. trip_tracking rows are created lazily by ensure_trip_tracking().
-- Three callers created them — taxi_driver_home, driver_tracking_context and
-- /api/tracking/trip — and all three are on the DRIVER's or the server's side.
--
-- lookup_ride, the CUSTOMER's door, only ever did a READ:
--
--     select channel_key into v_key from trip_tracking where ...
--
-- against a row nobody had created. So a passenger who opened tracking before
-- their driver had opened their own page got channelKey = null, and the live
-- view is gated on that key — no map, no route, no driver card.
--
-- That is the ORDINARY order of events, not an edge case: the customer is the
-- one waiting and refreshing; the driver is driving. Measured against a real
-- live ride before this migration:
--     lookup_ride(...)      -> ok: true, channelKey: NULL
--     tracking_snapshot(...) -> { "ok": false }   (no row existed at all)
create or replace function public.lookup_ride(p_ref text, p_phone text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_r ride_requests%rowtype;
  v_hex text; v_digits text; v_key text;
  v_rating numeric; v_rating_n integer; v_done integer;
begin
  v_hex := lower(regexp_replace(coalesce(p_ref, ''), '^RR-?', '', 'i'));
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_hex) < 4 or length(v_digits) < 5 then
    return jsonb_build_object('ok', false);
  end if;

  select * into v_r from ride_requests r
   where lower(substring(replace(r.id::text, '-', ''), 1, length(v_hex))) = v_hex
     and right(regexp_replace(r.customer_phone, '\D', '', 'g'), 7) = right(v_digits, 7)
   order by r.created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false); end if;

  -- START the watch rather than assuming somebody else already has.
  -- Idempotent, so the customer's polling costs one index lookup thereafter.
  if v_r.driver_id is not null
     and v_r.status in ('assigned','driver_on_way','arrived','on_trip') then
    perform ensure_trip_tracking('ride', v_r.id);
    select channel_key into v_key from trip_tracking
     where trip_kind = 'ride' and trip_id = v_r.id and ended_at is null;
  end if;

  if v_r.driver_id is not null then
    select round(avg(rating)::numeric, 1), count(*)
      into v_rating, v_rating_n
      from taxi_driver_reviews
     where driver_id = v_r.driver_id and status = 'approved';
    select rides_completed into v_done from taxi_drivers where id = v_r.driver_id;
  end if;

  return jsonb_build_object('ok', true,
    'status', v_r.status, 'service', v_r.service,
    'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label,
    'whenKind', v_r.when_kind, 'scheduledAt', v_r.scheduled_at,
    'price', v_r.quoted_price, 'currency', v_r.currency,
    'passengers', v_r.passengers, 'rounds', v_r.offer_rounds,
    'driver', case when v_r.driver_id is null then null else (
      select jsonb_build_object('name', t.name, 'phone', coalesce(t.whatsapp, t.phone),
                                'vehicle', t.vehicle, 'photo', t.photo,
                                'rating', case when coalesce(v_rating_n,0) > 0 then v_rating else null end,
                                'ratingCount', coalesce(v_rating_n, 0),
                                'ridesCompleted', coalesce(v_done, 0))
        from taxi_drivers t where t.id = v_r.driver_id) end,
    'tripId', v_r.id,
    'tripKind', 'ride',
    'channelKey', v_key,
    'customerName', v_r.customer_name,
    'pickupLat', v_r.pickup_lat, 'pickupLng', v_r.pickup_lng,
    'dropoffLat', v_r.dropoff_lat, 'dropoffLng', v_r.dropoff_lng);
end;
$function$;

-- STABLE is gone from BOTH: they write now (ensure_trip_tracking inserts on
-- first call). Left marked STABLE the planner may run them in a read-only
-- snapshot and the insert fails at runtime — the trap documented in
-- dispatch_geography.sql.
revoke all on function public.lookup_ride(text, text) from public, anon, authenticated;
grant execute on function public.lookup_ride(text, text) to service_role;

do $$
declare v jsonb; v_n integer; v_probe uuid := gen_random_uuid(); v_did uuid; v_ref text;
begin
  for v_n in select 1 loop null; end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='lookup_ride';
  if v_n <> 1 then raise exception 'lookup_ride has % overloads', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='taxi_driver_home';
  if v_n <> 1 then raise exception 'taxi_driver_home has % overloads', v_n; end if;

  if (lookup_ride('RR-000000','5799 0000')->>'ok')::boolean is not false then
    raise exception 'lookup_ride matched a nonsense reference';
  end if;

  -- THE REGRESSION TEST. A live ride whose tracking row does not exist yet must
  -- come back WITH a key, because this call is what creates it.
  select id into v_did from taxi_drivers where active limit 1;
  if v_did is not null then
    insert into ride_requests (id, service, when_kind, pickup_label, pickup_lat, pickup_lng,
      dropoff_label, dropoff_lat, dropoff_lng, passengers, customer_name, customer_phone,
      quoted_price, status, driver_id, assigned_at)
    values (v_probe, 'taxi', 'now', 'Mont Lubin', -19.7139, 63.4126,
      'Plaine Corail Airport', -19.7577, 63.3610, 2, 'M114 Probe', '+230 5799 7788',
      120000, 'assigned', v_did, now());
    v_ref := 'RR-' || upper(substring(replace(v_probe::text,'-',''),1,6));

    v := lookup_ride(v_ref, '5799 7788');
    if (v->>'ok')::boolean is not true then raise exception 'probe lookup failed'; end if;
    if v->>'channelKey' is null then
      raise exception 'REGRESSION: a live ride still returns no channelKey';
    end if;
    if length(v->>'channelKey') < 32 then
      raise exception 'channelKey too short to be a capability';
    end if;
    -- The endpoints the map draws the road between.
    if v->>'pickupLat' is null or v->>'dropoffLat' is null then
      raise exception 'endpoints missing from the customer payload';
    end if;
    -- And the snapshot the API reads must now exist.
    if (tracking_snapshot('ride', v_probe)->>'ok')::boolean is not true then
      raise exception 'tracking_snapshot still finds nothing';
    end if;

    delete from trip_tracking where trip_kind='ride' and trip_id = v_probe;
    delete from ride_requests where id = v_probe;
  end if;

  if has_function_privilege('anon', 'public.lookup_ride(text,text)', 'EXECUTE') then
    raise exception 'SECURITY: lookup_ride is anon-callable';
  end if;
  raise notice 'M113/M114 verified: the customer''s door starts the watch.';
end $$;
