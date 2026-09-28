-- M220 · the owner's worked examples, the zone lines, the night window, and the
-- booking path — run inside a transaction that is ROLLED BACK.
--
--   begin;  <this file>  rollback;
--
-- Every assertion writes a row to _t(name, ok, got). The final select returns
-- the failures first, so an all-green run reads as a list of ok = true.

create temp table _t (n serial, name text, ok boolean, got text) on commit drop;

do $$
declare
  v bigint := (select max(id) from transfer_pricing_versions);
  day timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius'
                     + interval '3 days 10 hours';            -- 10:00 island time, 3 days out
  j jsonb;
  f int;
begin
  -- ── The owner's examples ──────────────────────────────────────────────
  j := price_transfer_leg(v, 18, 'one_way', 1, day);
  insert into _t(name, ok, got) values ('18 km, 1 pax, one way = Rs 2,000', (j->>'fare')::int = 200000, j::text);
  j := price_transfer_leg(v, 18, 'return', 1, day);
  insert into _t(name, ok, got) values ('18 km, 1 pax, return = Rs 1,700 each way', (j->>'fare')::int = 170000, j::text);
  j := price_transfer_leg(v, 18, 'one_way', 2, day);
  insert into _t(name, ok, got) values ('18 km, 2 pax, one way = Rs 2,150', (j->>'fare')::int = 215000, j::text);
  j := price_transfer_leg(v, 18, 'return', 2, day);
  insert into _t(name, ok, got) values ('18 km, 2 pax, return = Rs 1,850 each way', (j->>'fare')::int = 185000, j::text);
  j := price_transfer_leg(v, 5, 'one_way', 4, day);
  insert into _t(name, ok, got) values ('5 km, 4 pax, one way = Rs 1,650', (j->>'fare')::int = 165000, j::text);

  -- ── Every zone, both products ─────────────────────────────────────────
  insert into _t(name, ok, got) select 'zone 1 one way Rs 1,200', (price_transfer_leg(v, 4, 'one_way', 1, day)->>'fare')::int = 120000, null;
  insert into _t(name, ok, got) select 'zone 2 one way Rs 1,500', (price_transfer_leg(v, 11, 'one_way', 1, day)->>'fare')::int = 150000, null;
  insert into _t(name, ok, got) select 'zone 1 return Rs 1,200', (price_transfer_leg(v, 4, 'return', 1, day)->>'fare')::int = 120000, null;
  insert into _t(name, ok, got) select 'zone 2 return Rs 1,500', (price_transfer_leg(v, 11, 'return', 1, day)->>'fare')::int = 150000, null;

  -- ── The lines themselves: ≤ 7 / > 7 and < 15 / ≥ 15 ──────────────────
  insert into _t(name, ok, got) select '7.00 km is zone 1', (price_transfer_leg(v, 7.00, 'one_way', 1, day)->>'zone')::int = 1, null;
  insert into _t(name, ok, got) select '7.01 km is zone 2', (price_transfer_leg(v, 7.01, 'one_way', 1, day)->>'zone')::int = 2, null;
  insert into _t(name, ok, got) select '14.99 km is zone 2', (price_transfer_leg(v, 14.99, 'one_way', 1, day)->>'zone')::int = 2, null;
  insert into _t(name, ok, got) select '15.00 km is zone 3', (price_transfer_leg(v, 15.00, 'one_way', 1, day)->>'zone')::int = 3, null;

  -- ── Night: 17:00–04:59, priced by hand at launch ─────────────────────
  insert into _t(name, ok, got) select '16:59 is day', (price_transfer_leg(v, 18, 'one_way', 1, day + interval '6 hours 59 minutes')->>'fare')::int = 200000, null;
  j := price_transfer_leg(v, 18, 'one_way', 1, day + interval '7 hours');
  insert into _t(name, ok, got) values ('17:00 is night, no automatic fare', (j->>'manual')::boolean and j->>'fare' is null and j->>'manualReason' = 'night', j::text);
  insert into _t(name, ok, got) select '04:59 is night', (price_transfer_leg(v, 18, 'one_way', 1, day + interval '18 hours 59 minutes')->>'manual')::boolean, null;
  insert into _t(name, ok, got) select '05:00 is day', (price_transfer_leg(v, 18, 'one_way', 1, day + interval '19 hours')->>'fare')::int = 200000, null;

  -- ── A group too big for one car goes to the owner ─────────────────────
  j := price_transfer_leg(v, 18, 'one_way', 7, day);
  insert into _t(name, ok, got) values ('7 people is priced by hand', (j->>'manual')::boolean and j->>'manualReason' = 'group', j::text);
  insert into _t(name, ok, got) select '6 people is Rs 2,750', (price_transfer_leg(v, 18, 'one_way', 6, day)->>'fare')::int = 275000, null;
