-- ============================================================================
-- Roulé Rodrigues Marketplace — Core schema (Phase 1: merchant platform)
-- ----------------------------------------------------------------------------
-- Production-grade foundation for the Local Store marketplace: merchants →
-- stores → catalog (products/variants/media) → inventory ledger → orders →
-- payments → QR pickup, plus coupons, reviews and an audit trail.
--
-- Design principles:
--   • Normalised, UUID PKs, timestamptz everywhere, soft-delete via status enums.
--   • Stock is a LEDGER (inventory_movements) — the variant's stock_quantity is a
--     cached running total, never the source of truth. Auditable at scale.
--   • RLS on every table. Storefront reads are public but scoped to APPROVED
--     merchants + ACTIVE stores/products; writes are gated to store staff; the
--     platform team bypasses via is_platform_admin(); QR redemption is service-
--     role only (server-side), never client.
--   • Money is stored in minor units (integer cents) to avoid float drift.
--     currency is ISO-4217 (default 'MUR'); PayPal captures in EUR — store the
--     captured currency/amount on the payment row, not the order.
--
-- Apply on a Supabase BRANCH first (never straight to production). Customer-side
-- tables (carts, wishlists, promotions, notifications, subscriptions, support)
-- land in migration 0002 with the customer storefront phase.
-- ============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists citext;         -- case-insensitive emails/slugs

-- ── Enumerated types ────────────────────────────────────────────────────────
create type merchant_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type kyc_status      as enum ('unsubmitted', 'submitted', 'in_review', 'approved', 'rejected');
create type staff_role      as enum ('owner', 'manager', 'cashier', 'stock', 'viewer');
create type store_status    as enum ('draft', 'active', 'paused', 'holiday', 'closed');
create type product_status  as enum ('draft', 'active', 'archived');
create type order_status    as enum ('pending_payment', 'paid', 'preparing', 'ready_for_pickup', 'collected', 'cancelled', 'refunded');
create type payment_provider as enum ('paypal', 'mcb_juice', 'cash', 'manual');
create type payment_status  as enum ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');
create type movement_reason as enum ('restock', 'sale', 'return', 'adjustment', 'damage', 'transfer');
create type review_status   as enum ('pending', 'published', 'rejected');
create type media_kind      as enum ('image', 'video');

