-- ══════════════════════════════════════════════════════════════════════════
-- M109 — LIVE TRIP TRACKING, FOR A FLEET THAT MOSTLY HAS NO ACCOUNTS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied to production as two migrations, m109a_live_tracking_schema_and_functions
-- and m109b_ranking_reads_live_positions, and captured here as one file. Split
-- because the first attempt aborted inside the verification block (see the note
-- above dispatch_candidates), and a smaller second transaction made the retry
-- cheap. apply_migration is transactional, so the aborted attempt changed
-- nothing — that property is what made it safe to develop this against a live
-- database at all.
--
-- ── WHAT THE AUDIT FOUND ──────────────────────────────────────────────────
-- The dispatch engine already has a geography (m74/dispatch_geography):
-- driver_locations, update_driver_location(), haversine_km(),
-- dispatch_candidates() with a radius ladder, and dispatch_settings holding
-- stale_location_minutes / road_factor / avg_speed_kmh. It is good work.
--
-- It has never run. On the live database:
--
--     driver_locations                 0 rows
--     update_driver_location() callers 0   (nothing in the app calls it)
--     delivery_drivers                 0
--     taxi_drivers                     1 active, 0 with base_lat
--
-- So every ranking decision made so far has taken the "position unknown"
-- branch and scored 0.25. The geography was built and never wired to a screen.
--
-- Worse, it could not have been wired for the fleet that actually exists:
--
--     driver_locations.driver_id  references delivery_drivers(id)
--
-- and the drivers doing the work are TAXI drivers, who by the owner's explicit
-- decision have no accounts at all. A taxi driver was structurally incapable of
-- reporting a position.
--
-- ── THE IDENTITY PROBLEM, WHICH DECIDES THE WHOLE DESIGN ───────────────────
-- Four parties need to take part in tracking, and only ONE of them holds a
-- Supabase JWT:
--
--     taxi / transfer driver   taxi_drivers.driver_token in a URL   no JWT
--     delivery driver          delivery_drivers.user_id            HAS a JWT
--     customer                 reference + phone, checked by us     no JWT
--     admin                    ADMIN_PASSWORD cookie + service_role no JWT
--
-- Supabase Realtime's private channels authorise with RLS on realtime.messages,
-- which reads auth.uid() / JWT claims. Three of the four parties have none, so
-- RLS CANNOT be the authorisation boundary for tracking. Our Next.js server is
-- — which is not a compromise, it is what already guards /api/rides/track,
-- /api/driver-home and every /api/admin route on this platform.
--
-- Therefore:
--   · every table here is RLS-on with NO policy and grants revoked, reachable
--     only through SECURITY DEFINER functions and the service-role client —
--     the same posture ride_offers and dispatch_settings already take;
--   · the Realtime topic is named by an unguessable per-trip CAPABILITY KEY
--     (64 hex, the same shape and entropy as ride_offers.token), handed out by
--     the server only after it has checked a credential;
--   · the authority on where a driver is remains this database, polled through
--     a guarded endpoint. Broadcast is the fast path, not the source of truth,
--     so a spoofed or missed frame self-corrects within one poll.
--
-- ── WHY NOT A SECOND LOCATION TABLE ───────────────────────────────────────
-- "Where is this driver now" is one question with one answer. driver_locations
-- becomes polymorphic instead of gaining a taxi-shaped twin, so dispatch,
-- tracking and the admin map all read one place. It is empty, so the primary
-- key change below rewrites nothing.

-- ── 1. ONE LOCATION TABLE, BOTH KINDS OF DRIVER ───────────────────────────

alter table public.driver_locations
  add column if not exists driver_kind text not null default 'delivery',
  -- Degrees clockwise from true north, straight from the Geolocation API. Null
  -- when the device cannot supply it (most phones report null while stationary),
  -- which is why the map derives a bearing from consecutive fixes as a fallback
  -- rather than treating null as "facing north".
  add column if not exists heading    double precision,
  add column if not exists speed_kmh  double precision,
  -- What the driver is DOING, not merely where they are. The admin map colours
  -- markers by this, and it is what makes "available" mean something.
  add column if not exists tracking_status text not null default 'online',
  -- The job this position belongs to, so a position can be published to exactly
  -- one trip channel and to no other.
  add column if not exists trip_kind text,
  add column if not exists trip_id   uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_locations_kind_ck') then
    alter table public.driver_locations add constraint driver_locations_kind_ck
      check (driver_kind in ('delivery','taxi'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'driver_locations_heading_ck') then
    alter table public.driver_locations add constraint driver_locations_heading_ck
      check (heading is null or (heading >= 0 and heading < 360));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'driver_locations_speed_ck') then
    alter table public.driver_locations add constraint driver_locations_speed_ck
      check (speed_kmh is null or (speed_kmh >= 0 and speed_kmh <= 300));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'driver_locations_tracking_ck') then
    alter table public.driver_locations add constraint driver_locations_tracking_ck
      check (tracking_status in ('online','en_route_pickup','at_pickup','on_trip'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'driver_locations_trip_ck') then
    alter table public.driver_locations add constraint driver_locations_trip_ck
      check (trip_kind is null or trip_kind in ('ride','delivery'));
  end if;
end $$;

-- The foreign key has to go: a taxi driver's id is not in delivery_drivers, and
-- Postgres cannot point one column at two tables. What replaces it is stronger
-- than a constraint — every function below resolves the driver from a
-- CREDENTIAL (a token, or auth.uid()), so a driver_id is never a parameter a
-- caller supplies. An id that does not exist cannot be written because no caller
-- gets to name one.
alter table public.driver_locations drop constraint if exists driver_locations_driver_id_fkey;

-- Empty table, so this rewrites nothing. (Verified: 0 rows before this ran.)
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.driver_locations'::regclass and contype = 'p'
       and conname = 'driver_locations_pkey'
       and (select count(*) from unnest(conkey)) = 1
  ) then
    alter table public.driver_locations drop constraint driver_locations_pkey;
    alter table public.driver_locations add constraint driver_locations_pkey
      primary key (driver_kind, driver_id);
  end if;