end $$;

-- ── The other two night options, on a price list published for the test ───
insert into transfer_pricing_versions (label, origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3,
  extra_passenger_fee, night_mode, night_from_hour, night_to_hour, night_surcharge, night_multiplier, commission_percent,
  effective_from)
select 'test fixed', origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3,
  extra_passenger_fee, 'fixed', 17, 4, 30000, 1.2, 10, now() + interval '100 years'
from transfer_pricing_versions order by id limit 1;
insert into transfer_pricing_versions (label, origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3,
  extra_passenger_fee, night_mode, night_from_hour, night_to_hour, night_surcharge, night_multiplier, commission_percent,
  effective_from)
select 'test multiplier', origin_label, origin_lat, origin_lng, zone1_max_km, zone2_max_km,
  one_way_zone1, one_way_zone2, one_way_zone3, return_zone1, return_zone2, return_zone3,
  extra_passenger_fee, 'multiplier', 17, 4, 30000, 1.2, 0, now() + interval '100 years'
from transfer_pricing_versions order by id limit 1;

do $$
declare
  vf bigint := (select id from transfer_pricing_versions where label = 'test fixed');
  vm bigint := (select id from transfer_pricing_versions where label = 'test multiplier');
  night timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius'
                       + interval '3 days 20 hours';
  j jsonb;
begin
  j := price_transfer_leg(vf, 18, 'one_way', 2, night);
  insert into _t(name, ok, got) values ('fixed night: 2,150 + 300 = Rs 2,450', (j->>'fare')::int = 245000, j::text);
  insert into _t(name, ok, got) values ('10% commission: Roulé 245, driver 2,205',
    (j->>'commission')::int = 24500 and (j->>'driverEarnings')::int = 220500, j::text);
  j := price_transfer_leg(vm, 18, 'one_way', 2, night);
  insert into _t(name, ok, got) values ('multiplier night: 2,150 × 1.2 = Rs 2,580', (j->>'fare')::int = 258000, j::text);
  -- Neither is active: effective_from is a century away.
  insert into _t(name, ok, got) values ('a future price list is not the active one',
    (transfer_quote_core(-19.7577, 63.361, -19.6836, 63.4186, 1, 'one_way', null, null, null)->'pricingVersion'->>'label') = 'Airport zones — launch', null);
end $$;

-- ── Quotes: the zone comes from a ROAD distance ───────────────────────────
do $$
declare
  day timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius'
                     + interval '3 days 10 hours';
  j jsonb;
