-- ══════════════════════════════════════════════════════════════════════════
-- THE CUSTOMER BOOKS THEMSELVES — SO THE PRICE MUST COMPUTE ITSELF
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied as m85_taxi_auto_dispatch, m86_taxi_whatsapp_readiness and
-- m87_ride_pricing_and_self_service. Captured here so the repo can rebuild.
--
-- The owner, clarifying what "automatic" meant: "it does not require the admin
-- intervention but the intervention of clients and driver only... admin should be
-- notified only if there is a serious issue."
--
-- That reframed the gap. Dispatch, notification and acceptance were already
-- automatic after M85 — but every ride still STARTED with a phone call the owner
-- typed into /admin/rides, pricing it by hand. Removing that has one hard
-- prerequisite: a customer cannot book a ride whose price a human decides
-- afterwards.

-- ── 1. DRIVER CONTACT + AUTOMATIC DISPATCH (m85) ──────────────────────────
alter table public.taxi_drivers
  add column if not exists whatsapp_api_key text,
  -- The driver's PERMANENT personal link. Unlike an offer token this never
  -- expires and is never spent: it is an identity, not an authorisation. Grants
  -- exactly two powers — read my own status, set my own availability.
  add column if not exists driver_token text unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- Quiet hours. A human pressing send used to be the accidental guard against a
  -- 03:00 WhatsApp; automation removes it, so the guard becomes explicit.
  add column if not exists notify_from_hour integer not null default 6
    check (notify_from_hour between 0 and 23),
  add column if not exists notify_to_hour integer not null default 22
    check (notify_to_hour between 0 and 23);

update public.taxi_drivers
   set driver_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where driver_token is null;

comment on column public.taxi_drivers.whatsapp_api_key is
  'CallMeBot bearer credential. Anyone holding it can send WhatsApp as that number, so it is never granted to a client role, never returned by an admin API and never reaches a bundle — same posture as driver_contact_channels (M43).';

revoke all on table public.taxi_drivers from anon, authenticated;

-- Returns the credential to the SERVER only, so no ordinary query anywhere could
-- accidentally ship it.
create or replace function public.taxi_offer_targets(p_request_id uuid)
returns table (driver_id uuid, driver_name text, phone text, api_key text,
               token text, price integer, pickup text, dropoff text,
               passengers integer, service text, when_kind text, scheduled_at timestamptz)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select t.id, t.name, coalesce(t.whatsapp, t.phone), t.whatsapp_api_key, o.token,
         r.quoted_price, r.pickup_label, r.dropoff_label, r.passengers,
         r.service, r.when_kind, r.scheduled_at
    from ride_offers o
    join taxi_drivers  t on t.id = o.driver_id
    join ride_requests r on r.id = o.request_id
   where o.request_id = p_request_id and o.status = 'offered'
     -- Outside their window a driver still HOLDS the offer; they are just not woken.
     and extract(hour from (now() at time zone 'Indian/Mauritius'))::int
           between t.notify_from_hour and t.notify_to_hour;
$$;
revoke all on function public.taxi_offer_targets(uuid) from public;
revoke all on function public.taxi_offer_targets(uuid) from anon, authenticated;
grant execute on function public.taxi_offer_targets(uuid) to service_role;

-- "Is this driver reachable automatically?" as a BOOLEAN. The obvious way to find
-- out — select the key and test it — ships a bearer credential to a browser.
create or replace function public.taxi_whatsapp_readiness()
returns table (driver_id uuid, whatsapp_ready boolean)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select id, (whatsapp_api_key is not null and length(btrim(whatsapp_api_key)) > 0)
    from taxi_drivers;
$$;
revoke all on function public.taxi_whatsapp_readiness() from public;
revoke all on function public.taxi_whatsapp_readiness() from anon, authenticated;
grant execute on function public.taxi_whatsapp_readiness() to service_role;

