-- ═══════════════════════════════════════════════════════════════════════════
-- M220 · AIRPORT TRANSFERS ARE PRICED BY ZONE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The owner's model, 29 Sep 2026. Zones by DRIVING distance from Plaine Corail:
--
--                      one way (1 person)     return package, EACH way
--   Zone 1  ≤ 7 km          Rs 1,200               Rs 1,200
--   Zone 2  > 7, < 15 km    Rs 1,500               Rs 1,500
--   Zone 3  ≥ 15 km         Rs 2,000               Rs 1,700
--
--   + Rs 150 per passenger after the first, per direction, on both.
--   Night (17:00–04:59) is the owner's to configure: priced by hand (the launch
--   setting), a fixed surcharge, or a multiplier.
--
-- Until now the airport was one flat Rs 1,800 in ride_pricing.flat_fare.
--
-- ── THE DISTANCE HAD TO BE A REAL ROAD DISTANCE ─────────────────────────────
-- The obvious implementation is quote_ride()'s existing estimate: straight
-- line × dispatch_settings.road_factor (1.35). Measured against a road router
-- for all 32 named places, it puts NINE of them in the wrong zone — every one
-- of them too cheap, because Rodrigues is a ridge with a coast road and the
-- straight line cuts across the middle:
--
--   Port Mathurin       estimate 13.8 km → Zone 2    road 18.2 km → Zone 3
--   Baie aux Huîtres    estimate 12.6 km → Zone 2    road 17.1 km → Zone 3
--   Caverne Patate      estimate  3.7 km → Zone 1    road  7.5 km → Zone 2
--
-- Port Mathurin is the single most common airport destination. Pricing it
-- from the estimate would have under-charged it by Rs 500 on every run.
--
-- So the zone comes from a road distance, in this order:
--   1. transfer_known_distances — the 32 named places, measured once with the
--      same OSRM router lib/tracking/routing.ts uses (routing.openstreetmap.de,
--      29 Sep 2026; the OSRM demo server returned identical numbers). A pin
--      within 250 m of one of them uses its number. No network, reproducible.
--   2. A road distance the SERVER routed for any other pin (the API calls the
--      router; the browser never supplies a distance).
--   3. Neither → no automatic price. The ride can still be booked and the owner
--      sets the fare. An estimate is never used for a zone: it is wrong in the
--      customer's favour 28% of the time.
--
-- Distance is measured airport → place. Reverse (place → airport) differs by up
-- to 0.8 km through Port Mathurin's one-way streets but never changes a zone for
-- any named place, and one number per place means both legs of a return package
-- are always the same zone.
--
-- ── WHAT THIS MIGRATION ADDS ────────────────────────────────────────────────
--   transfer_pricing_versions  append-only price lists. Publishing = a new row.
--   transfer_known_distances   the measured road distances.
--   ride_quotes                every quote shown, immutable once booked.
--   ride_requests +columns     quote, version, zone, leg, fare breakdown, and
--                              driver earnings kept apart from the customer fare.
--   quote_airport_transfer()   the pricing engine's public door (service role).
--   create_ride_request()      books from a quote; a return package becomes two
--                              linked rides, one per direction.
--   admin_set_ride_fare()      the owner prices a night or group transfer by hand.
--   auto_dispatch_rides()      holds a ride with no agreed fare.
--   driver screens             show driver_pay (earnings), not the customer fare.


-- ── 1. PRICE LISTS ──────────────────────────────────────────────────────────
-- Money in minor units (cents), like ride_pricing and ride_requests.quoted_price.

create table if not exists public.transfer_pricing_versions (
  id                    bigint generated always as identity primary key,
  service               text not null default 'airport' check (service = 'airport'),
  label                 text not null check (length(btrim(label)) between 1 and 120),

  -- Where "distance from the airport" is measured from, and how close a pin
  -- must be to count as the airport end. 300 m, not more: the François Leguat
  -- reserve is 0.98 km from the terminal as the crow flies.
  origin_label          text not null,
  origin_lat            double precision not null,
  origin_lng            double precision not null,
  origin_radius_km      numeric(5,2) not null default 0.30 check (origin_radius_km > 0 and origin_radius_km <= 2),

  -- Zone 1: road_km <= zone1_max_km.  Zone 2: road_km < zone2_max_km.
  -- Zone 3: road_km >= zone2_max_km. Exactly the owner's "≤ 7 / > 7 and < 15 /
  -- ≥ 15", including which side of each line the line itself falls on.
  zone1_max_km          numeric(6,2) not null,
  zone2_max_km          numeric(6,2) not null,

  one_way_zone1         integer not null,
  one_way_zone2         integer not null,
  one_way_zone3         integer not null,
  -- Per DIRECTION. A return package is two of these plus two passenger fees.
  return_zone1          integer not null,
  return_zone2          integer not null,
  return_zone3          integer not null,

  included_passengers   integer not null default 1 check (included_passengers between 1 and 20),
  extra_passenger_fee   integer not null check (extra_passenger_fee >= 0),
  -- Above this a group needs a bigger vehicle or two cars, which a per-head fee
  -- does not price. Such a quote goes to the owner instead.
  max_priced_passengers integer not null default 6 check (max_priced_passengers between 1 and 20),

  night_mode            text not null check (night_mode in ('none', 'manual', 'fixed', 'multiplier')),
  night_from_hour       integer not null check (night_from_hour between 0 and 23),
  night_to_hour         integer not null check (night_to_hour between 0 and 23),
  night_surcharge       integer not null default 0 check (night_surcharge >= 0),
  night_multiplier      numeric(4,2) not null default 1.00 check (night_multiplier between 1 and 3),

  -- Roulé's share of each fare. The driver earns the rest.
  commission_percent    numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  quote_valid_minutes   integer not null default 30 check (quote_valid_minutes between 5 and 1440),

  effective_from        timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  created_by            text,
  note                  text,

  check (zone1_max_km > 0 and zone2_max_km > zone1_max_km),
  check (one_way_zone1 > 0 and one_way_zone2 > 0 and one_way_zone3 > 0),
  check (return_zone1 > 0 and return_zone2 > 0 and return_zone3 > 0)
);

