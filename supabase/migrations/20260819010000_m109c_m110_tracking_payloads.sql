-- ══════════════════════════════════════════════════════════════════════════
-- M109c / M109d / M110 — WHAT THE TRACKING SCREENS ARE ALLOWED TO KNOW
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied to production as three migrations —
--   m109c_lookup_ride_carries_tracking
--   m109d_driver_home_carries_tracking
--   m110_lookup_ride_carries_driver_standing
-- — and captured here as one file, in that order. The final state of
-- lookup_ride is M110's; M109c's version is superseded and is NOT repeated.
--
-- ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────
-- Because without it a database rebuilt from supabase/migrations/ would have
-- the M109 tracking engine and none of the payload fields the screens read —
-- the customer's map would never receive a channelKey and would silently never
-- render. That is exactly the drift the M109 header warns about, committed by
-- the same session that wrote the warning. These files are only a record of
-- what was applied if somebody actually writes the record.

-- ── 1. THE CUSTOMER'S TWO-FACTOR DOOR ALSO HANDS OVER THE CAPABILITY ──────
-- lookup_ride is reference + the phone the ride was booked with. It already
-- decides WHO may see a ride; M109c/M110 make it also hand over what is needed
-- to WATCH one, and who is driving.
--
-- ── THE RATING IS CONDITIONAL, AND THAT IS THE POINT ──────────────────────
-- taxi_driver_reviews exists (rating smallint 1-5, status pending/approved/
-- rejected) and holds ZERO rows. Rendering "★ 4.9" against an empty table would
-- invent a reputation for a real, named person on a small island — the worst
-- kind of fake data, because a passenger would act on it.
--
-- So: the real aggregate over APPROVED reviews only, and NULL — not 0 — when
-- there are none, so the screen can tell "no reviews yet" from "rated zero".
-- With no reviews the screen shows what the platform has genuinely counted
-- since day one: rides completed.
--
-- The customer's own name is safe here for one specific reason: this function
-- is the two-factor door, so the only person who can reach the payload is the
-- person whose name it is. It is shown back to them, never to anybody else.
create or replace function public.lookup_ride(p_ref text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp'
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
     -- Last 7 digits only: 5799 0011 and +230 5799 0011 are the same person.
     and right(regexp_replace(r.customer_phone, '\D', '', 'g'), 7) = right(v_digits, 7)
   order by r.created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false); end if;

  -- The capability is served ONLY while the ride is genuinely live AND has a
  -- driver. That is what makes it stop working the moment the reason for it ends.
  if v_r.driver_id is not null
     and v_r.status in ('assigned','driver_on_way','arrived','on_trip') then
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
revoke all on function public.lookup_ride(text, text) from public, anon, authenticated;
grant execute on function public.lookup_ride(text, text) to service_role;

-- ── 2. THE DRIVER'S ONE ENDPOINT CARRIES THE TRACKING FIELDS TOO ──────────
-- /d/<token> polls taxi_driver_home every 15 seconds and everything on the
-- screen comes from it. M109d adds the job's id, its capability key and the
-- coordinates for the map strip and the Navigate button.
--
-- ensure_trip_tracking() is called HERE rather than at assignment time, which
-- is what makes tracking work for rides assigned before M109 existed: the row
-- appears the first time the driver opens their phone.
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
    -- Idempotent, so polling every 15 s costs one index lookup once it exists.
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
    'availability', v_t.availability, 'vehicle', v_t.vehicle,
    'vehicleType', v_t.vehicle_type,
    'whatsappReady', (v_t.whatsapp_api_key is not null and length(v_t.whatsapp_api_key) > 0),
    'ridesCompleted', v_t.rides_completed,
    'offer', v_offer, 'job', v_job);
end;
$function$;

