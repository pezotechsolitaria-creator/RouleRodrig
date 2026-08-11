-- M50 — The food platform. A food-first ordering engine on the existing
--       commerce core, with cookers who never touch a computer.
--
-- ── THE PRODUCT DECISION ────────────────────────────────────────────────────
-- Customers care about FOOD, not about who sells it. So the customer surface is
-- a single island-wide dish catalog: search a dish, add it, pay, collect. The
-- kitchen behind a dish is metadata, never a destination.
--
-- And the cooker is not a Roulé Rodrigues user. No login, no dashboard, no
-- subscription, no tablet. The platform operator owns the catalog and the
-- orders. A cooker exists as DATA — a name, a phone, an operational note.
--
-- ── THE ARCHITECTURAL DECISION: A KITCHEN IS A STORE ────────────────────────
-- Exactly the M33 call ("an event IS a store"), for exactly the same reasons.
-- Everything a food order needs already exists and is already hardened:
--
--   server-derived prices  → create_order(), including RR012 price integrity
--   no overselling         → product_variants.stock_quantity + `for update`
--                            + the inventory_movements ledger
--   idempotent checkout    → p_idempotency_key (M10); a double-tap is one order
--   cash / bank transfer   → the whole M6→M21 payment handshake
--   guest ordering         → M20/M21, lookup_order(number, email)
--   pickup handoff         → the 8-char hashed code + QR (M28/M30)
--   delivery               → delivery_zones (M7) + the driver network (M45/M46)
--   opening hours          → store_hours + store_schedule_status()
--   notifications          → the M44 queue
--
-- Writing a second copy of any of that for food would be the most expensive
-- mistake available here. This migration adds only what a store and a product
-- genuinely have no concept of: what a dish IS, when it is served, and who
-- cooks it.
--
-- ── WHY ONE KITCHEN PER STORE, AND NOT ONE STORE FOR ALL FOOD ───────────────
-- The obvious shortcut is a single "Roulé Rodrigues Kitchen" store holding
-- every dish, because then one cart can mix anything. That shortcut is the
-- operational failure: two dishes cooked in Port Mathurin and Rivière Cocos
-- would land on ONE order, with one pickup code, at one address, with one prep
-- time. There is no way to fulfil it.
--
-- One kitchen = one store makes the mixed cart STRUCTURALLY IMPOSSIBLE rather
-- than merely discouraged: the cart is already store-scoped, orders.store_id is
-- already singular, and the pickup handoff is already per store. The customer
-- sees one catalog; the boundary only appears at the moment it matters, as
-- "this dish is cooked at another kitchen — start a separate order?".
--
-- ── AND NO COOKER MAY EVER RECEIVE A LOGIN ──────────────────────────────────
-- M40 documented this trap: stores.merchant_id → merchants.owner_id is NOT
-- NULL and t_merchant_provision_owner then inserts a merchant_staff 'owner'
-- row, so creating a store the naive way MINTS A WORKING MERCHANT DASHBOARD as
-- a side effect of a foreign key. Every kitchen therefore belongs to ONE
-- system-owned merchant (system_key = 'food'), created by
-- lib/food/platform-merchant.ts, and protected from deletion by the M40
-- trigger that already guards system merchants.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT BUILD ─────────────────────────
-- No option/modifier tables. A priced choice (Small / Large, with rice / with
-- bread) is a product_variant — which already reaches the kitchen ticket as
-- order_items.variant_name and is already priced server-side. A paid extra is
-- an ordinary cheap catalog item. Anything else is the per-order note that
-- orders.notes already carries. A modifier schema would need a new column on
-- order_items that nothing downstream reads, and would multiply the admin work
-- for a two-person operation.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE KITCHEN — public half and operational half, kept apart on purpose
-- ════════════════════════════════════════════════════════════════════════════
-- The split is not tidiness. RLS filters ROWS, never COLUMNS, and a table grant
-- makes column-level REVOKEs a no-op on this database. So a cooker's phone
-- number cannot live in a table that anon may select from — it would be one
-- `select *` away from the public API. Public-safe facts live in
-- food_kitchens; everything that identifies or contacts a cooker lives in
-- food_kitchen_ops, which has RLS on and NO policy at all: service-role only,
-- the same posture as app_secrets.