-- ── Shared helpers ──────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Platform staff (super-admins). Kept as a table so admin access is data-driven,
-- auditable and revocable — not a brittle JWT claim.
create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'admin',        -- admin | support | finance | ...
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- ============================================================================
-- MERCHANTS & STAFF
-- ============================================================================
create table merchants (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete restrict,
  legal_name     text not null,
  display_name   text not null,
  contact_email  citext,
  contact_phone  text,
  status         merchant_status not null default 'pending',
  kyc_status     kyc_status not null default 'unsubmitted',
  kyc_documents  jsonb not null default '[]',        -- [{type,url,uploaded_at}]
  commission_rate numeric(5,4) not null default 0.10 check (commission_rate >= 0 and commission_rate <= 1),
  payout_details jsonb not null default '{}',        -- {method, account, ...} (never card numbers)
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on merchants (owner_id);
create index on merchants (status);
create trigger t_merchants_updated before update on merchants for each row execute function set_updated_at();

-- Staff link a user to a merchant with a role + fine-grained permission overrides.
create table merchant_staff (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        staff_role not null default 'viewer',
  permissions jsonb not null default '{}',           -- optional overrides on top of role
  created_at  timestamptz not null default now(),
  unique (merchant_id, user_id)
);
create index on merchant_staff (user_id);

create or replace function is_merchant_staff(_merchant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from merchant_staff where merchant_id = _merchant and user_id = auth.uid());
$$;
-- is_store_staff() and the visibility helpers are defined below, after the
-- stores/merchants tables exist (a `language sql` body is validated at CREATE).

-- ============================================================================
-- STORES
-- ============================================================================
create table stores (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  name          text not null,
  slug          citext not null unique,
  tagline       text,
  description   text,
  logo_url      text,
  cover_url     text,
  status        store_status not null default 'draft',
  category_hint text,                                 -- supermarket | pharmacy | hardware | ...
  phone         text,
  whatsapp      text,
  address       text,
  lat           double precision,
  lng           double precision,
  currency      char(3) not null default 'MUR',
  tax_inclusive boolean not null default true,
  default_tax_rate numeric(5,4) not null default 0 check (default_tax_rate >= 0 and default_tax_rate <= 1),
  pickup_config jsonb not null default '{}',          -- {prep_minutes, slots, instructions}
  fulfillment   jsonb not null default '{"pickup":true,"delivery":false}',
  rating_avg    numeric(3,2) not null default 0,
  rating_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on stores (merchant_id);
create index on stores (status);
create trigger t_stores_updated before update on stores for each row execute function set_updated_at();

-- Weekly opening hours + holidays (own table for clean querying/overrides).
create table store_hours (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references stores(id) on delete cascade,
  weekday    smallint check (weekday between 0 and 6),   -- 0 = Sunday; null = holiday override
  date       date,                                       -- set for a specific holiday/exception
  opens_at   time,
  closes_at  time,
  is_closed  boolean not null default false,
  note       text
);
create index on store_hours (store_id);

-- ============================================================================
-- CATALOG: categories → products → variants → media
-- ============================================================================
-- Global, hierarchical platform taxonomy (Supermarket › Fresh › Produce …).
create table categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references categories(id) on delete set null,
  name       text not null,
  slug       citext not null unique,
  icon       text,
  position   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index on categories (parent_id);

create table products (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  slug          citext not null,
  brand         text,
  description   text,
  status        product_status not null default 'draft',
  has_variants  boolean not null default false,
  -- denormalised "from" price (minor units) for fast listing/sort; kept in sync
  -- from variants by the application/trigger layer.
  min_price     integer not null default 0 check (min_price >= 0),
  currency      char(3) not null default 'MUR',
  tax_rate      numeric(5,4),                          -- null → inherit store default
  attributes    jsonb not null default '{}',           -- {axes:["color","size"], ...}
  seo           jsonb not null default '{}',
  -- Stored FTS vector (Postgres-recommended over a functional index: computed
  -- once on write, indexed directly, never recomputed per query).
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(description,''))
  ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, slug)
);
-- Composite + partial indexes for the real hot paths (catalog at millions of rows):
create index products_store_status_idx    on products (store_id, status);
create index products_category_status_idx on products (category_id, status);
create index products_store_active_idx    on products (store_id) where status = 'active';
create index products_created_idx         on products (created_at desc);
create index products_search_idx          on products using gin (search_vector);
create trigger t_products_updated before update on products for each row execute function set_updated_at();

-- Every product has ≥1 variant (a "default" variant when has_variants = false).
-- Stock and barcodes live here.
create table product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  sku           text,
  barcode       text,                                  -- EAN/UPC for barcode scanning
  name          text,                                  -- "Red / L"; null for default
  options       jsonb not null default '{}',           -- {color:"red", size:"L"}
  price         integer not null check (price >= 0),    -- minor units
  compare_at    integer check (compare_at >= 0),        -- was-price for sale display
  cost          integer check (cost >= 0),              -- for profit reports
  weight_grams  integer,
  stock_quantity integer not null default 0,            -- CACHE of inventory_movements
  low_stock_threshold integer not null default 0,
  is_active     boolean not null default true,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_id, sku)
);
create index on product_variants (product_id);
create index on product_variants (barcode);
-- Merchant "low stock" view: partial index covering only currently-low rows.
create index variants_low_stock_idx on product_variants (product_id) where stock_quantity <= low_stock_threshold;
create trigger t_variants_updated before update on product_variants for each row execute function set_updated_at();

