-- ── Somebody else is driving a customer's car ──────────────────────────────
--
-- The owner: "if someone takes a user car can I be able to track it?"
--
-- The honest answer before this was NO. There was no car-collection job, and
-- searching every column in the database for a plate or registration returned
-- NOTHING — so a driver could take a car and the platform held no record of
-- which car, whose, or what state it was in. /admin/live showed a moving dot
-- for the person and nothing about the vehicle.
--
-- This is the only job on the platform where the thing being moved is worth
-- more than everything else on the site together, and where "it came back
-- scratched" is a dispute the owner has to settle with no evidence.

-- ── ONE: THE JOB KNOWS WHICH CAR ───────────────────────────────────────────
alter table delivery_requests
  add column if not exists vehicle_plate text,
  add column if not exists vehicle_desc  text;

alter table delivery_requests
  drop constraint if exists delivery_requests_errand_kind_domain;

alter table delivery_requests
  add constraint delivery_requests_errand_kind_domain
    check (
      errand_kind is null
      or (kind = 'errand'
          and errand_kind in ('pay_bill', 'queue', 'collect', 'gas', 'other', 'vehicle'))
    );

-- Two statements, not one equivalence — the same lesson as the budget shape.
alter table delivery_requests
  add constraint delivery_requests_vehicle_only_on_vehicle_errand
    check (vehicle_plate is null or errand_kind = 'vehicle'),
  -- A car collection whose plate is blank is a job nobody can prove anything
  -- about afterwards.
  add constraint delivery_requests_vehicle_needs_plate
    check (errand_kind is distinct from 'vehicle'
           or btrim(coalesce(vehicle_plate, '')) <> '');

-- ── TWO: WHAT HAPPENED AT EACH HANDOVER ────────────────────────────────────
create table if not exists vehicle_custody_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references delivery_requests(id) on delete cascade,
  event       text not null check (event in ('collected', 'returned')),
  driver_id   uuid references delivery_drivers(id) on delete set null,
  -- Storage paths in the PRIVATE delivery-photos bucket. Never URLs, and never
  -- displayable without a signature.
  photo_paths text[] not null default '{}',
  note        text,
  lat         double precision,
  lng         double precision,
  recorded_at timestamptz not null default now(),

  -- AT LEAST ONE PHOTO, ALWAYS. The row exists to be evidence, and a handover
  -- record with no photograph is worse than no record at all: it looks like
  -- proof and settles nothing. The driver is standing at the car holding the
  -- phone they are pressing the button with, so this is a real requirement
  -- rather than a hopeful one.
  constraint vehicle_custody_needs_a_photo
    check (cardinality(photo_paths) >= 1)
);

-- One collection and one return per job. A second 'collected' is a bug or a
-- double tap, never a second fact.
create unique index if not exists vehicle_custody_one_per_event
  on vehicle_custody_events (request_id, event);

create index if not exists vehicle_custody_request_idx
  on vehicle_custody_events (request_id, recorded_at desc);

alter table vehicle_custody_events enable row level security;

-- No client role reaches this table directly. Every reader and writer goes
-- through a SECURITY DEFINER function, the same shape as taxi_drivers — the
-- rows describe where somebody's car was and who had it.
revoke all on table vehicle_custody_events from anon, authenticated;