create index if not exists transfer_pricing_versions_active_idx
  on public.transfer_pricing_versions (service, effective_from desc, id desc);

comment on table public.transfer_pricing_versions is
  'M220. Airport transfer price lists. Append-only: a quote records the id it was priced from, so a published row is never edited — publish a new one.';

create or replace function public.transfer_pricing_is_append_only()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception using errcode = 'RR098',
    message = 'A published price list cannot be changed. Publish a new version instead.';
end $$;

drop trigger if exists transfer_pricing_is_append_only on public.transfer_pricing_versions;
create trigger transfer_pricing_is_append_only
  before update or delete on public.transfer_pricing_versions
  for each row execute function public.transfer_pricing_is_append_only();


-- ── 2. MEASURED ROAD DISTANCES ──────────────────────────────────────────────
-- ids and coordinates are lib/rides/places.ts's, so a pick from the list lands
-- exactly on its row.

create table if not exists public.transfer_known_distances (
  place_id    text primary key,
  label       text not null,
  lat         double precision not null,
  lng         double precision not null,
  road_km     numeric(6,2) not null check (road_km >= 0),
  source      text not null,
  measured_at timestamptz not null default now()
);

comment on table public.transfer_known_distances is
  'M220. Road km from Plaine Corail Airport to each named place, measured with OSRM. Zones for these places never depend on a live router.';

insert into public.transfer_known_distances (place_id, label, lat, lng, road_km, source)
select v.place_id, v.label, v.lat, v.lng, v.road_km,
       'osrm routing.openstreetmap.de, airport to place, 2026-09-29'
  from (values
  ('ferry', 'Port Mathurin ferry terminal', -19.6829, 63.4189, 18.43),
  ('port-mathurin', 'Port Mathurin', -19.6836, 63.4186, 18.23),
  ('mont-lubin', 'Mont Lubin', -19.7074, 63.4413, 13.66),
  ('la-ferme', 'La Ferme', -19.7247, 63.3838, 7.16),
  ('riviere-cocos', 'Rivière Cocos', -19.7414, 63.4114, 11.09),
  ('baie-du-nord', 'Baie du Nord', -19.7123, 63.3748, 8.51),
  ('oyster-bay', 'Baie aux Huîtres', -19.6871, 63.4091, 17.12),
  ('grand-baie', 'Grand Baie', -19.6785, 63.4491, 20.64),
  ('riviere-banane', 'Rivière Banane', -19.6853, 63.4736, 19.13),
  ('port-sud-est', 'Port Sud-Est', -19.7419, 63.4514, 15.32),
  ('graviers', 'Graviers', -19.7265, 63.483, 19.40),
  ('st-francois', 'Saint François', -19.7007, 63.4946, 22.42),
  ('petit-gabriel', 'Petit Gabriel', -19.7165, 63.4279, 11.38),
  ('brulee', 'Brûlée', -19.7431, 63.4181, 11.52),
  ('quatre-vents', 'Quatre Vents', -19.7202, 63.4086, 8.98),
  ('anse-quitor', 'Anse Quitor', -19.7539, 63.3703, 3.82),
  ('citron-donis', 'Citron Donis', -19.7181, 63.4761, 18.03),
  ('roche-bon-dieu', 'Roche Bon Dieu', -19.6912, 63.4763, 18.58),
  ('pointe-coton', 'Pointe Coton', -19.685, 63.4951, 21.87),
  ('trou-dargent', 'Trou d''Argent', -19.7135, 63.5012, 23.86),
  ('anse-ally', 'Anse Ally', -19.6955, 63.4975, 21.62),
  ('st-francois-beach', 'Saint François beach', -19.701, 63.496, 22.54),
  ('mourouk', 'Mourouk', -19.7393, 63.467, 17.40),
  ('anse-bouteille', 'Anse Bouteille', -19.7177, 63.5, 23.86),
  ('gravier-beach', 'Graviers beach', -19.7282, 63.4854, 19.71),
  ('caverne-patate', 'Caverne Patate', -19.7547, 63.3868, 7.49),
  ('francois-leguat', 'François Leguat tortoise reserve', -19.7562, 63.3702, 6.03),
  ('ile-aux-cocos', 'Île aux Cocos jetty', -19.6906, 63.3778, 12.34),
  ('montagne-malgache', 'Montagne Malgache', -19.7017, 63.4028, 17.70),
  ('grande-montagne', 'Grande Montagne reserve', -19.7064, 63.4657, 16.44),
  ('jardin-5-sens', 'Jardin des 5 Sens', -19.7159, 63.457, 15.39),
  ('hospital', 'Queen Elizabeth Hospital', -19.6989, 63.4133, 15.21)
  ) as v(place_id, label, lat, lng, road_km)