begin
  j := transfer_quote_core(-19.7577, 63.361, -19.6836, 63.4186, 1, 'one_way', day, null, null);
  insert into _t(name, ok, got) values ('Port Mathurin is zone 3 (18.23 km by road), Rs 2,000',
    (j->>'ok')::boolean and (j->>'zone')::int = 3 and (j->>'price')::int = 200000
    and j->>'distanceSource' = 'place:port-mathurin' and j->>'direction' = 'from', j::text);

  j := transfer_quote_core(-19.6836, 63.4186, -19.7577, 63.361, 1, 'one_way', day, null, null);
  insert into _t(name, ok, got) values ('to the airport from Port Mathurin: same zone, direction to',
    (j->>'zone')::int = 3 and j->>'direction' = 'to', j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.7547, 63.3868, 1, 'one_way', day, null, null);
  insert into _t(name, ok, got) values ('Caverne Patate is zone 2 (7.49 km), not the estimate''s zone 1',
    (j->>'zone')::int = 2 and (j->>'price')::int = 150000, j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.7300, 63.4300, 1, 'one_way', day, null, null);
  insert into _t(name, ok, got) values ('an unknown pin with no router asks for a road distance',
    not (j->>'ok')::boolean and j->>'reason' = 'need_road_distance' and j->'origin' is not null, j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.7300, 63.4300, 1, 'one_way', day, null, 9.3);
  insert into _t(name, ok, got) values ('the same pin with a routed 9.3 km is zone 2',
    (j->>'zone')::int = 2 and j->>'distanceSource' = 'router', j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.6836, 63.4186, 2, 'return', day, day + interval '4 days', null);
  insert into _t(name, ok, got) values ('return package, 2 pax, zone 3: Rs 3,700 for both',
    (j->>'total')::int = 370000 and jsonb_array_length(j->'legs') = 2
    and (j->'legs'->0->>'fare')::int = 185000 and (j->'legs'->1->>'fare')::int = 185000, j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.6836, 63.4186, 1, 'return', day, day + interval '4 days 8 hours', null);
  insert into _t(name, ok, got) values ('return leg at 18:00: outbound priced, return by hand, no total',
    (j->>'needsManual')::boolean and j->>'total' is null
    and (j->'legs'->0->>'fare')::int = 170000 and (j->'legs'->1->>'manual')::boolean, j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.6836, 63.4186, 1, 'return', day, day + interval '30 minutes', null);
  insert into _t(name, ok, got) values ('a return 30 minutes after the outbound is refused',
    j->>'reason' = 'return_too_soon', j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.7577, 63.361, 1, 'one_way', day, null, null);
  insert into _t(name, ok, got) values ('airport to airport is refused', j->>'reason' = 'same_place', j::text);

  j := transfer_quote_core(-19.6836, 63.4186, -19.7414, 63.4114, 1, 'one_way', day, null, null);
  insert into _t(name, ok, got) values ('a trip that never touches the airport is refused',
    j->>'reason' = 'not_an_airport_trip', j::text);

  j := transfer_quote_core(-19.7577, 63.361, -19.7562, 63.3702, 1, 'one_way', day, null, null);
  insert into _t(name, ok, got) values ('the tortoise reserve, 0.98 km away, is not "the airport"',
    (j->>'ok')::boolean and (j->>'zone')::int = 1, j::text);

  j := quote_ride('airport', -19.7577, 63.361, -19.6836, 63.4186, 1, 0, day);
  insert into _t(name, ok, got) values ('quote_ride(airport) forwards to zones, never Rs 1,800',
    (j->>'price')::int = 200000, j::text);

  j := quote_ride('taxi', -19.6836, 63.4186, -19.7414, 63.4114, 1, 0, day);
  insert into _t(name, ok, got) values ('quote_ride(taxi) is unchanged (per km)',
    (j->>'ok')::boolean and (j->>'price')::int > 0 and not (j->>'flat')::boolean, j::text);
end $$;

-- ── Booking from a quote ──────────────────────────────────────────────────
do $$
declare
  day timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius'
                     + interval '3 days 10 hours';
  q jsonb; b jsonb; qid uuid; r ride_requests%rowtype; r2 ride_requests%rowtype;
  err text; hint text;
