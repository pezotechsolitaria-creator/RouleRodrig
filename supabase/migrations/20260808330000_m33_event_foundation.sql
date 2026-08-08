-- M33 — Event foundation. The first ticketing migration.
--
-- NUMBERING: T1 was planned as "M27". M27–M32 were taken in the meantime by
-- the pickup-code / reviews / admin-delete work, so ticketing starts at M33.
--
-- ── THE ARCHITECTURAL DECISION ──────────────────────────────────────────────
-- An EVENT IS A STORE. This table is a 1:1 extension of `stores`, not a
-- replacement for it, and that single choice is what makes ticketing reuse
-- rather than duplicate:
--
--   zero overselling   → product_variants.stock_quantity + `for update` +
--                        the inventory_movements ledger. Proven under real
--                        8-way concurrency: 3 units, 8 racing buyers, 3 sold.
--   reservations       → auto_release_at, expire_order(), max_open_reservations
--   payment methods    → store_payment_settings, per store, already enforced
--   cash / transfer    → the whole M6→M21 handshake, untouched
--   organiser identity → merchants + merchant_staff + existing RLS
--   money              → order_financials, all four monetization models
--   guest access       → lookup_order(number, email)
--   checkout           → create_order(), including RR012 price integrity
--
-- A ticket type will be a product_variant, so capacity IS stock_quantity. The
-- only genuinely new primitive in the whole design is `tickets` (a serialized
-- admission identity), which lands in a later migration.
--
-- ── TWO REVIEW FINDINGS, CORRECTED BY MEASUREMENT ───────────────────────────
-- S1 (predicted 🔴 "store_schedule_status refuses a store with no opening
--     hours, so every ticket sale fails with RR010") IS WRONG. Probed against
--     this database: a store with no store_hours rows returns
--     has_schedule=false, is_open=true, delivery_available=true. Events are
--     always-open by default and need no workaround. The predicted blocker does
--     not exist, and building a fix for it would have been pure complexity.
--
-- S8 ("draft events must not be purchasable") is FREE. store_is_visible()
--     already gates on stores.status, whose enum is
--     draft|active|paused|holiday|closed. A draft event is unpurchasable by
--     construction; publishing is `status = 'active'`. No new concept.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ────────────────────────────
-- No ticket_types, no tickets, no check-ins, no gates, no QR. Those depend on
-- decisions this table does not make, and shipping an empty `tickets` table now
-- would be speculative. This migration is only: what is an event, when is it,
-- where is it, and has it been cancelled.

-- ── 1. The event ────────────────────────────────────────────────────────────
create table if not exists events (
  -- PK *is* the FK. Enforces 1:1 with a store at the schema level: an event
  -- cannot exist without its store, and a store cannot have two events.
  store_id          uuid primary key references stores(id) on delete cascade,

  starts_at         timestamptz not null,
  ends_at           timestamptz,
  -- R4: an explicit IANA zone, not an assumption. Rodrigues is UTC+4 with no
  -- DST, but the buyer is frequently NOT in that zone — a tourist booking from
  -- Europe must see the door time in ISLAND time, not theirs. Storing the zone
  -- beside the instant is what lets the UI render "Sat 9 Aug, 20:00 (Rodrigues)"
  -- correctly for everyone.
  timezone          text not null default 'Indian/Mauritius',
  doors_open_at     timestamptz,

  venue_name        text,
  venue_address     text,
  -- Same convention as orders.delivery_lat/lng: a GPS pin is the reliable
  -- locator on this island, a street address is the optional note.
  venue_lat         double precision,
  venue_lng         double precision,

  support_phone     text,
  terms             text,

  -- F: cancellation is a FACT with a time, not a status word. Deriving
  -- "cancelled" from a timestamp keeps it auditable (when?) and avoids adding a
  -- state to an enum that other code would have to learn.
  cancelled_at      timestamptz,
  cancelled_reason  text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint events_ends_after_start check (ends_at is null or ends_at >= starts_at),
  constraint events_doors_before_start check (doors_open_at is null or doors_open_at <= starts_at),
  constraint events_gps_pair check (
    (venue_lat is null and venue_lng is null) or (venue_lat is not null and venue_lng is not null)
  ),
  constraint events_gps_range check (
    venue_lat is null or (venue_lat between -90 and 90 and venue_lng between -180 and 180)
  ),
  constraint events_cancel_reason_needs_cancel check (
    cancelled_reason is null or cancelled_at is not null
  )
);

comment on table events is
  'A 1:1 extension of stores that turns a store into an event. The store row supplies identity, payment settings, staff, RLS and checkout compatibility; this row adds only what a store has no concept of — when it happens, where, and whether it was called off. Ticket types are product_variants, so capacity is stock_quantity and zero-overselling is inherited, not rebuilt (M33).';
comment on column events.timezone is
  'IANA zone of the VENUE, not the buyer. Rodrigues is UTC+4 with no DST, but tourists buy from other zones and must see island time.';
comment on column events.cancelled_at is
  'Cancellation as a timestamped fact rather than a status word — auditable, and it does not force every status switch in the codebase to learn a new enum member.';

-- R2: the smallest correct lifecycle. Only TWO facts are stored — the store's
-- own status (draft/active/...) and cancelled_at. Everything else an organiser
-- asks about ("are sales open?", "has it started?", "is it over?") is DERIVED
-- from now() against the timestamps. Stored lifecycle states need a job to
-- advance them and are wrong the moment that job fails.
create or replace function public.event_phase(p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when e.cancelled_at is not null then 'cancelled'
    when s.status <> 'active' then 'draft'
    when e.ends_at is not null and e.ends_at < now() then 'ended'
    when e.starts_at <= now() then 'in_progress'
    else 'upcoming'
  end
  from events e join stores s on s.id = e.store_id
  where e.store_id = p_store_id;
$$;

revoke all on function public.event_phase(uuid) from public;
grant execute on function public.event_phase(uuid) to anon, authenticated, service_role;

comment on function public.event_phase(uuid) is
  'Derived lifecycle: cancelled | draft | ended | in_progress | upcoming. Computed from stores.status, cancelled_at and the clock — never stored, so it cannot go stale (M33).';

create index if not exists events_starts_at_idx on events (starts_at)
  where cancelled_at is null;

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
alter table events enable row level security;

-- Read: exactly the storefront rule already used for products. A draft or
-- suspended event is invisible for free, because store_is_visible() already
-- encodes "approved merchant, active store" (S8).
drop policy if exists events_public_read on events;
create policy events_public_read on events
  for select to anon, authenticated
  using (store_is_visible(store_id));

-- Staff and platform admins see their own regardless of visibility, so an
-- organiser can build an event before publishing it.
drop policy if exists events_staff_read on events;
create policy events_staff_read on events
  for select to authenticated
  using (is_store_staff(store_id) or is_platform_admin());

drop policy if exists events_staff_write on events;
create policy events_staff_write on events
  for all to authenticated
  using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

revoke all on events from anon, authenticated;
grant select on events to anon, authenticated;
grant insert, update, delete on events to authenticated;

-- ── 3. R1 — tell test data apart from real data ─────────────────────────────
-- Earned the hard way: a cleanup pattern during the M23 verification would have
-- deleted a REAL customer order, because nothing distinguished it from the rows
-- the test had just created. It was caught by inspecting before deleting, which
-- is not a control — it is luck. This column is the control.
--
-- Never written by checkout: create_order does not set it, so every customer
-- order is real by default and a test row has to be marked deliberately.
alter table orders add column if not exists is_test boolean not null default false;

comment on column orders.is_test is
  'Marks an order created for testing. NEVER set by create_order — real orders are the default, and a test row must be marked on purpose. Exists so destructive cleanup can target test data by predicate instead of by a hand-written email pattern that might match a real customer (M33).';

create index if not exists orders_is_test_idx on orders (is_test) where is_test;

-- ── 4. Post-conditions ──────────────────────────────────────────────────────
do $$
declare v_phase text;
begin
  if not exists (select 1 from pg_tables where tablename = 'events') then
    raise exception 'M33: events table missing'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='orders' and column_name='is_test') then
    raise exception 'M33: orders.is_test missing'; end if;

  -- The 1:1 guarantee must be structural, not conventional.
  if (select count(*) from information_schema.table_constraints
       where table_name='events' and constraint_type='PRIMARY KEY') <> 1 then
    raise exception 'M33: events lost its primary key'; end if;

  -- anon must never write an event.
  if has_table_privilege('anon', 'events', 'INSERT')
     or has_table_privilege('anon', 'events', 'UPDATE') then
    raise exception 'M33: anon can write events'; end if;

  -- The derived lifecycle must not blow up on a store that has no event.
  select event_phase('00000000-0000-0000-0000-000000000000') into v_phase;
  if v_phase is not null then
    raise exception 'M33: event_phase returned % for a non-event store, expected null', v_phase; end if;

  -- Nothing in this migration may have disturbed checkout.
  if position('for update of v' in
       (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='create_order')) = 0 then
    raise exception 'M33: the stock row lock vanished from create_order'; end if;
end;
$$;