create table product_media (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  kind       media_kind not null default 'image',
  url        text not null,
  alt        text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index on product_media (product_id);
create index on product_media (variant_id);

-- ── Inventory ledger — the source of truth for stock ────────────────────────
create table inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references product_variants(id) on delete cascade,
  delta       integer not null,                        -- +restock / −sale
  reason      movement_reason not null,
  order_id    uuid,                                    -- FK added after orders exists
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on inventory_movements (variant_id);
create index on inventory_movements (order_id);
create index on inventory_movements (created_by);
create index on inventory_movements (created_at desc);

-- Keep the variant's cached stock_quantity in sync with the ledger.
create or replace function apply_inventory_movement() returns trigger
language plpgsql as $$
begin
  update product_variants
     set stock_quantity = stock_quantity + new.delta
   where id = new.variant_id;
  return new;
end $$;
create trigger t_inventory_apply after insert on inventory_movements
  for each row execute function apply_inventory_movement();

-- ============================================================================
-- ORDERS · ITEMS · PAYMENTS · QR PICKUP
-- ============================================================================
-- One order per store (marketplace carts split per merchant at checkout).
create table orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text not null unique,                 -- human ref, e.g. RS-7F3A21
  store_id       uuid not null references stores(id) on delete restrict,
  customer_id    uuid references auth.users(id) on delete set null,
  customer_name  text,
  customer_phone text,
  status         order_status not null default 'pending_payment',
  subtotal       integer not null default 0,           -- minor units
  discount       integer not null default 0,
  tax            integer not null default 0,
  total          integer not null default 0,
  currency       char(3) not null default 'MUR',
  commission_amount integer not null default 0,        -- platform cut, computed at capture
  coupon_id      uuid,
  pickup_slot    tstzrange,
  notes          text,
  placed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on orders (customer_id);
-- Merchant dashboard lists a store's orders by status, newest first — one
-- composite serves it and store-only listings (store_id is the left prefix).
create index orders_store_status_created_idx on orders (store_id, status, created_at desc);
-- Admin cross-store views filter by status over time.
create index orders_status_created_idx on orders (status, created_at desc);
create trigger t_orders_updated before update on orders for each row execute function set_updated_at();

-- Now that orders exists, wire the inventory ledger FK.
alter table inventory_movements
  add constraint inventory_movements_order_fk
  foreign key (order_id) references orders(id) on delete set null;

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  variant_id    uuid references product_variants(id) on delete set null,
  -- snapshots so the receipt never changes if the product is later edited
  product_name  text not null,
  variant_name  text,
  sku           text,
  unit_price    integer not null check (unit_price >= 0),
  quantity      integer not null check (quantity > 0),
  line_total    integer not null check (line_total >= 0),
  created_at    timestamptz not null default now()
);
create index on order_items (order_id);
create index on order_items (variant_id);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  provider      payment_provider not null,
  provider_ref  text,                                  -- PayPal capture id / MCB txn ref
  amount        integer not null,                      -- amount actually charged (minor units)
  currency      char(3) not null,                      -- may differ from order (PayPal EUR)
  status        payment_status not null default 'pending',
  raw           jsonb not null default '{}',           -- provider payload (audit)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on payments (order_id);
create index on payments (provider, provider_ref);
create trigger t_payments_updated before update on payments for each row execute function set_updated_at();

-- QR pickup: we store only a HASH of the token; the raw signed token lives in the
-- customer's app/receipt. Redemption is single-use + time-limited, performed
-- server-side (service role) which atomically stamps redeemed_at.
create table qr_pickup_tokens (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  token_hash  text not null unique,                    -- sha256(signed token)
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index on qr_pickup_tokens (order_id);

-- ============================================================================
-- GROWTH: coupons · reviews
-- ============================================================================
create table coupons (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid references stores(id) on delete cascade,   -- null = platform-wide
  code            citext not null,
  discount_type   text not null check (discount_type in ('percent','fixed')),
  value           integer not null check (value >= 0),            -- percent (0-100) or minor units
  min_order       integer not null default 0,
  usage_limit     integer,
  used_count      integer not null default 0,
  per_customer_limit integer,
  starts_at       timestamptz,
  expires_at      timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (store_id, code),
  check (discount_type <> 'percent' or value <= 100)      -- percent coupons cap at 100
);

-- Wire the orders.coupon_id FK now that coupons exists, and index it.
alter table orders add constraint orders_coupon_fk
  foreign key (coupon_id) references coupons(id) on delete set null;
create index on orders (coupon_id);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  product_id  uuid references products(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,      -- verified-purchase link
  customer_id uuid references auth.users(id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  title       text,
  body        text,
  status      review_status not null default 'pending',
  created_at  timestamptz not null default now()
);
create index on reviews (store_id);
create index on reviews (product_id);
create index on reviews (order_id);
create index on reviews (customer_id);
-- One review per customer per product.
create unique index reviews_one_per_customer_product on reviews (customer_id, product_id)
  where customer_id is not null and product_id is not null;

-- ============================================================================
-- AUDIT
-- ============================================================================
create table audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_role  text,
  action      text not null,                            -- 'product.update', 'order.refund', ...
  entity_type text,
  entity_id   text,
  diff        jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index on audit_logs (entity_type, entity_id);
create index on audit_logs (created_at desc);

-- ============================================================================
-- DENORMALISATION TRIGGERS — keep cached aggregates trustworthy
-- ============================================================================
-- products.min_price = cheapest active variant (0 if none). Storefront sorts and
-- filters on this instead of a per-query MIN() over variants.
create or replace function sync_product_min_price() returns trigger
language plpgsql as $$
declare _pid uuid := coalesce(new.product_id, old.product_id);
begin
  update products p set min_price = coalesce(
    (select min(v.price) from product_variants v where v.product_id = _pid and v.is_active), 0)
  where p.id = _pid;
  return null;
end $$;
create trigger t_variant_min_price
  after insert or delete or update of price, is_active on product_variants
  for each row execute function sync_product_min_price();

-- stores.rating_avg / rating_count from PUBLISHED reviews only.
create or replace function sync_store_rating() returns trigger
language plpgsql as $$
declare _sid uuid := coalesce(new.store_id, old.store_id);
begin
  update stores s set
    rating_count = (select count(*) from reviews r where r.store_id = _sid and r.status = 'published'),
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r
                             where r.store_id = _sid and r.status = 'published'), 0)
  where s.id = _sid;
  return null;
