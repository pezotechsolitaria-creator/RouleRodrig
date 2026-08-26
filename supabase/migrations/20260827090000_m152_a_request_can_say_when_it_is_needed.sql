-- ── M152 — a request can say WHEN it is needed ─────────────────────────────
--
-- delivery_requests has never had a scheduling column. Not a missing UI for an
-- existing field — the field does not exist. `expires_at` is a 48-hour TTL on
-- the QUOTING period and says nothing about when the customer needs the thing
-- moved.
--
-- Two consequences, and the second is the expensive one:
--
--   A customer could not say "tomorrow afternoon", so every request read as
--   "now" to a driver, and a driver who took one and turned up was as likely
--   as not to be early or a day late.
--
--   THE BOARD COULD NOT RANK BY URGENCY, because nothing recorded urgency. It
--   ordered by created_at, so a job for Christmas posted in August outranked
--   one needed this afternoon. That is the owner's report exactly, and it was
--   not a sorting bug — there was no column to sort on. M153 does the sorting;
--   this migration gives it something to sort.
--
-- ── THE TIMES ARE COMPUTED HERE, NEVER SENT ───────────────────────────────
-- The client sends a CHOICE — "tomorrow", "afternoon" — and the server turns it
-- into two timestamps. A client that sends its own window can send one in the
-- past, one ten years out, or one an hour wide, and every driver-facing promise
-- downstream is built on it. Same rule as the fee (§38).
--
-- ── AND THEY ARE COMPUTED IN LOCAL TIME ───────────────────────────────────
-- Indian/Mauritius, UTC+4, no DST — the convention already used by 16 other
-- migrations here. This is not a detail: a person opening the app at 2am local
-- is at 22:00 UTC the PREVIOUS DAY, so "today" computed in UTC is yesterday,
-- and "today, morning 8–12" resolves to a window that closed 14 hours ago.

