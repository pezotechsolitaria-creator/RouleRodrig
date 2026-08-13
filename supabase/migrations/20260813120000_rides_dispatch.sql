-- ══════════════════════════════════════════════════════════════════════════
-- TAXI + TRANSFER: A REAL RIDE, DISPATCHED WITHOUT DRIVER ACCOUNTS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied to production as m83_rides_dispatch_no_accounts and
-- m84_ride_token_no_pgcrypto. Captured as one file (m84 supersedes m83's token
-- default and offer_ride).
--
-- ── WHAT EXISTED ──────────────────────────────────────────────────────────
-- Nothing dispatchable. taxi_drivers is a public directory (name, phone,
-- whatsapp, vehicle, areas as free text, rate_from as free text). A taxi or
-- transfer "request" wrote one row to lead_events:
--     kind, target_name, category, type, ref, created_at
-- No customer. No phone. No pickup. No destination. No status. It is a tap
-- counter for a WhatsApp redirect, so there was never a ride to assign, track,
-- reassign or complete — and 0 transfer leads had ever been recorded.
--
-- ── THE MECHANISM, GIVEN NO ACCOUNTS ──────────────────────────────────────
-- The owner: "FOR TAXI, THEY DO NOT NEED ACCOUNTS AS I CAN ADD THEM ON MY ADMIN
-- MYSELF." Right call for this island — requiring an app install is how you end
-- up with three drivers on the platform — and it decides everything downstream.
--
-- A driver with no login cannot press ACCEPT in an app, so the OFFER carries its
-- own authorisation: a 64-hex single-use token, sent by WhatsApp, naming exactly
-- one offer. The token is the identity. It cannot be pointed at another ride, it
-- expires with the offer, it is spent on first answer, and it reveals no customer
-- phone number until that driver has won the job.

-- ── 1. TAXI DRIVERS GAIN OPERATIONAL FACTS ────────────────────────────────
-- The directory columns describe a driver to a CUSTOMER. Dispatch needs to know
-- where they wait, how many fit, and what work they take. All admin-set: no GPS,
-- no app, no account.
alter table public.taxi_drivers
  add column if not exists base_lat double precision check (base_lat between -90 and 90),
  add column if not exists base_lng double precision check (base_lng between -180 and 180),
  add column if not exists base_label text,
  add column if not exists seats integer check (seats between 1 and 60),
  add column if not exists luggage_capacity integer check (luggage_capacity >= 0),
  add column if not exists handles_taxi boolean not null default true,
  add column if not exists handles_airport boolean not null default true,
  add column if not exists handles_transfer boolean not null default true,
  -- Availability is the owner's switch, not a live presence signal. He knows who
  -- is working today; deriving it would be inventing information.
  add column if not exists availability text not null default 'available'
    check (availability in ('available','busy','off')),
  add column if not exists rides_offered integer not null default 0,
  add column if not exists rides_accepted integer not null default 0,
  add column if not exists rides_completed integer not null default 0,
  add column if not exists rides_declined integer not null default 0,
  add column if not exists last_offered_at timestamptz;

comment on column public.taxi_drivers.base_lat is
  'Where this driver usually waits, set by the admin. Dispatch ranks on distance from here — there is no GPS because there is no driver app, by design.';

create index if not exists taxi_drivers_dispatchable_idx
  on public.taxi_drivers (active, availability) where active;