end $$;
create trigger t_review_store_rating
  after insert or delete or update of rating, status on reviews
  for each row execute function sync_store_rating();

-- ── RLS helper functions (defined here, after their tables exist) ───────────
-- SECURITY DEFINER so they bypass RLS internally — this both prevents policy
-- recursion and lets an anon storefront visitor test "is this merchant approved"
-- without being able to read the merchants table directly.
create or replace function is_store_staff(_store uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from stores s
    join merchant_staff ms on ms.merchant_id = s.merchant_id
    where s.id = _store and ms.user_id = auth.uid()
  );
$$;

create or replace function merchant_is_approved(_merchant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from merchants where id = _merchant and status = 'approved');
$$;

create or replace function store_is_visible(_store uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from stores s join merchants m on m.id = s.merchant_id
    where s.id = _store and s.status = 'active' and m.status = 'approved'
  );
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Storefront = public read of approved+active supply. Writes = store staff.
-- Platform admins bypass. Service role (server) bypasses RLS entirely and owns
-- payments, QR redemption and inventory ledger writes.
-- ============================================================================
alter table platform_admins    enable row level security;
alter table merchants          enable row level security;
alter table merchant_staff     enable row level security;
alter table stores             enable row level security;
alter table store_hours        enable row level security;
alter table categories         enable row level security;
alter table products           enable row level security;
alter table product_variants   enable row level security;
alter table product_media      enable row level security;
alter table inventory_movements enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table payments           enable row level security;
alter table qr_pickup_tokens   enable row level security;
alter table coupons            enable row level security;
alter table reviews            enable row level security;
alter table audit_logs         enable row level security;

-- platform_admins: only admins can see who the admins are.
create policy admins_select on platform_admins for select using (is_platform_admin());

-- merchants: staff of the merchant can read; owner/admin can update.
create policy merchants_read on merchants for select
  using (is_merchant_staff(id) or is_platform_admin());
create policy merchants_update on merchants for update
  using (owner_id = auth.uid() or is_platform_admin());

-- merchant_staff: a user sees their own memberships; owners/admin manage.
create policy staff_read on merchant_staff for select
  using (user_id = auth.uid() or is_merchant_staff(merchant_id) or is_platform_admin());
create policy staff_write on merchant_staff for all
  using (is_platform_admin() or exists (
    select 1 from merchants m where m.id = merchant_staff.merchant_id and m.owner_id = auth.uid()
  ))
  with check (is_platform_admin() or exists (
    select 1 from merchants m where m.id = merchant_staff.merchant_id and m.owner_id = auth.uid()
  ));

-- categories: public read of active; admin writes.
create policy categories_public_read on categories for select using (is_active or is_platform_admin());
create policy categories_admin_write on categories for all using (is_platform_admin()) with check (is_platform_admin());

-- stores: public sees ACTIVE stores of APPROVED merchants; staff/admin see all theirs.
create policy stores_public_read on stores for select using (
  is_platform_admin()
  or is_store_staff(id)
  or (status = 'active' and merchant_is_approved(merchant_id))
);
create policy stores_staff_write on stores for all
  using (is_store_staff(id) or is_platform_admin())
  with check (is_store_staff(id) or is_platform_admin());