begin
  q := quote_airport_transfer(-19.7577, 63.361, -19.6836, 63.4186, 2, 'return', day, day + interval '4 days', null);
  qid := (q->>'quoteId')::uuid;
  insert into _t(name, ok, got) values ('quote_airport_transfer writes a quote and returns its id',
    qid is not null and exists (select 1 from ride_quotes where id = qid and total = 370000), q::text);

  -- Tampering: one quote, four passengers.
  begin
    perform create_ride_request('airport', 'scheduled', day, 'Plaine Corail Airport', -19.7577, 63.361,
      'Port Mathurin', -19.6836, 63.4186, 4, 1, null, 'MK140', false, 'Test M220', '+23057000000', null,
      qid, 'return', day + interval '4 days', null);
    insert into _t(name, ok, got) values ('a quote for 2 cannot book 4', false, 'booked');
  exception when sqlstate 'RR097' then
    get stacked diagnostics err = message_text, hint = pg_exception_hint;
    insert into _t(name, ok, got) values ('a quote for 2 cannot book 4', hint = 'mismatch', err);
  end;

  b := create_ride_request('airport', 'scheduled', day, 'Plaine Corail Airport', -19.7577, 63.361,
      'Port Mathurin', -19.6836, 63.4186, 2, 1, 'two bags', 'MK140', true, 'Test M220', '+23057000000', null,
      qid, 'return', day + interval '4 days', 'MK141');
  insert into _t(name, ok, got) values ('the package books: two references, Rs 3,700',
    (b->>'ok')::boolean and b->>'returnReference' is not null and (b->>'price')::int = 370000, b::text);

  select * into r  from ride_requests where quote_id = qid and leg = 'outbound';
  select * into r2 from ride_requests where quote_id = qid and leg = 'return';
  insert into _t(name, ok, got) values ('outbound leg: airport → Port Mathurin, Rs 1,850, zone 3, meet & greet kept',
    r.pickup_label = 'Plaine Corail Airport' and r.quoted_price = 185000 and r.transfer_zone = 3
    and r.meet_greet and r.flight_ref = 'MK140' and r.driver_pay = 185000 and r.platform_commission = 0, to_jsonb(r)::text);
  insert into _t(name, ok, got) values ('return leg: reversed, on its own day, same package, departure flight',
    r2.pickup_label = 'Port Mathurin' and r2.dropoff_label = 'Plaine Corail Airport'
    and r2.scheduled_at = day + interval '4 days' and r2.package_id = r.package_id
    and r2.flight_ref = 'MK141' and not r2.meet_greet and r2.quoted_price = 185000, to_jsonb(r2)::text);
  insert into _t(name, ok, got) values ('the quote is marked accepted, pointing at the outbound ride',
    exists (select 1 from ride_quotes where id = qid and accepted_at is not null and ride_id = r.id), null);

  -- The same quote twice.
  begin
    perform create_ride_request('airport', 'scheduled', day, 'Plaine Corail Airport', -19.7577, 63.361,
      'Port Mathurin', -19.6836, 63.4186, 2, 1, null, 'MK140', true, 'Test M220', '+23057000000', null,
      qid, 'return', day + interval '4 days', null);
    insert into _t(name, ok, got) values ('a quote books once', false, 'booked twice');
  exception when sqlstate 'RR097' then
    get stacked diagnostics hint = pg_exception_hint;
    insert into _t(name, ok, got) values ('a quote books once', hint = 'used', hint);
  end;

  -- An agreed fare stays agreed.
  begin
    update ride_requests set quoted_price = 1 where id = r.id;
    insert into _t(name, ok, got) values ('an agreed fare cannot be edited', false, 'edited');
  exception when sqlstate 'RR099' then
    insert into _t(name, ok, got) values ('an agreed fare cannot be edited', true, null);
  end;
  begin
    update ride_quotes set total = 1 where id = qid;
    insert into _t(name, ok, got) values ('a booked quote cannot be edited', false, 'edited');
  exception when sqlstate 'RR099' then
    insert into _t(name, ok, got) values ('a booked quote cannot be edited', true, null);
  end;
  begin
    delete from ride_quotes where id = qid;
    insert into _t(name, ok, got) values ('a booked quote cannot be deleted', false, 'deleted');
  exception when sqlstate 'RR099' then
    insert into _t(name, ok, got) values ('a booked quote cannot be deleted', true, null);
  end;
  begin
    update transfer_pricing_versions set one_way_zone3 = 1;
    insert into _t(name, ok, got) values ('a published price list cannot be edited', false, 'edited');
  exception when sqlstate 'RR098' then
    insert into _t(name, ok, got) values ('a published price list cannot be edited', true, null);
  end;
  -- Normal life still works on a quoted ride: its status can move.
  update ride_requests set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin' where id = r2.id;
  insert into _t(name, ok, got) values ('a quoted ride can still change status',
    (select status from ride_requests where id = r2.id) = 'cancelled', null);
end $$;

-- ── Night: booked, held, then priced by the owner ─────────────────────────
do $$
declare
  eve timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius'
                     + interval '3 days 19 hours';            -- 19:00
  q jsonb; b jsonb; rid uuid; s jsonb;
begin
  q := quote_airport_transfer(-19.7577, 63.361, -19.7414, 63.4114, 1, 'one_way', eve, null, null);
  insert into _t(name, ok, got) values ('an evening quote is written, with no price',
    (q->>'ok')::boolean and (q->>'needsManual')::boolean and q->>'price' is null and q->>'quoteId' is not null, q::text);
  b := create_ride_request('airport', 'scheduled', eve, 'Plaine Corail Airport', -19.7577, 63.361,
      'Rivière Cocos', -19.7414, 63.4114, 1, 0, null, 'MK142', false, 'Test M220 night', '+23057000001', null,
      (q->>'quoteId')::uuid, 'one_way', null, null);
  select id into rid from ride_requests where quote_id = (q->>'quoteId')::uuid;
  insert into _t(name, ok, got) values ('it books, flagged fare_pending, no price',
    (b->>'farePending')::boolean and exists (select 1 from ride_requests where id = rid and fare_pending and quoted_price is null), b::text);
  insert into _t(name, ok, got) values ('it counts on the owner''s attention list',
    rides_awaiting_fare_count() >= 1, rides_awaiting_fare_count()::text);

  s := admin_set_ride_fare(rid, 180000, 'agreed on the phone');
  insert into _t(name, ok, got) values ('the owner sets Rs 1,800; the hold lifts',
    exists (select 1 from ride_requests where id = rid and not fare_pending and quoted_price = 180000
            and driver_earnings = 180000 and platform_commission = 0 and driver_pay = 180000), s::text);
  begin
    perform admin_set_ride_fare(rid, 1000, null);
    insert into _t(name, ok, got) values ('and cannot set it twice', false, 'set twice');
  exception when sqlstate 'RR093' then
    insert into _t(name, ok, got) values ('and cannot set it twice', true, null);
  end;