on conflict (place_id) do nothing;


-- ── 3. QUOTES ───────────────────────────────────────────────────────────────
-- Written by the server for every price the screen shows. The browser holds
-- only the id; everything that decides the price lives here, and a booking
-- must match it field for field or be refused.

create table if not exists public.ride_quotes (
  id                  uuid primary key default gen_random_uuid(),
  service             text not null default 'airport',
  pricing_version_id  bigint not null references public.transfer_pricing_versions (id),
  direction           text not null check (direction in ('from', 'to')),
  trip_type           text not null check (trip_type in ('one_way', 'return')),
  pickup_lat          double precision not null,
  pickup_lng          double precision not null,
  dropoff_lat         double precision not null,
  dropoff_lng         double precision not null,
  passengers          integer not null check (passengers between 1 and 20),
  -- Null = "as soon as possible", priced at the moment of quoting.
  outbound_at         timestamptz,
  return_at           timestamptz,
  road_km             numeric(6,2) not null,
  distance_source     text not null,
  zone                smallint not null check (zone between 1 and 3),
  legs                jsonb not null,
  -- Null when any leg needs a hand-set fare (night, large group).
  total               integer,
  needs_manual        boolean not null,
  driver_earnings     integer,
  platform_commission integer,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  ride_id             uuid,
  check ((trip_type = 'return') = (return_at is not null))
);

create index if not exists ride_quotes_prune_idx
  on public.ride_quotes (expires_at) where accepted_at is null;

comment on table public.ride_quotes is
  'M220. Every airport-transfer quote. Immutable once accepted: the booked ride points here and at the price list it came from.';

create or replace function public.ride_quote_is_immutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.accepted_at is not null then
      raise exception using errcode = 'RR099', message = 'A booked quote is a record and cannot be deleted.';
    end if;
    return old;
  end if;
  -- The one change allowed: being accepted, once.
  if old.accepted_at is not null
     or new.accepted_at is null
     or (to_jsonb(new) - 'accepted_at' - 'ride_id') <> (to_jsonb(old) - 'accepted_at' - 'ride_id') then
    raise exception using errcode = 'RR099', message = 'A quote cannot be changed once it is written.';
  end if;
  return new;
end $$;

drop trigger if exists ride_quote_is_immutable on public.ride_quotes;
create trigger ride_quote_is_immutable
  before update or delete on public.ride_quotes
  for each row execute function public.ride_quote_is_immutable();


-- ── 4. THE RIDE CARRIES ITS PRICE, AND WHO GETS WHAT ────────────────────────

alter table public.ride_requests
  add column if not exists quote_id            uuid references public.ride_quotes (id),
  add column if not exists pricing_version_id  bigint references public.transfer_pricing_versions (id),
  add column if not exists trip_type           text check (trip_type in ('one_way', 'return')),
  -- Both legs of a return package share it; a one-way ride has none.
  add column if not exists package_id          uuid,
  add column if not exists leg                 text check (leg in ('outbound', 'return')),
  add column if not exists transfer_zone       smallint check (transfer_zone between 1 and 3),
  add column if not exists road_km             numeric(6,2),
  add column if not exists fare_breakdown      jsonb,
  add column if not exists driver_earnings     integer check (driver_earnings >= 0),
  add column if not exists platform_commission integer check (platform_commission >= 0),
  -- A night or large-group transfer: booked, but nobody is offered it until the
  -- owner has agreed a fare with the customer.
  add column if not exists fare_pending        boolean not null default false;

-- What every driver screen shows. Until a split exists, the driver's number is
-- the fare, which is exactly what they saw before this migration.
alter table public.ride_requests
  add column if not exists driver_pay integer
    generated always as (coalesce(driver_earnings, quoted_price)) stored;

alter table public.ride_requests drop constraint if exists ride_requests_fare_split_adds_up;
alter table public.ride_requests add constraint ride_requests_fare_split_adds_up
  check (driver_earnings is null
         or (quoted_price is not null and platform_commission is not null
             and driver_earnings + platform_commission = quoted_price));

create index if not exists ride_requests_package_idx
  on public.ride_requests (package_id) where package_id is not null;
create index if not exists ride_requests_fare_pending_idx
  on public.ride_requests (created_at) where fare_pending;