-- THE LOOP THAT REPLACES THE ADMIN'S FINGER. Rides on the notification worker
-- that already runs every minute: already authorised, already concurrency-safe,
-- and one less pinger to forget. FOR UPDATE SKIP LOCKED so two overlapping runs
-- take disjoint rides rather than double-offering.
create or replace function public.auto_dispatch_rides(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_r record; v_offered integer := 0; v_rounds integer := 0; v_failed integer := 0;
  v_ids jsonb := '[]'::jsonb; v_res jsonb; v_max integer;
begin
  select cardinality(radius_stages_km) + 1 into v_max from dispatch_settings where id = 'main';
  for v_r in
    select id, status, offer_rounds from ride_requests
     where status in ('new','dispatching')
       -- 30 minutes before pickup is the preparation window: earlier and the
       -- driver forgets, later and nobody is free.
       and (when_kind = 'now' or scheduled_at is null
            or scheduled_at <= now() + interval '30 minutes')
       -- 'dispatching' is only actionable once every live offer is gone — until
       -- then the drivers already asked are still deciding.
       and (status = 'new'
            or not exists (select 1 from ride_offers o
                            where o.request_id = ride_requests.id
                              and o.status = 'offered' and o.expires_at > now()))
     -- Somebody standing by a road outranks a booking for Thursday.
     order by (when_kind = 'now') desc, created_at asc
     limit greatest(coalesce(p_limit, 20), 1)
     for update skip locked
  loop
    update ride_offers set status = 'expired', responded_at = now()
     where request_id = v_r.id and status = 'offered' and expires_at <= now();

    if v_r.offer_rounds >= v_max then
      update ride_requests set status = 'no_driver', updated_at = now() where id = v_r.id;
      perform log_ride_event(v_r.id, 'system', null, 'ride.no_driver', v_r.status, 'no_driver',
                             jsonb_build_object('rounds', v_r.offer_rounds));
      v_failed := v_failed + 1;
      v_ids := v_ids || jsonb_build_object('rideId', v_r.id, 'outcome', 'no_driver');
      continue;
    end if;

    v_res := offer_ride(v_r.id, 10);
    v_rounds := v_rounds + 1;
    v_offered := v_offered + coalesce((v_res->>'offered')::int, 0);
    v_ids := v_ids || jsonb_build_object('rideId', v_r.id,
      'stage', (v_res->>'stage')::int, 'offered', (v_res->>'offered')::int);
  end loop;
  return jsonb_build_object('rounds', v_rounds, 'offered', v_offered,
                            'exhausted', v_failed, 'rides', v_ids);
end; $$;
revoke all on function public.auto_dispatch_rides(integer) from public;
revoke all on function public.auto_dispatch_rides(integer) from anon, authenticated;
grant execute on function public.auto_dispatch_rides(integer) to service_role;

-- ── 2. THE DRIVER'S OWN PAGE, BY PERMANENT LINK ───────────────────────────
-- Not an account. A cook signs in because a kitchen has a shift, a menu and
-- money; a driver needs to say "I am working" and answer one offer. Both fit
-- behind a bookmarked link with no password.
create or replace function public.taxi_driver_home(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_t taxi_drivers%rowtype; v_offer jsonb; v_job jsonb;
begin
  if p_token is null or length(p_token) < 32 then return jsonb_build_object('ok', false); end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;

  select jsonb_build_object('token', o.token, 'pickup', r.pickup_label,
                            'dropoff', r.dropoff_label, 'price', r.quoted_price,
                            'passengers', r.passengers, 'expiresAt', o.expires_at)
    into v_offer from ride_offers o join ride_requests r on r.id = o.request_id
   where o.driver_id = v_t.id and o.status = 'offered' and o.expires_at > now()
   order by o.offered_at desc limit 1;

  select jsonb_build_object('pickup', r.pickup_label, 'dropoff', r.dropoff_label,
                            'customerName', r.customer_name, 'customerPhone', r.customer_phone,
                            'status', r.status, 'price', r.quoted_price)
    into v_job from ride_requests r
   where r.driver_id = v_t.id and r.status in ('assigned','driver_on_way','arrived','on_trip')
   order by r.assigned_at desc limit 1;

  return jsonb_build_object('ok', true, 'name', v_t.name,
    'availability', v_t.availability, 'vehicle', v_t.vehicle,
    -- The driver is the only person who can fix this, so their page is where it
    -- has to be said.
    'whatsappReady', (v_t.whatsapp_api_key is not null and length(v_t.whatsapp_api_key) > 0),
    'ridesCompleted', v_t.rides_completed, 'offer', v_offer, 'job', v_job);
end; $$;
revoke all on function public.taxi_driver_home(text) from public;
grant execute on function public.taxi_driver_home(text) to anon, authenticated, service_role;

-- What makes automatic dispatch safe: until now only the owner could stop a
-- driver being woken for work they were never going to take.
create or replace function public.set_taxi_availability_by_token(p_token text, p_state text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_t taxi_drivers%rowtype;
begin
  if p_state not in ('available','off') then
    raise exception using errcode='RR094', message='Invalid state.'; end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;
  -- 'busy' is the OWNER's word, set from the desk, so a driver can never clear it.
  if v_t.availability = 'busy' and p_state = 'available' then
    return jsonb_build_object('ok', true, 'availability', 'busy',
      'message', 'The office has you marked busy — call them to change it.'); end if;
  update taxi_drivers set availability = p_state where id = v_t.id;
  return jsonb_build_object('ok', true, 'availability', p_state);
end; $$;
revoke all on function public.set_taxi_availability_by_token(text, text) from public;
grant execute on function public.set_taxi_availability_by_token(text, text) to anon, authenticated, service_role;

-- ── 3. PRICING (m87) ──────────────────────────────────────────────────────
-- Predictable, not surge. The brief was explicit, and on an island where the same
-- journey is quoted the same way every day a moving fare would destroy trust
-- faster than it earned anything.
create table if not exists public.ride_pricing (
  service text primary key check (service in ('taxi','airport','hotel','ferry','private')),
  -- Minor units throughout, like every other price on the platform, so a fare can
  -- never land 100x wrong.
  base_fare      integer not null default 15000 check (base_fare >= 0),
  per_km         integer not null default 4000  check (per_km >= 0),
  minimum_fare   integer not null default 25000 check (minimum_fare >= 0),
  per_extra_passenger integer not null default 0 check (per_extra_passenger >= 0),
  per_luggage    integer not null default 0 check (per_luggage >= 0),
  -- A flat addition rather than a multiplier, so a customer sees exactly what the
  -- night costs.
  night_surcharge integer not null default 0 check (night_surcharge >= 0),
  night_from_hour integer not null default 21 check (night_from_hour between 0 and 23),
  night_to_hour   integer not null default 5  check (night_to_hour between 0 and 23),
  -- Somebody has to be able to say "the airport is Rs 1,800, full stop". When set,
  -- distance is ignored entirely.
  flat_fare integer check (flat_fare >= 0),
  is_bookable boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Taxi is distance-based; the airport and ferry are the two runs everybody
-- already quotes flat. Private hire is a negotiation, so it carries no formula —
-- better an honest "we will confirm" than a number nobody meant.
insert into public.ride_pricing (service, base_fare, per_km, minimum_fare, flat_fare)
values ('taxi', 15000, 4000, 25000, null),
       ('airport', 0, 0, 0, 180000),
       ('ferry',   0, 0, 0, 120000),
       ('hotel',  15000, 4000, 30000, null),
       ('private', 0, 0, 0, null)
on conflict (service) do nothing;

alter table public.ride_pricing enable row level security;
-- Readable by nobody through the API: quotes come from quote_ride(), so there is
-- one place a fare can be computed and the client never sees the formula it would
-- need to forge one.
revoke all on table public.ride_pricing from anon, authenticated;

create or replace function public.quote_ride(
  p_service text,
  p_pickup_lat double precision default null,  p_pickup_lng double precision default null,
  p_dropoff_lat double precision default null, p_dropoff_lng double precision default null,
  p_passengers integer default 1, p_luggage integer default 0,
  p_when timestamptz default null
) returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare
  v_p ride_pricing%rowtype; v_set dispatch_settings%rowtype;
  v_km numeric; v_road numeric; v_fare integer; v_hour integer;
  v_night boolean := false; v_est integer;
begin
  select * into v_p from ride_pricing where service = p_service;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_service'); end if;
  if not v_p.is_bookable then
    return jsonb_build_object('ok', false, 'reason', 'not_bookable',
      'message', 'This one is arranged by hand — send us a message and we will sort it.'); end if;
  select * into v_set from dispatch_settings where id = 'main';

  v_hour := extract(hour from coalesce(p_when, now()) at time zone 'Indian/Mauritius')::int;
  -- A window that wraps midnight (21:00 → 05:00) is two ranges, not one.
  v_night := case
    when v_p.night_surcharge = 0 then false
    when v_p.night_from_hour <= v_p.night_to_hour
      then v_hour between v_p.night_from_hour and v_p.night_to_hour
    else v_hour >= v_p.night_from_hour or v_hour <= v_p.night_to_hour end;

  if v_p.flat_fare is not null then
    v_fare := v_p.flat_fare; v_road := null;
  else
    if p_pickup_lat is null or p_dropoff_lat is null then
      -- No coordinates means no distance means no honest number. Say so rather
      -- than quoting the minimum and hoping.
      return jsonb_build_object('ok', false, 'reason', 'need_locations',
        'message', 'Pick both places on the map so we can work out the fare.'); end if;
    v_km := haversine_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng)::numeric;
    v_road := round(v_km * v_set.road_factor, 2);
    v_fare := v_p.base_fare + round(v_road * v_p.per_km)::integer;
    if v_fare < v_p.minimum_fare then v_fare := v_p.minimum_fare; end if;
  end if;

  v_fare := v_fare
          + greatest(0, coalesce(p_passengers, 1) - 1) * v_p.per_extra_passenger
          + greatest(0, coalesce(p_luggage, 0)) * v_p.per_luggage
          + case when v_night then v_p.night_surcharge else 0 end;

  -- Zero is not a price. A service with no formula and no flat fare is a
  -- conversation, and pretending otherwise puts a free ride on the screen.
  if v_fare <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'quote_on_request',
      'message', 'We will confirm the price with you — no charge until you agree.'); end if;

  v_est := case when v_road is null then null
                else ceil(v_road / v_set.avg_speed_kmh * 60)::integer end;
  return jsonb_build_object('ok', true, 'price', v_fare, 'currency', 'MUR',
    'roadKm', v_road, 'tripMinutes', v_est, 'night', v_night,
    'flat', (v_p.flat_fare is not null));
end; $$;
revoke all on function public.quote_ride(text, double precision, double precision, double precision, double precision, integer, integer, timestamptz) from public;
grant execute on function public.quote_ride(text, double precision, double precision, double precision, double precision, integer, integer, timestamptz) to service_role;

-- ── 4. THE CUSTOMER'S OWN BOOKING ─────────────────────────────────────────
create or replace function public.create_ride_request(
  p_service text, p_when_kind text, p_scheduled_at timestamptz,
  p_pickup_label text,  p_pickup_lat double precision,  p_pickup_lng double precision,
  p_dropoff_label text, p_dropoff_lat double precision, p_dropoff_lng double precision,
  p_passengers integer, p_luggage integer, p_notes text,
  p_flight_ref text, p_meet_greet boolean,
  p_customer_name text, p_customer_phone text, p_customer_email text
) returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_quote jsonb; v_id uuid; v_price integer;
begin
  if coalesce(btrim(p_customer_name), '') = '' or coalesce(btrim(p_customer_phone), '') = '' then
    raise exception using errcode='RR095', message='We need a name and a phone number to send a driver.'; end if;
  if coalesce(btrim(p_pickup_label), '') = '' or coalesce(btrim(p_dropoff_label), '') = '' then
    raise exception using errcode='RR095', message='Where from and where to, please.'; end if;
  if p_when_kind = 'scheduled' and p_scheduled_at is null then
    raise exception using errcode='RR095', message='Pick a date and time for a later ride.'; end if;
  -- A ride booked for the past is a typo, not a booking.
  if p_when_kind = 'scheduled' and p_scheduled_at < now() - interval '5 minutes' then
    raise exception using errcode='RR095', message='That time has already passed.'; end if;

  -- THE PRICE IS RE-COMPUTED HERE from these arguments, and the caller's idea of
  -- it is never read. RR012's rule: what is charged must be derived server-side
  -- from what was actually requested.
  v_quote := quote_ride(p_service, p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
                        p_passengers, p_luggage,
                        case when p_when_kind = 'scheduled' then p_scheduled_at else now() end);
  -- A ride we cannot price is still worth taking — it goes out with no number and
  -- the owner confirms. Better than refusing the customer.
  v_price := case when (v_quote->>'ok')::boolean then (v_quote->>'price')::integer else null end;

  insert into ride_requests (
    service, when_kind, scheduled_at, pickup_label, pickup_lat, pickup_lng,
    dropoff_label, dropoff_lat, dropoff_lng, passengers, luggage, notes,
    flight_ref, meet_greet, customer_name, customer_phone, customer_email,
    quoted_price, status
  ) values (
    p_service,
    case when p_when_kind = 'scheduled' then 'scheduled' else 'now' end,
    case when p_when_kind = 'scheduled' then p_scheduled_at else null end,
    btrim(p_pickup_label), p_pickup_lat, p_pickup_lng,
    btrim(p_dropoff_label), p_dropoff_lat, p_dropoff_lng,
    greatest(coalesce(p_passengers, 1), 1), greatest(coalesce(p_luggage, 0), 0),
    nullif(btrim(coalesce(p_notes, '')), ''),
    nullif(btrim(coalesce(p_flight_ref, '')), ''), coalesce(p_meet_greet, false),
    btrim(p_customer_name), btrim(p_customer_phone),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    v_price,
    -- 'new' means auto_dispatch_rides() picks it up on the next tick. Nobody
    -- presses anything.
    'new'
  ) returning id into v_id;

  perform log_ride_event(v_id, 'customer', null, 'ride.requested', null, 'new',
    jsonb_build_object('quoted', v_price, 'quoteOk', (v_quote->>'ok')::boolean));
  return jsonb_build_object('ok', true,
    'reference', 'RR-' || upper(substring(replace(v_id::text, '-', ''), 1, 6)),
    'price', v_price, 'currency', 'MUR');
end; $$;
revoke all on function public.create_ride_request(text, text, timestamptz, text, double precision, double precision, text, double precision, double precision, integer, integer, text, text, boolean, text, text, text) from public;
grant execute on function public.create_ride_request(text, text, timestamptz, text, double precision, double precision, text, double precision, double precision, integer, integer, text, text, boolean, text, text, text) to service_role;

-- ── 5. CLOSE THE HOLE M83 LEFT ────────────────────────────────────────────
-- ride_requests had an anon INSERT policy so a form could write directly. With no
-- price that was merely useless; with a price it is forgeable — anybody could POST
-- a Rs 20 airport transfer, or write a ride carrying somebody else's phone number.
-- Bookings go through create_ride_request() and nowhere else.
drop policy if exists ride_requests_anon_insert on public.ride_requests;
revoke all on table public.ride_requests from anon, authenticated;

-- ── 6. THE CUSTOMER'S OWN STATUS ──────────────────────────────────────────
-- Two factors, like every other lookup here: a reference alone must not be enough,
-- because references are short and guessable.
create or replace function public.lookup_ride(p_ref text, p_phone text)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_r ride_requests%rowtype; v_hex text; v_digits text;
begin
  v_hex := lower(regexp_replace(coalesce(p_ref, ''), '^RR-?', '', 'i'));
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_hex) < 4 or length(v_digits) < 5 then return jsonb_build_object('ok', false); end if;

  select * into v_r from ride_requests r
   where lower(substring(replace(r.id::text, '-', ''), 1, length(v_hex))) = v_hex
     -- Last 7 digits only: "5799 0011" and "+230 5799 0011" are the same person.
     and right(regexp_replace(r.customer_phone, '\D', '', 'g'), 7) = right(v_digits, 7)
   order by r.created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false); end if;

  return jsonb_build_object('ok', true, 'status', v_r.status, 'service', v_r.service,
    'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label,
    'whenKind', v_r.when_kind, 'scheduledAt', v_r.scheduled_at,
    'price', v_r.quoted_price, 'currency', v_r.currency,
    'passengers', v_r.passengers, 'rounds', v_r.offer_rounds,
    'driver', case when v_r.driver_id is null then null else (
      select jsonb_build_object('name', t.name, 'phone', coalesce(t.whatsapp, t.phone),
                                'vehicle', t.vehicle)
        from taxi_drivers t where t.id = v_r.driver_id) end);
end; $$;
revoke all on function public.lookup_ride(text, text) from public;
grant execute on function public.lookup_ride(text, text) to anon, authenticated, service_role;