-- ── 2. A RIDE THAT ACTUALLY EXISTS ────────────────────────────────────────
create table if not exists public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  -- The brief was firm that taxi logic must not be forced onto every transfer:
  -- an airport run needs a flight number and a meeting sign, a town hop needs
  -- neither.
  service text not null check (service in ('taxi','airport','hotel','ferry','private')),
  when_kind text not null default 'now' check (when_kind in ('now','scheduled')),
  scheduled_at timestamptz,
  pickup_label  text not null,
  pickup_lat    double precision check (pickup_lat between -90 and 90),
  pickup_lng    double precision check (pickup_lng between -180 and 180),
  dropoff_label text not null,
  dropoff_lat   double precision check (dropoff_lat between -90 and 90),
  dropoff_lng   double precision check (dropoff_lng between -180 and 180),
  passengers integer not null default 1 check (passengers between 1 and 60),
  luggage    integer not null default 0 check (luggage >= 0),
  notes      text,
  -- Airport / ferry specifics. Null for a town taxi, which is the point.
  flight_ref text,
  arrival_at timestamptz,
  meet_greet boolean not null default false,
  customer_name  text not null,
  customer_phone text not null,
  customer_email text,
  -- Minor units, server-set. Never taken from a client.
  quoted_price integer check (quoted_price >= 0),
  currency     text not null default 'MUR',
  status text not null default 'new' check (status in (
    'new','dispatching','assigned','driver_on_way','arrived','on_trip',
    'completed','cancelled',
    'no_driver'  -- the ladder ran out; needs a human
  )),
  driver_id uuid references public.taxi_drivers(id) on delete set null,
  offer_rounds integer not null default 0,
  assigned_at timestamptz, started_at timestamptz, completed_at timestamptz,
  cancelled_at timestamptz, cancel_reason text,
  cancelled_by text check (cancelled_by in ('customer','driver','admin','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ride_requests drop constraint if exists ride_requests_scheduled_has_time;
alter table public.ride_requests add constraint ride_requests_scheduled_has_time
  check (when_kind <> 'scheduled' or scheduled_at is not null);

create index if not exists ride_requests_open_idx
  on public.ride_requests (status, created_at desc)
  where status in ('new','dispatching','assigned','driver_on_way','arrived','on_trip');
create index if not exists ride_requests_driver_idx on public.ride_requests (driver_id, created_at desc);
create index if not exists ride_requests_scheduled_idx
  on public.ride_requests (scheduled_at) where when_kind = 'scheduled';

alter table public.ride_requests enable row level security;
-- Anon may CREATE a request (that is the booking form) and read nothing back.
-- Same posture as bookings: generate the id server-side, never
-- .insert().select(). There is no SELECT policy ON PURPOSE — a readable
-- ride_requests hands every customer's phone number to anyone with the
-- publishable key.
drop policy if exists ride_requests_anon_insert on public.ride_requests;
create policy ride_requests_anon_insert on public.ride_requests
  for insert to anon, authenticated with check (true);
revoke all on table public.ride_requests from anon, authenticated;
grant insert on table public.ride_requests to anon, authenticated;

-- ── 3. OFFERS THAT CARRY THEIR OWN AUTHORISATION ──────────────────────────
create table if not exists public.ride_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ride_requests(id) on delete cascade,
  driver_id  uuid not null references public.taxi_drivers(id) on delete cascade,
  -- 64 hex chars from two gen_random_uuid()s. NOT gen_random_bytes: pgcrypto is
  -- installed into the `extensions` schema, and every function here pins
  -- `search_path to 'public','pg_temp'` (an unpinned search_path on a SECURITY
  -- DEFINER function is a privilege-escalation vector), so the call failed at
  -- RUNTIME with 42883 even though the migration applied cleanly. gen_random_uuid
  -- is Postgres core from 13 onward and needs no extension.
  token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status text not null default 'offered'
    check (status in ('offered','accepted','declined','expired','withdrawn')),
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  responded_at timestamptz,
  unique (request_id, driver_id)
);
create index if not exists ride_offers_live_idx on public.ride_offers (request_id, status) where status = 'offered';
create index if not exists ride_offers_expiry_idx on public.ride_offers (expires_at) where status = 'offered';

alter table public.ride_offers enable row level security;
-- RLS on, NO policy, no grant. Tokens are redeemed through SECURITY DEFINER
-- functions only: if this table were readable, one leaked publishable key would
-- expose every live token — which is every unaccepted job on the island.
revoke all on table public.ride_offers from anon, authenticated;

-- ── 4. OBSERVABILITY ──────────────────────────────────────────────────────
create table if not exists public.ride_events (
  id bigserial primary key,
  request_id uuid not null references public.ride_requests(id) on delete cascade,
  actor_type text not null check (actor_type in ('customer','driver','admin','system')),
  actor_ref text, action text not null,
  from_status text, to_status text, detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ride_events_request_idx on public.ride_events (request_id, created_at desc);
alter table public.ride_events enable row level security;
revoke all on table public.ride_events from anon, authenticated;

create or replace function public.log_ride_event(
  p_request_id uuid, p_actor_type text, p_actor_ref text, p_action text,
  p_from text default null, p_to text default null, p_detail jsonb default null
) returns void language sql security definer set search_path to 'public','pg_temp' as $$
  insert into ride_events (request_id, actor_type, actor_ref, action, from_status, to_status, detail)
  values (p_request_id, p_actor_type, p_actor_ref, p_action, p_from, p_to, p_detail);
$$;
revoke all on function public.log_ride_event(uuid, text, text, text, text, text, jsonb) from public;
grant execute on function public.log_ride_event(uuid, text, text, text, text, text, jsonb) to service_role;

-- ── 5. RANKING, REUSING THE SAME DIALS AS DELIVERY ────────────────────────
-- Same dispatch_settings row, same weights, same radius ladder. One set of dials
-- for the whole platform was the point of the engine.
--
-- Returns reason_skipped for INELIGIBLE drivers too, so an operator can see who
-- was passed over and why rather than staring at a short list. A dispatch
-- decision nobody can explain is one nobody can debug.
create or replace function public.ride_candidates(
  p_request_id uuid, p_stage integer default 1, p_limit integer default 20
) returns table (
  driver_id uuid, name text, phone text, whatsapp text, vehicle text, seats integer,
  base_label text, distance_km double precision, eta_minutes integer,
  accept_rate numeric, idle_hours integer, score numeric, reason_skipped text
) language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare
  v_r ride_requests%rowtype; v_set dispatch_settings%rowtype;
  v_radius double precision; v_deg double precision; v_wsum numeric;
begin
  select * into v_r from ride_requests where id = p_request_id;
  if not found then return; end if;
  select * into v_set from dispatch_settings where id = 'main';

  v_radius := case
    when v_r.pickup_lat is null or v_r.pickup_lng is null then null
    when p_stage is null or p_stage < 1 then null
    when p_stage > cardinality(v_set.radius_stages_km) then null
    else v_set.radius_stages_km[p_stage] end;
  v_deg := case when v_radius is null then null else (v_radius / 111.0) + 0.02 end;
  v_wsum := greatest(v_set.weight_proximity + v_set.weight_reliability
                     + v_set.weight_workload + v_set.weight_idle, 1);

  return query
  with base as (
    select t.*,
      case when t.base_lat is null or v_r.pickup_lat is null then null
           else (haversine_km(v_r.pickup_lat, v_r.pickup_lng, t.base_lat, t.base_lng)
                 * v_set.road_factor)::numeric end as road_km,
      case when t.rides_offered < 3 then 0.70::numeric
           else round(t.rides_accepted::numeric / greatest(t.rides_offered, 1), 3) end as reliability,
      coalesce(extract(epoch from (now() - t.last_offered_at))::integer / 3600, 72)::integer as idle_h,
      -- One taxi, one fare: a driver already holding a live ride is at capacity.
      (select count(*) from ride_requests r2
        where r2.driver_id = t.id
          and r2.status in ('assigned','driver_on_way','arrived','on_trip'))::integer as live_jobs
    from taxi_drivers t where t.active
  ),
  judged as (
    select b.*, case
      when b.availability = 'off'  then 'not working today'
      when b.availability = 'busy' then 'marked busy'
      when b.live_jobs > 0         then 'already on a ride'
      when coalesce(b.seats, 4) < v_r.passengers then
        format('seats %s < %s passengers', coalesce(b.seats, 4), v_r.passengers)
      when v_r.service = 'airport' and not b.handles_airport then 'no airport runs'
      when v_r.service in ('hotel','private','ferry') and not b.handles_transfer then 'no transfers'
      when v_r.service = 'taxi' and not b.handles_taxi then 'no town taxi'
      when v_radius is not null and b.road_km is not null and b.road_km > v_radius then
        format('%s km away, outside this round', round(b.road_km, 1))
      else null end as skip
    from base b
  )
  select j.id, j.name, j.phone, j.whatsapp, j.vehicle, j.seats, j.base_label,
    round(j.road_km, 2)::double precision,
    case when j.road_km is null then null else ceil(j.road_km / v_set.avg_speed_kmh * 60)::integer end,
    j.reliability, j.idle_h,
    case when j.skip is not null then null else round((
        -- Unknown base scores 0.25: behind every located driver, ahead of nobody
        -- being asked at all. Most of the roster has no coordinates on day one.
        v_set.weight_proximity * coalesce(greatest(0::numeric, 1 - (j.road_km / 18)), 0.25)
      + v_set.weight_reliability * j.reliability
      + v_set.weight_workload * 1
      + v_set.weight_idle * least(1::numeric, j.idle_h::numeric / 12)
    ) / v_wsum, 4) end,
    j.skip
  from judged j
  order by (j.skip is not null), 12 desc nulls last, 8 asc nulls last
  limit greatest(coalesce(p_limit, 20), 1);
end; $$;
revoke all on function public.ride_candidates(uuid, integer, integer) from public;
revoke all on function public.ride_candidates(uuid, integer, integer) from anon, authenticated;
grant execute on function public.ride_candidates(uuid, integer, integer) to service_role;

-- ── 6. OFFER A ROUND ──────────────────────────────────────────────────────
create or replace function public.offer_ride(p_request_id uuid, p_minutes integer default 10)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_r ride_requests%rowtype; v_stage integer; v_row record;
  v_out jsonb := '[]'::jsonb; v_n integer := 0; v_exp timestamptz;
begin
  select * into v_r from ride_requests where id = p_request_id;
  if not found then raise exception using errcode='RR090', message='Ride not found.'; end if;
  if v_r.status not in ('new','dispatching') then
    raise exception using errcode='RR091', message='This ride is no longer waiting for a driver.';
  end if;

  v_stage := v_r.offer_rounds + 1;
  -- WhatsApp is not a push notification: a driver may not look at their phone for
  -- several minutes. A 30-second window would expire before it was read, so this
  -- is minutes — the one place this deliberately departs from the brief's
  -- timings, because the channel is different.
  v_exp := now() + make_interval(mins => greatest(coalesce(p_minutes, 10), 1));

  for v_row in
    select c.driver_id, c.name, c.whatsapp, c.phone
      from ride_candidates(p_request_id, v_stage, 3) c
     where c.reason_skipped is null
       -- Never ask twice. Declining is a decision; asking again is nagging.
       and not exists (select 1 from ride_offers o
                        where o.request_id = p_request_id and o.driver_id = c.driver_id
                          and o.status in ('declined','withdrawn'))
  loop
    insert into ride_offers (request_id, driver_id, expires_at)
    values (p_request_id, v_row.driver_id, v_exp)
    on conflict (request_id, driver_id) do update
      -- Revive an expired row AND mint a fresh token: the old one was printed in
      -- a WhatsApp message that may still be sitting on somebody's screen.
      set status='offered', expires_at=excluded.expires_at, responded_at=null, offered_at=now(),
          token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
      where ride_offers.status in ('expired','withdrawn');

    update taxi_drivers set rides_offered = rides_offered + 1, last_offered_at = now()
     where id = v_row.driver_id;

    v_out := v_out || jsonb_build_object('driverId', v_row.driver_id, 'name', v_row.name,
      'whatsapp', coalesce(v_row.whatsapp, v_row.phone),
      'token', (select token from ride_offers where request_id=p_request_id and driver_id=v_row.driver_id));
    v_n := v_n + 1;
  end loop;

  update ride_requests
     set offer_rounds = v_stage,
         status = case when v_n > 0 then 'dispatching'
                       when v_stage > (select cardinality(radius_stages_km) + 1
                                         from dispatch_settings where id='main') then 'no_driver'
                       else status end,
         updated_at = now()
   where id = p_request_id;

  perform log_ride_event(p_request_id, 'system', null, 'ride.offered', v_r.status,
    (select status from ride_requests where id = p_request_id),
    jsonb_build_object('stage', v_stage, 'drivers', v_n));
  return jsonb_build_object('ok', true, 'stage', v_stage, 'offered', v_n, 'targets', v_out);
end; $$;
revoke all on function public.offer_ride(uuid, integer) from public;
revoke all on function public.offer_ride(uuid, integer) from anon, authenticated;
grant execute on function public.offer_ride(uuid, integer) to service_role;

-- ── 7. THE DRIVER'S ONE-TAP SCREEN ────────────────────────────────────────
-- Read-only by token. Returns what a driver needs to decide and NOTHING that
-- would let them shop the customer: no email, and the phone only once the ride is
-- theirs.
create or replace function public.ride_offer_by_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_o ride_offers%rowtype; v_r ride_requests%rowtype; v_t taxi_drivers%rowtype;
begin
  if p_token is null or length(p_token) < 16 then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into v_o from ride_offers where token = p_token;
  if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  select * into v_r from ride_requests where id = v_o.request_id;
  select * into v_t from taxi_drivers where id = v_o.driver_id;
  return jsonb_build_object('ok', true,
    'offerStatus', case when v_o.status='offered' and v_o.expires_at < now() then 'expired' else v_o.status end,
    'rideStatus', v_r.status, 'mine', (v_r.driver_id = v_o.driver_id),
    'driverName', v_t.name, 'service', v_r.service, 'whenKind', v_r.when_kind,
    'scheduledAt', v_r.scheduled_at, 'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label,
    'passengers', v_r.passengers, 'luggage', v_r.luggage, 'notes', v_r.notes,
    'flightRef', v_r.flight_ref, 'meetGreet', v_r.meet_greet,
    'price', v_r.quoted_price, 'currency', v_r.currency, 'expiresAt', v_o.expires_at,
    -- The customer's phone appears only after this driver has WON the job.
    'customerName',  case when v_r.driver_id = v_o.driver_id then v_r.customer_name  else null end,
    'customerPhone', case when v_r.driver_id = v_o.driver_id then v_r.customer_phone else null end);
end; $$;
revoke all on function public.ride_offer_by_token(text) from public;
grant execute on function public.ride_offer_by_token(text) to anon, authenticated, service_role;

-- ── 8. ATOMIC ACCEPTANCE, BY TOKEN ────────────────────────────────────────
create or replace function public.accept_ride_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_o ride_offers%rowtype; v_r ride_requests%rowtype;
begin
  select * into v_o from ride_offers where token = p_token;
  if not found then return jsonb_build_object('ok',false,'reason','invalid','message','This link is not valid.'); end if;
  if v_o.status <> 'offered' then
    return jsonb_build_object('ok',false,'reason','used','message','This offer has already been answered.'); end if;
  if v_o.expires_at < now() then
    update ride_offers set status='expired', responded_at=now() where id = v_o.id;
    return jsonb_build_object('ok',false,'reason','expired','message','This offer has expired.'); end if;

  -- THE RACE. The same compare-and-swap the delivery engine uses: the WHERE
  -- clause IS the lock. A second driver's UPDATE blocks on this row until the
  -- first commits, then re-evaluates `driver_id is null`, matches nothing, and
  -- falls through to the honest "already taken" below rather than overwriting the
  -- winner. Never decided in a client.
  update ride_requests
     set driver_id = v_o.driver_id, status='assigned', assigned_at=now(), updated_at=now()
   where id = v_o.request_id and driver_id is null and status in ('new','dispatching')
  returning * into v_r;

  if not found then
    update ride_offers set status='withdrawn', responded_at=now() where id = v_o.id;
    return jsonb_build_object('ok',false,'reason','taken',
      'message','Someone else has already taken this ride.'); end if;

  update ride_offers set status='accepted', responded_at=now() where id = v_o.id;
  update ride_offers set status='withdrawn', responded_at=now()
   where request_id = v_o.request_id and id <> v_o.id and status='offered';
  update taxi_drivers set rides_accepted = rides_accepted + 1 where id = v_o.driver_id;
  perform log_ride_event(v_o.request_id, 'driver', v_o.driver_id::text, 'ride.accepted',
                         'dispatching', 'assigned', null);
  return jsonb_build_object('ok', true, 'message','You have this ride.',
    'customerName', v_r.customer_name, 'customerPhone', v_r.customer_phone,
    'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label);
end; $$;
revoke all on function public.accept_ride_by_token(text) from public;
grant execute on function public.accept_ride_by_token(text) to anon, authenticated, service_role;

create or replace function public.decline_ride_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_o ride_offers%rowtype;
begin
  select * into v_o from ride_offers where token = p_token;
  if not found or v_o.status <> 'offered' then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  update ride_offers set status='declined', responded_at=now() where id = v_o.id;
  update taxi_drivers set rides_declined = rides_declined + 1 where id = v_o.driver_id;
  perform log_ride_event(v_o.request_id, 'driver', v_o.driver_id::text, 'ride.declined', null, null, null);
  -- Declining does NOT fail the ride. If every live offer is now answered, drop
  -- back to 'new' so the next round can go out immediately instead of waiting for
  -- a timeout nobody is watching.
  if not exists (select 1 from ride_offers where request_id = v_o.request_id and status='offered') then
    update ride_requests set status='new', updated_at=now()
     where id = v_o.request_id and status='dispatching';
  end if;
  return jsonb_build_object('ok', true, 'message','Thanks — we will ask someone else.');
end; $$;
revoke all on function public.decline_ride_by_token(text) from public;
grant execute on function public.decline_ride_by_token(text) to anon, authenticated, service_role;

-- ── 9. ADMIN OVERRIDE, THROUGH THE SAME DOOR ──────────────────────────────
-- The brief was firm that a manual assignment must not be a separate unsafe
-- pathway. Identical compare-and-swap, so an admin assigning by hand cannot
-- overwrite a driver who accepted a second earlier.
create or replace function public.admin_assign_ride(p_request_id uuid, p_driver_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_r ride_requests%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.'; end if;
  if not exists (select 1 from taxi_drivers where id = p_driver_id and active) then
    raise exception using errcode='RR092', message='That driver is not active.'; end if;
  update ride_requests set driver_id=p_driver_id, status='assigned', assigned_at=now(), updated_at=now()
   where id=p_request_id and driver_id is null and status in ('new','dispatching','no_driver')
  returning * into v_r;
  if not found then
    return jsonb_build_object('ok',false,'reason','taken','message','This ride already has a driver.'); end if;
  update ride_offers set status='withdrawn', responded_at=now()
   where request_id=p_request_id and status='offered';
  perform log_ride_event(p_request_id,'admin',null,'ride.assigned_manually',null,'assigned',
                         jsonb_build_object('driverId', p_driver_id));
  return jsonb_build_object('ok', true, 'driverId', p_driver_id);
end; $$;
revoke all on function public.admin_assign_ride(uuid, uuid) from public;
revoke all on function public.admin_assign_ride(uuid, uuid) from anon, authenticated;
grant execute on function public.admin_assign_ride(uuid, uuid) to service_role;

-- ── 10. STATUS TRANSITIONS, SERVER-SIDE ───────────────────────────────────
-- A ride is not complete because a client said so. Each step is checked against
-- the one before it, so nothing can jump from 'new' to 'completed'.
-- lib/rides/model.ts mirrors this graph for the UI, and a test asserts they agree.
create or replace function public.admin_set_ride_status(
  p_request_id uuid, p_status text, p_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_r ride_requests%rowtype; v_ok boolean;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.'; end if;
  select * into v_r from ride_requests where id = p_request_id;
  if not found then raise exception using errcode='RR090', message='Ride not found.'; end if;

  v_ok := case p_status
    when 'driver_on_way' then v_r.status = 'assigned'
    when 'arrived'       then v_r.status in ('assigned','driver_on_way')
    when 'on_trip'       then v_r.status in ('assigned','driver_on_way','arrived')
    when 'completed'     then v_r.status = 'on_trip'
    when 'cancelled'     then v_r.status not in ('completed','cancelled')
    when 'new'           then v_r.status in ('dispatching','no_driver')
    else false end;
  if not v_ok then
    raise exception using errcode='RR093',
      message = format('Cannot go from %s to %s.', v_r.status, p_status); end if;

  update ride_requests
     set status = p_status,
         started_at   = case when p_status='on_trip'   then now() else started_at end,
         completed_at = case when p_status='completed' then now() else completed_at end,
         cancelled_at = case when p_status='cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_status='cancelled' then p_reason else cancel_reason end,
         cancelled_by  = case when p_status='cancelled' then 'admin' else cancelled_by end,
         -- Cancelling releases the driver so dispatch can resume without the
         -- customer having to book again.
         driver_id = case when p_status='cancelled' then null else driver_id end,
         updated_at = now()
   where id = p_request_id;

  if p_status = 'completed' then
    update taxi_drivers set rides_completed = rides_completed + 1 where id = v_r.driver_id; end if;
  if p_status = 'cancelled' then
    update ride_offers set status='withdrawn', responded_at=now()
     where request_id = p_request_id and status='offered'; end if;

  perform log_ride_event(p_request_id,'admin',null,'ride.status', v_r.status, p_status,
    case when p_reason is null then null else jsonb_build_object('reason', p_reason) end);
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function public.admin_set_ride_status(uuid, text, text) from public;
revoke all on function public.admin_set_ride_status(uuid, text, text) from anon, authenticated;
grant execute on function public.admin_set_ride_status(uuid, text, text) to service_role;

-- ── 11. EXPIRE WHAT NOBODY ANSWERED ───────────────────────────────────────
-- Never leave a ride stuck in 'dispatching' holding dead offers. Idempotent, so a
-- double run is harmless.
create or replace function public.sweep_ride_offers()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_expired integer; v_reopened integer;
begin
  with e as (update ride_offers set status='expired', responded_at=now()
              where status='offered' and expires_at < now() returning request_id)
  select count(*) into v_expired from e;
  with r as (update ride_requests set status='new', updated_at=now()
              where status='dispatching'
                and not exists (select 1 from ride_offers o
                                 where o.request_id = ride_requests.id and o.status='offered')
              returning id)
  select count(*) into v_reopened from r;
  return jsonb_build_object('expired', v_expired, 'reopened', v_reopened);
end; $$;
revoke all on function public.sweep_ride_offers() from public;
revoke all on function public.sweep_ride_offers() from anon, authenticated;
grant execute on function public.sweep_ride_offers() to service_role;
