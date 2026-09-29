-- ═══════════════════════════════════════════════════════════════════════════
-- M222 · AIRPORT TRANSFERS GO OUT LIKE A NORMAL TAXI — NOTHING IS HELD
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The owner, 29 Sep 2026: "for airport transfer, no dashboards — just how a
-- normal taxi uses it", confirmed as: booking, admin and driver screens all
-- behave like a normal taxi, and nothing new is built.
--
-- M220 held a hand-priced transfer (night 22:00-04:59, or a group of 7+) with
-- fare_pending = true until the owner typed a fare into a "set the fare" box on
-- the desk. That box is removed with the other airport-only screens, and a hold
-- nobody can release is a stuck booking. So a hand-priced transfer now does
-- what an unpriced normal taxi ride has always done: it is booked with no fixed
-- price and offered to drivers straight away; the fare is agreed by hand.
--
--   create_ride_request   writes fare_pending = false on every ride (the
--                         response still says farePending, meaning "priced by
--                         hand", so the screens and messages can say so)
--   auto_dispatch_rides   back to its M199 shape, without the fare_pending
--                         filter, so no ride can be held by this column again
--
-- Prices are unchanged: zones, return package, the Rs 300 evening band, and
-- night/groups priced by hand. No open ride was held when this was written
-- (checked: 0 of 11 rides had fare_pending).

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
        false, v_out,   -- M222: never held; a hand-priced leg is dispatched like any unpriced taxi ride
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
          false, v_back,   -- M222: never held
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
    v_price, false,   -- M222: never held
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


-- ── auto_dispatch_rides: the M199 shape, no hold ───────────────────────────

create or replace function public.auto_dispatch_rides(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_r        record;
  v_offered  integer := 0;
  v_rounds   integer := 0;
  v_failed   integer := 0;
  v_ids      jsonb := '[]'::jsonb;
  v_res      jsonb;
  v_max      integer;
  v_window   integer;
  v_ladder   interval;
  v_lead     interval;
begin
  -- M135 · One read, used by BOTH the offer window and the pacing wait below.
  select cardinality(radius_stages_km) + 1, accept_window_minutes
    into v_max, v_window
    from dispatch_settings where id = 'main';

  -- M199 · How long the ladder actually takes, read from the same settings
  -- rather than assumed. The lead time is derived from it, so the two cannot
  -- drift apart again.
  v_ladder := make_interval(mins => v_max * v_window);
  v_lead   := greatest(interval '3 hours', v_ladder + interval '15 minutes');

  for v_r in
    select id, status, offer_rounds, when_kind, scheduled_at, service
      from ride_requests
     where status in ('new','dispatching')
       -- M199 · Start early enough that the LAST round still lands before the
       -- pickup, with room for a person to intervene.
       and (when_kind = 'now'
            or scheduled_at is null
            or scheduled_at <= now() + case
                 when service = 'airport' then interval '24 hours'
                 else v_lead
               end)
       and (status = 'new'
            or not exists (select 1 from ride_offers o
                            where o.request_id = ride_requests.id
                              and o.status = 'offered'
                              and o.expires_at > now()))
       -- ── M132 · AN EMPTY ROUND MUST STILL COST THE FULL WINDOW ──────────
       and (offer_rounds = 0
            or coalesce((select (e.detail->>'drivers')::int
                           from ride_events e
                          where e.request_id = ride_requests.id
                            and e.action = 'ride.offered'
                          order by e.created_at desc, e.id desc
                          limit 1), 1) > 0
            or updated_at <= now() - make_interval(mins => v_window))
     order by
       (when_kind = 'now') desc, created_at asc
     limit greatest(coalesce(p_limit, 20), 1)
     for update skip locked
  loop
    update ride_offers set status = 'expired', responded_at = now()
     where request_id = v_r.id and status = 'offered' and expires_at <= now();

    if v_r.offer_rounds >= v_max then
      update ride_requests set status = 'no_driver', updated_at = now() where id = v_r.id;
      perform log_ride_event(v_r.id, 'system', null, 'ride.no_driver',
                             v_r.status, 'no_driver',
                             -- M199 · A NEGATIVE value means we gave up after
                             -- the pickup — the bug this migration closes.
                             jsonb_build_object(
                               'rounds', v_r.offer_rounds,
                               'minutesBeforePickup',
                                 case when v_r.scheduled_at is null then null
                                      else round(extract(epoch from (v_r.scheduled_at - now())) / 60)
                                 end));
      v_failed := v_failed + 1;
      v_ids := v_ids || jsonb_build_object('rideId', v_r.id, 'outcome', 'no_driver');
      continue;
    end if;

    v_res := offer_ride(v_r.id, v_window);
    v_rounds := v_rounds + 1;
    v_offered := v_offered + coalesce((v_res->>'offered')::int, 0);
    v_ids := v_ids || jsonb_build_object(
      'rideId', v_r.id,
      'stage', (v_res->>'stage')::int,
      'offered', (v_res->>'offered')::int);
  end loop;

  return jsonb_build_object('rounds', v_rounds, 'offered', v_offered,
                            'exhausted', v_failed, 'rides', v_ids);
end;
$function$;

-- ── The desk's "set the fare" function and its counter are retired ─────────
-- Nothing calls them once the desk box and the attention item are gone, and
-- admin_set_ride_fare could no longer succeed on a quoted ride anyway: with
-- fare_pending false, ride_price_is_settled refuses a later quoted_price write
-- (RR099). Dead code that looks callable is a trap; removed. (Review of M222.)
drop function if exists public.admin_set_ride_fare(uuid, integer, text);
drop function if exists public.rides_awaiting_fare_count();

-- Nothing is held any more; release anything that somehow still is.
update public.ride_requests set fare_pending = false, updated_at = now()
 where fare_pending and status in ('new', 'dispatching', 'no_driver');

notify pgrst, 'reload schema';
