-- M221 · the evening band (17:00–21:59, fixed +Rs 300) and the night band
-- (22:00–04:59, priced by hand) — run inside a transaction that is ROLLED BACK:
--
--   begin;  <this file>  rollback;
--
-- Failures sort first. The launch list's behaviour is asserted in
-- m220_transfer_pricing.sql and must stay green beside this file.

create temp table _t (n serial, name text, ok boolean, got text) on commit drop;

do $$
declare
  v2  bigint := (select id from transfer_pricing_versions where created_by = 'migration m221');
  v1  bigint := (select id from transfer_pricing_versions where created_by = 'migration m220');
  d0  timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius'
                     + interval '3 days';                     -- midnight, island time, 3 days out
  at  timestamptz;
  j   jsonb;
  s   jsonb := transfer_price_sheet();
begin
  -- ── The owner's decision is the list in force ──────────────────────────
  insert into _t(name, ok, got) values ('M221 published exactly one new list, and it is active',
    v2 is not null and (s->>'id')::bigint = v2
    and (select count(*) from transfer_pricing_versions where created_by = 'migration m221') = 1, s::text);
  insert into _t(name, ok, got) values ('evening 17-21 fixed Rs 300; night 22-04 by hand',
    s->>'eveningMode' = 'fixed' and (s->>'eveningFromHour')::int = 17 and (s->>'eveningToHour')::int = 21
    and (s->>'eveningSurcharge')::int = 30000
    and s->>'nightMode' = 'manual' and (s->>'nightFromHour')::int = 22 and (s->>'nightToHour')::int = 4, s::text);
  insert into _t(name, ok, got) values ('zones and fares carried over unchanged',
    s->'oneWay' = '[120000,150000,200000]'::jsonb and s->'returnEach' = '[120000,150000,170000]'::jsonb
    and (s->>'extraPassengerFee')::int = 15000 and (s->>'zone1MaxKm')::numeric = 7 and (s->>'zone2MaxKm')::numeric = 15, s::text);

  -- ── Every edge of both bands, 1 passenger, Zone 3 (18 km) ──────────────
  at := d0 + interval '16 hours 59 minutes';
  insert into _t(name, ok, got) select '16:59 — day, Rs 2,000', (price_transfer_leg(v2, 18, 'one_way', 1, at)->>'fare')::int = 200000, null;
  at := d0 + interval '17 hours';
  j := price_transfer_leg(v2, 18, 'one_way', 1, at);
  insert into _t(name, ok, got) values ('17:00 — evening, Rs 2,000 + 300 = Rs 2,300, priced automatically',
    (j->>'fare')::int = 230000 and j->>'band' = 'evening' and not (j->>'manual')::boolean
    and (j->>'nightAdjustment')::int = 30000, j::text);
  at := d0 + interval '21 hours 59 minutes';
  insert into _t(name, ok, got) select '21:59 — still evening, Rs 2,300', (price_transfer_leg(v2, 18, 'one_way', 1, at)->>'fare')::int = 230000, null;
  at := d0 + interval '22 hours';
  j := price_transfer_leg(v2, 18, 'one_way', 1, at);
  insert into _t(name, ok, got) values ('22:00 — night, by hand',
    (j->>'manual')::boolean and j->>'manualReason' = 'night' and j->>'band' = 'night' and j->>'fare' is null, j::text);
  at := d0 + interval '1 day 4 hours 59 minutes';
  insert into _t(name, ok, got) select '04:59 — still night', (price_transfer_leg(v2, 18, 'one_way', 1, at)->>'manualReason') = 'night', null;
  at := d0 + interval '1 day 5 hours';
  insert into _t(name, ok, got) select '05:00 — day again, Rs 2,000', (price_transfer_leg(v2, 18, 'one_way', 1, at)->>'fare')::int = 200000, null;

  -- ── The surcharge is per trip, on top of passengers, in every zone ─────
  at := d0 + interval '18 hours';
  insert into _t(name, ok, got) select '18:00, 2 pax, one way: 2,150 + 300 = Rs 2,450',
    (price_transfer_leg(v2, 18, 'one_way', 2, at)->>'fare')::int = 245000, null;
  insert into _t(name, ok, got) select '18:00, 2 pax, return leg: 1,850 + 300 = Rs 2,150',
    (price_transfer_leg(v2, 18, 'return', 2, at)->>'fare')::int = 215000, null;
  insert into _t(name, ok, got) select '18:00, Zone 1: 1,200 + 300 = Rs 1,500',
    (price_transfer_leg(v2, 5, 'one_way', 1, at)->>'fare')::int = 150000, null;
  insert into _t(name, ok, got) select '18:00, 7 people: still by hand (group beats evening)',
    (price_transfer_leg(v2, 18, 'one_way', 7, at)->>'manualReason') = 'group', null;

  -- ── The launch list is untouched: 17:30 there is still night, by hand ──
  at := d0 + interval '17 hours 30 minutes';
  j := price_transfer_leg(v1, 18, 'one_way', 1, at);
  insert into _t(name, ok, got) values ('launch list unchanged: 17:30 is night, by hand',
    (j->>'manual')::boolean and j->>'manualReason' = 'night', j::text);