end $$;

-- ── Callers that predate the migration ────────────────────────────────────
do $$
declare
  day timestamptz := date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius'
                     + interval '3 days 10 hours';
  b jsonb;
begin
  -- The live booking route's exact argument list, no quote.
  b := create_ride_request(p_service => 'airport', p_when_kind => 'scheduled', p_scheduled_at => day,
    p_pickup_label => 'Plaine Corail Airport', p_pickup_lat => -19.7577, p_pickup_lng => 63.361,
    p_dropoff_label => 'Port Mathurin', p_dropoff_lat => -19.6836, p_dropoff_lng => 63.4186,
    p_passengers => 1, p_luggage => 0, p_notes => null, p_flight_ref => 'MK140', p_meet_greet => false,
    p_customer_name => 'Test M220 old', p_customer_phone => '+23057000002', p_customer_email => null);
  insert into _t(name, ok, got) values ('the old argument list still books, at the zone price',
    (b->>'ok')::boolean and (b->>'price')::int = 200000, b::text);

  b := create_ride_request(p_service => 'airport', p_when_kind => 'scheduled', p_scheduled_at => day,
    p_pickup_label => 'Plaine Corail Airport', p_pickup_lat => -19.7577, p_pickup_lng => 63.361,
    p_dropoff_label => 'Chez Marie', p_dropoff_lat => -19.7300, p_dropoff_lng => 63.4300,
    p_passengers => 1, p_luggage => 0, p_notes => null, p_flight_ref => 'MK140', p_meet_greet => false,
    p_customer_name => 'Test M220 pin', p_customer_phone => '+23057000003', p_customer_email => null);
  insert into _t(name, ok, got) values ('an unzoned pin with no quote still books, held for a fare',
    (b->>'ok')::boolean and b->>'price' is null and (b->>'farePending')::boolean, b::text);

  b := create_ride_request(p_service => 'taxi', p_when_kind => 'now', p_scheduled_at => null,
    p_pickup_label => 'Port Mathurin', p_pickup_lat => -19.6836, p_pickup_lng => 63.4186,
    p_dropoff_label => 'Rivière Cocos', p_dropoff_lat => -19.7414, p_dropoff_lng => 63.4114,
    p_passengers => 1, p_luggage => 0, p_notes => null, p_flight_ref => null, p_meet_greet => false,
    p_customer_name => 'Test M220 taxi', p_customer_phone => '+23057000004', p_customer_email => null);
  insert into _t(name, ok, got) values ('a taxi still books exactly as before',
    (b->>'ok')::boolean and (b->>'price')::int > 0 and not (b->>'farePending')::boolean, b::text);
end $$;

-- ── Nobody but the service role ───────────────────────────────────────────
insert into _t(name, ok, got)
select 'anon cannot execute ' || f, not has_function_privilege('anon', f, 'EXECUTE'), null
  from unnest(array[
    'public.quote_airport_transfer(double precision,double precision,double precision,double precision,integer,text,timestamptz,timestamptz,numeric)',
    'public.create_ride_request(text,text,timestamptz,text,double precision,double precision,text,double precision,double precision,integer,integer,text,text,boolean,text,text,text,uuid,text,timestamptz,text)',
    'public.quote_ride(text,double precision,double precision,double precision,double precision,integer,integer,timestamptz)',
    'public.admin_set_ride_fare(uuid,integer,text)',
    'public.price_transfer_leg(bigint,numeric,text,integer,timestamptz)']) f;
insert into _t(name, ok, got)
select 'anon cannot read ' || t, not has_table_privilege('anon', t, 'SELECT'), null
  from unnest(array['public.ride_quotes', 'public.transfer_pricing_versions', 'public.transfer_known_distances']) t;
insert into _t(name, ok, got)
select 'exactly one create_ride_request exists (no PGRST203 overload)',
  (select count(*) from pg_proc where proname = 'create_ride_request' and pronamespace = 'public'::regnamespace) = 1, null;

select n, ok, name, left(got, 400) as got from _t order by ok, n;
