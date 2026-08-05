-- Weekly opening hours + delivery windows.
--
-- This EXTENDS the dormant store_hours table created in the very first
-- marketplace migration (20260730000001) rather than adding a new JSONB column
-- to stores. That table already had the right shape (weekday / date override /
-- opens_at / closes_at / is_closed) and already had correct RLS —
--   read : store_is_visible OR is_store_staff OR is_platform_admin
--   write: is_store_staff OR is_platform_admin
-- which is exactly "a merchant edits their own, an admin edits everyone's".
-- It had simply never been referenced by a single line of application code.
--
-- The delivery window lives in the SAME ROW as the store window on purpose:
-- it makes "delivery must start no earlier than opening and end no later than
-- closing" a row-level CHECK constraint. Split across tables or buried in JSONB
-- that rule could only be enforced by a trigger, and the requirement is that
-- invalid schedules are rejected by the database itself.
--
-- All times are Rodrigues WALL-CLOCK time (UTC+4, Indian/Mauritius, no DST).
-- `time without time zone` is the correct type for that: a shop opens at 08:00
-- local regardless of what the server clock is doing. Every comparison must go
-- through (now() at time zone 'Indian/Mauritius') — never bare now(), which is
-- UTC on this server and is four hours (and often a whole day) adrift.
alter table store_hours
  add column if not exists delivery_opens_at  time,
  add column if not exists delivery_closes_at time,
  add column if not exists delivery_closed    boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

comment on table store_hours is
  'Weekly opening + delivery windows per store. Times are Rodrigues wall-clock (UTC+4, no DST). weekday = recurring week rule; date = one-off override (holiday).';

-- A row is EITHER a recurring weekday rule OR a dated override, never both and
-- never neither. Without this the table cannot be reasoned about at all.
alter table store_hours drop constraint if exists store_hours_weekday_xor_date;

alter table store_hours add constraint store_hours_weekday_xor_date
  check ((weekday is not null) <> (date is not null));

-- Closing must be after opening. Closed days carry no times and are exempt.
alter table store_hours drop constraint if exists store_hours_open_before_close;

alter table store_hours add constraint store_hours_open_before_close
  check (
    is_closed
    or (opens_at is not null and closes_at is not null and closes_at > opens_at)
  );

-- Delivery is independent of, but bounded by, the shop's own hours: a shop may
-- be open 08:00-20:00 while only delivering 09:00-18:00, but it can never
-- deliver before it opens or after it shuts, and a closed shop delivers nothing.
alter table store_hours drop constraint if exists store_hours_delivery_window;

alter table store_hours add constraint store_hours_delivery_window
  check (
    is_closed
    or delivery_closed
    or (
      delivery_opens_at is not null
      and delivery_closes_at is not null
      and delivery_closes_at >  delivery_opens_at
      and delivery_opens_at  >= opens_at
      and delivery_closes_at <= closes_at
    )
  );

-- Upsert keys. The table had none, so nothing stopped two contradictory rows
-- for the same day. Partial uniques because weekday and date are exclusive.
create unique index if not exists store_hours_weekday_key
  on store_hours (store_id, weekday) where date is null;

create unique index if not exists store_hours_date_key
  on store_hours (store_id, date) where date is not null;

-- Lookup path used by every schedule evaluation.
create index if not exists store_hours_lookup_idx
  on store_hours (store_id, weekday) include (opens_at, closes_at, is_closed);

drop trigger if exists t_store_hours_updated on store_hours;

create trigger t_store_hours_updated
  before update on store_hours
  for each row execute function set_updated_at();
