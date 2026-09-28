-- ═══════════════════════════════════════════════════════════════════════════
-- M221 · AN EVENING BAND AND A NIGHT BAND
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The owner, 29 Sep 2026, after M220 went live:
--
--   "Keep 'priced by hand' for true night (22:00–05:00). For the early evening
--    window 17:00–21:59, apply a fixed surcharge of Rs 300 automatically so
--    afternoon flights can dispatch without manual intervention. Update the
--    price-list editor so both windows are configurable."
--
-- M220 had ONE night band (17:00–04:59, priced by hand), so every flight
-- landing after 17:00 waited for the owner to set a fare before any driver was
-- asked. This adds a second band with its own rule:
--
--   evening  17:00–21:59   fixed  +Rs 300 per trip (per direction)
--   night    22:00–04:59   manual — booked, held, the owner sets the fare
--
-- ── WHERE THE BANDS OVERLAP, NIGHT WINS ─────────────────────────────────────
-- The editor lets either window be moved. If the owner drags them over each
-- other, the hour belongs to the NIGHT band. That is the conservative choice:
-- night is where a hand-set fare lives, and an hour both could claim should
-- never be priced lower than the owner's own night rule.
--
-- ── THE LAUNCH LIST STAYS EXACTLY AS IT WAS ─────────────────────────────────
-- transfer_pricing_versions is append-only, and a booked quote is reproduced
-- from the version it names. So the new columns DEFAULT TO OFF ('none'): the
-- launch list (version 1) keeps its 17:00–04:59 manual night and prices any
-- re-computation exactly as it quoted. The owner's decision is published as a
-- NEW version, effective now.
--
-- `manualReason` gains 'evening' beside 'night' and 'group', so the screens can
-- say which band a hand-set fare comes from rather than calling 17:30 "night".

alter table public.transfer_pricing_versions
  add column if not exists evening_mode       text not null default 'none'
    check (evening_mode in ('none', 'manual', 'fixed', 'multiplier')),
  add column if not exists evening_from_hour  integer not null default 17
    check (evening_from_hour between 0 and 23),
  add column if not exists evening_to_hour    integer not null default 21
    check (evening_to_hour between 0 and 23),
  add column if not exists evening_surcharge  integer not null default 0
    check (evening_surcharge >= 0),
  add column if not exists evening_multiplier numeric(4,2) not null default 1.00
    check (evening_multiplier between 1 and 3);


-- ── ONE LEG, NOW WITH TWO BANDS ─────────────────────────────────────────────