create table if not exists food_kitchens (
  -- PK is the FK: a kitchen cannot exist without its store, and a store cannot
  -- be two kitchens. Same 1:1 enforcement as events.store_id.
  store_id           uuid primary key references stores(id) on delete cascade,

  -- The honest prep estimate shown on every card from this kitchen, unless the
  -- dish overrides it. A RANGE, never a single number: a kitchen that promises
  -- "20 min" is wrong most of the time, and "15–30 min" is right most of the
  -- time. Nothing on this platform promises a delivery minute.
  prep_minutes_min   integer not null default 15 check (prep_minutes_min between 0 and 480),
  prep_minutes_max   integer not null default 30 check (prep_minutes_max between 0 and 480),

  -- A landmark, because half the collection points on this island have no
  -- street address. "Green gate beside the church, ask for Marie."
  pickup_hint        text,

  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint food_kitchens_prep_range check (prep_minutes_max >= prep_minutes_min)
);

comment on table food_kitchens is
  'A 1:1 extension of stores that turns a store into a kitchen. The store row supplies identity, opening hours, payment settings, RLS and checkout compatibility; this row adds only the prep estimate and the collection landmark. Cooker identity is NOT here — see food_kitchen_ops (M50).';

create table if not exists food_kitchen_ops (
  store_id       uuid primary key references stores(id) on delete cascade,
  -- Who actually cooks. The platform operator rings this number; the customer
  -- never sees it and no public policy can reach it.
  cooker_name    text,
  cooker_phone   text,
  -- "Calls before 7am only", "no fish on Mondays", "closes if it rains".
  cooker_notes   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table food_kitchen_ops is
  'Cooker identity and operational notes. RLS is enabled with NO policy on purpose: service-role only, because RLS cannot restrict columns and this data must never be reachable from the public API (M50).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. FOOD TAXONOMY — separate from `categories` on purpose
-- ════════════════════════════════════════════════════════════════════════════
-- public.categories is the marketplace's product taxonomy and it feeds
-- browse_store_categories() on /shop. Putting "Burgers" and "Ourite" in there
-- would surface food categories in the shop directory's filter bar, which is
-- the same leak M42 had to close for events. Food gets its own taxonomy.
--
-- Many-to-many, because a dish genuinely is more than one thing: octopus curry
-- is Local AND Seafood AND Lunch.

create table if not exists food_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        citext not null unique,
  name        text not null,
  -- Trilingual, same convention as the rest of the site (lib/localize.ts).
  name_fr     text,
  name_cr     text,
  emoji       text,
  image_url   text,
  position    integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists food_item_categories (
  product_id  uuid not null references products(id) on delete cascade,
  category_id uuid not null references food_categories(id) on delete cascade,
  primary key (product_id, category_id)
);
create index if not exists food_item_categories_category_idx on food_item_categories (category_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE DISH
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists food_items (
  product_id        uuid primary key references products(id) on delete cascade,

  -- The dish's OWN public slug, unique across the whole island — not
  -- products.slug, which is only unique per store (`unique (store_id, slug)`).
  -- That distinction is the whole point of the food surface: the customer URL
  -- is /food/octopus-curry, never /food/marie-kitchen/octopus-curry, because
  -- the kitchen is metadata and must not appear in the path. Two kitchens both
  -- cooking "Ourite" is normal and the admin deduplicates on write.
  slug              citext not null unique,

  -- The one line under the name on the card. NOT the description — this is
  -- "Crispy chicken · lettuce · house sauce", read in half a second.
  descriptor        text,
  descriptor_fr     text,
  descriptor_cr     text,

  -- 0 none · 1 mild · 2 hot · 3 very hot. A number, not a tag, because it sorts
  -- and filters as a range and a customer's question is "how hot", not "is it".
  spice_level       smallint not null default 0 check (spice_level between 0 and 3),

  -- Free-form set validated in the application layer, not an enum: dietary
  -- vocabulary changes with the menu, and an enum change is a migration.
  -- e.g. {vegetarian, vegan, seafood, contains_pork, gluten_free, halal}
  dietary           text[] not null default '{}',
  -- {breakfast, lunch, dinner, snack} — powers "Good for lunch" rails.
  meal_times        text[] not null default '{}',

  allergens         text,
  -- "Serves 2". Null when it is one portion.
  serves            smallint check (serves is null or serves between 1 and 20),

  -- Per-dish override of the kitchen's estimate. Null inherits the kitchen —
  -- so changing a kitchen's prep time changes every dish that never disagreed.
  prep_minutes_min  integer check (prep_minutes_min is null or prep_minutes_min between 0 and 480),
  prep_minutes_max  integer check (prep_minutes_max is null or prep_minutes_max between 0 and 480),

  -- The dish this kitchen is known for. Drives the "Signature" rail.
  is_signature      boolean not null default false,
  position          integer not null default 0,

  -- ── Availability ─────────────────────────────────────────────────────────
  -- Four independent facts, because they answer four different questions and
  -- collapsing them into one status column loses the reason:
  --
  --   products.status      is this dish on the menu at all?   (draft/active/archived)
  --   available_days       which days is it cooked?           (null = every day)
  --   available_from/until which hours is it served?          (null = all day)
  --   sold_out_until       has today's batch run out?         (the "86 it" button)
  --
  -- Plus stock_quantity on the variant, which is TODAY'S REMAINING PORTIONS and
  -- is what actually makes overselling impossible under concurrency.
  --
  -- 0 = Sunday, matching store_hours.weekday and extract(dow).
  available_days    smallint[],
  available_from    time,
  available_until   time,

  -- How many portions this dish is restocked to each morning. Null means the
  -- kitchen does not count it (bottled drinks, packaged snacks) and it is
  -- topped back up to a high number instead. This is the honest model for an
  -- island kitchen: "twenty curries today", not an infinite menu.
  daily_capacity    integer check (daily_capacity is null or daily_capacity between 0 and 100000),

  -- Manual, timestamped unavailability. A FACT with an end, not a status word —
  -- so it expires by itself and nobody has to remember to switch it back on.
  sold_out_until    timestamptz,
  sold_out_reason   text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint food_items_prep_pair check (
    (prep_minutes_min is null) = (prep_minutes_max is null)
  ),
  constraint food_items_prep_range check (
    prep_minutes_max is null or prep_minutes_max >= prep_minutes_min
  ),
  constraint food_items_window_pair check (
    (available_from is null) = (available_until is null)
  ),
  constraint food_items_sold_out_reason check (
    sold_out_reason is null or sold_out_until is not null
  )
);

comment on table food_items is
  'A 1:1 extension of products that turns a product into a dish. products supplies name, slug, price, media, search vector, status and checkout compatibility; this row adds what a product has no concept of — how hot it is, when it is served, and whether today''s batch has run out (M50).';
comment on column food_items.daily_capacity is
  'Portions this dish is restocked to each morning by food_restock_day(). Null = not counted, topped to a high number. The live counter is product_variants.stock_quantity, which is what create_order() locks.';
comment on column food_items.sold_out_until is
  'Manual unavailability with an expiry, so it switches itself back on. Nothing has to remember.';

create index if not exists food_items_signature_idx on food_items (is_signature) where is_signature;
create index if not exists food_items_position_idx  on food_items (position);
create index if not exists food_items_dietary_idx   on food_items using gin (dietary);
create index if not exists food_items_meals_idx     on food_items using gin (meal_times);

-- Keep updated_at honest on all four tables.
drop trigger if exists t_food_kitchens_updated on food_kitchens;
create trigger t_food_kitchens_updated before update on food_kitchens
  for each row execute function set_updated_at();
drop trigger if exists t_food_kitchen_ops_updated on food_kitchen_ops;
create trigger t_food_kitchen_ops_updated before update on food_kitchen_ops
  for each row execute function set_updated_at();
drop trigger if exists t_food_categories_updated on food_categories;
create trigger t_food_categories_updated before update on food_categories
  for each row execute function set_updated_at();
drop trigger if exists t_food_items_updated on food_items;
create trigger t_food_items_updated before update on food_items
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. IS THIS DISH SERVABLE RIGHT NOW?
-- ════════════════════════════════════════════════════════════════════════════
-- One definition, used by the catalog RPCs (to grey a card out), by the item
-- page (to disable the button) and by the ENFORCEMENT TRIGGER below (to refuse
-- the order). Three surfaces, one answer — the UI and the database can never
-- disagree about whether breakfast is still being served.
--
-- Returns the REASON, not just a boolean, because "sold out" and "we start
-- serving this at 11:00" are completely different things to tell a customer and
-- the difference is free to carry.
create or replace function public.food_item_availability(p_product_id uuid, p_at timestamptz default now())
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v         food_items%rowtype;
  v_status  product_status;
  v_local   timestamp;
  v_dow     smallint;
  v_time    time;
begin
  select * into v from food_items where product_id = p_product_id;
  -- Not a dish at all. Availability is not this function's business, and
  -- answering 'available' would let it accidentally green-light a shop product.
  if not found then return 'not_food'; end if;

  select status into v_status from products where id = p_product_id;
  if v_status is null then return 'missing'; end if;
  if v_status <> 'active' then return 'off_menu'; end if;

  if v.sold_out_until is not null and v.sold_out_until > p_at then
    return 'sold_out';
  end if;

  -- Rodrigues local time, explicitly. The buyer is frequently a tourist whose
  -- phone is on a European clock; "breakfast until 10:30" means 10:30 HERE.
  v_local := p_at at time zone 'Indian/Mauritius';
  v_dow   := extract(dow from v_local)::smallint;
  v_time  := v_local::time;

  if v.available_days is not null
     and array_length(v.available_days, 1) is not null
     and not (v_dow = any (v.available_days)) then
    return 'wrong_day';
  end if;

  if v.available_from is not null then
    if v.available_from <= v.available_until then
      -- Ordinary window: 07:00–10:30.
      if v_time < v.available_from or v_time > v.available_until then
        return 'wrong_time';
      end if;
    else
      -- Window crossing midnight: 18:00–02:00. Late food is a real category on
      -- an island where the last bus is at six.
      if v_time < v.available_from and v_time > v.available_until then
        return 'wrong_time';
      end if;
    end if;
  end if;

  return 'available';
end $$;

comment on function public.food_item_availability(uuid, timestamptz) is
  'The single definition of "can this dish be ordered right now", shared by the catalog RPCs, the item page and the order_items enforcement trigger. Returns a reason code, not a boolean: available | sold_out | wrong_day | wrong_time | off_menu | not_food | missing.';

-- ── ENFORCEMENT ─────────────────────────────────────────────────────────────
-- On order_items, not inside create_order(). create_order() is today's only
-- path to an order row, and "today's only path" is precisely how several
-- earlier gaps in this schema began (see M28's pickup trigger and M23's
-- financials trigger for the same reasoning). A trigger covers every writer
-- that will ever exist — the RPC, a future admin repair screen, a hand-typed
-- INSERT at 2am — and it survives create_order() being rewritten.
--
-- RR006 is the existing "product unavailable" code, which app/api/checkout
-- already maps to a 409 with the message shown to the customer. Nothing
-- downstream needs to learn a new code.
create or replace function public.enforce_food_item_servable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product uuid;
  v_reason  text;
  v_name    text;
begin
  select p.id, p.name into v_product, v_name
    from product_variants pv join products p on p.id = pv.product_id
   where pv.id = new.variant_id;

  if v_product is null then return new; end if;

  v_reason := food_item_availability(v_product);
  -- 'not_food' is the overwhelmingly common case (every shop product) and must
  -- cost nothing: one indexed PK lookup that misses.
  if v_reason in ('available', 'not_food') then return new; end if;

  raise exception using errcode = 'RR006', message = case v_reason
    when 'sold_out'   then format('%s has sold out for today.', coalesce(v_name, 'That dish'))
    when 'wrong_day'  then format('%s is not cooked today.', coalesce(v_name, 'That dish'))
    when 'wrong_time' then format('%s is not being served right now.', coalesce(v_name, 'That dish'))
    when 'off_menu'   then format('%s is no longer on the menu.', coalesce(v_name, 'That dish'))
    else format('%s is unavailable.', coalesce(v_name, 'That dish'))
  end;
end $$;

drop trigger if exists t_order_items_food_servable on order_items;
create trigger t_order_items_food_servable
  before insert on order_items
  for each row execute function enforce_food_item_servable();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. THE DAILY RESET
-- ════════════════════════════════════════════════════════════════════════════
-- Restocks every dish to its daily_capacity through the inventory ledger rather
-- than by writing stock_quantity directly — so the count stays auditable and
-- the existing t_inventory_apply trigger remains the only thing that ever
-- touches the cache. Idempotent: running it twice in a morning is a no-op for
-- anything already at capacity.
--
-- Called by the daily cron and by an admin button. NOT by a customer path:
-- authorized to platform admins and to the service role (auth.uid() is null),
-- the same gate every admin_* RPC in this schema uses.
create or replace function public.food_restock_day(p_store_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        record;
  v_target integer;
  v_count  integer := 0;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR004', message = 'Not authorized.';
  end if;

  for r in
    select pv.id as variant_id, pv.stock_quantity, fi.daily_capacity
      from food_items fi
      join products p          on p.id  = fi.product_id
      join product_variants pv on pv.product_id = p.id
     where p.status = 'active'
       and pv.is_active
       and (p_store_id is null or p.store_id = p_store_id)
  loop
    -- Null capacity = a dish the kitchen does not count. Topped to a high
    -- number rather than given an "unlimited" flag, so exactly one code path
    -- decrements stock and the row lock in create_order() still applies.
    v_target := coalesce(r.daily_capacity, 9999);
    if r.stock_quantity <> v_target then
      insert into inventory_movements (variant_id, delta, reason, note)
      values (r.variant_id, v_target - r.stock_quantity, 'restock', 'Daily food reset');
      v_count := v_count + 1;
    end if;
  end loop;

  -- Expired "sold out for today" marks clear themselves, but clearing them here
  -- too means the morning reset leaves nothing stale behind.
  update food_items set sold_out_until = null, sold_out_reason = null
   where sold_out_until is not null and sold_out_until <= now();

  return v_count;
end $$;

comment on function public.food_restock_day(uuid) is
  'Morning reset: restocks every active dish to its daily_capacity through the inventory ledger (never by writing stock_quantity directly) and clears expired sold-out marks. Idempotent. Admin / service-role only (M50).';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ════════════════════════════════════════════════════════════════════════════
alter table food_kitchens        enable row level security;
alter table food_kitchen_ops     enable row level security;
alter table food_categories      enable row level security;
alter table food_item_categories enable row level security;
alter table food_items           enable row level security;

-- food_kitchen_ops gets NO policy. Deliberate — see the table comment.

drop policy if exists food_kitchens_public_read on food_kitchens;
create policy food_kitchens_public_read on food_kitchens
  for select using (store_is_visible(store_id) or is_platform_admin());

drop policy if exists food_kitchens_admin_write on food_kitchens;
create policy food_kitchens_admin_write on food_kitchens
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists food_categories_public_read on food_categories;
create policy food_categories_public_read on food_categories
  for select using (is_active or is_platform_admin());

drop policy if exists food_categories_admin_write on food_categories;
create policy food_categories_admin_write on food_categories
  for all using (is_platform_admin()) with check (is_platform_admin());

-- A dish is visible exactly when its product is. One predicate, so the food
-- layer can never disagree with the catalog about what is published.
drop policy if exists food_items_public_read on food_items;
create policy food_items_public_read on food_items
  for select using (
    exists (
      select 1 from products p
       where p.id = food_items.product_id
         and p.status = 'active'
         and store_is_visible(p.store_id)
    ) or is_platform_admin()
  );

drop policy if exists food_items_admin_write on food_items;
create policy food_items_admin_write on food_items
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists food_item_categories_public_read on food_item_categories;
create policy food_item_categories_public_read on food_item_categories
  for select using (
    exists (
      select 1 from products p
       where p.id = food_item_categories.product_id
         and p.status = 'active'
         and store_is_visible(p.store_id)
    ) or is_platform_admin()
  );

drop policy if exists food_item_categories_admin_write on food_item_categories;
create policy food_item_categories_admin_write on food_item_categories
  for all using (is_platform_admin()) with check (is_platform_admin());

-- Grants. Supabase's default privileges hand anon/authenticated full DML on a
-- newly created table, so the REVOKE is what actually makes these read-only —
-- the policies alone would not. Every write in this feature lands through the
-- service role behind the /admin cookie session, exactly like delivery_zones
-- and subscriptions.
revoke all on food_kitchens, food_categories, food_item_categories, food_items, food_kitchen_ops
  from anon, authenticated;
grant select on food_kitchens, food_categories, food_item_categories, food_items to anon, authenticated;

-- The catalog RPCs are read-only and public by design (the menu is public).
-- food_restock_day is not: it writes the ledger.
revoke execute on function public.food_restock_day(uuid) from public, anon, authenticated;
-- Trigger functions are never RPC-callable — the standing rule from M22.
revoke execute on function public.enforce_food_item_servable() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. A KITCHEN IS NOT A SHOP, AND MUST NOT APPEAR IN /shop
-- ════════════════════════════════════════════════════════════════════════════
-- Exactly the M42 problem: "a kitchen IS a store" is the right internal model
-- with a customer-facing consequence nobody wants — publish a kitchen and a
-- plate of octopus curry appears in the marketplace directory between the honey
-- and the baskets, with an "Open now" badge and a product called "Ourite".
--
-- browse_stores() is the single source of the directory, so one predicate there
-- fixes every surface that reads it. Patched programmatically against the live
-- definition for the same reason M42 gave: the function now carries amendments
-- from M12 through M42 and retyping it by hand is the larger risk. Asserted
-- three ways, and re-running is a no-op.
do $$
declare
  v_def    text;
  v_anchor constant text := 'not exists (select 1 from events';
  v_new    text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'browse_stores';

  if v_def is null then
    raise exception 'M50: browse_stores() not found.';
  end if;
  if position('food_kitchens' in v_def) > 0 then
    raise notice 'M50: browse_stores() already excludes kitchens, nothing to do.';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'M50: the M42 event predicate in browse_stores() has changed shape. Re-read it before patching — nothing was modified.';
  end if;

  -- Anchored on M42's own predicate so the two exclusions sit together and the
  -- next person sees both at once.
  v_new := replace(
    v_def,
    v_anchor,
    '-- M50: a kitchen is not a shop. Food has its own surface at /food.
      not exists (select 1 from food_kitchens fk where fk.store_id = s.id)
      and ' || v_anchor
  );

  if position('store_schedule_at' in v_new) = 0
     or position('deliveryFeeFrom' in v_new) = 0
     or position('ratingAvg' in v_new) = 0 then
    raise exception 'M50: the patched browse_stores() lost an earlier amendment. Aborting with nothing changed.';
  end if;

  execute v_new;
  raise notice 'M50: browse_stores() now excludes kitchens.';
end $$;