-- STABLE is gone ON PURPOSE: this now WRITES (ensure_trip_tracking inserts on
-- first call). Left marked STABLE, the planner may run it in a read-only
-- snapshot and the insert fails at runtime — the same class of bug as the
-- round(double precision, int) one documented in dispatch_geography.sql.
revoke all on function public.taxi_driver_home(text) from public;
grant execute on function public.taxi_driver_home(text) to anon, authenticated, service_role;

-- ── 3. PROVE IT ───────────────────────────────────────────────────────────
-- Same discipline as M109: a plpgsql body is not resolved until it RUNS, so a
-- migration that applies cleanly proves nothing. Call everything, against real
-- rows where they exist, and clean up.
do $$
declare v jsonb; v_n integer; v_did uuid; v_ride_id uuid := gen_random_uuid(); v_ref text;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='lookup_ride';
  if v_n <> 1 then raise exception 'lookup_ride has % overloads', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='taxi_driver_home';
  if v_n <> 1 then raise exception 'taxi_driver_home has % overloads', v_n; end if;

  if (lookup_ride('RR-000000', '5799 0000')->>'ok')::boolean is not false then
    raise exception 'lookup_ride matched a nonsense reference';
  end if;
  if (taxi_driver_home('not-a-real-token-but-long-enough-to-pass-32')->>'ok')::boolean is not false then
    raise exception 'taxi_driver_home accepted a bad token';
  end if;

  select id into v_did from taxi_drivers where active limit 1;
  if v_did is not null then
    insert into ride_requests (id, service, when_kind, pickup_label, dropoff_label,
      passengers, customer_name, customer_phone, quoted_price, status, driver_id, assigned_at)
    values (v_ride_id, 'taxi', 'now', 'Port Mathurin', 'Plaine Corail Airport',
      2, 'M110 Probe', '+230 5799 0011', 120000, 'assigned', v_did, now());
    v_ref := 'RR-' || upper(substring(replace(v_ride_id::text,'-',''),1,6));

    v := lookup_ride(v_ref, '5799 0011');
    if (v->>'ok')::boolean is not true then raise exception 'real lookup failed'; end if;
    if v->'driver'->>'name' is null then raise exception 'driver block missing'; end if;
    if not (v->'driver' ? 'rating' and v->'driver' ? 'ratingCount'
            and v->'driver' ? 'ridesCompleted') then
      raise exception 'driver standing fields missing';
    end if;
    -- No approved reviews exist, so this MUST be null rather than a number.
    if v->'driver'->>'rating' is not null then
      raise exception 'a rating appeared with no approved reviews: %', v->'driver'->>'rating';
    end if;
    if (v->>'customerName') <> 'M110 Probe' then raise exception 'customerName missing'; end if;
    -- Every field the deployed screen reads must survive.
    if not (v ? 'pickup' and v ? 'dropoff' and v ? 'price' and v ? 'currency'
            and v ? 'passengers' and v ? 'rounds' and v ? 'status' and v ? 'service'
            and v ? 'whenKind' and v ? 'scheduledAt' and v ? 'tripId' and v ? 'channelKey'
            and v ? 'pickupLat' and v ? 'dropoffLng') then
      raise exception 'lookup_ride dropped a field the screen depends on';
    end if;

    delete from ride_requests where id = v_ride_id;
  end if;

  -- taxi_driver_home against the REAL token, so the WRITE path executes.
  if exists (select 1 from taxi_drivers where driver_token is not null) then
    v := taxi_driver_home((select driver_token from taxi_drivers
                            where driver_token is not null limit 1));
    if (v->>'ok')::boolean is not true then raise exception 'taxi_driver_home failed'; end if;
    if not (v ? 'vehicleType') then raise exception 'taxi_driver_home lost a field'; end if;
  end if;

  if has_function_privilege('anon', 'public.lookup_ride(text,text)', 'EXECUTE') then
    raise exception 'SECURITY: lookup_ride is anon-callable';
  end if;
  raise notice 'M109c/M109d/M110 verified.';
end $$;