create policy store_hours_read on store_hours for select using (
  store_is_visible(store_id) or is_store_staff(store_id) or is_platform_admin()
);
create policy store_hours_write on store_hours for all
  using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

-- products: public sees ACTIVE products of visible stores; staff manage theirs.
create policy products_public_read on products for select using (
  is_platform_admin()
  or is_store_staff(store_id)
  or (status = 'active' and store_is_visible(store_id))
);
create policy products_staff_write on products for all
  using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

-- variants & media inherit the parent product's store.
create policy variants_read on product_variants for select using (
  exists (select 1 from products p where p.id = product_variants.product_id) -- product policy already filters visibility on join reads
);
create policy variants_write on product_variants for all
  using (exists (select 1 from products p where p.id = product_variants.product_id and (is_store_staff(p.store_id) or is_platform_admin())))
  with check (exists (select 1 from products p where p.id = product_variants.product_id and (is_store_staff(p.store_id) or is_platform_admin())));

-- Media inherits the parent product's visibility (the subquery runs under the
-- caller's RLS on products), so draft/unapproved images never leak.
create policy media_read on product_media for select using (
  exists (select 1 from products p where p.id = product_media.product_id)
);
create policy media_write on product_media for all
  using (exists (select 1 from products p where p.id = product_media.product_id and (is_store_staff(p.store_id) or is_platform_admin())))
  with check (exists (select 1 from products p where p.id = product_media.product_id and (is_store_staff(p.store_id) or is_platform_admin())));

-- inventory ledger: staff of the store can read; writes go through the server
-- (service role) — no direct client insert, to keep stock trustworthy.
create policy inventory_read on inventory_movements for select using (
  exists (select 1 from product_variants v join products p on p.id = v.product_id
          where v.id = inventory_movements.variant_id and (is_store_staff(p.store_id) or is_platform_admin()))
);
-- Staff may record restocks/adjustments/returns from the dashboard, but NEVER a
-- 'sale' — sale movements are written only by the server (service role) inside
-- the order flow, so stock can't be faked down from the client.
create policy inventory_staff_insert on inventory_movements for insert with check (
  reason <> 'sale'
  and exists (select 1 from product_variants v join products p on p.id = v.product_id
              where v.id = inventory_movements.variant_id and (is_store_staff(p.store_id) or is_platform_admin()))
);

-- orders: the customer sees their own; store staff see their store's; admin all.
create policy orders_read on orders for select using (
  customer_id = auth.uid() or is_store_staff(store_id) or is_platform_admin()
);
create policy orders_staff_update on orders for update
  using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

create policy order_items_read on order_items for select using (
  exists (select 1 from orders o where o.id = order_items.order_id
          and (o.customer_id = auth.uid() or is_store_staff(o.store_id) or is_platform_admin()))
);

-- payments & QR tokens: readable by store staff / admin; mutated only by server.
create policy payments_read on payments for select using (
  exists (select 1 from orders o where o.id = payments.order_id and (is_store_staff(o.store_id) or is_platform_admin()))
);
create policy qr_read on qr_pickup_tokens for select using (
  exists (select 1 from orders o where o.id = qr_pickup_tokens.order_id and (is_store_staff(o.store_id) or is_platform_admin()))
);

-- coupons: NO public read — a public policy would let anyone enumerate every
-- active code. Customers validate a code they TYPE via a SECURITY DEFINER RPC
-- (added with checkout in 0002). Only store staff / admin list their own coupons.
create policy coupons_staff_read on coupons for select using (is_store_staff(store_id) or is_platform_admin());
create policy coupons_write on coupons for all
  using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

-- reviews: public reads PUBLISHED; the author manages their own; staff/admin moderate.
create policy reviews_public_read on reviews for select using (
  status = 'published' or customer_id = auth.uid() or is_store_staff(store_id) or is_platform_admin()
);
create policy reviews_author_write on reviews for insert with check (customer_id = auth.uid());
create policy reviews_moderate on reviews for update
  using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

-- audit_logs: admin read only; writes via server.
create policy audit_admin_read on audit_logs for select using (is_platform_admin());

-- ============================================================================
-- End of migration 0001. Next: 0002_marketplace_customer.sql
--   (carts, cart_items, wishlists, promotions, notifications, subscriptions,
--    support_tickets) + a place_order() RPC that splits carts per store,
--    reserves stock, and issues the pickup token atomically.
-- ============================================================================
