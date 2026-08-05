-- M6 step 2 of 2 — subscription foundation, per-store payment settings,
-- marketplace delivery config, and the order columns for GPS delivery and
-- payment receipts. Entirely additive: no existing column or policy is dropped,
-- and vehicle rentals / place bookings are untouched.

-- ── 1. Merchant subscriptions (replaces the commission model) ────────────────
create type subscription_plan as enum ('starter', 'standard', 'premium');
-- trialing/active = selling. past_due = inside the grace window, still selling.
-- suspended = past grace, selling blocked. cancelled = merchant left.
create type subscription_status as enum ('trialing', 'active', 'past_due', 'suspended', 'cancelled');

create table merchant_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  merchant_id         uuid not null unique references merchants(id) on delete cascade,
  plan                subscription_plan not null default 'starter',
  status              subscription_status not null default 'trialing',
  started_at          timestamptz not null default now(),
  current_period_end  timestamptz not null default (now() + interval '30 days'),
  -- Days after current_period_end during which the shop keeps selling. Named
  -- rather than hardcoded so the platform can lengthen it per merchant.
  grace_days          integer not null default 7 check (grace_days >= 0),
  cancelled_at        timestamptz,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index merchant_subscriptions_period_idx on merchant_subscriptions (current_period_end);

-- Billing history. Recurring charging is NOT implemented in this milestone —
-- rows are recorded by the platform (admin/manual today, an automated biller
-- later) so the merchant can see what they owe and what they have paid.
create table subscription_invoices (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  plan          subscription_plan not null,
  amount        integer not null check (amount >= 0),   -- minor units, like every other money column
  currency      char(3) not null default 'MUR',
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  status        text not null default 'due' check (status in ('due', 'paid', 'void')),
  paid_at       timestamptz,
  note          text,
  created_at    timestamptz not null default now()
);
create index subscription_invoices_merchant_idx on subscription_invoices (merchant_id, created_at desc);

-- Single source of truth for "may this merchant sell right now".
-- SECURITY DEFINER + stable so it can be used inside RLS and other RPCs without
-- the caller needing read access to the subscription row.
-- A merchant with NO subscription row is treated as ACTIVE, so every merchant
-- that existed before this migration keeps working until the platform assigns
-- them a plan — this milestone must not retroactively suspend anyone.
create or replace function merchant_subscription_active(_merchant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select s.status in ('trialing', 'active', 'past_due')
             and now() <= s.current_period_end + make_interval(days => s.grace_days)
      from merchant_subscriptions s
      where s.merchant_id = _merchant
    ),
    true
  );
$$;

