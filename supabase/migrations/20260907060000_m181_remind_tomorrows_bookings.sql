-- ── Nobody was reminded ────────────────────────────────────────────────────
--
-- Every other kind of booking on this platform gets a reminder the day before:
-- a scooter pickup, a scooter return, an experience, a food collection. A
-- service appointment got none. A customer books a car wash on Tuesday for
-- Saturday, and on Saturday morning neither side has been told anything since.
alter table service_bookings
  add column if not exists reminded_at timestamptz;

comment on column service_bookings.reminded_at is
  'Set when the day-before reminder went out. Stamped per booking even though the provider gets one digest, so a booking made late on the eve is not re-reminded and a re-run of the cron sends nothing.';

create index if not exists service_bookings_reminder_idx
  on service_bookings (starts_at) where status = 'booked' and reminded_at is null;

-- ── Why `drop table if exists` and not just `on commit drop` ───────────────
-- `on commit drop` drops at COMMIT, not at the end of the function, so calling
-- this twice inside one transaction died with "relation _due already exists".
-- In production the cron calls it once per request and each call is its own
-- transaction, so it would never have fired there — it fired in the first
-- probe. A function that only works when called once per transaction is a trap
-- for the next caller: a retry wrapper, a backfill loop, or an admin running it
-- by hand twice to check.
create or replace function public.remind_tomorrows_bookings()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_zone constant text := 'Indian/Mauritius';
  v_day date := ((now() at time zone v_zone)::date + 1);
  v_providers int := 0;
  v_customers int := 0;
  v_guests int := 0;
  v_rows int := 0;
begin
  -- Cron-only. Reached through the service role, where auth.uid() is null; a
  -- signed-in caller must be an admin. Same shape as admin_service_bookings.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  drop table if exists _due;
  create temp table _due on commit drop as
  select b.id, b.store_id, b.service_name, b.starts_at, b.customer_name,
         b.customer_phone, b.created_by, s.merchant_id
    from service_bookings b
    join stores s on s.id = b.store_id
   where b.status = 'booked'
     and b.reminded_at is null
     and (b.starts_at at time zone v_zone)::date = v_day;

  select count(*) into v_rows from _due;
  if v_rows = 0 then
    return jsonb_build_object('ok', true, 'day', v_day, 'bookings', 0,
                              'providers', 0, 'customers', 0, 'guests', 0);
  end if;

  -- ── The provider's list for tomorrow ─────────────────────────────────
  -- One digest, not one alert per job. A car wash with six appointments does
  -- not want six notifications; they want tomorrow's list. That is also the
  -- difference between a bell people read and a bell people mute.
  with per_store as (
    select store_id, merchant_id,
           count(*) as n,
           string_agg(to_char(starts_at at time zone v_zone, 'HH24:MI') || '  ' || service_name
                      || ' — ' || customer_name || ' (' || customer_phone || ')',
                      E'\n' order by starts_at) as lines
      from _due group by store_id, merchant_id
  ),
  ins as (
    insert into notifications (recipient_type, recipient_id, type, title, body, data,
                               category, priority, link, dedupe_key)
    select 'merchant', ms.user_id, 'service_bookings_tomorrow',
           case when p.n = 1 then '1 booking tomorrow' else p.n || ' bookings tomorrow' end,
           p.lines,
           jsonb_build_object('storeId', p.store_id, 'date', v_day, 'count', p.n),
           'bookings', 'normal', '/merchant/diary',
           -- Belt and braces beside reminded_at: if the cron runs twice in a
           -- day, or a second booking for the same store arrives between runs,
           -- the digest is still one row per person per store per day.
           'svc-tomorrow:' || p.store_id || ':' || v_day || ':' || ms.user_id
      from per_store p
      join stores s on s.id = p.store_id
      join merchant_staff ms on ms.merchant_id = s.merchant_id
    on conflict do nothing
    returning 1
  )
  select count(*) into v_providers from ins;

  -- ── The customer, WHEN THERE IS ONE TO REACH ─────────────────────────
  -- created_by is null for a guest, and a guest left only a telephone number:
  -- the public booking door takes no email and no account, on purpose. This
  -- platform has no SMS, so a guest genuinely cannot be reminded — which is
  -- counted and returned rather than passed over in silence, because "0
  -- reminders sent" and "4 people we had no way to reach" are different facts.
  with ins as (
    insert into notifications (recipient_type, recipient_id, type, title, body, data,
                               category, priority, link, dedupe_key)
    select 'customer', d.created_by, 'service_booking_tomorrow',
           d.service_name || ' tomorrow',
           to_char(d.starts_at at time zone v_zone, 'HH24:MI') || ' with ' || s.name,
           jsonb_build_object('bookingId', d.id, 'storeId', d.store_id,
                              'startsAt', d.starts_at),
           'bookings', 'normal', '/shop/' || s.slug,
           'svc-mine:' || d.id
      from _due d
      join stores s on s.id = d.store_id
     where d.created_by is not null
    on conflict do nothing
    returning 1
  )
  select count(*) into v_customers from ins;

  select count(*) into v_guests from _due where created_by is null;

  update service_bookings b
     set reminded_at = now()
    from _due d
   where b.id = d.id;

  return jsonb_build_object('ok', true, 'day', v_day, 'bookings', v_rows,
                            'providers', v_providers, 'customers', v_customers,
                            'guests', v_guests);
end $function$;

revoke all on function public.remind_tomorrows_bookings() from public, anon, authenticated;