end $$;

-- ── Overlap and the other evening modes, on lists published for the test ───
insert into transfer_pricing_versions (label, origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3, extra_passenger_fee,
  night_mode, night_from_hour, night_to_hour, night_surcharge, night_multiplier,
  evening_mode, evening_from_hour, evening_to_hour, evening_surcharge, evening_multiplier, commission_percent, effective_from)
select 'test overlap', origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3, extra_passenger_fee,
  'manual', 22, 4, 0, 1, 'fixed', 17, 23, 30000, 1, 0, now() + interval '100 years'
from transfer_pricing_versions where created_by = 'migration m221';
insert into transfer_pricing_versions (label, origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3, extra_passenger_fee,
  night_mode, night_from_hour, night_to_hour, night_surcharge, night_multiplier,
  evening_mode, evening_from_hour, evening_to_hour, evening_surcharge, evening_multiplier, commission_percent, effective_from)
select 'test evening manual', origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3, extra_passenger_fee,
  'manual', 22, 4, 0, 1, 'manual', 17, 21, 0, 1, 0, now() + interval '100 years'
from transfer_pricing_versions where created_by = 'migration m221';
insert into transfer_pricing_versions (label, origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3, extra_passenger_fee,
  night_mode, night_from_hour, night_to_hour, night_surcharge, night_multiplier,
  evening_mode, evening_from_hour, evening_to_hour, evening_surcharge, evening_multiplier, commission_percent, effective_from)
select 'test evening multiplier 10pct', origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3, extra_passenger_fee,
  'manual', 22, 4, 0, 1, 'multiplier', 17, 21, 0, 1.2, 10, now() + interval '100 years'
from transfer_pricing_versions where created_by = 'migration m221';

do $$
declare
  vo bigint := (select id from transfer_pricing_versions where label = 'test overlap');
  vm bigint := (select id from transfer_pricing_versions where label = 'test evening manual');
  vx bigint := (select id from transfer_pricing_versions where label = 'test evening multiplier 10pct');
  d0 timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius' + interval '3 days';
  j  jsonb;
begin
  j := price_transfer_leg(vo, 18, 'one_way', 1, d0 + interval '22 hours 30 minutes');
  insert into _t(name, ok, got) values ('overlapping bands: 22:30 belongs to night (by hand), not evening',
    j->>'band' = 'night' and (j->>'manual')::boolean, j::text);
  j := price_transfer_leg(vo, 18, 'one_way', 1, d0 + interval '21 hours');
  insert into _t(name, ok, got) values ('overlapping bands: 21:00 is still evening',
    j->>'band' = 'evening' and (j->>'fare')::int = 230000, j::text);
  j := price_transfer_leg(vm, 18, 'one_way', 1, d0 + interval '18 hours');
  insert into _t(name, ok, got) values ('evening by hand says evening, not night',
    j->>'manualReason' = 'evening' and j->>'fare' is null, j::text);
  j := price_transfer_leg(vx, 18, 'one_way', 2, d0 + interval '18 hours');
  insert into _t(name, ok, got) values ('evening multiplier: 2,150 × 1.2 = Rs 2,580; 10% commission split',
    (j->>'fare')::int = 258000 and (j->>'commission')::int = 25800 and (j->>'driverEarnings')::int = 232200, j::text);
end $$;

-- ── The quote and the booking, through the real functions ─────────────────
do $$
declare
  d0 timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius' + interval '3 days';
  q jsonb; b jsonb; r ride_requests%rowtype;