-- Convenience wrapper for the store-scoped call sites (checkout, product writes).
create or replace function store_subscription_active(_store uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select merchant_subscription_active((select merchant_id from stores where id = _store));
$$;

alter table merchant_subscriptions enable row level security;
alter table subscription_invoices enable row level security;

-- Merchants read their own subscription + invoices; only the platform writes.
create policy merchant_subscriptions_read on merchant_subscriptions for select
  using (is_merchant_staff(merchant_id) or is_platform_admin());
create policy merchant_subscriptions_admin_write on merchant_subscriptions for all
  using (is_platform_admin()) with check (is_platform_admin());

create policy subscription_invoices_read on subscription_invoices for select
  using (is_merchant_staff(merchant_id) or is_platform_admin());
create policy subscription_invoices_admin_write on subscription_invoices for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Belt-and-braces to match the M5.1 posture: RLS decides which row, grants
-- decide which columns. Clients never write these tables at all.
revoke insert, update, delete on merchant_subscriptions from authenticated, anon;
revoke insert, update, delete on subscription_invoices from authenticated, anon;

-- ── 2. Per-store payment settings ───────────────────────────────────────────
-- Per STORE, not per merchant: one merchant may own several shops and the whole
-- cart/checkout path already resolves by store_id, so each shop gets its own
-- bank account and QR image.
create table store_payment_settings (
  store_id              uuid primary key references stores(id) on delete cascade,
  accepts_cash          boolean not null default true,
  accepts_bank_transfer boolean not null default false,
  bank_name             text,
  account_holder        text,
  account_number        text,
  qr_image_url          text,
  qr_label              text,
  payment_instructions  text,
  -- When true, the customer must attach proof of transfer before the order can
  -- move to awaiting_payment_confirmation.
  require_receipt       boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- A shop cannot switch bank transfer on without somewhere to send the money.
  constraint bank_details_present_when_enabled check (
    not accepts_bank_transfer
    or (nullif(trim(bank_name), '') is not null
        and nullif(trim(account_holder), '') is not null
        and nullif(trim(account_number), '') is not null)
  ),
  -- ...and cannot disable every method, which would make the shop unbuyable.
  constraint at_least_one_method check (accepts_cash or accepts_bank_transfer)
);

alter table store_payment_settings enable row level security;

-- Store staff manage their own settings.
create policy store_payment_settings_staff_write on store_payment_settings for all
  using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

-- Customers must see the bank details to pay. Restricted to SIGNED-IN users on
-- a publicly visible shop: bank details are semi-public (they appear on any
-- invoice) but there is no reason to let anonymous scrapers harvest every
-- merchant's account number.
create policy store_payment_settings_customer_read on store_payment_settings for select
  to authenticated
  using (store_is_visible(store_id) or is_store_staff(store_id) or is_platform_admin());

revoke insert, update, delete on store_payment_settings from anon;

-- ── 3. Marketplace-level delivery config ────────────────────────────────────
-- "Roulé Rodrigues Delivery" is a platform-operated network, so its pricing is
-- platform config, not per-merchant. Single row; values are configurable so the
-- fee can later become dynamic (distance/zone) without a schema change.
create table marketplace_settings (
  id                    text primary key default 'main' check (id = 'main'),
  delivery_enabled      boolean not null default true,
  delivery_base_fee     integer not null default 15000 check (delivery_base_fee >= 0), -- Rs 150.00
  delivery_eta_minutes  integer not null default 60 check (delivery_eta_minutes > 0),
  delivery_note         text,
  updated_at            timestamptz not null default now()
);
insert into marketplace_settings (id) values ('main') on conflict (id) do nothing;

alter table marketplace_settings enable row level security;
create policy marketplace_settings_public_read on marketplace_settings for select using (true);
create policy marketplace_settings_admin_write on marketplace_settings for all
  using (is_platform_admin()) with check (is_platform_admin());
revoke insert, update, delete on marketplace_settings from authenticated, anon;

-- ── 4. Order columns: delivery, GPS and receipt ─────────────────────────────
-- fulfillment_method was previously validated by create_order() and then thrown
-- away — the order never recorded whether the customer wanted pickup or delivery.
alter table orders
  add column if not exists fulfillment_method    text check (fulfillment_method in ('pickup', 'delivery')),
  add column if not exists delivery_fee          integer not null default 0 check (delivery_fee >= 0),
  -- GPS is the primary delivery location; a written address is only ever a note.
  add column if not exists delivery_lat          double precision check (delivery_lat between -90 and 90),
  add column if not exists delivery_lng          double precision check (delivery_lng between -180 and 180),
  add column if not exists delivery_instructions text,
  -- Storage object path in the PRIVATE order-receipts bucket, never a public URL.
  add column if not exists payment_receipt_path  text,
  add column if not exists receipt_submitted_at  timestamptz,
  -- Replaces create_order()'s hardcoded "cancel anything pending_payment for
  -- 30 minutes" reaper, which would have destroyed orders after a customer had
  -- already wired real money. NULL = never auto-release.
  add column if not exists auto_release_at       timestamptz;

-- A delivery order must carry a GPS fix; a pickup order must not pretend to.
alter table orders add constraint orders_delivery_needs_gps check (
  fulfillment_method is distinct from 'delivery'
  or (delivery_lat is not null and delivery_lng is not null)
);
