-- M45 — The Roulé Rodrigues delivery network: drivers, jobs, and the two
--       guarantees that make it trustworthy.
--
-- WHAT ALREADY EXISTED AND IS REUSED, NOT REBUILT
--   delivery_zones (5 rows, M7)  → the customer already picks a zone at
--                                  checkout and orders.delivery_fee is
--                                  snapshotted server-side. Pricing is NOT
--                                  re-invented here.
--   orders.fulfillment_method    → 'rr_delivery' already exists and already
--                                  gates on store_payment_settings.
--   notification queue (M44)     → driver offers ride on it. No second channel.
--   audit_logs                   → admin overrides land there, same as M31.
--   taxi_drivers                 → a DIFFERENT product (airport transfers,
--                                  no accounts, no jobs). Deliberately not
--                                  reused: merging them would give taxi
--                                  drivers delivery permissions.
--
-- THE TWO INVARIANTS THIS FILE EXISTS TO ENFORCE
--   1. ZERO DOUBLE ASSIGNMENT. Two drivers pressing Accept on the same job at
--      the same instant produce exactly one winner. Enforced by a conditional
--      UPDATE that only matches while the row is still unassigned — the loser
--      changes zero rows and is told so. Not by a client check, not by a
--      SELECT-then-UPDATE.
--   2. NO FAKED COMPLETION. A driver tapping "Delivered" is not proof. The
--      customer's PIN is verified server-side inside the same transaction that
--      moves the delivery to `delivered`. A driver never sees the PIN.
--
-- ON RELIABILITY, WHICH IS THE REAL PRODUCT PROBLEM
-- The brief is blunt: never let one unreliable driver silently break the
-- customer's experience. So every delivery carries EXPECTED MILESTONE
-- DEADLINES, and a sweep (M46) escalates on them. A driver who says nothing is
-- the default case, not the exception.
--
-- ON MONEY
-- customer_fee, driver_earning and platform_fee are three separate columns and
-- are never assumed equal. Defaults come from delivery_settings so the owner
-- can change the split without a deploy. Nothing here charges anyone: the
-- marketplace remains cash / bank transfer / merchant QR.

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'driver_status') then
    -- `pending` is the state an application lands in. A driver is NEVER active
    -- by submitting a form.
    create type driver_status as enum
      ('pending', 'approved', 'suspended', 'rejected', 'inactive');
  end if;
  if not exists (select 1 from pg_type where typname = 'driver_availability') then
    create type driver_availability as enum ('offline', 'available', 'busy');
  end if;
  if not exists (select 1 from pg_type where typname = 'delivery_status') then
    create type delivery_status as enum (
      'created', 'searching_driver', 'assigned',
      'going_to_pickup', 'arrived_at_pickup', 'picked_up',
      'out_for_delivery', 'arrived', 'delivered',
      -- Exceptional states. Kept explicit rather than folded into `cancelled`
      -- so the admin queue can tell "nobody accepted" from "the package is in
      -- an unreachable driver's boot", which need completely different actions.
      'cancelled', 'driver_unavailable', 'driver_unresponsive',
      'failed_delivery', 'returned_to_merchant', 'requires_admin'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'delivery_offer_status') then
    create type delivery_offer_status as enum ('offered', 'accepted', 'declined', 'expired', 'withdrawn');
  end if;
end;
$$;

-- ── Operational settings — no magic numbers in code ─────────────────────────
create table if not exists delivery_settings (
  id                        text primary key default 'main' check (id = 'main'),
  -- Capacity. Two is a deliberate starting point for an island where a driver
  -- on a scooter cannot realistically juggle more; the owner can raise it.
  max_active_deliveries     integer not null default 2 check (max_active_deliveries between 1 and 20),
  -- Milestone thresholds, in minutes. These drive the escalation sweep.
  accept_window_minutes     integer not null default 10 check (accept_window_minutes between 1 and 240),
  pickup_window_minutes     integer not null default 45 check (pickup_window_minutes between 5 and 480),
  delivery_window_minutes   integer not null default 90 check (delivery_window_minutes between 5 and 960),
  -- How long after a missed milestone before the driver is nudged, then warned,
  -- then declared unresponsive.
  reminder_after_minutes    integer not null default 10 check (reminder_after_minutes between 1 and 240),
  unresponsive_after_minutes integer not null default 25 check (unresponsive_after_minutes between 2 and 480),
  -- The split. Percentages of the customer's delivery fee. Industry practice
  -- for last-mile courier work is roughly 75-85% to the courier; 80/20 is the
  -- starting point and is fully configurable.
  driver_share_percent      integer not null default 80 check (driver_share_percent between 0 and 100),
  -- How many drivers an offer goes to at once. Broadcasting to everyone is
  -- simple and correct on an island with a handful of drivers; a wider
  -- algorithm can come later.
  offer_batch_size          integer not null default 10 check (offer_batch_size between 1 and 100),
  auto_reassign_before_pickup boolean not null default true,
  updated_at                timestamptz not null default now()
);
insert into delivery_settings (id) values ('main') on conflict (id) do nothing;