-- ── THREE: THE DRIVER RECORDS A HANDOVER ───────────────────────────────────
create or replace function public.record_vehicle_custody(
  p_request_id uuid,
  p_event      text,
  p_photos     text[],
  p_note       text default null,
  p_lat        double precision default null,
  p_lng        double precision default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d   delivery_drivers%rowtype;
  v_r   delivery_requests%rowtype;
  v_has_collected boolean;
  v_id  uuid;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    raise exception 'Your driver account is not approved yet.' using errcode = 'P0001';
  end if;
  if coalesce(p_event, '') not in ('collected', 'returned') then
    raise exception 'Say whether the car was collected or returned.' using errcode = 'P0001';
  end if;
  if p_photos is null or cardinality(p_photos) = 0 then
    raise exception 'Take at least one photo of the car first.' using errcode = 'P0001';
  end if;

  select * into v_r from delivery_requests where id = p_request_id;
  if not found or v_r.errand_kind is distinct from 'vehicle' then
    raise exception 'That is not a car collection.' using errcode = 'P0001';
  end if;

  -- THE JOB MUST BE THEIRS. Without this any approved driver could file a
  -- handover against somebody else's job and muddy the only evidence there is.
  if not exists (
    select 1 from deliveries dl
     where dl.request_id = v_r.id and dl.driver_id = v_d.id
  ) then
    raise exception 'This job is not yours.' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from vehicle_custody_events e
     where e.request_id = v_r.id and e.event = 'collected'
  ) into v_has_collected;

  if p_event = 'returned' and not v_has_collected then
    -- A return with no collection is a trail that reads as though the car
    -- appeared from nowhere.
    raise exception 'Record the collection first.' using errcode = 'P0001';
  end if;

  insert into vehicle_custody_events
    (request_id, event, driver_id, photo_paths, note, lat, lng)
  values
    (v_r.id, p_event, v_d.id, p_photos,
     nullif(btrim(coalesce(p_note, '')), ''), p_lat, p_lng)
  on conflict (request_id, event) do nothing
  returning id into v_id;

  if v_id is null then
    -- Already recorded. Not an error — a driver double-tapping on a bad signal
    -- must not be told something went wrong.
    return jsonb_build_object('ok', true, 'alreadyRecorded', true);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'event', p_event);
end;
$function$;

revoke all on function public.record_vehicle_custody(uuid, text, text[], text, double precision, double precision)
  from public, anon;
grant execute on function public.record_vehicle_custody(uuid, text, text[], text, double precision, double precision)
  to authenticated;

-- ── FOUR: THE OWNER SEES WHOSE CARS ARE OUT ────────────────────────────────
--
-- A car is HELD when it has been collected and not yet returned — DERIVED, not
-- a status somebody has to remember to set, so this list cannot drift out of
-- step with what actually happened at the car.
create or replace function public.admin_vehicle_custody(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  return (
    with j as (
      select r.id, r.what, r.vehicle_plate, r.vehicle_desc,
             r.contact_name, r.contact_phone,
             r.pickup_text, r.dropoff_text, r.status,
             c.recorded_at as collected_at, c.driver_id as collected_by,
             c.lat as collected_lat, c.lng as collected_lng,
             cardinality(c.photo_paths) as collected_photos,
             ret.recorded_at as returned_at,
             cardinality(ret.photo_paths) as returned_photos
        from delivery_requests r
        left join vehicle_custody_events c
               on c.request_id = r.id and c.event = 'collected'
        left join vehicle_custody_events ret
               on ret.request_id = r.id and ret.event = 'returned'
       where r.errand_kind = 'vehicle'
         and r.created_at > now() - (v_days || ' days')::interval
    )
    select jsonb_build_object(
      'days', v_days,
      -- OUT NOW, worst first: the car that has been gone longest is the one to
      -- ask about.
      'held', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'requestId', j.id,
                 'plate', j.vehicle_plate,
                 'vehicle', j.vehicle_desc,
                 'what', j.what,
                 'customerName', j.contact_name,
                 'customerPhone', j.contact_phone,
                 'from', j.pickup_text,
                 'to', j.dropoff_text,
                 'collectedAt', j.collected_at,
                 'heldMinutes', floor(extract(epoch from (now() - j.collected_at)) / 60)::int,
                 'collectedPhotos', j.collected_photos,
                 'driverName', d.full_name,
                 'driverPhone', d.phone,
                 'lat', j.collected_lat, 'lng', j.collected_lng
               ) order by j.collected_at)
          from j left join delivery_drivers d on d.id = j.collected_by
         where j.collected_at is not null and j.returned_at is null
      ), '[]'::jsonb),
      'totals', (
        select jsonb_build_object(
          'jobs', count(*),
          'heldNow', count(*) filter (where collected_at is not null and returned_at is null),
          'returned', count(*) filter (where returned_at is not null),
          -- Booked and never collected: a job that quietly did not happen, and
          -- the customer may still be waiting by their car.
          'neverCollected', count(*) filter (
            where collected_at is null and status in ('accepted', 'expired', 'cancelled'))
        ) from j
      )
    )
  );
end;
$function$;

revoke all on function public.admin_vehicle_custody(integer) from public, anon, authenticated;