create or replace function public.price_transfer_leg(
  p_version_id bigint, p_road_km numeric, p_trip_type text,
  p_passengers integer, p_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v         transfer_pricing_versions%rowtype;
  v_zone    smallint;
  v_base    integer;
  v_n       integer := greatest(coalesce(p_passengers, 1), 1);
  v_extra_n integer;
  v_extra   integer;
  v_late    boolean;
  v_eve     boolean;
  v_band    text;
  v_mode    text;
  v_sur     integer;
  v_mult    numeric;
  v_adj     integer := 0;
  v_manual  boolean := false;
  v_reason  text;
  v_fare    integer;
  v_comm    integer;
begin
  select * into v from transfer_pricing_versions where id = p_version_id;
  if not found then
    raise exception using errcode = 'RR098', message = 'Unknown price list.';
  end if;
  if p_trip_type is null or p_trip_type not in ('one_way', 'return') then
    raise exception using errcode = 'RR098', message = 'A transfer is one way or a return package.';
  end if;

  v_zone := case when p_road_km <= v.zone1_max_km then 1
                 when p_road_km <  v.zone2_max_km then 2
                 else 3 end;
  v_base := case when p_trip_type = 'one_way'
                 then case v_zone when 1 then v.one_way_zone1 when 2 then v.one_way_zone2 else v.one_way_zone3 end
                 else case v_zone when 1 then v.return_zone1  when 2 then v.return_zone2  else v.return_zone3  end end;
  v_extra_n := greatest(v_n - v.included_passengers, 0);
  v_extra   := v_extra_n * v.extra_passenger_fee;

  -- Night first: an hour both bands claim belongs to night (see header).
  v_late := v.night_mode <> 'none'
            and transfer_is_night(p_at, v.night_from_hour, v.night_to_hour);
  v_eve  := not v_late and v.evening_mode <> 'none'
            and transfer_is_night(p_at, v.evening_from_hour, v.evening_to_hour);
  v_band := case when v_late then 'night' when v_eve then 'evening' end;
  v_mode := case when v_late then v.night_mode when v_eve then v.evening_mode end;
  v_sur  := case when v_late then v.night_surcharge else v.evening_surcharge end;
  v_mult := case when v_late then v.night_multiplier else v.evening_multiplier end;

  if v_n > v.max_priced_passengers then
    v_manual := true; v_reason := 'group';
  elsif v_mode = 'manual' then
    v_manual := true; v_reason := v_band;
  elsif v_mode = 'fixed' then
    v_adj := v_sur;
  elsif v_mode = 'multiplier' then
    -- On the whole leg (base + passengers), to the whole rupee.
    v_adj := (round((v_base + v_extra) * v_mult / 100.0) * 100)::integer - (v_base + v_extra);
  end if;

  v_fare := case when v_manual then null else v_base + v_extra + v_adj end;
  v_comm := case when v_fare is null then null
                 else round(v_fare * v.commission_percent / 100.0)::integer end;

  return jsonb_build_object(
    'zone', v_zone, 'tripType', p_trip_type, 'at', p_at,
    'base', v_base, 'passengers', v_n, 'extraPassengers', v_extra_n, 'passengerFee', v_extra,
    -- `night` stays true for EITHER band, as every earlier reader expects;
    -- `band` says which one.
    'night', v_band is not null, 'band', v_band,
    'nightRule', v_mode, 'nightAdjustment', v_adj,
    'manual', v_manual, 'manualReason', v_reason,
    'fare', v_fare, 'commission', v_comm,
    'driverEarnings', case when v_fare is null then null else v_fare - v_comm end,
    'pricingVersion', v.id);
end $$;


-- ── THE PRICE SHEET PUBLISHES BOTH BANDS ────────────────────────────────────

create or replace function public.transfer_price_sheet()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v transfer_pricing_versions%rowtype;
begin
  select * into v from transfer_pricing_versions
   where service = 'airport' and effective_from <= now()
   order by effective_from desc, id desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v.id, 'label', v.label,
    'zone1MaxKm', v.zone1_max_km, 'zone2MaxKm', v.zone2_max_km,
    'oneWay', jsonb_build_array(v.one_way_zone1, v.one_way_zone2, v.one_way_zone3),
    'returnEach', jsonb_build_array(v.return_zone1, v.return_zone2, v.return_zone3),
    'includedPassengers', v.included_passengers, 'extraPassengerFee', v.extra_passenger_fee,
    'maxPricedPassengers', v.max_priced_passengers,
    'nightMode', v.night_mode, 'nightFromHour', v.night_from_hour, 'nightToHour', v.night_to_hour,
    'nightSurcharge', v.night_surcharge, 'nightMultiplier', v.night_multiplier,
    'eveningMode', v.evening_mode, 'eveningFromHour', v.evening_from_hour, 'eveningToHour', v.evening_to_hour,
    'eveningSurcharge', v.evening_surcharge, 'eveningMultiplier', v.evening_multiplier,
    'bookable', coalesce((select is_bookable from ride_pricing where service = 'airport'), true),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.place_id, 'label', k.label, 'roadKm', k.road_km,
               'zone', (price_transfer_leg(v.id, k.road_km, 'one_way', 1, null)->>'zone')::int)
             order by k.road_km)
        from transfer_known_distances k), '[]'::jsonb));
end $$;


-- ── THE QUOTE NAMES BOTH WINDOWS ────────────────────────────────────────────

create or replace function public.transfer_quote_core(
  p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_lat double precision, p_dropoff_lng double precision,
  p_passengers integer, p_trip_type text,
  p_outbound_at timestamptz, p_return_at timestamptz, p_router_km numeric)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v          transfer_pricing_versions%rowtype;
  v_bookable boolean;
  v_pick_d   double precision;
  v_drop_d   double precision;
  v_dir      text;
  v_free_lat double precision;
  v_free_lng double precision;
  v_place    text;
  v_place_km numeric;
  v_place_d  double precision;
  v_km       numeric;
  v_source   text;
  v_out      jsonb;
  v_legs     jsonb;
  v_manual   boolean;
  v_reasons  jsonb;
  v_total    integer;
  v_driver   integer;
  v_comm     integer;
  v_speed    integer;