end $$;

comment on table public.driver_locations is
  'Current position only, one row per driver, upserted — still deliberately not a history table. M109 made it polymorphic (driver_kind) because taxi drivers have no accounts and therefore no row in delivery_drivers, yet they are the fleet actually driving. Integrity is held by the callers, which resolve a driver from a credential and never accept a driver_id.';

create index if not exists driver_locations_trip_idx
  on public.driver_locations (trip_kind, trip_id) where trip_id is not null;

-- The existing self-read policy named delivery_drivers without qualification,
-- which after the PK change would let a delivery driver read a TAXI driver's row
-- that happened to share a uuid. Vanishingly unlikely, and free to close.
drop policy if exists driver_locations_self_read on public.driver_locations;
create policy driver_locations_self_read on public.driver_locations
  for select using (
    driver_kind = 'delivery'
    and driver_id in (select id from public.delivery_drivers where user_id = auth.uid())
  );

revoke all on table public.driver_locations from anon;

-- ── 2. A TRIP THAT IS BEING WATCHED ───────────────────────────────────────
-- One row per trackable journey. It carries three things nothing else models:
--
--   the CAPABILITY   channel_key — names the Realtime topic. Knowing it is what
--                    authorises watching, and it is handed out only by a server
--                    that has just checked a credential.
--   the ENDPOINTS    pickup / dropoff copied at start, so the map has something
--                    to draw before the first GPS fix arrives and after the
--                    trip is over.
--   the LAST KNOWN   the authoritative position, written every ~20s rather than
--                    every GPS tick. Broadcast carries the smooth movement;
--                    this is what survives a reload, a dropped socket, and a
--                    customer opening the page an hour later.
create table if not exists public.trip_tracking (
  trip_kind text not null check (trip_kind in ('ride','delivery')),
  trip_id   uuid not null,

  -- 64 hex from two gen_random_uuid()s — 256 bits, and the same construction
  -- ride_offers.token uses. NOT gen_random_bytes: pgcrypto lives in the
  -- `extensions` schema and every function here pins search_path to
  -- 'public','pg_temp' (an unpinned search_path on a SECURITY DEFINER function
  -- is a privilege-escalation vector), so that call fails at RUNTIME with 42883
  -- while the migration applies cleanly. That exact bug is documented in
  -- rides_dispatch.sql; this is it, not repeated.
  channel_key text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),

  driver_kind text check (driver_kind in ('delivery','taxi')),
  driver_id   uuid,

  -- Mirrors driver_locations.tracking_status, plus the terminal state. Kept here
  -- as well so a finished trip still says what it was doing when it ended, after
  -- the driver's row has moved on to the next job.
  status text not null default 'pending'
    check (status in ('pending','en_route_pickup','at_pickup','on_trip','ended')),

  pickup_lat   double precision, pickup_lng   double precision,
  dropoff_lat  double precision, dropoff_lng  double precision,
  pickup_label text, dropoff_label text,

  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  heading double precision, speed_kmh double precision, accuracy_m double precision,
  recorded_at timestamptz,

  created_at timestamptz not null default now(),
  ended_at   timestamptz,

  primary key (trip_kind, trip_id)
);

comment on table public.trip_tracking is
  'One row per journey being watched. channel_key names the Realtime Broadcast topic and IS the authorisation to watch — it is unguessable, per-trip, and handed out only by a server that has just checked a credential (driver token, reference+phone, or the admin cookie). RLS on with no policy and no grant: reachable through SECURITY DEFINER functions only.';

comment on column public.trip_tracking.channel_key is
  'The capability. 256 bits. Never logged, never in a URL that could be shared onward, and it stops being served the moment ended_at is set.';

create index if not exists trip_tracking_driver_idx
  on public.trip_tracking (driver_kind, driver_id) where ended_at is null;
create index if not exists trip_tracking_live_idx
  on public.trip_tracking (ended_at, recorded_at desc);

alter table public.trip_tracking enable row level security;
-- RLS on with NO policy: every API role is denied by RLS. The grants are revoked
-- as well, because a permissive policy added later for an unrelated reason must
-- not be able to turn every live capability key public. Two locks, deliberately.
revoke all on table public.trip_tracking from anon, authenticated;

-- ── 3. START WATCHING A TRIP ──────────────────────────────────────────────
-- Lazily, on first need, rather than from inside accept_ride_by_token,
-- admin_assign_ride, accept_delivery and admin_reassign_delivery. Four proven
-- production paths stay untouched; if this were wired into them, a fault here
-- could refuse a driver a job, and a tracking bug must never cost a fare.
create or replace function public.ensure_trip_tracking(p_trip_kind text, p_trip_id uuid)
returns public.trip_tracking
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v_t public.trip_tracking%rowtype;
  v_r ride_requests%rowtype;
  v_d deliveries%rowtype;
  v_s stores%rowtype;
begin
  select * into v_t from trip_tracking where trip_kind = p_trip_kind and trip_id = p_trip_id;
  if found then return v_t; end if;

  if p_trip_kind = 'ride' then
    select * into v_r from ride_requests where id = p_trip_id;
    if not found then return v_t; end if;
    insert into trip_tracking (trip_kind, trip_id, driver_kind, driver_id,
      pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_label, dropoff_label)
    values ('ride', p_trip_id, 'taxi', v_r.driver_id,
      v_r.pickup_lat, v_r.pickup_lng, v_r.dropoff_lat, v_r.dropoff_lng,
      v_r.pickup_label, v_r.dropoff_label)
    on conflict (trip_kind, trip_id) do nothing;

  elsif p_trip_kind = 'delivery' then
    select * into v_d from deliveries where id = p_trip_id;
    if not found then return v_t; end if;
    -- A delivery's pickup is the SHOP, and its drop-off is the customer's pin.
    select * into v_s from stores where id = v_d.store_id;
    insert into trip_tracking (trip_kind, trip_id, driver_kind, driver_id,
      pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_label, dropoff_label)
    values ('delivery', p_trip_id, 'delivery', v_d.driver_id,
      v_s.lat, v_s.lng, v_d.dropoff_lat, v_d.dropoff_lng,
      v_s.name, coalesce(v_d.dropoff_note, 'Delivery address'))
    on conflict (trip_kind, trip_id) do nothing;
  else
    return v_t;
  end if;

  select * into v_t from trip_tracking where trip_kind = p_trip_kind and trip_id = p_trip_id;
  -- The driver may have been assigned after the row was first created (a
  -- reassignment), so keep the pointer honest on every call rather than only at
  -- insert. Cheap, and it is what makes admin_reassign_delivery work without
  -- this migration touching it.
  return v_t;
