-- ── The fourth kind of business ────────────────────────────────────────────
--
-- The owner: "where the service provider dashboard? create one and assign it to
-- ninjaespion23@gmail.com so i can do tests."
--
-- There was none, and that was on purpose. lib/merchant/kind.ts said so in as
-- many words:
--
--   ADDING 'service' LATER. A car wash or a plumber sells a booked slot rather
--   than stock. When trade_providers exists it is: one member on this union,
--   one KIND_VOCAB entry, one extra probe in getAccessibleStores, and one entry
--   in the home block list. It is deliberately NOT here yet — an unreachable
--   case in a Record is the same lie as a stat card showing a zero.
--
-- This is that table, and the four changes made alongside it are exactly the
-- four it named. Nothing was invented; a previous session had already decided
-- the shape and left the instructions.
--
-- ── WHY A TABLE AND NOT A COLUMN ───────────────────────────────────────────
-- Kind is never stored on `stores`. It is DERIVED from authority tables —
-- food_kitchens makes a kitchen, events makes a box office — and those are the
-- same tables marketplace_stores excludes on, so a store's kind in the console
-- and its treatment on the storefront can never disagree. A `stores.kind`
-- column would be a second opinion, and the two would drift the first time
-- somebody wrote one without the other.
create table if not exists trade_providers (
  store_id   uuid primary key references stores(id) on delete cascade,
  -- What they actually do, in their own words: "Car wash", "Plumber",
  -- "Mechanic". Shown to a customer, so it is a label and not an enum — an
  -- island of tradespeople will not fit a list we guessed in advance.
  trade      text not null check (btrim(trade) <> ''),
  -- Do they come to the customer, or does the customer come to them? The one
  -- fact about a service that changes what the listing has to say, and the one
  -- a fulfilment setting cannot express: a service is not "delivered".
  mobile     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trade_providers enable row level security;

-- Readable by anyone who can see the store, exactly like the other two
-- authority tables — a customer browsing needs to know a shop is a car wash.
-- Written only by its own staff or an admin.
drop policy if exists trade_providers_read on trade_providers;
create policy trade_providers_read on trade_providers
  for select using (store_is_visible(store_id) or is_store_staff(store_id) or is_platform_admin());

drop policy if exists trade_providers_write on trade_providers;
create policy trade_providers_write on trade_providers
  for all using (is_store_staff(store_id) or is_platform_admin())
  with check (is_store_staff(store_id) or is_platform_admin());

-- AND THE GRANT, which is the half a policy is useless without. Learned the
-- hard way on delivery_drivers, whose self-read policy had never once run
-- because the table carried no grant at all — the /account delivery door was
-- missing for months as a result.
grant select on trade_providers to anon, authenticated;

comment on table trade_providers is
  'Authority table for MerchantKind = service. A store listed here is a trade — a car wash, a plumber — selling booked time rather than stock. Kind is derived from this, never stored on stores.';