begin
  if p_trip_type is null or p_trip_type not in ('one_way', 'return') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_trip_type',
      'message', 'Choose one way or a return package.');
  end if;

  select is_bookable into v_bookable from ride_pricing where service = 'airport';
  if v_bookable is false then
    return jsonb_build_object('ok', false, 'reason', 'not_bookable',
      'message', 'This one is arranged by hand — send us a message and we will sort it.');
  end if;

  select * into v from transfer_pricing_versions
   where service = 'airport' and effective_from <= now()
   order by effective_from desc, id desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_price_list',
      'message', 'We will confirm the price with you — no charge until you agree.');
  end if;

  if p_pickup_lat is null or p_pickup_lng is null or p_dropoff_lat is null or p_dropoff_lng is null then
    return jsonb_build_object('ok', false, 'reason', 'need_locations',
      'message', 'Choose both places from the list so we can work out the fare.');
  end if;

  -- Which end is the airport. Exactly one must be.
  v_pick_d := haversine_km(p_pickup_lat, p_pickup_lng, v.origin_lat, v.origin_lng);
  v_drop_d := haversine_km(p_dropoff_lat, p_dropoff_lng, v.origin_lat, v.origin_lng);
  if v_pick_d <= v.origin_radius_km and v_drop_d > v.origin_radius_km then
    v_dir := 'from'; v_free_lat := p_dropoff_lat; v_free_lng := p_dropoff_lng;
  elsif v_drop_d <= v.origin_radius_km and v_pick_d > v.origin_radius_km then
    v_dir := 'to';   v_free_lat := p_pickup_lat;  v_free_lng := p_pickup_lng;
  elsif v_pick_d <= v.origin_radius_km then
    return jsonb_build_object('ok', false, 'reason', 'same_place',
      'message', 'Both ends of this trip are the airport. Where are you going?');
  else
    return jsonb_build_object('ok', false, 'reason', 'not_an_airport_trip',
      'message', 'An airport transfer starts or ends at Plaine Corail.');
  end if;

  if p_outbound_at is not null and p_outbound_at < now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'past', 'message', 'That time has already passed.');
  end if;
  if p_trip_type = 'return' then
    if p_return_at is null then
      return jsonb_build_object('ok', false, 'reason', 'need_return_time',
        'message', 'Choose when the return trip is.');
    end if;
    if p_return_at < coalesce(p_outbound_at, now()) + interval '1 hour' then
      return jsonb_build_object('ok', false, 'reason', 'return_too_soon',
        'message', 'The return trip has to be at least an hour after the first one.');
    end if;
  end if;

  -- The road distance: a measured place first, then the server's router.
  select k.place_id, k.road_km, haversine_km(v_free_lat, v_free_lng, k.lat, k.lng)
    into v_place, v_place_km, v_place_d
    from transfer_known_distances k
   order by haversine_km(v_free_lat, v_free_lng, k.lat, k.lng)
   limit 1;

  if v_place is not null and v_place_d <= 0.25 then
    v_km := v_place_km; v_source := 'place:' || v_place;
  elsif p_router_km is not null and p_router_km > 0 and p_router_km < 80 then
    v_km := round(p_router_km, 2); v_source := 'router';
  else
    -- Not an error: the API routes this pin and asks again.
    return jsonb_build_object('ok', false, 'reason', 'need_road_distance',
      'message', 'We will confirm the price with you — no charge until you agree.',
      'direction', v_dir,
      'origin', jsonb_build_object('lat', v.origin_lat, 'lng', v.origin_lng),
      'destination', jsonb_build_object('lat', v_free_lat, 'lng', v_free_lng));
  end if;

  if v_km < 0.5 then
    return jsonb_build_object('ok', false, 'reason', 'same_place',
      'message', 'Both ends of this trip are the airport. Where are you going?');
  end if;

  v_out  := price_transfer_leg(v.id, v_km, p_trip_type, p_passengers, p_outbound_at)
            || jsonb_build_object('leg', 'outbound');
  v_legs := jsonb_build_array(v_out);
  if p_trip_type = 'return' then
    v_legs := v_legs || jsonb_build_array(
      price_transfer_leg(v.id, v_km, 'return', p_passengers, p_return_at)
      || jsonb_build_object('leg', 'return'));
  end if;

  select bool_or((l->>'manual')::boolean),
         coalesce(jsonb_agg(distinct l->>'manualReason') filter (where l->>'manualReason' is not null), '[]'::jsonb)
    into v_manual, v_reasons
    from jsonb_array_elements(v_legs) l;
  if not v_manual then
    select sum((l->>'fare')::int), sum((l->>'driverEarnings')::int), sum((l->>'commission')::int)
      into v_total, v_driver, v_comm
      from jsonb_array_elements(v_legs) l;
  end if;

  select avg_speed_kmh into v_speed from dispatch_settings where id = 'main';

  return jsonb_build_object(
    'ok', true, 'service', 'airport', 'direction', v_dir, 'tripType', p_trip_type,
    'zone', (v_out->>'zone')::int, 'roadKm', v_km, 'distanceSource', v_source,
    'pricingVersion', jsonb_build_object('id', v.id, 'label', v.label),
    'legs', v_legs,
    'total', v_total,
    -- `price` is the key every older reader (PriceCard, the booking route,
    -- analytics) already uses. Null while a hand-set fare is pending.
    'price', v_total, 'currency', 'MUR', 'flat', true,
    'needsManual', v_manual, 'manualReasons', v_reasons,
    'driverEarnings', v_driver, 'commission', v_comm,
    'night', exists (select 1 from jsonb_array_elements(v_legs) l where (l->>'night')::boolean),
    'nightWindow', jsonb_build_object('from', v.night_from_hour, 'to', v.night_to_hour,
                                      'mode', v.night_mode, 'surcharge', v.night_surcharge,
                                      'multiplier', v.night_multiplier),
    -- M221 · the second band, so a screen can name it and its surcharge.
    'eveningWindow', jsonb_build_object('from', v.evening_from_hour, 'to', v.evening_to_hour,
                                        'mode', v.evening_mode, 'surcharge', v.evening_surcharge,
                                        'multiplier', v.evening_multiplier),
    'tripMinutes', case when coalesce(v_speed, 0) > 0 then ceil(v_km / v_speed * 60)::int end,
    'validMinutes', v.quote_valid_minutes,
    'message', case
      when v_reasons ? 'group' then 'For a group this size we confirm the vehicle and the fare with you first.'
      when v_reasons ? 'night' then 'Night transfers are priced by hand. We confirm the fare with you before a driver is sent.'
      when v_reasons ? 'evening' then 'Evening transfers are priced by hand. We confirm the fare with you before a driver is sent.'
    end);