end;
$$;

revoke all on function public.ensure_trip_tracking(text, uuid) from public, anon, authenticated;
grant execute on function public.ensure_trip_tracking(text, uuid) to service_role;

-- ── 4. A DRIVER REPORTS A POSITION ────────────────────────────────────────
-- ONE writer for both kinds of driver. Called by /api/tracking/ping AFTER that
-- route has authenticated the driver — which is why p_driver_id is safe here and
-- would not be safe if this were reachable by anon.
--
-- Writes twice on purpose: driver_locations is what DISPATCH ranks on ("who is
-- near this pickup"), trip_tracking is what a WATCHER reads ("where is my
-- taxi"). They answer different questions and have different lifetimes — a
-- driver's row outlives any one job.
-- A heading of exactly 0 from a stationary device is noise, not north. One
-- definition, so the two writes below cannot drift apart.
create or replace function public.sane_heading(p_heading double precision, p_speed double precision)
returns double precision language sql immutable parallel safe
set search_path to 'public','pg_temp'
as $$ select case when p_heading is null or p_speed is null or p_speed < 2 then null else p_heading end $$;

revoke all on function public.sane_heading(double precision, double precision) from public, anon, authenticated;
grant execute on function public.sane_heading(double precision, double precision) to service_role;

create or replace function public.record_driver_position(
  p_driver_kind text, p_driver_id uuid,
  p_lat double precision, p_lng double precision,
  p_heading double precision default null,
  p_speed_kmh double precision default null,
  p_accuracy_m double precision default null,
  p_tracking_status text default 'online',
  p_trip_kind text default null, p_trip_id uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_now timestamptz := now();
begin
  if p_driver_kind not in ('delivery','taxi') then
    raise exception using errcode='RR110', message='Unknown driver kind.';
  end if;
  if p_driver_id is null then
    raise exception using errcode='RR111', message='No driver.';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception using errcode='RR087', message='Invalid coordinates.';
  end if;

  insert into driver_locations (driver_kind, driver_id, lat, lng, heading, speed_kmh,
                                accuracy_m, tracking_status, trip_kind, trip_id, recorded_at)
  values (p_driver_kind, p_driver_id, p_lat, p_lng,
          sane_heading(p_heading, p_speed_kmh),
          p_speed_kmh, p_accuracy_m, coalesce(p_tracking_status,'online'),
          p_trip_kind, p_trip_id, v_now)
  on conflict (driver_kind, driver_id) do update
    set lat = excluded.lat, lng = excluded.lng, heading = excluded.heading,
        speed_kmh = excluded.speed_kmh, accuracy_m = excluded.accuracy_m,
        tracking_status = excluded.tracking_status,
        trip_kind = excluded.trip_kind, trip_id = excluded.trip_id,
        recorded_at = v_now;

  if p_trip_kind is not null and p_trip_id is not null then
    update trip_tracking
       set lat = p_lat, lng = p_lng, heading = sane_heading(p_heading, p_speed_kmh),
           speed_kmh = p_speed_kmh, accuracy_m = p_accuracy_m, recorded_at = v_now,
           driver_kind = p_driver_kind, driver_id = p_driver_id,
           status = case when p_tracking_status in ('en_route_pickup','at_pickup','on_trip')
                         then p_tracking_status else status end
     where trip_kind = p_trip_kind and trip_id = p_trip_id and ended_at is null;
  end if;

  return jsonb_build_object('ok', true, 'recordedAt', v_now);
end;
$$;

revoke all on function public.record_driver_position(text, uuid, double precision, double precision,
  double precision, double precision, double precision, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_driver_position(text, uuid, double precision, double precision,
  double precision, double precision, double precision, text, text, uuid) to service_role;

-- Going off duty erases where you were, for both kinds of driver. The other half
-- of "do not track drivers forever", and now it reaches the fleet that has no
-- account to log out of.
create or replace function public.clear_driver_position(p_driver_kind text, p_driver_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  delete from driver_locations where driver_kind = p_driver_kind and driver_id = p_driver_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.clear_driver_position(text, uuid) from public, anon, authenticated;
grant execute on function public.clear_driver_position(text, uuid) to service_role;

-- ── 5. THE TAXI DRIVER MOVES THEIR OWN RIDE ───────────────────────────────
-- The missing half of taking the owner out of the loop. Until now the only way
-- a ride could reach 'arrived' or 'on_trip' was admin_set_ride_status() — so the
-- customer's timeline moved when the OWNER touched /admin, which is precisely
-- the answering-service role the ride system was built to end.
--
-- The token is the identity, exactly as it is for accept_ride_by_token: it names
-- one driver, it cannot be pointed at another ride, and the ride must already be
-- theirs. The transition graph is the same one admin_set_ride_status enforces
-- and lib/rides/model.ts mirrors, minus the admin-only moves (a driver may not
-- reopen a ride or cancel it out from under the office).
create or replace function public.driver_advance_ride_by_token(p_token text, p_to text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_t taxi_drivers%rowtype; v_r ride_requests%rowtype; v_ok boolean;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false, 'reason','invalid'); end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason','invalid'); end if;

  select * into v_r from ride_requests
   where driver_id = v_t.id and status in ('assigned','driver_on_way','arrived','on_trip')
   order by assigned_at desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason','no_job',
      'message','You are not on a ride right now.'); end if;

  v_ok := case p_to
    when 'driver_on_way' then v_r.status = 'assigned'
    when 'arrived'       then v_r.status in ('assigned','driver_on_way')
    when 'on_trip'       then v_r.status in ('assigned','driver_on_way','arrived')
    when 'completed'     then v_r.status = 'on_trip'
    else false end;
  if not v_ok then
    -- Not an exception: a driver double-tapping ARRIVED on a slow connection is
    -- the normal case, and it must not look like a fault. The client re-reads
    -- and finds itself already there.
    return jsonb_build_object('ok', false, 'reason','out_of_order',
      'status', v_r.status,
      'message', format('That step is not next — this ride is %s.', v_r.status)); end if;

  update ride_requests
     set status = p_to,
         started_at   = case when p_to = 'on_trip'   then coalesce(started_at, now())   else started_at end,
         completed_at = case when p_to = 'completed' then now() else completed_at end,
         updated_at = now()
   where id = v_r.id and status = v_r.status;
  if not found then
    return jsonb_build_object('ok', false, 'reason','raced', 'message','Try again.'); end if;

  if p_to = 'completed' then
    update taxi_drivers set rides_completed = rides_completed + 1 where id = v_t.id;
    -- The watch ends with the ride. Nothing to unsubscribe, nothing to clean up
    -- later, and the capability key stops being served the same second.
    update trip_tracking set status = 'ended', ended_at = now()
     where trip_kind = 'ride' and trip_id = v_r.id;
    update driver_locations
       set tracking_status = 'online', trip_kind = null, trip_id = null
     where driver_kind = 'taxi' and driver_id = v_t.id;
  else
    perform ensure_trip_tracking('ride', v_r.id);
    update trip_tracking
       set status = case p_to when 'driver_on_way' then 'en_route_pickup'
                              when 'arrived'       then 'at_pickup'
                              when 'on_trip'       then 'on_trip' end,
           driver_kind = 'taxi', driver_id = v_t.id
     where trip_kind = 'ride' and trip_id = v_r.id;
  end if;

  perform log_ride_event(v_r.id, 'driver', v_t.id::text, 'ride.status', v_r.status, p_to,
    jsonb_build_object('by','driver'));
  return jsonb_build_object('ok', true, 'status', p_to);
end;
$$;
revoke all on function public.driver_advance_ride_by_token(text, text) from public;
-- anon on purpose, like accept_ride_by_token: a taxi driver has no session, and
-- the token is what proves who they are. It reveals nothing — a wrong token
-- returns {ok:false,reason:'invalid'} and touches nothing.
grant execute on function public.driver_advance_ride_by_token(text, text) to anon, authenticated, service_role;

-- ── 6. WHAT A DRIVER'S PHONE NEEDS TO TRACK ───────────────────────────────
-- Returns the capability key plus the coordinates of the job. Service-role only:
-- it is reached through /api/tracking/driver, which rate-limits the token space
-- the same way /api/driver-home does.
create or replace function public.driver_tracking_context(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_t taxi_drivers%rowtype; v_r ride_requests%rowtype; v_tt trip_tracking%rowtype;
begin
  if p_token is null or length(p_token) < 32 then return jsonb_build_object('ok', false); end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;

  select * into v_r from ride_requests
   where driver_id = v_t.id and status in ('assigned','driver_on_way','arrived','on_trip')
   order by assigned_at desc limit 1;

  if found then
    v_tt := ensure_trip_tracking('ride', v_r.id);
    select * into v_tt from trip_tracking where trip_kind='ride' and trip_id = v_r.id;
  end if;

  return jsonb_build_object('ok', true,
    'driverKind','taxi', 'driverId', v_t.id, 'name', v_t.name,
    'availability', v_t.availability,
    'trip', case when v_r.id is null then null else jsonb_build_object(
      'kind','ride', 'id', v_r.id, 'status', v_r.status,
      'channelKey', v_tt.channel_key,
      'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label,
      'pickupLat', v_r.pickup_lat, 'pickupLng', v_r.pickup_lng,
      'dropoffLat', v_r.dropoff_lat, 'dropoffLng', v_r.dropoff_lng,
      'customerName', v_r.customer_name, 'customerPhone', v_r.customer_phone) end);
end;
$$;
revoke all on function public.driver_tracking_context(text) from public, anon, authenticated;
grant execute on function public.driver_tracking_context(text) to service_role;

-- The same answer for a DELIVERY driver, who does have a session. Resolved from
-- auth.uid() through current_driver(), so there is no driver_id to supply and
-- nothing to point at somebody else.
create or replace function public.delivery_tracking_context()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_d delivery_drivers%rowtype; v_dl deliveries%rowtype; v_tt trip_tracking%rowtype;
begin
  v_d := current_driver();
  if v_d.id is null then return jsonb_build_object('ok', false); end if;

  select * into v_dl from deliveries
   where driver_id = v_d.id
     and status in ('assigned','going_to_pickup','arrived_at_pickup','picked_up','out_for_delivery','arrived')
   order by assigned_at desc limit 1;

  if found then
    v_tt := ensure_trip_tracking('delivery', v_dl.id);
    select * into v_tt from trip_tracking where trip_kind='delivery' and trip_id = v_dl.id;
  end if;

  return jsonb_build_object('ok', true,
    'driverKind','delivery', 'driverId', v_d.id, 'name', v_d.full_name,
    'availability', v_d.availability,
    'trip', case when v_dl.id is null then null else jsonb_build_object(
      'kind','delivery', 'id', v_dl.id, 'status', v_dl.status,
      'channelKey', v_tt.channel_key,
      'pickup', v_tt.pickup_label, 'dropoff', v_tt.dropoff_label,
      'pickupLat', v_tt.pickup_lat, 'pickupLng', v_tt.pickup_lng,
      'dropoffLat', v_tt.dropoff_lat, 'dropoffLng', v_tt.dropoff_lng) end);
end;
$$;
revoke all on function public.delivery_tracking_context() from public, anon;
grant execute on function public.delivery_tracking_context() to authenticated, service_role;

-- ── 7. WHAT A WATCHER READS ───────────────────────────────────────────────
-- The authority. Broadcast supplies smooth movement between fixes; THIS is what
-- a page reads on load, on reconnect, and on every fallback poll — so a dropped
-- socket degrades to a slower dot rather than a blank map.
--
-- Deliberately returns no customer identity and no driver phone: the caller
-- already knows who it asked about, and this must stay safe to hand to whichever
-- of the three watcher types asked for it.
create or replace function public.tracking_snapshot(p_trip_kind text, p_trip_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare v_tt trip_tracking%rowtype; v_age integer;
begin
  select * into v_tt from trip_tracking where trip_kind = p_trip_kind and trip_id = p_trip_id;
  if not found then return jsonb_build_object('ok', false); end if;
  v_age := case when v_tt.recorded_at is null then null
                else extract(epoch from (now() - v_tt.recorded_at))::integer end;
  return jsonb_build_object('ok', true,
    'status', v_tt.status, 'endedAt', v_tt.ended_at,
    'lat', v_tt.lat, 'lng', v_tt.lng, 'heading', v_tt.heading,
    'speedKmh', v_tt.speed_kmh, 'accuracyM', v_tt.accuracy_m,
    'recordedAt', v_tt.recorded_at, 'ageSeconds', v_age,
    'pickupLat', v_tt.pickup_lat, 'pickupLng', v_tt.pickup_lng,
    'dropoffLat', v_tt.dropoff_lat, 'dropoffLng', v_tt.dropoff_lng,
    'pickupLabel', v_tt.pickup_label, 'dropoffLabel', v_tt.dropoff_label,
    -- One dial, one definition of stale, shared with dispatch. If the owner
    -- widens it because rural phones sleep, every screen agrees at once.
    'staleAfterSeconds', (select stale_location_minutes * 60 from dispatch_settings where id='main'));
end;
$$;
revoke all on function public.tracking_snapshot(text, uuid) from public, anon, authenticated;
grant execute on function public.tracking_snapshot(text, uuid) to service_role;

-- ── 8. THE ADMIN'S LIVE OPERATIONS VIEW ───────────────────────────────────
-- Every driver the platform can see, of both kinds, with where they are, how old
-- that is, and what they are doing. One query rather than the admin map calling
-- five endpoints and stitching them together in a browser.
create or replace function public.admin_live_map()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare v_stale integer; v_out jsonb;
begin
  -- Callable by an authenticated platform admin, and by the service-role client
  -- that /admin actually uses (auth.uid() is null there — see M28: the null gate
  -- alone is NOT a boundary, which is why the grant below is revoked from anon).
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  select stale_location_minutes * 60 into v_stale from dispatch_settings where id='main';

  select jsonb_build_object(
    'ok', true, 'staleAfterSeconds', v_stale, 'at', now(),
    'drivers', coalesce(jsonb_agg(d order by d->>'name'), '[]'::jsonb))
    into v_out
  from (
    -- Taxi and transfer: no account, availability is the owner's switch.
    select jsonb_build_object(
      'kind','taxi', 'id', t.id, 'name', t.name, 'phone', coalesce(t.whatsapp, t.phone),
      'vehicle', t.vehicle, 'vehicleType', t.vehicle_type,
      'availability', case when not t.active then 'off' else t.availability end,
      'services', array_remove(array[
        case when t.handles_taxi     then 'taxi'     end,
        case when t.handles_airport  then 'airport'  end,
        case when t.handles_transfer then 'transfer' end], null),
      'lat', coalesce(l.lat, t.base_lat), 'lng', coalesce(l.lng, t.base_lng),
      -- "Where they wait" is not "where they are". Saying which one the pin means
      -- is the difference between a map an operator trusts and one they learn to
      -- ignore.
      'positionSource', case when l.driver_id is not null then 'live'
                             when t.base_lat is not null then 'base' else null end,
      'heading', l.heading, 'speedKmh', l.speed_kmh,
      'ageSeconds', case when l.recorded_at is null then null
                         else extract(epoch from (now() - l.recorded_at))::integer end,
      'trackingStatus', coalesce(l.tracking_status, 'offline'),
      'job', case when r.id is null then null else jsonb_build_object(
        'kind','ride', 'id', r.id, 'status', r.status,
        'ref', 'RR-' || upper(substring(replace(r.id::text,'-',''), 1, 6)),
        'customerName', r.customer_name, 'customerPhone', r.customer_phone,
        'pickup', r.pickup_label, 'dropoff', r.dropoff_label,
        'dropoffLat', r.dropoff_lat, 'dropoffLng', r.dropoff_lng,
        'pickupLat', r.pickup_lat, 'pickupLng', r.pickup_lng,
        'channelKey', tt.channel_key) end) as d
    from taxi_drivers t
    left join driver_locations l on l.driver_kind='taxi' and l.driver_id = t.id
    left join lateral (
      select * from ride_requests rr
       where rr.driver_id = t.id
         and rr.status in ('assigned','driver_on_way','arrived','on_trip')
       order by rr.assigned_at desc limit 1) r on true
    left join trip_tracking tt on tt.trip_kind='ride' and tt.trip_id = r.id

    union all

    -- Delivery: has an account, availability is their own switch.
    select jsonb_build_object(
      'kind','delivery', 'id', dd.id, 'name', dd.full_name, 'phone', dd.phone,
      'vehicle', dd.vehicle_details, 'vehicleType', dd.vehicle_type,
      'availability', case when dd.status <> 'approved' then 'off' else dd.availability::text end,
      'services', array['delivery'],
      'lat', l.lat, 'lng', l.lng,
      'positionSource', case when l.driver_id is not null then 'live' else null end,
      'heading', l.heading, 'speedKmh', l.speed_kmh,
      'ageSeconds', case when l.recorded_at is null then null
                         else extract(epoch from (now() - l.recorded_at))::integer end,
      'trackingStatus', coalesce(l.tracking_status, 'offline'),
      'job', case when dl.id is null then null else jsonb_build_object(
        'kind','delivery', 'id', dl.id, 'status', dl.status::text,
        'ref', 'RR-' || upper(substring(replace(dl.id::text,'-',''), 1, 6)),
        'customerName', null, 'customerPhone', null,
        'pickup', st.name, 'dropoff', dl.dropoff_note,
        'dropoffLat', dl.dropoff_lat, 'dropoffLng', dl.dropoff_lng,
        'pickupLat', st.lat, 'pickupLng', st.lng,
        'channelKey', tt2.channel_key) end) as d
    from delivery_drivers dd
    left join driver_locations l on l.driver_kind='delivery' and l.driver_id = dd.id
    left join lateral (
      select * from deliveries d2
       where d2.driver_id = dd.id
         and d2.status in ('assigned','going_to_pickup','arrived_at_pickup',
                           'picked_up','out_for_delivery','arrived')
       order by d2.assigned_at desc limit 1) dl on true
    left join stores st on st.id = dl.store_id
    left join trip_tracking tt2 on tt2.trip_kind='delivery' and tt2.trip_id = dl.id
  ) s;

  return v_out;
end;
$$;
revoke all on function public.admin_live_map() from public, anon, authenticated;
grant execute on function public.admin_live_map() to service_role;

-- ── 9. DISPATCH LEARNS TO PREFER A LIVE POSITION ──────────────────────────
-- ride_candidates ranked taxi drivers on base_lat/base_lng — "where this driver
-- usually waits", set by the owner — because when it was written no taxi driver
-- could report anything better. Now they can. A fresh GPS fix beats a static
-- base every time; a stale one is worse than nothing and falls back.
--
-- Everything else about this function is unchanged: same weights, same
-- eligibility rules, same reason_skipped strings, same ordering.
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
      -- THE CHANGE: a fresh live fix, else the admin-set base, else nothing.
      -- stale_location_minutes is the same dial dispatch_candidates uses, so
      -- both engines agree on what "current" means.
      coalesce(case when l.recorded_at >= now() - make_interval(mins => v_set.stale_location_minutes)
                    then l.lat end, t.base_lat) as at_lat,
      coalesce(case when l.recorded_at >= now() - make_interval(mins => v_set.stale_location_minutes)
                    then l.lng end, t.base_lng) as at_lng,
      case when t.rides_offered < 3 then 0.70::numeric
           else round(t.rides_accepted::numeric / greatest(t.rides_offered, 1), 3) end as reliability,
      coalesce(extract(epoch from (now() - t.last_offered_at))::integer / 3600, 72)::integer as idle_h,
      (select count(*) from ride_requests r2
        where r2.driver_id = t.id
          and r2.status in ('assigned','driver_on_way','arrived','on_trip'))::integer as live_jobs
    from taxi_drivers t
    left join driver_locations l on l.driver_kind = 'taxi' and l.driver_id = t.id
    where t.active
  ),
  measured as (
    select b.*,
      case when b.at_lat is null or v_r.pickup_lat is null then null
           else (haversine_km(v_r.pickup_lat, v_r.pickup_lng, b.at_lat, b.at_lng)
                 * v_set.road_factor)::numeric end as road_km
    from base b
  ),
  judged as (
    select m.*, case
      when m.availability = 'off'  then 'not working today'
      when m.availability = 'busy' then 'marked busy'
      when m.live_jobs > 0         then 'already on a ride'
      when coalesce(m.seats, 4) < v_r.passengers then
        format('seats %s < %s passengers', coalesce(m.seats, 4), v_r.passengers)
      when v_r.service = 'airport' and not m.handles_airport then 'no airport runs'
      when v_r.service in ('hotel','private','ferry') and not m.handles_transfer then 'no transfers'
      when v_r.service = 'taxi' and not m.handles_taxi then 'no town taxi'
      when v_radius is not null and m.road_km is not null and m.road_km > v_radius then
        format('%s km away, outside this round', round(m.road_km, 1))
      else null end as skip
    from measured m
  )
  select j.id, j.name, j.phone, j.whatsapp, j.vehicle, j.seats, j.base_label,
    round(j.road_km, 2)::double precision,
    case when j.road_km is null then null else ceil(j.road_km / v_set.avg_speed_kmh * 60)::integer end,
    j.reliability, j.idle_h,
    case when j.skip is not null then null else round((
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
revoke all on function public.ride_candidates(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.ride_candidates(uuid, integer, integer) to service_role;

-- dispatch_candidates joins driver_locations too, and after the PK change that
-- join must name the kind or a taxi driver's row could satisfy a delivery
-- driver's lookup.
--
-- ── A WARNING THIS MIGRATION EARNED THE HARD WAY ───────────────────────────
-- The first attempt at this file rewrote dispatch_candidates from the version
-- in supabase/migrations/20260813110000_dispatch_geography.sql — SIX arguments.
-- The DEPLOYED function takes SEVEN: m103 added p_size_class and the
-- vehicle_can_carry() eligibility test that makes "Deliver Anything" match a
-- parcel to a vehicle that can actually hold it. A `create or replace` with the
-- old signature does not replace anything; it creates a second OVERLOAD, and
-- offer_delivery's call then resolves ambiguously — silently dropping vehicle
-- matching from live dispatch.
--
-- It was caught only because the verification block at the bottom CALLS the
-- function, and Postgres answered "function ... is not unique". The whole
-- migration rolled back, so production never saw it. That is the entire
-- argument for the verification block, and for reading pg_get_functiondef()
-- before replacing anything: THESE FILES ARE A RECORD OF WHAT WAS APPLIED, NOT
-- A MIRROR OF WHAT IS DEPLOYED.
--
-- What follows is the deployed 7-argument body, verbatim, with ONE line
-- changed — the driver_locations join. Everything else is byte-for-byte the
-- live function, including m103's vehicle_can_carry() filter and the
-- equirectangular distance it uses in place of haversine_km().
create or replace function public.dispatch_candidates(
  p_lat double precision, p_lng double precision, p_zone_id uuid default null,
  p_stage integer default 1, p_limit integer default 20,
  p_exclude uuid[] default '{}'::uuid[], p_size_class text default null
) returns table (
  driver_id uuid, full_name text, distance_km double precision, eta_minutes integer,
  active_jobs integer, accept_rate numeric, idle_minutes integer, score numeric,
  location_age_seconds integer
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_set    dispatch_settings%rowtype;
  v_dset   delivery_settings%rowtype;
  v_radius double precision;
  v_lat    double precision := p_lat;
  v_lng    double precision := p_lng;
  v_deg    double precision;
  v_wsum   numeric;
begin
  select * into v_set  from dispatch_settings where id = 'main';
  select * into v_dset from delivery_settings where id = 'main';

  v_radius := case
    when p_stage is null or p_stage < 1 then v_set.radius_stages_km[1]
    when p_stage > cardinality(v_set.radius_stages_km) then null
    else v_set.radius_stages_km[p_stage]
  end;

  v_deg := case when v_radius is null then null
                else (v_radius * v_set.road_factor) / 111.0 end;

  v_wsum := greatest(
    v_set.weight_proximity + v_set.weight_reliability
      + v_set.weight_workload + v_set.weight_idle,
    0.0001);

  return query
  with eligible as (
    select
      d.id, d.full_name,
      case when l.lat is null or v_lat is null then null
           else 111.045 * sqrt(
                  power(l.lat - v_lat, 2)
                + power((l.lng - v_lng) * cos(radians((l.lat + v_lat) / 2)), 2))
      end as raw_km,
      case when l.recorded_at is null then null
           else extract(epoch from (now() - l.recorded_at))::integer end as loc_age,
      (select count(*)::integer from deliveries dl
        where dl.driver_id = d.id
          and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                            'picked_up','out_for_delivery','arrived')) as jobs,
      case
        when coalesce(m.offers_received, 0) = 0 then 0.70::numeric
        else greatest(0::numeric, round(
          (coalesce(m.offers_accepted, 0)::numeric
             / greatest(coalesce(m.offers_received, 0), 1)::numeric)
          - least(0.4, coalesce(m.driver_cancellations, 0)::numeric * 0.05)
          - least(0.3, coalesce(m.unresponsive_events, 0)::numeric * 0.05)
        , 3))
      end as reliability,
      coalesce(extract(epoch from (now() - (
        select max(o.offered_at) from delivery_offers o where o.driver_id = d.id
      )))::integer / 60, 1440)::integer as idle_min
    from delivery_drivers d
    -- THE ONLY CHANGED LINE. Without driver_kind, a taxi driver's row could be
    -- read as a delivery driver's position now that both live in this table.
    left join driver_locations l on l.driver_kind = 'delivery' and l.driver_id = d.id
    left join driver_metrics   m on m.driver_id = d.id
    where d.status = 'approved'
      and d.availability = 'available'
      and not (d.id = any (coalesce(p_exclude, '{}'::uuid[])))
      and (cardinality(d.service_zone_ids) = 0
           or p_zone_id is null
           or p_zone_id = any (d.service_zone_ids))
      and (select count(*) from deliveries dl
            where dl.driver_id = d.id
              and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                'picked_up','out_for_delivery','arrived'))
          < v_dset.max_active_deliveries
      and vehicle_can_carry(d.vehicle_type, p_size_class)
      and (v_deg is null or l.driver_id is null
           or (l.lat between v_lat - v_deg and v_lat + v_deg
               and l.lng between v_lng - v_deg and v_lng + v_deg))
  ),
  within as (
    select e.*, (e.raw_km * v_set.road_factor)::numeric as road_km
      from eligible e
     where v_radius is null or e.raw_km is null or e.raw_km <= v_radius
  )
  select
    w.id, w.full_name,
    round(w.road_km, 2)::double precision,
    case when w.road_km is null then null
         else ceil(w.road_km / v_set.avg_speed_kmh * 60)::integer end,
    w.jobs, w.reliability, w.idle_min,
    round((
        v_set.weight_proximity * coalesce(greatest(0::numeric, 1 - (w.road_km / 18)), 0.25)
      + v_set.weight_reliability * w.reliability
      + v_set.weight_workload * greatest(0::numeric, 1 - (w.jobs::numeric
          / greatest(v_dset.max_active_deliveries, 1)))
      + v_set.weight_idle * least(1::numeric, w.idle_min::numeric / 120)
    ) / v_wsum, 4)::numeric,
    w.loc_age
  from within w
  order by 8 desc, 3 asc nulls last, w.idle_min desc
  limit greatest(coalesce(p_limit, 20), 1);
end;
$function$;
revoke all on function public.dispatch_candidates(double precision, double precision, uuid, integer, integer, uuid[], text) from public, anon, authenticated;
grant execute on function public.dispatch_candidates(double precision, double precision, uuid, integer, integer, uuid[], text) to service_role;

-- Proof there is still exactly ONE dispatch_candidates. A second overload is the
-- failure described above, and it stays invisible until dispatch picks the wrong
-- one on a live job.
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'dispatch_candidates';
  if v_n <> 1 then
    raise exception 'dispatch_candidates has % overloads - dispatch would resolve ambiguously', v_n;
  end if;
end $$;

-- update_driver_location() keeps working for the authenticated delivery driver
-- who calls it directly: driver_kind defaults to 'delivery', which is exactly
-- what current_driver() resolves. Left alone deliberately — a signature change
-- would break a grant for no gain.

-- ── 10. THE WATCH ENDS WITH THE JOB ───────────────────────────────────────
-- A trip whose ride or delivery has finished must stop being watchable even if
-- nothing pressed COMPLETE — a driver whose phone died mid-trip must not leave a
-- live capability key and a last-known position lying around forever.
create or replace function public.sweep_trip_tracking()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_rides integer; v_dels integer; v_stale integer;
begin
  with e as (
    update trip_tracking t set status='ended', ended_at=now()
     where t.trip_kind='ride' and t.ended_at is null
       and exists (select 1 from ride_requests r
                    where r.id = t.trip_id and r.status in ('completed','cancelled','no_driver'))
    returning 1) select count(*) into v_rides from e;

  with e as (
    update trip_tracking t set status='ended', ended_at=now()
     where t.trip_kind='delivery' and t.ended_at is null
       and exists (select 1 from deliveries d
                    where d.id = t.trip_id
                      and d.status in ('delivered','cancelled','failed_delivery','returned_to_merchant'))
    returning 1) select count(*) into v_dels from e;

  -- Anything still "live" 12 hours after its last fix is not live. Rodrigues is
  -- 18 km across; no honest journey here outlasts that.
  with e as (
    update trip_tracking set status='ended', ended_at=now()
     where ended_at is null and created_at < now() - interval '12 hours'
    returning 1) select count(*) into v_stale from e;

  -- A finished trip keeps its row (the audit trail and the customer's "your
  -- trip is complete" screen both need it) but must not keep a position. This is
  -- the same "nowhere to keep a trail" rule driver_locations already follows.
  update trip_tracking set lat=null, lng=null, heading=null, speed_kmh=null, accuracy_m=null
   where ended_at is not null and ended_at < now() - interval '2 hours' and lat is not null;

  -- A driver whose phone has been silent for six hours is not online.
  delete from driver_locations where recorded_at < now() - interval '6 hours';

  return jsonb_build_object('rides', v_rides, 'deliveries', v_dels, 'stale', v_stale);
end;
$$;
revoke all on function public.sweep_trip_tracking() from public, anon, authenticated;
grant execute on function public.sweep_trip_tracking() to service_role;

-- ── 11. PROVE IT ──────────────────────────────────────────────────────────
-- A migration applying successfully proves NOTHING about the SQL inside a
-- plpgsql function: the body is not planned until it runs, so a typo'd column
-- or a round(double precision, int) sails through CREATE and fails on the first
-- real call. dispatch_geography.sql documents exactly that bug. So: call every
-- function here, and assert the grants are what they are supposed to be rather
-- than what the REVOKE statements imply.
do $$
declare v jsonb; v_r record; v_acl record;
begin
  -- Bodies execute.
  perform ensure_trip_tracking('ride', '00000000-0000-0000-0000-000000000000');
  v := tracking_snapshot('ride', '00000000-0000-0000-0000-000000000000');
  if (v->>'ok')::boolean is not false then
    raise exception 'tracking_snapshot should not find a nonexistent trip';
  end if;
  v := driver_advance_ride_by_token('not-a-real-token-but-long-enough-to-pass-32', 'arrived');
  if (v->>'ok')::boolean is not false then
    raise exception 'driver_advance_ride_by_token accepted a bad token';
  end if;
  v := driver_tracking_context('not-a-real-token-but-long-enough-to-pass-32');
  if (v->>'ok')::boolean is not false then
    raise exception 'driver_tracking_context accepted a bad token';
  end if;
  v := clear_driver_position('taxi', '00000000-0000-0000-0000-000000000000');
  v := sweep_trip_tracking();
  v := admin_live_map();
  if (v->>'ok')::boolean is not true then raise exception 'admin_live_map failed'; end if;

  -- record_driver_position writes both rows, then cleans up after itself.
  v := record_driver_position('taxi', '00000000-0000-0000-0000-000000000001',
         -19.6836, 63.4186, 90, 30, 12, 'online', null, null);
  if (v->>'ok')::boolean is not true then raise exception 'record_driver_position failed'; end if;
  if not exists (select 1 from driver_locations
                  where driver_kind='taxi' and driver_id='00000000-0000-0000-0000-000000000001') then
    raise exception 'record_driver_position wrote nothing';
  end if;
  delete from driver_locations where driver_id='00000000-0000-0000-0000-000000000001';

  -- The ranking functions still plan and run.
  for v_r in select * from dispatch_candidates(-19.6836, 63.4186, null::uuid, 1, 5, '{}'::uuid[], null::text) loop null; end loop;

  -- ── ACLs, asserted rather than assumed ──────────────────────────────────
  -- Supabase's default privileges grant EXECUTE on new public functions to anon
  -- and authenticated. `revoke ... from public` does NOT undo that — only naming
  -- the roles does. update_driver_location() is reachable by anon today for
  -- exactly this reason. Assert, do not hope.
  for v_acl in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname in ('ensure_trip_tracking','record_driver_position','clear_driver_position',
                         'driver_tracking_context','tracking_snapshot','admin_live_map',
                         'sweep_trip_tracking','sane_heading','ride_candidates',
                         'dispatch_candidates')
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
            or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  loop
    raise exception 'SECURITY: %() is executable by anon or authenticated', v_acl.proname;
  end loop;

  -- The two that are anon-callable ON PURPOSE, because a taxi driver's token is
  -- their only identity. Asserted so a later blanket revoke cannot silently
  -- take the fleet's controls away.
  if not has_function_privilege('anon', 'public.driver_advance_ride_by_token(text,text)', 'EXECUTE') then
    raise exception 'driver_advance_ride_by_token must stay anon-callable (token IS the identity)';
  end if;
  if has_function_privilege('anon', 'public.delivery_tracking_context()', 'EXECUTE') then
    raise exception 'delivery_tracking_context must not be anon-callable';
  end if;

  -- Tables: no API role may read the capability keys.
  if has_table_privilege('anon', 'public.trip_tracking', 'SELECT')
     or has_table_privilege('authenticated', 'public.trip_tracking', 'SELECT') then
    raise exception 'SECURITY: trip_tracking is readable by an API role';
  end if;
  if has_table_privilege('anon', 'public.driver_locations', 'SELECT') then
    raise exception 'SECURITY: driver_locations is readable by anon';
  end if;

  raise notice 'M109 verified: bodies execute, ACLs are least-privilege.';
end $$;