alter table public.delivery_requests
  add column if not exists schedule_kind text not null default 'asap',
  add column if not exists time_slot     text not null default 'any',
  add column if not exists window_start  timestamptz,
  add column if not exists window_end    timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_requests_schedule_kind_check') then
    alter table public.delivery_requests add constraint delivery_requests_schedule_kind_check
      check (schedule_kind in ('asap','today','tomorrow','date'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_requests_time_slot_check') then
    alter table public.delivery_requests add constraint delivery_requests_time_slot_check
      check (time_slot in ('any','morning','afternoon','evening'));
  end if;
  -- A window that ends before it starts is not a window.
  if not exists (select 1 from pg_constraint where conname = 'delivery_requests_window_order_check') then
    alter table public.delivery_requests add constraint delivery_requests_window_order_check
      check (window_start is null or window_end is null or window_end > window_start);
  end if;
end $$;

-- THE index the board sorts on. Partial, because the board only ever reads open
-- rows, and an index over cancelled history would be mostly dead pages.
create index if not exists delivery_requests_window_idx
  on public.delivery_requests (window_start)
  where status = 'open';

-- ── The slots ──────────────────────────────────────────────────────────────
--
-- 08–12, 12–17, 17–20. The evening slot stops at 20:00 rather than running to
-- midnight because it is describing Rodrigues: most of the island's roads are
-- unlit, sunset sits between roughly 17:30 and 18:30 all year, and a driver
-- asked to find an unnumbered house up a track at 22:00 will decline or arrive
-- badly. A slot nobody will quote on is worse than no slot.
--
-- 'any' is 08–20 — the whole working day, which is what somebody who does not
-- mind actually means.

create or replace function public.compute_delivery_window(
  p_kind text,
  p_slot text default 'any',
  p_date date default null,
  p_now timestamptz default now()
)
returns tstzrange
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_zone  constant text := 'Indian/Mauritius';
  v_local timestamp;
  v_today date;
  v_day   date;
  v_from  time;
  v_to    time;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if coalesce(p_kind,'') not in ('asap','today','tomorrow','date') then
    raise exception 'Choose when you need it.' using errcode = 'P0001';
  end if;
  if coalesce(p_slot,'any') not in ('any','morning','afternoon','evening') then
    raise exception 'Choose a time of day.' using errcode = 'P0001';
  end if;

  -- ASAP is not a slot on a calendar. It is "start now", and it is given a
  -- four-hour tail so that it EXPIRES: an ASAP request from this morning is not
  -- ASAP by the afternoon, and leaving it on the board as though it were is how
  -- a driver ends up ringing somebody about a job they no longer need.
  if p_kind = 'asap' then
    return tstzrange(p_now, p_now + interval '4 hours', '[)');
  end if;

  v_local := p_now at time zone v_zone;
  v_today := v_local::date;

  v_day := case p_kind
             when 'today'    then v_today
             when 'tomorrow' then v_today + 1
             else p_date
           end;

  if v_day is null then
    raise exception 'Choose a date.' using errcode = 'P0001';
  end if;
  if v_day < v_today then
    raise exception 'That date has already passed.' using errcode = 'P0001';
  end if;
  -- A horizon, so the board cannot fill with requests nobody will look at for
  -- half a year. 60 days was the first number here and the probe below caught
  -- it: the owner's own example — "25 December" against "tomorrow afternoon" —
  -- is 106 days out when asked in September, so a 60-day horizon refused the
  -- very request the feature was described with. 90 covers planning a Christmas
  -- delivery from late September, and still refuses a year out, which is past
  -- the point where a driver can honestly name a price.
  if v_day > v_today + 90 then
    raise exception 'You can book up to 90 days ahead.' using errcode = 'P0001';
  end if;

  select f, t into v_from, v_to from (values
    ('morning',   time '08:00', time '12:00'),
    ('afternoon', time '12:00', time '17:00'),
    ('evening',   time '17:00', time '20:00'),
    ('any',       time '08:00', time '20:00')
  ) as s(slot, f, t) where s.slot = coalesce(p_slot,'any');

  v_start := (v_day + v_from) at time zone v_zone;
  v_end   := (v_day + v_to)   at time zone v_zone;

  -- Already over. "Today, morning" chosen at 3pm is a real thing to tap by
  -- accident, and silently sliding it to tomorrow would be worse than refusing.
  if v_end <= p_now then
    raise exception 'That time has already passed. Choose another.' using errcode = 'P0001';
  end if;

  -- Half over: "today, afternoon" at 2pm starts now, not at noon. Otherwise the
  -- board would sort it as though two hours of it were still available.
  if v_start < p_now then
    v_start := p_now;
  end if;

  return tstzrange(v_start, v_end, '[)');
end;
$fn$;

revoke all on function public.compute_delivery_window(text, text, date, timestamptz)
  from public, anon, authenticated;

-- ── Anything already here predates the question ────────────────────────────
-- Zero rows in production, but a backfill that is only correct on an empty
-- table is not a backfill. Existing rows are treated as 'asap' from when they
-- were posted, which is the only honest reading of a request that was never
-- asked.
update public.delivery_requests
   set window_start = coalesce(window_start, created_at),
       window_end   = coalesce(window_end, created_at + interval '4 hours')
 where window_start is null or window_end is null;

-- ── Posting a request ──────────────────────────────────────────────────────
-- DROPPED and recreated rather than replaced: three new parameters with
-- defaults would leave the old 17-argument version an exact match for every
-- existing call, so the scheduling would silently never run. The GRANT pins an
-- exact signature too.

drop function if exists public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text, text, text);

create function public.create_delivery_request(
  p_kind text,
  p_what text,
  p_pickup_text text,
  p_dropoff_text text,
  p_contact_name text,
  p_contact_phone text,
  p_size_class text default 'standard',
  p_max_budget integer default null,
  p_pickup_note text default null,
  p_dropoff_note text default null,
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null,
  p_dropoff_lat double precision default null,
  p_dropoff_lng double precision default null,
  p_guest_email text default null,
  p_photo_url text default null,
  p_cargo_kind text default 'general',
  p_schedule_kind text default 'asap',
  p_time_slot text default 'any',
  p_needed_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_open  integer;
  v_id    uuid;
  v_cargo text := coalesce(nullif(btrim(p_cargo_kind), ''), 'general');
  v_sched text := coalesce(nullif(btrim(p_schedule_kind), ''), 'asap');
  v_slot  text := coalesce(nullif(btrim(p_time_slot), ''), 'any');
  v_win   tstzrange;
begin
  if v_uid is not null then
    v_email := null;
  else
    v_email := nullif(btrim(lower(coalesce(p_guest_email, ''))), '');
    if v_email is null then
      raise exception 'Enter your email so we can send you the quotes.' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(p_kind,'') not in ('package','shop_and_deliver') then
    raise exception 'Choose whether we are collecting something or buying it.' using errcode = 'P0001';
  end if;
  if v_cargo not in ('general','food','fragile','heavy') then
    raise exception 'Choose what kind of thing it is.' using errcode = 'P0001';
  end if;

  -- Raises on its own for a slot that has passed, a date in the past, or a date
  -- beyond the horizon.
  v_win := compute_delivery_window(v_sched, v_slot, p_needed_date);

  if p_kind = 'shop_and_deliver' and coalesce(p_max_budget, 0) <= 0 then
    raise exception 'Set the most we may spend on the item.' using errcode = 'P0001';
  end if;
  if p_kind = 'package' and p_max_budget is not null then
    raise exception 'A collection has nothing to buy, so it takes no budget.' using errcode = 'P0001';
  end if;

  select count(*) into v_open from delivery_requests
   where status = 'open'
     and ((v_uid is not null and customer_id = v_uid)
       or (v_uid is null and guest_email = v_email));
  if v_open >= 5 then
    raise exception 'You already have 5 requests waiting for quotes.' using errcode = 'P0001';
  end if;

  insert into delivery_requests (
    kind, what, pickup_text, pickup_note, pickup_lat, pickup_lng,
    dropoff_text, dropoff_note, dropoff_lat, dropoff_lng,
    size_class, cargo_kind, max_budget, customer_id, guest_email,
    contact_name, contact_phone, photo_url,
    schedule_kind, time_slot, window_start, window_end, expires_at
  ) values (
    p_kind, btrim(p_what), btrim(p_pickup_text), nullif(btrim(coalesce(p_pickup_note,'')),''),
    p_pickup_lat, p_pickup_lng,
    btrim(p_dropoff_text), nullif(btrim(coalesce(p_dropoff_note,'')),''),
    p_dropoff_lat, p_dropoff_lng,
    coalesce(nullif(p_size_class,''), 'standard'), v_cargo, p_max_budget, v_uid, v_email,
    btrim(p_contact_name), btrim(p_contact_phone),
    nullif(btrim(coalesce(p_photo_url, '')), ''),
    v_sched, v_slot, lower(v_win), upper(v_win),
    -- ── EXPIRY IS NOW TIED TO THE WINDOW, not to a flat 48 hours ──────────
    -- The old rule would have expired a request for Christmas in two days, and
    -- kept an ASAP request quotable long after the moment had gone. A request
    -- stops taking quotes when the delivery window closes; the two-hour floor
    -- only protects a window that is almost over from expiring before anybody
    -- can answer it.
    greatest(upper(v_win), now() + interval '2 hours')
  ) returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision,
  text, text, text, text, text, date)
  from public, anon;
grant execute on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision,
  text, text, text, text, text, date)
  to authenticated;

