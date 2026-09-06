-- ── Booked time, for a business that sells it ──────────────────────────────
--
-- The owner: "now build the booked slots and calendar for services."
--
-- ── WHAT IS REUSED, AND WHAT COULD NOT BE ──────────────────────────────────
-- Availability is `store_hours`, which already exists, already supports both a
-- recurring weekday and a specific date, and is already editable at
-- /merchant/hours. A service provider's availability IS their opening hours,
-- and a second calendar of "when I work" would immediately disagree with the
-- one the storefront reads.
--
-- food_pickup_slots() was the obvious model and is a good one — days × opening
-- hours × lead time, with a REASON when a day yields nothing. But it could not
-- simply be widened, because of the one thing that makes a service different:
--
--   A FOOD SLOT IS NOT CONSUMED. Twenty people can collect at 18:30. A car wash
--   can wash two cars at once, and the twenty-first booking at 09:00 is not a
--   busy morning, it is a promise nobody can keep.
--
-- So slots here are counted against real bookings, and the capacity lives on
-- the provider rather than on the platform.
alter table trade_providers
  -- How long the diary is cut into. 30 minutes suits a wash; a plumber may want
  -- 60. Not a platform constant: the wrong granularity makes every slot either
  -- unbookable or meaningless.
  add column if not exists slot_minutes integer not null default 30
    check (slot_minutes in (15, 30, 60)),
  -- How many jobs at once. THE number that makes this different from food.
  add column if not exists concurrent_jobs integer not null default 1
    check (concurrent_jobs between 1 and 20),
  -- Least notice they will accept. A mobile valet needs to drive there.
  add column if not exists lead_hours integer not null default 2
    check (lead_hours between 0 and 168),
  -- How far ahead the diary is open.
  add column if not exists booking_days integer not null default 14
    check (booking_days between 1 and 90);

-- ── How long each service takes ────────────────────────────────────────────
-- On the VARIANT, because that is where a price already lives: "Full detailing"
-- and "Basic wash" are two variants of one product at two prices, and they take
-- different amounts of the day. A duration on the product would make them the
-- same length or force a product per length.
create table if not exists service_durations (
  variant_id uuid primary key references product_variants(id) on delete cascade,
  minutes    integer not null check (minutes between 5 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table service_durations enable row level security;

drop policy if exists service_durations_read on service_durations;
create policy service_durations_read on service_durations
  for select using (true);

grant select on service_durations to anon, authenticated;

comment on table service_durations is
  'How long one service takes, per product variant. Absent means the provider has not said, and the slot finder falls back to one slot.';

-- ── The diary itself ───────────────────────────────────────────────────────
create table if not exists service_bookings (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  variant_id   uuid references product_variants(id) on delete set null,
  -- Denormalised on purpose: a service renamed or deleted next year must not
  -- rewrite what somebody was booked in for, and the calendar has to render
  -- without a join to a row that may be gone.
  service_name text not null check (btrim(service_name) <> ''),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'booked'
                 check (status in ('booked', 'done', 'cancelled', 'no_show')),
  customer_name  text not null check (btrim(customer_name) <> ''),
  customer_phone text not null,
  note         text,
  -- Where it came from. Almost every booking on this island will arrive by
  -- telephone, and a diary that can only be filled by a web checkout is a
  -- diary a car wash cannot use.
  source       text not null default 'provider'
                 check (source in ('provider', 'customer', 'admin')),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint service_bookings_ends_after_start check (ends_at > starts_at)
);

create index if not exists service_bookings_store_time_idx
  on service_bookings (store_id, starts_at)
  where status = 'booked';

alter table service_bookings enable row level security;
revoke all on table service_bookings from anon, authenticated;

comment on table service_bookings is
  'A booked appointment for a trade. RPC-only: the rows carry a customer name and phone. Capacity is enforced in book_service_slot, not by a constraint, because a provider may run several jobs at once.';