alter table delivery_settings enable row level security;
create policy delivery_settings_public_read on delivery_settings for select using (true);
revoke insert, update, delete on delivery_settings from anon, authenticated;

comment on table delivery_settings is
  'Every operational dial for the delivery network on one row, so the owner can retune capacity, timeouts and the driver share without a deploy (M45).';

-- ── Drivers ─────────────────────────────────────────────────────────────────
-- A driver is a REAL auth user with a lightweight profile — reusing Supabase
-- Auth rather than inventing a second identity system. They are deliberately
-- NOT merchants: no merchant_staff row, no store, no subscription. The M40
-- lesson applies here too — an internal schema convenience must not hand
-- somebody a role the product never intended.
create table if not exists delivery_drivers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  full_name          text not null check (btrim(full_name) <> ''),
  phone              text not null check (phone ~ '^\+[1-9][0-9]{6,15}$'),
  photo_url          text,
  vehicle_type       text not null default 'scooter',
  vehicle_details    text,
  licence_reference  text,
  -- Private documents live in a PRIVATE bucket; this is only the object path,
  -- never a public URL. Customers never see any of this.
  licence_doc_path   text,
  emergency_contact  text,
  service_zone_ids   uuid[] not null default '{}',
  preferred_hours    text,
  experience_note    text,
  status             driver_status not null default 'pending',
  availability       driver_availability not null default 'offline',
  status_reason      text,
  terms_accepted_at  timestamptz,
  approved_at        timestamptz,
  approved_by        uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists delivery_drivers_status_idx on delivery_drivers (status, availability);
create index if not exists delivery_drivers_user_idx on delivery_drivers (user_id);

drop trigger if exists t_delivery_drivers_updated on delivery_drivers;
create trigger t_delivery_drivers_updated before update on delivery_drivers
  for each row execute function set_updated_at();

comment on table delivery_drivers is
  'Delivery partners. A real auth user with a lightweight profile — NOT a merchant: no merchant_staff row, no store, no subscription. Approval is an admin act; submitting the form only produces `pending` (M45).';
comment on column delivery_drivers.licence_doc_path is
  'Object path in the PRIVATE driver-docs bucket, never a public URL. Customers and merchants never see driver documents.';

-- Reliability, measured rather than assumed. Maintained by the delivery
-- lifecycle so it cannot be gamed from the client, and deliberately NOT
-- reducible to customer ratings alone.
create table if not exists driver_metrics (
  driver_id            uuid primary key references delivery_drivers(id) on delete cascade,
  offers_received      integer not null default 0,
  offers_accepted      integer not null default 0,
  deliveries_completed integer not null default 0,
  deliveries_failed    integer not null default 0,
  driver_cancellations integer not null default 0,
  unresponsive_events  integer not null default 0,
  on_time_deliveries   integer not null default 0,
  rating_sum           integer not null default 0,
  rating_count         integer not null default 0,
  updated_at           timestamptz not null default now()
);

comment on table driver_metrics is
  'Server-computed reliability inputs. Never written by a driver. Completion, punctuality, cancellations and unresponsive incidents all count — a driver cannot look reliable on customer ratings alone (M45).';