-- ── Probes ─────────────────────────────────────────────────────────────────
do $assert$
declare
  v_zone constant text := 'Indian/Mauritius';
  v_now  timestamptz;
  v_w    tstzrange;
  v_ok   boolean;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_delivery_request') <> 1 then
    raise exception 'M152: create_delivery_request has an overload';
  end if;

  -- 09:00 local on a fixed day, so the assertions below are about the logic and
  -- not about what time it happens to be while the migration runs.
  -- November, so that the owner's literal example (25 December) sits inside
  -- the horizon and the ordering assertion below is about ordering.
  v_now := (date '2026-11-01' + time '09:00') at time zone v_zone;

  v_w := compute_delivery_window('today', 'morning', null, v_now);
  if lower(v_w) <> v_now then
    raise exception 'M152: a half-started window must begin now, got %', lower(v_w);
  end if;
  if upper(v_w) <> (date '2026-11-01' + time '12:00') at time zone v_zone then
    raise exception 'M152: morning must end at noon local, got %', upper(v_w);
  end if;

  v_w := compute_delivery_window('tomorrow', 'afternoon', null, v_now);
  if lower(v_w) <> (date '2026-11-02' + time '12:00') at time zone v_zone then
    raise exception 'M152: tomorrow afternoon is wrong, got %', lower(v_w);
  end if;

  -- THE ORDERING THE OWNER ASKED ABOUT, asserted at the source.
  if not (lower(compute_delivery_window('tomorrow','afternoon',null,v_now))
        < lower(compute_delivery_window('date','any',date '2026-12-25',v_now))) then
    raise exception 'M152: tomorrow must sort before Christmas';
  end if;
  if not (lower(compute_delivery_window('asap',null,null,v_now))
        < lower(compute_delivery_window('tomorrow','morning',null,v_now))) then
    raise exception 'M152: asap must sort before tomorrow';
  end if;

  -- ── THE MIDNIGHT CASE, which is the whole reason for the timezone ───────
  -- 02:00 local on the 10th is 22:00 UTC on the NINTH. Computed in UTC, "today"
  -- would resolve to the 9th and "today, morning" would already be over.
  v_ok := false;
  v_w := compute_delivery_window('today', 'morning', null,
           (date '2026-11-01' + time '02:00') at time zone v_zone);
  if lower(v_w) = (date '2026-11-01' + time '08:00') at time zone v_zone then
    v_ok := true;
  end if;
  if not v_ok then
    raise exception 'M152: at 2am local, today/morning must be 08:00 THAT day, got %', lower(v_w);
  end if;

  -- Refusals. Each in its own subtransaction, because a probe that expects a
  -- throw must not take the migration down with it.
  begin
    perform compute_delivery_window('today', 'morning', null,
      (date '2026-11-01' + time '15:00') at time zone v_zone);
    raise exception 'M152: accepted a morning slot at 3pm';
  exception when sqlstate 'P0001' then null;
  end;

  begin
    perform compute_delivery_window('date', 'any', date '2020-01-01', v_now);
    raise exception 'M152: accepted a date in the past';
  exception when sqlstate 'P0001' then null;
  end;

  begin
    perform compute_delivery_window('date', 'any', date '2030-01-01', v_now);
    raise exception 'M152: accepted a date beyond the horizon';
  exception when sqlstate 'P0001' then null;
  end;

  begin
    perform compute_delivery_window('date', 'any', null, v_now);
    raise exception 'M152: accepted a dated request with no date';
  exception when sqlstate 'P0001' then null;
  end;

  if has_function_privilege('anon','public.create_delivery_request(text, text, text, text, text, text, text, integer, text, text, double precision, double precision, double precision, double precision, text, text, text, text, text, date)','execute') then
    raise exception 'M152: posting is reachable by anon';
  end if;

  if exists (select 1 from delivery_requests where window_start is null or window_end is null) then
    raise exception 'M152: a request was left with no window';
  end if;
end;
$assert$;