create or replace function public.ride_price_is_settled()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.quote_id is not null and (
       new.quote_id           is distinct from old.quote_id
    or new.pricing_version_id is distinct from old.pricing_version_id
    or new.transfer_zone      is distinct from old.transfer_zone
    or new.road_km            is distinct from old.road_km
    or new.trip_type          is distinct from old.trip_type
    or new.package_id         is distinct from old.package_id
    or new.leg                is distinct from old.leg) then
    raise exception using errcode = 'RR099', message = 'The quote behind a booked ride cannot be changed.';
  end if;

  -- An agreed fare stays agreed. The only way a priced-from-a-quote ride gets a
  -- number later is admin_set_ride_fare() on a ride that was waiting for one.
  if old.quote_id is not null and not old.fare_pending and (
       new.quoted_price        is distinct from old.quoted_price
    or new.driver_earnings     is distinct from old.driver_earnings
    or new.platform_commission is distinct from old.platform_commission
    or new.fare_breakdown      is distinct from old.fare_breakdown) then
    raise exception using errcode = 'RR099', message = 'This fare was agreed with the customer and cannot be changed.';
  end if;
  return new;
end $$;

drop trigger if exists ride_price_is_settled on public.ride_requests;
create trigger ride_price_is_settled
  before update on public.ride_requests
  for each row execute function public.ride_price_is_settled();


-- ── 5. THE LAUNCH PRICE LIST ────────────────────────────────────────────────

insert into public.transfer_pricing_versions (
  label, origin_label, origin_lat, origin_lng, origin_radius_km,
  zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3,
  return_zone1, return_zone2, return_zone3,
  included_passengers, extra_passenger_fee, max_priced_passengers,
  night_mode, night_from_hour, night_to_hour, night_surcharge, night_multiplier,
  commission_percent, quote_valid_minutes, created_by, note)
select
  'Airport zones — launch', 'Plaine Corail Airport', -19.7577, 63.361, 0.30,
  7, 15,
  120000, 150000, 200000,
  120000, 150000, 170000,
  1, 15000, 6,
  -- Priced by hand at night for launch, as the owner recommended. The
  -- surcharge and multiplier are filled so switching mode is one field.
  'manual', 17, 4, 30000, 1.20,
  coalesce((select commission_percent from public.ride_pricing where service = 'airport'), 0),
  30, 'migration m220', 'Owner''s zone model, 29 Sep 2026.'
where not exists (select 1 from public.transfer_pricing_versions);

-- The old flat fare is retired, so nothing can quote Rs 1,800 by accident.
update public.ride_pricing set flat_fare = null, updated_at = now()
 where service = 'airport' and flat_fare is not null;


-- ── 6. THE PRICING ENGINE ───────────────────────────────────────────────────

create or replace function public.transfer_is_night(p_at timestamptz, p_from integer, p_to integer)
returns boolean language sql stable set search_path = public, pg_temp as $$
  -- Island time. 17 → 4 reads "17:00 to 04:59", wrapping midnight.
  select case when p_from <= p_to then h between p_from and p_to
              else h >= p_from or h <= p_to end
    from (select extract(hour from coalesce(p_at, now()) at time zone 'Indian/Mauritius')::int as h) x;
$$;

-- One direction of one trip. Pure: the same inputs give the same jsonb, which
-- is what makes a stored quote reproducible from its pricing_version_id.
create or replace function public.price_transfer_leg(
  p_version_id bigint, p_road_km numeric, p_trip_type text,
  p_passengers integer, p_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v        transfer_pricing_versions%rowtype;
  v_zone   smallint;
  v_base   integer;
  v_n      integer := greatest(coalesce(p_passengers, 1), 1);
  v_extra_n integer;
  v_extra  integer;
  v_night  boolean;
  v_adj    integer := 0;
  v_manual boolean := false;
  v_reason text;
  v_fare   integer;
  v_comm   integer;
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
  v_night   := v.night_mode <> 'none' and transfer_is_night(p_at, v.night_from_hour, v.night_to_hour);

  if v_n > v.max_priced_passengers then
    v_manual := true; v_reason := 'group';
  elsif v_night and v.night_mode = 'manual' then
    v_manual := true; v_reason := 'night';
  elsif v_night and v.night_mode = 'fixed' then
    v_adj := v.night_surcharge;
  elsif v_night and v.night_mode = 'multiplier' then
    -- On the whole leg (base + passengers), to the whole rupee.
    v_adj := (round((v_base + v_extra) * v.night_multiplier / 100.0) * 100)::integer - (v_base + v_extra);
  end if;

  v_fare := case when v_manual then null else v_base + v_extra + v_adj end;
  v_comm := case when v_fare is null then null
                 else round(v_fare * v.commission_percent / 100.0)::integer end;

  return jsonb_build_object(
    'zone', v_zone, 'tripType', p_trip_type, 'at', p_at,
    'base', v_base, 'passengers', v_n, 'extraPassengers', v_extra_n, 'passengerFee', v_extra,
    'night', v_night, 'nightRule', case when v_night then v.night_mode end, 'nightAdjustment', v_adj,
    'manual', v_manual, 'manualReason', v_reason,
    'fare', v_fare, 'commission', v_comm,
    'driverEarnings', case when v_fare is null then null else v_fare - v_comm end,
    'pricingVersion', v.id);
end $$;

-- The whole quote, without writing anything. quote_airport_transfer() stores
-- it; quote_ride() forwards to it for callers that predate this migration.
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
    'nightWindow', jsonb_build_object('from', v.night_from_hour, 'to', v.night_to_hour),
    'tripMinutes', case when coalesce(v_speed, 0) > 0 then ceil(v_km / v_speed * 60)::int end,
    'validMinutes', v.quote_valid_minutes,
    'message', case
      when v_reasons ? 'group' then 'For a group this size we confirm the vehicle and the fare with you first.'
      when v_reasons ? 'night' then 'Evening and night transfers are priced by hand. We confirm the fare with you before a driver is sent.'
    end);