end $$;


-- ── BOOKING: THE LEGS SAY WHY A FARE IS PENDING ─────────────────────────────
-- Same signature as M220, so CREATE OR REPLACE — no second overload.

create or replace function public.create_ride_request(
  p_service text, p_when_kind text, p_scheduled_at timestamptz,
  p_pickup_label text, p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_label text, p_dropoff_lat double precision, p_dropoff_lng double precision,
  p_passengers integer, p_luggage integer, p_notes text, p_flight_ref text, p_meet_greet boolean,
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_quote_id uuid default null, p_trip_type text default 'one_way',
  p_return_at timestamptz default null, p_return_flight_ref text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_quote   jsonb;
  v_id      uuid;
  v_ret_id  uuid;
  v_price   integer;
  v_q       ride_quotes%rowtype;
  v_when    timestamptz;
  v_trip    text := coalesce(nullif(btrim(p_trip_type), ''), 'one_way');
  v_n       integer := greatest(coalesce(p_passengers, 1), 1);
  v_pkg     uuid;
  v_out     jsonb;
  v_back    jsonb;
  v_meta    jsonb;
  v_pending boolean := false;
begin
  if coalesce(btrim(p_customer_name), '') = '' or coalesce(btrim(p_customer_phone), '') = '' then
    raise exception using errcode='RR095', message='We need a name and a phone number to send a driver.';
  end if;
  if coalesce(btrim(p_pickup_label), '') = '' then
    raise exception using errcode='RR095', message='Where should the driver meet you?';
  end if;
  -- Private hire is the one service that may have no destination. Every other
  -- one without a "where to" is a typo, not a booking.
  if p_service <> 'private' and coalesce(btrim(p_dropoff_label), '') = '' then
    raise exception using errcode='RR095', message='Where from and where to, please.';
  end if;
  if p_when_kind = 'scheduled' and p_scheduled_at is null then
    raise exception using errcode='RR095', message='Pick a date and time for a later ride.';
  end if;
  -- A ride booked for the past is a typo, not a booking.
  if p_when_kind = 'scheduled' and p_scheduled_at < now() - interval '5 minutes' then
    raise exception using errcode='RR095', message='That time has already passed.';
  end if;
  if v_trip not in ('one_way', 'return') then
    raise exception using errcode='RR095', message='Choose one way or a return package.';
  end if;
  if v_trip = 'return' and p_service <> 'airport' then
    raise exception using errcode='RR095', message='Return packages are for airport transfers.';
  end if;

  v_when := case when p_when_kind = 'scheduled' then p_scheduled_at else null end;

  -- ── THE AIRPORT: THE PRICE IS THE QUOTE THE CUSTOMER SAW ─────────────────
  if p_service = 'airport' then
    if p_quote_id is null then
      -- No quote presented: an older screen, or a direct caller. Quote here from
      -- exactly these arguments. Without a router, a pin that is not a named
      -- place cannot be zoned — that ride is booked and priced by the owner.
      v_quote := quote_airport_transfer(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
                                        v_n, v_trip, v_when, p_return_at, null);
      if coalesce((v_quote->>'ok')::boolean, false) then
        p_quote_id := (v_quote->>'quoteId')::uuid;
      elsif v_quote->>'reason' in ('same_place', 'not_an_airport_trip', 'past',
                                   'need_return_time', 'return_too_soon', 'invalid_trip_type') then
        raise exception using errcode='RR095', message = v_quote->>'message';
      elsif v_trip = 'return' then
        -- Two rides with no price and no quote to tie them: refuse rather than
        -- invent a package the desk cannot read.
        raise exception using errcode='RR095',
          message='Choose your place from the list so we can price the return package.';
      end if;
    end if;

    if p_quote_id is not null then
      select * into v_q from ride_quotes where id = p_quote_id for update;
      if not found or v_q.service <> 'airport' then
        raise exception using errcode='RR097', hint='invalid',
          message='That price is no longer available. Please check the fare again.';
      end if;
      if v_q.accepted_at is not null then
        raise exception using errcode='RR097', hint='used', message='This fare has already been booked.';
      end if;
      if v_q.expires_at < now() then
        raise exception using errcode='RR097', hint='expired',
          message='That price has expired. Please check the fare again.';
      end if;
      -- Field for field. A quote for one passenger cannot book four.
      if p_pickup_lat is null or p_pickup_lng is null or p_dropoff_lat is null or p_dropoff_lng is null
         or abs(v_q.pickup_lat  - p_pickup_lat)  > 1e-6 or abs(v_q.pickup_lng  - p_pickup_lng)  > 1e-6
         or abs(v_q.dropoff_lat - p_dropoff_lat) > 1e-6 or abs(v_q.dropoff_lng - p_dropoff_lng) > 1e-6
         or v_q.passengers <> v_n
         or v_q.trip_type <> v_trip
         or v_q.outbound_at is distinct from v_when
         or v_q.return_at is distinct from (case when v_trip = 'return' then p_return_at end) then
        raise exception using errcode='RR097', hint='mismatch',
          message='The trip changed after it was priced. Please check the fare again.';
      end if;

      v_pkg  := case when v_q.trip_type = 'return' then gen_random_uuid() end;
      v_meta := jsonb_build_object('quoteId', v_q.id, 'roadKm', v_q.road_km,
                                   'distanceSource', v_q.distance_source, 'direction', v_q.direction);
      v_out  := (v_q.legs->0) || v_meta;

      insert into ride_requests (
        service, when_kind, scheduled_at,
        pickup_label, pickup_lat, pickup_lng,
        dropoff_label, dropoff_lat, dropoff_lng,
        passengers, luggage, notes, flight_ref, meet_greet,
        customer_name, customer_phone, customer_email,
        quoted_price, driver_earnings, platform_commission, fare_pending, fare_breakdown,
        quote_id, pricing_version_id, trip_type, package_id, leg, transfer_zone, road_km,
        status
      ) values (
        'airport',
        case when p_when_kind = 'scheduled' then 'scheduled' else 'now' end, v_when,
        btrim(p_pickup_label), p_pickup_lat, p_pickup_lng,
        nullif(btrim(coalesce(p_dropoff_label, '')), ''), p_dropoff_lat, p_dropoff_lng,
        v_n, greatest(coalesce(p_luggage, 0), 0),
        nullif(btrim(coalesce(p_notes, '')), ''),
        nullif(btrim(coalesce(p_flight_ref, '')), ''), coalesce(p_meet_greet, false),
        btrim(p_customer_name), btrim(p_customer_phone),
        nullif(btrim(coalesce(p_customer_email, '')), ''),
        (v_out->>'fare')::int, (v_out->>'driverEarnings')::int, (v_out->>'commission')::int,
        coalesce((v_out->>'manual')::boolean, false), v_out,
        v_q.id, v_q.pricing_version_id, v_q.trip_type, v_pkg, 'outbound', v_q.zone, v_q.road_km,
        'new'
      ) returning id into v_id;

      perform log_ride_event(v_id, 'customer', null, 'ride.requested', null, 'new',
        jsonb_build_object('quoted', (v_out->>'fare')::int, 'quoteOk', true, 'quoteId', v_q.id,
                           'zone', v_q.zone, 'leg', 'outbound', 'tripType', v_q.trip_type,
                           'pricingVersion', v_q.pricing_version_id,
                           'farePending', coalesce((v_out->>'manual')::boolean, false)));

      if v_q.trip_type = 'return' then
        v_back := (v_q.legs->1) || v_meta;
        -- The same journey reversed, on its own day, dispatched on its own.
        insert into ride_requests (
          service, when_kind, scheduled_at,
          pickup_label, pickup_lat, pickup_lng,
          dropoff_label, dropoff_lat, dropoff_lng,
          passengers, luggage, notes, flight_ref, meet_greet,
          customer_name, customer_phone, customer_email,
          quoted_price, driver_earnings, platform_commission, fare_pending, fare_breakdown,
          quote_id, pricing_version_id, trip_type, package_id, leg, transfer_zone, road_km,
          status
        ) values (
          'airport', 'scheduled', v_q.return_at,
          btrim(p_dropoff_label), p_dropoff_lat, p_dropoff_lng,
          btrim(p_pickup_label), p_pickup_lat, p_pickup_lng,
          v_n, greatest(coalesce(p_luggage, 0), 0),
          nullif(btrim(coalesce(p_notes, '')), ''),
          nullif(btrim(coalesce(p_return_flight_ref, '')), ''),
          -- Waiting inside with a sign only means something at an arrival.
          case when v_q.direction = 'to' then coalesce(p_meet_greet, false) else false end,
          btrim(p_customer_name), btrim(p_customer_phone),
          nullif(btrim(coalesce(p_customer_email, '')), ''),
          (v_back->>'fare')::int, (v_back->>'driverEarnings')::int, (v_back->>'commission')::int,
          coalesce((v_back->>'manual')::boolean, false), v_back,
          v_q.id, v_q.pricing_version_id, v_q.trip_type, v_pkg, 'return', v_q.zone, v_q.road_km,
          'new'
        ) returning id into v_ret_id;

        perform log_ride_event(v_ret_id, 'customer', null, 'ride.requested', null, 'new',
          jsonb_build_object('quoted', (v_back->>'fare')::int, 'quoteOk', true, 'quoteId', v_q.id,
                             'zone', v_q.zone, 'leg', 'return', 'tripType', v_q.trip_type,
                             'pricingVersion', v_q.pricing_version_id,
                             'farePending', coalesce((v_back->>'manual')::boolean, false)));
      end if;

      update ride_quotes set accepted_at = now(), ride_id = v_id where id = v_q.id;

      v_pending := v_q.needs_manual;
      return jsonb_build_object('ok', true,
        'reference', 'RR-' || upper(substring(replace(v_id::text, '-', ''), 1, 6)),
        'returnReference', case when v_ret_id is not null
          then 'RR-' || upper(substring(replace(v_ret_id::text, '-', ''), 1, 6)) end,
        'price', v_q.total, 'currency', 'MUR',
        'tripType', v_q.trip_type, 'zone', v_q.zone, 'farePending', v_pending,
        'legs', jsonb_build_array(
          jsonb_build_object('leg', 'outbound', 'price', (v_out->>'fare')::int,
                             'at', v_q.outbound_at, 'farePending', coalesce((v_out->>'manual')::boolean, false),
                             'reason', v_out->>'manualReason'))
          || case when v_ret_id is null then '[]'::jsonb else jsonb_build_array(
          jsonb_build_object('leg', 'return', 'price', (v_back->>'fare')::int,
                             'at', v_q.return_at, 'farePending', coalesce((v_back->>'manual')::boolean, false),
                             'reason', v_back->>'manualReason')) end);
    end if;

    -- Could not be zoned (a pin with no router, the price list switched off):
    -- still a ride, booked with no price and held for the owner to set one.
    v_pending := true;
  end if;

  -- ── EVERY OTHER SERVICE, AS BEFORE ──────────────────────────────────────
  -- THE PRICE IS RE-COMPUTED HERE, from these arguments, and the caller's idea
  -- of it is never read. This is the RR012 rule: what is charged must be
  -- derived server-side from what was actually requested.
  if p_service <> 'airport' then
    v_quote := quote_ride(p_service, p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
                          p_passengers, p_luggage,
                          case when p_when_kind = 'scheduled' then p_scheduled_at else now() end);
    -- A ride we cannot price is still a ride worth taking — it just goes out
    -- with no number and the owner confirms. Better than refusing the customer.
    v_price := case when (v_quote->>'ok')::boolean then (v_quote->>'price')::integer else null end;
  end if;

  insert into ride_requests (
    service, when_kind, scheduled_at,
    pickup_label, pickup_lat, pickup_lng,
    dropoff_label, dropoff_lat, dropoff_lng,
    passengers, luggage, notes, flight_ref, meet_greet,
    customer_name, customer_phone, customer_email, quoted_price, fare_pending,
    trip_type, status
  ) values (
    p_service,
    case when p_when_kind = 'scheduled' then 'scheduled' else 'now' end,
    v_when,
    btrim(p_pickup_label), p_pickup_lat, p_pickup_lng,
    -- NULL, not '', so "no destination" is a fact the admin desk and the driver
    -- screen can both read rather than an empty string they must guess about.
    nullif(btrim(coalesce(p_dropoff_label, '')), ''), p_dropoff_lat, p_dropoff_lng,
    v_n, greatest(coalesce(p_luggage, 0), 0),
    nullif(btrim(coalesce(p_notes, '')), ''),
    nullif(btrim(coalesce(p_flight_ref, '')), ''), coalesce(p_meet_greet, false),
    btrim(p_customer_name), btrim(p_customer_phone),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    v_price, v_pending,
    case when p_service = 'airport' then 'one_way' end,
    -- 'new' means auto_dispatch_rides() picks it up on the next tick. Nobody has
    -- to press anything — unless the fare is still the owner's to set.
    'new'
  ) returning id into v_id;

  perform log_ride_event(v_id, 'customer', null, 'ride.requested', null, 'new',
    jsonb_build_object('quoted', v_price, 'quoteOk', coalesce((v_quote->>'ok')::boolean, false),
                       'farePending', v_pending));

  return jsonb_build_object('ok', true,
    'reference', 'RR-' || upper(substring(replace(v_id::text, '-', ''), 1, 6)),
    'price', v_price, 'currency', 'MUR', 'farePending', v_pending);
end;
$function$;

-- ── THE OWNER'S DECISION, PUBLISHED AS A NEW PRICE LIST ─────────────────────
-- Everything carried over from the list in force except the two bands. Guarded
-- so a re-run cannot publish it twice.

insert into public.transfer_pricing_versions (
  label, origin_label, origin_lat, origin_lng, origin_radius_km,
  zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3,
  return_zone1, return_zone2, return_zone3,
  included_passengers, extra_passenger_fee, max_priced_passengers,
  night_mode, night_from_hour, night_to_hour, night_surcharge, night_multiplier,
  evening_mode, evening_from_hour, evening_to_hour, evening_surcharge, evening_multiplier,
  commission_percent, quote_valid_minutes, created_by, note)
select
  'Airport zones — evening +Rs 300, night by hand',
  origin_label, origin_lat, origin_lng, origin_radius_km,
  zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3,
  return_zone1, return_zone2, return_zone3,
  included_passengers, extra_passenger_fee, max_priced_passengers,
  'manual', 22, 4, night_surcharge, night_multiplier,
  'fixed', 17, 21, 30000, 1.20,
  commission_percent, quote_valid_minutes, 'migration m221',
  'Owner decision 29 Sep 2026: 17:00-21:59 fixed Rs 300 per trip; 22:00-04:59 priced by hand.'
from public.transfer_pricing_versions
where service = 'airport' and effective_from <= now()
  and not exists (select 1 from public.transfer_pricing_versions where created_by = 'migration m221')
order by effective_from desc, id desc
limit 1;

-- CREATE OR REPLACE keeps each function's existing grants (service_role only,
-- set in M220/M220b); nothing here widens them.

notify pgrst, 'reload schema';
