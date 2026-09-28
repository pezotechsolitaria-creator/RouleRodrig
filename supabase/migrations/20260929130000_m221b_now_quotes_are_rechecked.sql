-- ═══════════════════════════════════════════════════════════════════════════
-- M221b · A "NOW" QUOTE IS RE-CHECKED AT BOOKING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Found by the adversarial review of M221, confirmed by two independent
-- verifiers against the live database:
--
--   A customer opens the airport form at 21:40. It defaults to "as soon as
--   possible", so the quote is priced at now(): evening band, Rs 2,300,
--   automatic. The quote is valid 30 minutes. They book at 22:05. The booking
--   compares the quote's time with the booking's — null and null, equal — so
--   the ride is written at Rs 2,300 with fare_pending = false and offered to
--   drivers at 22:05, inside the owner's priced-by-hand night.
--
-- The reverse happens at 17:00 (a day fare booked after the evening surcharge
-- began), and M220 had the same gap at its own 17:00 edge.
--
-- Fix: for a "now" quote only, re-price the outbound leg at booking time on
-- the quote's own price list and road distance. If the fare or the manual flag
-- differs, raise RR097 (hint 'repriced'). app/api/rides/route.ts already treats
-- any RR097 other than 'used' by re-quoting from the booking's details and
-- booking only if every leg matches what the customer was shown — otherwise
-- the new price goes back to them. A scheduled quote carries its own time and
-- is unaffected; a return leg is always scheduled.
--
-- Same signature as M220/M221, so CREATE OR REPLACE — no second overload.

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
  v_chk     jsonb;
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

      -- M221b · A "now" quote was priced at the moment it was written, and a
      -- band can start while the customer is still typing their name: quoted
      -- at 21:40 in the evening band, booked at 22:05 in the night band. The
      -- field check above cannot see that (both times are null), so re-price
      -- the leg NOW, on the quote's own price list and distance. If the fare
      -- or the hand-priced flag moved, refuse like any stale quote; the route
      -- re-quotes and books only if the customer's number is unchanged.
      if v_q.outbound_at is null then
        v_chk := price_transfer_leg(v_q.pricing_version_id, v_q.road_km, v_q.trip_type, v_n, null);
        if (v_chk->>'fare') is distinct from (v_q.legs->0->>'fare')
           or (v_chk->>'manual') is distinct from (v_q.legs->0->>'manual') then
          raise exception using errcode='RR097', hint='repriced',
            message='The fare changed with the time of day. Please check it again.';
        end if;
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

notify pgrst, 'reload schema';