end $$;

-- The public door, for the service role only: price it, write it down, and
-- hand back an id the booking must present.
create or replace function public.quote_airport_transfer(
  p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_lat double precision, p_dropoff_lng double precision,
  p_passengers integer, p_trip_type text,
  p_outbound_at timestamptz, p_return_at timestamptz, p_router_km numeric default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_q   jsonb;
  v_id  uuid;
  v_exp timestamptz;
begin
  v_q := transfer_quote_core(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
                             p_passengers, p_trip_type, p_outbound_at,
                             case when p_trip_type = 'return' then p_return_at end,
                             p_router_km);
  if not coalesce((v_q->>'ok')::boolean, false) then
    return v_q;
  end if;

  -- Quotes nobody booked are worth nothing after a day or two. Pruned here, a
  -- few at a time, rather than by a cron (vercel.json is at its cron cap).
  delete from ride_quotes
   where id in (select id from ride_quotes
                 where accepted_at is null and expires_at < now() - interval '2 days'
                 limit 200);

  insert into ride_quotes (
    service, pricing_version_id, direction, trip_type,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, passengers,
    outbound_at, return_at, road_km, distance_source, zone, legs,
    total, needs_manual, driver_earnings, platform_commission, expires_at)
  values (
    'airport', (v_q->'pricingVersion'->>'id')::bigint, v_q->>'direction', p_trip_type,
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng, greatest(coalesce(p_passengers, 1), 1),
    p_outbound_at, case when p_trip_type = 'return' then p_return_at end,
    (v_q->>'roadKm')::numeric, v_q->>'distanceSource', (v_q->>'zone')::smallint, v_q->'legs',
    (v_q->>'total')::int, (v_q->>'needsManual')::boolean,
    (v_q->>'driverEarnings')::int, (v_q->>'commission')::int,
    now() + make_interval(mins => coalesce((v_q->>'validMinutes')::int, 30)))
  returning id, expires_at into v_id, v_exp;

  return v_q || jsonb_build_object('quoteId', v_id, 'expiresAt', v_exp);
end $$;


-- ── 7. quote_ride(): THE AIRPORT NOW FORWARDS TO THE ZONE ENGINE ────────────
-- Same signature, so nothing that calls it breaks. A caller that has not been
-- updated gets a one-way zone price rather than the retired flat fare.

create or replace function public.quote_ride(
  p_service text, p_pickup_lat double precision default null, p_pickup_lng double precision default null,
  p_dropoff_lat double precision default null, p_dropoff_lng double precision default null,
  p_passengers integer default 1, p_luggage integer default 0, p_when timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $function$
declare
  v_p ride_pricing%rowtype; v_set dispatch_settings%rowtype;
  v_km numeric; v_road numeric; v_fare integer; v_hour integer;
  v_night boolean := false; v_est integer;
begin
  if p_service = 'airport' then
    return transfer_quote_core(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
                               p_passengers, 'one_way', p_when, null, null);
  end if;

  select * into v_p from ride_pricing where service = p_service;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_service'); end if;
  if not v_p.is_bookable then
    return jsonb_build_object('ok', false, 'reason', 'not_bookable',
      'message', 'This one is arranged by hand — send us a message and we will sort it.'); end if;
  select * into v_set from dispatch_settings where id = 'main';

  v_hour := extract(hour from coalesce(p_when, now()) at time zone 'Indian/Mauritius')::int;
  v_night := case
    when v_p.night_surcharge = 0 then false
    when v_p.night_from_hour <= v_p.night_to_hour
      then v_hour between v_p.night_from_hour and v_p.night_to_hour
    else v_hour >= v_p.night_from_hour or v_hour <= v_p.night_to_hour end;

  if v_p.flat_fare is not null then
    v_fare := v_p.flat_fare; v_road := null;
  else
    if p_pickup_lat is null or p_dropoff_lat is null then
      return jsonb_build_object('ok', false, 'reason', 'need_locations',
        'message', 'Choose both places from the list so we can work out the fare.'); end if;
    v_km := haversine_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng)::numeric;
    v_road := round(v_km * v_set.road_factor, 2);
    v_fare := v_p.base_fare + round(v_road * v_p.per_km)::integer;
    if v_fare < v_p.minimum_fare then v_fare := v_p.minimum_fare; end if;
  end if;

  v_fare := v_fare
          + greatest(0, coalesce(p_passengers, 1) - 1) * v_p.per_extra_passenger
          + greatest(0, coalesce(p_luggage, 0)) * v_p.per_luggage
          + case when v_night then v_p.night_surcharge else 0 end;

  if v_fare <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'quote_on_request',
      'message', 'We will confirm the price with you — no charge until you agree.'); end if;

  v_est := case when v_road is null then null
                else ceil(v_road / v_set.avg_speed_kmh * 60)::integer end;
  return jsonb_build_object('ok', true, 'price', v_fare, 'currency', 'MUR',
    'roadKm', v_road, 'tripMinutes', v_est, 'night', v_night,
    'flat', (v_p.flat_fare is not null));