begin
  q := transfer_quote_core(-19.7577, 63.361, -19.6836, 63.4186, 1, 'one_way', d0 + interval '18 hours', null, null);
  insert into _t(name, ok, got) values ('quote at 18:00 to Port Mathurin: Rs 2,300, no hand pricing, both windows named',
    (q->>'price')::int = 230000 and not (q->>'needsManual')::boolean
    and q->'eveningWindow'->>'mode' = 'fixed' and (q->'eveningWindow'->>'surcharge')::int = 30000
    and (q->'nightWindow'->>'from')::int = 22, q::text);

  -- A flight landing at 18:30 is booked AND dispatchable: no fare_pending.
  q := quote_airport_transfer(-19.7577, 63.361, -19.6836, 63.4186, 1, 'one_way', d0 + interval '18 hours 30 minutes', null, null);
  b := create_ride_request('airport', 'scheduled', d0 + interval '18 hours 30 minutes', 'Plaine Corail Airport', -19.7577, 63.361,
      'Port Mathurin', -19.6836, 63.4186, 1, 0, null, 'MK142', false, 'Test M221 evening', '+23057000005', null,
      (q->>'quoteId')::uuid, 'one_way', null, null);
  select * into r from ride_requests where quote_id = (q->>'quoteId')::uuid;
  insert into _t(name, ok, got) values ('an 18:30 arrival books at Rs 2,300 and is NOT held from drivers',
    (b->>'price')::int = 230000 and not (b->>'farePending')::boolean
    and not r.fare_pending and r.quoted_price = 230000 and r.fare_breakdown->>'band' = 'evening', b::text);

  -- A 23:00 arrival is held, and the booking says why.
  q := quote_airport_transfer(-19.7577, 63.361, -19.6836, 63.4186, 1, 'one_way', d0 + interval '23 hours', null, null);
  b := create_ride_request('airport', 'scheduled', d0 + interval '23 hours', 'Plaine Corail Airport', -19.7577, 63.361,
      'Port Mathurin', -19.6836, 63.4186, 1, 0, null, 'MK144', false, 'Test M221 night', '+23057000006', null,
      (q->>'quoteId')::uuid, 'one_way', null, null);
  insert into _t(name, ok, got) values ('a 23:00 arrival is held, and the legs carry reason = night',
    (b->>'farePending')::boolean and b->'legs'->0->>'reason' = 'night', b::text);

  -- Return package: evening out, day back.
  q := quote_airport_transfer(-19.7577, 63.361, -19.6836, 63.4186, 2, 'return',
       d0 + interval '18 hours', d0 + interval '4 days 10 hours', null);
  insert into _t(name, ok, got) values ('return package, 2 pax, evening arrival + day departure: 2,150 + 1,850 = Rs 4,000',
    (q->>'total')::int = 400000 and (q->'legs'->0->>'fare')::int = 215000 and (q->'legs'->1->>'fare')::int = 185000, q::text);
end $$;

-- ── M221b · a "now" quote is re-checked against the clock at booking ─────
do $$
declare qid uuid; hnt text; v bigint := (select id from transfer_pricing_versions where created_by = 'migration m221');
begin
  -- Written as if at another time of day: the recorded fare is not the fare now.
  insert into ride_quotes (service, pricing_version_id, direction, trip_type, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    passengers, outbound_at, return_at, road_km, distance_source, zone, legs, total, needs_manual, expires_at)
  values ('airport', v, 'from', 'one_way', -19.7577, 63.361, -19.6836, 63.4186, 1, null, null, 18.23, 'place:port-mathurin', 3,
    jsonb_build_array(jsonb_build_object('leg', 'outbound', 'fare', 1, 'manual', false)), 1, false, now() + interval '20 minutes')
  returning id into qid;
  begin
    perform create_ride_request('airport', 'now', null, 'Plaine Corail Airport', -19.7577, 63.361, 'Port Mathurin', -19.6836, 63.4186,
      1, 0, null, 'MK140', false, 'Test M221b', '+23057000007', null, qid, 'one_way', null, null);
    insert into _t(name, ok, got) values ('M221b: a now-quote that no longer matches the clock is refused', false, 'booked');
  exception when sqlstate 'RR097' then
    get stacked diagnostics hnt = pg_exception_hint;
    insert into _t(name, ok, got) values ('M221b: a now-quote that no longer matches the clock is refused', hnt = 'repriced', hnt);
  end;
end $$;

insert into _t(name, ok, got)
select 'still exactly one create_ride_request (no PGRST203 overload)',
  (select count(*) from pg_proc where proname = 'create_ride_request' and pronamespace = 'public'::regnamespace) = 1, null;
insert into _t(name, ok, got)
select 'anon still cannot execute ' || f, not has_function_privilege('anon', f, 'EXECUTE'), null
  from unnest(array[
    'public.create_ride_request(text,text,timestamptz,text,double precision,double precision,text,double precision,double precision,integer,integer,text,text,boolean,text,text,text,uuid,text,timestamptz,text)',
    'public.price_transfer_leg(bigint,numeric,text,integer,timestamptz)',
    'public.transfer_quote_core(double precision,double precision,double precision,double precision,integer,text,timestamptz,timestamptz,numeric)',
    'public.transfer_price_sheet()']) f;

select n, ok, name, left(got, 300) as got from _t order by ok, n;