-- ── Deliveries ──────────────────────────────────────────────────────────────
create table if not exists deliveries (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null unique references orders(id) on delete cascade,
  store_id           uuid not null references stores(id) on delete restrict,
  zone_id            uuid references delivery_zones(id) on delete set null,
  driver_id          uuid references delivery_drivers(id) on delete set null,
  status             delivery_status not null default 'created',
  -- Money, three separate numbers because they are three different things.
  customer_fee       integer not null default 0 check (customer_fee >= 0),
  driver_earning     integer not null default 0 check (driver_earning >= 0),
  platform_fee       integer not null default 0 check (platform_fee >= 0),
  -- Destination. GPS is the locator on this island; the address is the note.
  dropoff_lat        double precision check (dropoff_lat between -90 and 90),
  dropoff_lng        double precision check (dropoff_lng between -180 and 180),
  dropoff_note       text,
  -- Proof of delivery. The driver never sees this; the customer reads it out.
  pin                text not null,
  pin_attempts       integer not null default 0,
  -- Expected milestones, stamped when the clock for each starts. The sweep
  -- compares against these rather than against one global timeout, because
  -- "hasn't accepted in 10 minutes" and "hasn't delivered in 90" are different
  -- failures needing different responses.
  offer_expires_at   timestamptz,
  pickup_due_at      timestamptz,
  delivery_due_at    timestamptz,
  assigned_at        timestamptz,
  picked_up_at       timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  failure_reason     text,
  admin_note         text,
  reassignment_count integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint deliveries_delivered_shape
    check ((status = 'delivered') = (delivered_at is not null))
);
create index if not exists deliveries_status_idx on deliveries (status, created_at desc);
create index if not exists deliveries_driver_idx on deliveries (driver_id, status);
create index if not exists deliveries_store_idx on deliveries (store_id, created_at desc);
create index if not exists deliveries_open_idx on deliveries (status)
  where status in ('searching_driver', 'assigned', 'going_to_pickup', 'arrived_at_pickup',
                   'picked_up', 'out_for_delivery', 'arrived');

drop trigger if exists t_deliveries_updated on deliveries;
create trigger t_deliveries_updated before update on deliveries
  for each row execute function set_updated_at();

comment on column deliveries.pin is
  'Customer proof of delivery. NEVER granted to a driver or exposed in a driver-facing payload: the driver types what the customer reads aloud and the server compares. A driver pressing "Delivered" is not proof (M45).';

-- One row per driver per delivery offer, so "who was asked, who declined, who
-- never answered" is a fact rather than an inference.
create table if not exists delivery_offers (
  id           uuid primary key default gen_random_uuid(),
  delivery_id  uuid not null references deliveries(id) on delete cascade,
  driver_id    uuid not null references delivery_drivers(id) on delete cascade,
  status       delivery_offer_status not null default 'offered',
  offered_at   timestamptz not null default now(),
  responded_at timestamptz,
  expires_at   timestamptz,
  unique (delivery_id, driver_id)
);
create index if not exists delivery_offers_driver_idx on delivery_offers (driver_id, status);
create index if not exists delivery_offers_delivery_idx on delivery_offers (delivery_id, status);

-- The audit trail. Disputes are the whole reason this exists: "the driver says
-- he delivered it, the customer says he didn't" is answerable only if every
-- transition was recorded with who and when.
create table if not exists delivery_events (
  id          bigint generated always as identity primary key,
  delivery_id uuid not null references deliveries(id) on delete cascade,
  actor_type  text not null check (actor_type in ('driver', 'customer', 'merchant', 'admin', 'system')),
  actor_id    uuid,
  action      text not null,
  from_status delivery_status,
  to_status   delivery_status,
  reason      text,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists delivery_events_delivery_idx on delivery_events (delivery_id, created_at);

comment on table delivery_events is
  'Append-only audit of every delivery transition: who acted, what changed, why. This is what makes a "he said / she said" dispute answerable (M45).';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table delivery_drivers enable row level security;
alter table driver_metrics   enable row level security;
alter table deliveries       enable row level security;
alter table delivery_offers  enable row level security;
alter table delivery_events  enable row level security;

-- A driver reads and edits their OWN profile, and can never change their own
-- status: approval and suspension are admin acts, so the column is protected
-- by a column grant rather than by trusting the client.
drop policy if exists delivery_drivers_self_read on delivery_drivers;
create policy delivery_drivers_self_read on delivery_drivers for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());

drop policy if exists delivery_drivers_self_update on delivery_drivers;
create policy delivery_drivers_self_update on delivery_drivers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists driver_metrics_self_read on driver_metrics;
create policy driver_metrics_self_read on driver_metrics for select to authenticated
  using (exists (select 1 from delivery_drivers d
                  where d.id = driver_metrics.driver_id
                    and (d.user_id = auth.uid() or is_platform_admin())));