end; $function$;


-- ── 8. BOOKING FROM A QUOTE ─────────────────────────────────────────────────
-- Dropped and recreated rather than replaced: four new parameters change the
-- signature, and CREATE OR REPLACE would leave the old one beside it — the
-- PGRST203 overload trap this project has already fallen into once. Every new
-- parameter is defaulted, so the booking route that is live while this applies
-- still resolves to the one function that exists.

drop function if exists public.create_ride_request(
  text, text, timestamptz, text, double precision, double precision, text,
  double precision, double precision, integer, integer, text, text, boolean, text, text, text);

create function public.create_ride_request(
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
                             'at', v_q.outbound_at, 'farePending', coalesce((v_out->>'manual')::boolean, false)))
          || case when v_ret_id is null then '[]'::jsonb else jsonb_build_array(
          jsonb_build_object('leg', 'return', 'price', (v_back->>'fare')::int,
                             'at', v_q.return_at, 'farePending', coalesce((v_back->>'manual')::boolean, false))) end);
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


-- ── 9. THE OWNER SETS A FARE BY HAND ────────────────────────────────────────

create or replace function public.admin_set_ride_fare(p_request_id uuid, p_price integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_r    ride_requests%rowtype;
  v_pct  numeric;
  v_comm integer;
begin
  if p_price is null or p_price <= 0 or p_price > 10000000 then
    raise exception using errcode='RR095', message='Enter the fare in rupees.';
  end if;
  select * into v_r from ride_requests where id = p_request_id for update;
  if not found then
    raise exception using errcode='RR091', message='That ride no longer exists.';
  end if;
  if v_r.status in ('completed', 'cancelled') then
    raise exception using errcode='RR093', message='That ride has finished, so its fare can no longer be set.';
  end if;
  if not v_r.fare_pending and v_r.quoted_price is not null then
    raise exception using errcode='RR093', message='This ride already has an agreed fare.';
  end if;

  -- The commission of the price list the ride was quoted from; otherwise the
  -- service's own rate.
  if v_r.pricing_version_id is not null then
    select commission_percent into v_pct from transfer_pricing_versions where id = v_r.pricing_version_id;
  else
    select commission_percent into v_pct from ride_pricing where service = v_r.service;
  end if;
  v_comm := round(p_price * coalesce(v_pct, 0) / 100.0)::integer;

  update ride_requests
     set quoted_price = p_price, platform_commission = v_comm, driver_earnings = p_price - v_comm,
         fare_pending = false,
         fare_breakdown = coalesce(fare_breakdown, '{}'::jsonb) || jsonb_build_object(
           'fare', p_price, 'commission', v_comm, 'driverEarnings', p_price - v_comm,
           'manualFareSetAt', now(), 'manualFareNote', nullif(btrim(coalesce(p_note, '')), '')),
         updated_at = now()
   where id = p_request_id;

  perform log_ride_event(p_request_id, 'admin', null, 'ride.fare_set', v_r.status, v_r.status,
    jsonb_build_object('price', p_price, 'commission', v_comm, 'wasPending', v_r.fare_pending));

  return jsonb_build_object('ok', true, 'price', p_price,
    'driverEarnings', p_price - v_comm, 'commission', v_comm);
end $$;

create or replace function public.rides_awaiting_fare_count()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from ride_requests
   where fare_pending and status in ('new', 'dispatching', 'no_driver');
$$;


-- ── 10. NOBODY IS OFFERED A RIDE WITH NO AGREED FARE ────────────────────────
-- Unchanged from M199 but for one line: `and not fare_pending`. A driver asked
-- to accept "Price on request" at 18:00 either refuses or argues at the door.
-- The owner can still dispatch one by hand from the desk.

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
       -- M220 · A night or group transfer waits for the owner's fare.
       and not fare_pending
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


-- ── 11. DRIVERS SEE WHAT THEY EARN ──────────────────────────────────────────
-- Every driver screen labels this number "You earn". It was the customer fare,
-- which was only true while commission was 0%. driver_pay is the driver's
-- share when a split exists and the fare otherwise — unchanged for every ride
-- booked before today. `fare` is added beside it: the driver collects cash, so
-- they need the customer's number too once the two differ.

create or replace function public.taxi_offer_targets(p_request_id uuid)
returns table(driver_id uuid, driver_name text, phone text, api_key text, token text, price integer,
              pickup text, dropoff text, passengers integer, service text, when_kind text,
              scheduled_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $function$
  select t.id, t.name, coalesce(t.whatsapp, t.phone), t.whatsapp_api_key, o.token,
         r.driver_pay, r.pickup_label, r.dropoff_label, r.passengers,
         r.service, r.when_kind, r.scheduled_at
    from ride_offers o
    join taxi_drivers  t on t.id = o.driver_id
    join ride_requests r on r.id = o.request_id
   where o.request_id = p_request_id
     and o.status = 'offered'
     -- Quiet hours, in island time. A driver outside their window is still
     -- HOLDING the offer — they may open the app — they are just not woken.
     and extract(hour from (now() at time zone 'Indian/Mauritius'))::int
           between t.notify_from_hour and t.notify_to_hour;
$function$;

create or replace function public.ride_offer_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_o ride_offers%rowtype; v_r ride_requests%rowtype; v_t taxi_drivers%rowtype;
begin
  if p_token is null or length(p_token) < 16 then return jsonb_build_object('ok', false, 'reason','invalid'); end if;
  select * into v_o from ride_offers where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason','invalid'); end if;
  select * into v_r from ride_requests where id = v_o.request_id;
  select * into v_t from taxi_drivers  where id = v_o.driver_id;

  return jsonb_build_object(
    'ok', true,
    'offerStatus', case when v_o.status = 'offered' and v_o.expires_at < now() then 'expired' else v_o.status end,
    'rideStatus', v_r.status,
    'mine', (v_r.driver_id = v_o.driver_id),
    'driverName', v_t.name,
    'service', v_r.service,
    'whenKind', v_r.when_kind,
    'scheduledAt', v_r.scheduled_at,
    'pickup', v_r.pickup_label,
    'dropoff', v_r.dropoff_label,
    -- The pins behind the labels. "Ma position actuelle" names a place only
    -- these numbers know; the screen turns them into a Google Maps link.
    'pickupLat', v_r.pickup_lat,
    'pickupLng', v_r.pickup_lng,
    'dropoffLat', v_r.dropoff_lat,
    'dropoffLng', v_r.dropoff_lng,
    'passengers', v_r.passengers,
    'luggage', v_r.luggage,
    'notes', v_r.notes,
    'flightRef', v_r.flight_ref,
    'meetGreet', v_r.meet_greet,
    'price', v_r.driver_pay,
    'fare', v_r.quoted_price,
    'currency', v_r.currency,
    'expiresAt', v_o.expires_at,
    -- The customer's phone appears only after this driver has won the job.
    'customerName',  case when v_r.driver_id = v_o.driver_id then v_r.customer_name  else null end,
    'customerPhone', case when v_r.driver_id = v_o.driver_id then v_r.customer_phone else null end
  );
end;
$function$;

create or replace function public.taxi_driver_home(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_t taxi_drivers%rowtype; v_offer jsonb; v_job jsonb; v_r ride_requests%rowtype;
        v_key text;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false); end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;

  select jsonb_build_object('token', o.token, 'pickup', r.pickup_label,
                            'dropoff', r.dropoff_label, 'price', r.driver_pay,
                            'fare', r.quoted_price,
                            'passengers', r.passengers, 'expiresAt', o.expires_at,
                            -- A driver decides whether to take an airport run
                            -- partly on WHICH flight it is, so it belongs here
                            -- as well as on the accepted job.
                            'service', r.service, 'flightRef', r.flight_ref)
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
      'status', v_r.status, 'price', v_r.driver_pay, 'fare', v_r.quoted_price,
      'kind', 'ride', 'id', v_r.id, 'channelKey', v_key,
      'pickupLat', v_r.pickup_lat, 'pickupLng', v_r.pickup_lng,
      'dropoffLat', v_r.dropoff_lat, 'dropoffLng', v_r.dropoff_lng,
      -- M120. What the driver needs to meet an arrival: which flight or boat,
      -- whether they were asked to wait inside with a sign, and when.
      'service', v_r.service, 'flightRef', v_r.flight_ref,
      'meetGreet', v_r.meet_greet, 'scheduledAt', v_r.scheduled_at);
  end if;

  return jsonb_build_object('ok', true, 'name', v_t.name,
    -- M113. Their own id, to key fleet presence on.
    'driverId', v_t.id,
    'availability', v_t.availability, 'vehicle', v_t.vehicle,
    'vehicleType', v_t.vehicle_type,
    'whatsappReady', (v_t.whatsapp_api_key is not null and length(v_t.whatsapp_api_key) > 0),
    'ridesCompleted', v_t.rides_completed,
    'offer', v_offer, 'job', v_job);
end;
$function$;

create or replace function public.taxi_driver_log_by_token(p_token text, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $function$
declare
  v_id   uuid;
  v_days int := greatest(1, least(coalesce(p_days, 30), 90));
  v_from timestamptz;
begin
  select id into v_id from taxi_drivers
   where driver_token = btrim(coalesce(p_token, ''))
     and btrim(coalesce(p_token, '')) <> '';
  if v_id is null then
    -- Same shape as a real answer, so a bad token cannot be told apart from a
    -- driver who has done nothing.
    return jsonb_build_object('days', v_days, 'rows', '[]'::jsonb, 'totals', null);
  end if;

  v_from := now() - (v_days || ' days')::interval;

  return (
    with r as (
      select rr.*,
             coalesce(rr.completed_at, rr.cancelled_at, rr.no_show_at, rr.updated_at) as finished_at
        from ride_requests rr
       where rr.driver_id = v_id
         and rr.status in ('completed', 'cancelled', 'no_driver')
         and coalesce(rr.completed_at, rr.cancelled_at, rr.no_show_at, rr.updated_at) >= v_from
    )
    select jsonb_build_object(
      'days', v_days,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', r.id,
                 'status', r.status,
                 'service', r.service,
                 'finishedAt', r.finished_at,
                 -- M220 · The driver's share, not the customer's fare.
                 'earning', r.driver_pay,
                 'from', r.pickup_label,
                 'to', r.dropoff_label,
                 'passengers', r.passengers,
                 'noShow', r.no_show_at is not null
               ) order by r.finished_at desc)
          from r
      ), '[]'::jsonb),
      'totals', (
        select jsonb_build_object(
          'jobs', count(*),
          'completed', count(*) filter (where status = 'completed'),
          'cancelled', count(*) filter (where status <> 'completed'),
          'noShows', count(*) filter (where no_show_at is not null),
          -- Completed only. See the note above.
          'earned', coalesce(sum(driver_pay) filter (where status = 'completed'), 0)
        ) from r
      ),
      -- Which kinds of work actually pay: an airport run and a town taxi are
      -- different afternoons, and the split is the thing a driver plans around.
      'byService', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'service', d.service, 'jobs', d.jobs, 'earned', d.earned)
                 order by d.jobs desc, d.service)
          from (
            select service,
                   count(*) filter (where status = 'completed') as jobs,
                   coalesce(sum(driver_pay) filter (where status = 'completed'), 0) as earned
              from r group by service
          ) d where d.jobs > 0
      ), '[]'::jsonb)
    )
  );
end;
$function$;


-- ── 12. WHO MAY CALL WHAT ───────────────────────────────────────────────────
-- Supabase's default privileges hand every new table and function to anon and
-- authenticated. None of this is theirs: the booking and quote routes use the
-- service role, and quote_ride / create_ride_request were callable straight
-- from a browser with the anon key — past the route's rate limit and its
-- validation. Closed here.

alter table public.transfer_pricing_versions enable row level security;
alter table public.transfer_known_distances  enable row level security;
alter table public.ride_quotes               enable row level security;

revoke all on table public.transfer_pricing_versions, public.transfer_known_distances, public.ride_quotes
  from public, anon, authenticated;
grant select, insert on table public.transfer_pricing_versions to service_role;
grant select, insert, update, delete on table public.transfer_known_distances to service_role;
grant select, insert, update, delete on table public.ride_quotes to service_role;

revoke all on function public.transfer_is_night(timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.price_transfer_leg(bigint, numeric, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.transfer_quote_core(double precision, double precision, double precision, double precision, integer, text, timestamptz, timestamptz, numeric) from public, anon, authenticated;
revoke all on function public.quote_airport_transfer(double precision, double precision, double precision, double precision, integer, text, timestamptz, timestamptz, numeric) from public, anon, authenticated;
revoke all on function public.quote_ride(text, double precision, double precision, double precision, double precision, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.create_ride_request(text, text, timestamptz, text, double precision, double precision, text, double precision, double precision, integer, integer, text, text, boolean, text, text, text, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_set_ride_fare(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.rides_awaiting_fare_count() from public, anon, authenticated;
revoke all on function public.transfer_pricing_is_append_only() from public, anon, authenticated;
revoke all on function public.ride_quote_is_immutable() from public, anon, authenticated;
revoke all on function public.ride_price_is_settled() from public, anon, authenticated;

grant execute on function public.transfer_is_night(timestamptz, integer, integer) to service_role;
grant execute on function public.price_transfer_leg(bigint, numeric, text, integer, timestamptz) to service_role;
grant execute on function public.transfer_quote_core(double precision, double precision, double precision, double precision, integer, text, timestamptz, timestamptz, numeric) to service_role;
grant execute on function public.quote_airport_transfer(double precision, double precision, double precision, double precision, integer, text, timestamptz, timestamptz, numeric) to service_role;
grant execute on function public.quote_ride(text, double precision, double precision, double precision, double precision, integer, integer, timestamptz) to service_role;
grant execute on function public.create_ride_request(text, text, timestamptz, text, double precision, double precision, text, double precision, double precision, integer, integer, text, text, boolean, text, text, text, uuid, text, timestamptz, text) to service_role;
grant execute on function public.admin_set_ride_fare(uuid, integer, text) to service_role;
grant execute on function public.rides_awaiting_fare_count() to service_role;

notify pgrst, 'reload schema';