-- A driver sees a delivery only while it is OFFERED to them or ASSIGNED to
-- them. Not the whole queue, not another driver's job, and never after it is
-- reassigned away.
drop policy if exists deliveries_driver_read on deliveries;
create policy deliveries_driver_read on deliveries for select to authenticated
  using (
    is_platform_admin()
    or exists (select 1 from delivery_drivers d
                where d.id = deliveries.driver_id and d.user_id = auth.uid())
    or exists (select 1 from delivery_offers o
                join delivery_drivers d on d.id = o.driver_id
               where o.delivery_id = deliveries.id
                 and d.user_id = auth.uid()
                 and o.status = 'offered')
    -- The shop whose order it is.
    or is_store_staff(deliveries.store_id)
  );

drop policy if exists delivery_offers_driver_read on delivery_offers;
create policy delivery_offers_driver_read on delivery_offers for select to authenticated
  using (
    is_platform_admin()
    or exists (select 1 from delivery_drivers d
                where d.id = delivery_offers.driver_id and d.user_id = auth.uid())
  );

drop policy if exists delivery_events_read on delivery_events;
create policy delivery_events_read on delivery_events for select to authenticated
  using (
    is_platform_admin()
    or exists (select 1 from deliveries dl
                where dl.id = delivery_events.delivery_id
                  and (is_store_staff(dl.store_id)
                       or exists (select 1 from delivery_drivers d
                                   where d.id = dl.driver_id and d.user_id = auth.uid())))
  );

-- WRITES ARE NEVER CLIENT-SIDE. Every state change goes through a SECURITY
-- DEFINER RPC that validates the transition. A driver with a REST client must
-- not be able to set status='delivered' directly, which is exactly what an
-- UPDATE grant would allow.
revoke all on deliveries      from anon, authenticated;
revoke all on delivery_offers from anon, authenticated;
revoke all on delivery_events from anon, authenticated;
revoke all on driver_metrics  from anon, authenticated;
revoke all on delivery_drivers from anon, authenticated;

-- Readable columns only, and `pin` is not among them — a driver must never be
-- able to read the code they are supposed to be told.
grant select (id, order_id, store_id, zone_id, driver_id, status, customer_fee,
              driver_earning, dropoff_lat, dropoff_lng, dropoff_note,
              offer_expires_at, pickup_due_at, delivery_due_at, assigned_at,
              picked_up_at, delivered_at, failure_reason, reassignment_count, created_at)
  on deliveries to authenticated;
grant select on delivery_offers to authenticated;
grant select on delivery_events to authenticated;
grant select on driver_metrics to authenticated;
grant select (id, user_id, full_name, phone, photo_url, vehicle_type, vehicle_details,
              service_zone_ids, preferred_hours, experience_note, status, availability,
              status_reason, approved_at, created_at)
  on delivery_drivers to authenticated;
-- A driver may edit their own profile fields — but NOT status, NOT approved_at,
-- and NOT the licence document path.
grant update (full_name, phone, photo_url, vehicle_type, vehicle_details,
              service_zone_ids, preferred_hours, experience_note, emergency_contact, availability)
  on delivery_drivers to authenticated;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  -- The PIN is the anti-fraud control. If a driver can read it, the whole
  -- proof-of-delivery mechanism is theatre.
  if has_column_privilege('authenticated', 'public.deliveries', 'pin', 'SELECT') then
    raise exception 'M45: a driver can read deliveries.pin.';
  end if;
  -- A driver must not be able to promote themselves.
  if has_column_privilege('authenticated', 'public.delivery_drivers', 'status', 'UPDATE') then
    raise exception 'M45: a driver can change their own approval status.';
  end if;
  if has_column_privilege('authenticated', 'public.delivery_drivers', 'licence_doc_path', 'SELECT') then
    raise exception 'M45: driver documents are readable by client roles.';
  end if;
  -- No direct writes to the lifecycle tables.
  if has_table_privilege('authenticated', 'public.deliveries', 'UPDATE')
     or has_table_privilege('authenticated', 'public.deliveries', 'INSERT') then
    raise exception 'M45: a client role can write deliveries directly.';
  end if;
  if has_table_privilege('anon', 'public.delivery_drivers', 'SELECT') then
    raise exception 'M45: anon can read driver records.';
  end if;
end;
$$;
