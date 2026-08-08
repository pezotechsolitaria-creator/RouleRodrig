-- M34 — Ticket types, and the sales window that makes them real.
--
-- ── A TICKET TYPE IS A PRODUCT VARIANT ──────────────────────────────────────
-- Same move as M33: this is a 1:1 EXTENSION of product_variants (the PK is the
-- FK), not a parallel catalogue. Everything a ticket type needs to be sellable
-- already exists on the variant and is already hardened:
--
--   price     → product_variants.price, derived server-side by create_order,
--               protected by the RR012 expected-total guard
--   capacity  → product_variants.stock_quantity, decremented under
--               `for update`, backed by a stock_non_negative CHECK, and proven
--               under real 8-way concurrency
--   on/off    → product_variants.is_active
--   naming    → product_variants.name ("VIP", "Regular", "Early Bird")
--
-- So "VIP: 100 seats at Rs 800" is a variant. This table adds ONLY the two
-- things a shop product has no concept of: WHEN it may be sold, and HOW MANY
-- one buyer may take.
--
-- ── EARLY BIRD NEEDS NO PRICING ENGINE ──────────────────────────────────────
-- This is the simplification that removes the most complexity from the original
-- spec. "Early Bird Rs 400 until 1 Aug, then Regular Rs 500" is not a pricing
-- rule — it is TWO TICKET TYPES, one of which has a sales_end. No date-ranged
-- price table, no rule evaluation order, no "which price wins" ambiguity. The
-- price of a ticket is the price of its variant, exactly as for a bag of rice.
--
-- ── WHAT IS DELIBERATELY ABSENT: door_price ─────────────────────────────────
-- The spec asks for advance vs door pricing. It is NOT in this migration, on
-- purpose. create_order has no notion of a sales CHANNEL, so a door_price
-- column would sit here looking authoritative while nothing could ever read it
-- — the same trap as an unenforced capacity counter. It lands with the box
-- office, which is the first code that can actually choose between the two.
-- A column that looks enforced but is not is worse than no column.
--
-- ── ENFORCEMENT ─────────────────────────────────────────────────────────────
-- A sales window that only the UI respects is decoration. create_order is
-- amended to refuse a closed window (RR015) and an out-of-range quantity
-- (RR016), guarded so that a variant with NO ticket_types row — i.e. every
-- marketplace product that exists today — takes exactly the path it always did.

create table if not exists ticket_types (
  variant_id     uuid primary key references product_variants(id) on delete cascade,

  -- Shown under the type name at checkout: "Includes a welcome drink",
  -- "Under 12s only". Not a rule the system enforces — a human-readable term.
  description    text,

  -- The sales window. NULL start = on sale immediately; NULL end = until the
  -- event. Both nullable so the simplest event needs no dates at all.
  sales_start    timestamptz,
  sales_end      timestamptz,

  -- Per-ORDER limits, not per-person: the platform cannot identify a person, and
  -- pretending otherwise would be security theatre. A determined buyer can place
  -- two orders — max_open_reservations (M21) is what actually bounds hoarding.
  -- This stops the honest mistake and the casual scalper, which is its real job.
  min_per_order  integer not null default 1 check (min_per_order >= 1),
  max_per_order  integer check (max_per_order is null or max_per_order >= 1),

  display_order  integer not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint ticket_types_window_ordered check (
    sales_start is null or sales_end is null or sales_end > sales_start
  ),
  constraint ticket_types_qty_range check (
    max_per_order is null or max_per_order >= min_per_order
  )
);

comment on table ticket_types is
  'A 1:1 extension of product_variants that turns a variant into an admission type. Price stays on the variant (server-derived, RR012-guarded) and capacity stays stock_quantity (row-locked, CHECK-backed). This table adds only WHEN it may be sold and HOW MANY per order. Early-bird pricing is expressed as a second ticket type with a sales_end, not as a pricing engine (M34).';
comment on column ticket_types.max_per_order is
  'Per ORDER, not per person — the platform cannot identify a person. max_open_reservations (M21) is the real anti-hoarding control; this stops honest mistakes and casual scalping.';

create index if not exists ticket_types_display_idx on ticket_types (display_order);

drop trigger if exists ticket_types_set_updated_at on ticket_types;
create trigger ticket_types_set_updated_at
  before update on ticket_types
  for each row execute function set_updated_at();

-- ── Is this type on sale right now? ─────────────────────────────────────────
-- ONE function, used by create_order, the storefront and the organiser UI, so
-- the button and the refusal can never disagree — the same "single authority"
-- pattern as order_hold_hours() and resolve_commission_rate().
create or replace function public.ticket_sales_open(p_variant_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select (tt.sales_start is null or tt.sales_start <= p_at)
        and (tt.sales_end   is null or tt.sales_end   >  p_at)
       from ticket_types tt where tt.variant_id = p_variant_id),
    -- Not a ticket type at all: an ordinary product is always "in its window".
    true);
$$;

revoke all on function public.ticket_sales_open(uuid, timestamptz) from public;
grant execute on function public.ticket_sales_open(uuid, timestamptz) to anon, authenticated, service_role;

comment on function public.ticket_sales_open(uuid, timestamptz) is
  'Whether a ticket type may be sold at a given instant. Returns TRUE for any variant that is not a ticket type, so ordinary marketplace products are unaffected (M34).';

-- ── RLS: mirrors product_variants exactly ───────────────────────────────────
alter table ticket_types enable row level security;

drop policy if exists ticket_types_public_read on ticket_types;
create policy ticket_types_public_read on ticket_types
  for select to anon, authenticated
  using (exists (
    select 1 from product_variants v join products p on p.id = v.product_id
    where v.id = ticket_types.variant_id and store_is_visible(p.store_id)
  ));

drop policy if exists ticket_types_staff_all on ticket_types;
create policy ticket_types_staff_all on ticket_types
  for all to authenticated
  using (exists (
    select 1 from product_variants v join products p on p.id = v.product_id
    where v.id = ticket_types.variant_id and (is_store_staff(p.store_id) or is_platform_admin())
  ))
  with check (exists (
    select 1 from product_variants v join products p on p.id = v.product_id
    where v.id = ticket_types.variant_id and (is_store_staff(p.store_id) or is_platform_admin())
  ));

revoke all on ticket_types from anon, authenticated;
grant select on ticket_types to anon, authenticated;
grant insert, update, delete on ticket_types to authenticated;

-- ── create_order enforces the window and the per-order limits ───────────────
-- Guarded string surgery on one anchor inside the item loop. Every check is
-- scoped by `exists (… ticket_types …)`, so a marketplace variant never even
-- evaluates them.
do $$
declare
  v_src text;
  v_decl_old constant text :=
    '  v_merchant_net integer; v_model text; v_plan text; v_discount integer := 0;';
  v_decl_new constant text :=
    '  v_merchant_net integer; v_model text; v_plan text; v_discount integer := 0;' || E'\n' ||
    '  v_tt record;';
  v_old constant text :=
    '      raise exception using errcode=''RR007'', message=format(''Only %s left of "%s".'', v_variant.stock_quantity, v_variant.product_name); end if;';
  v_new constant text :=
    '      raise exception using errcode=''RR007'', message=format(''Only %s left of "%s".'', v_variant.stock_quantity, v_variant.product_name); end if;' || E'\n' ||
    '    -- M34: ticket-type rules. Only reached when the variant IS a ticket' || E'\n' ||
    '    -- type; an ordinary product finds no row and skips every check.' || E'\n' ||
    '    select tt.sales_start, tt.sales_end, tt.min_per_order, tt.max_per_order' || E'\n' ||
    '      into v_tt from ticket_types tt where tt.variant_id = v_variant.id;' || E'\n' ||
    '    if found then' || E'\n' ||
    '      if not ticket_sales_open(v_variant.id) then' || E'\n' ||
    '        raise exception using errcode=''RR015'',' || E'\n' ||
    '          message=format(''"%s" is not on sale right now.'', v_variant.product_name);' || E'\n' ||
    '      end if;' || E'\n' ||
    '      if v_qty < v_tt.min_per_order then' || E'\n' ||
    '        raise exception using errcode=''RR016'',' || E'\n' ||
    '          message=format(''You need at least %s of "%s".'', v_tt.min_per_order, v_variant.product_name);' || E'\n' ||
    '      end if;' || E'\n' ||
    '      if v_tt.max_per_order is not null and v_qty > v_tt.max_per_order then' || E'\n' ||
    '        raise exception using errcode=''RR016'',' || E'\n' ||
    '          message=format(''You can take at most %s of "%s" in one order.'', v_tt.max_per_order, v_variant.product_name);' || E'\n' ||
    '      end if;' || E'\n' ||
    '    end if;';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_order';

  if v_src is null then raise exception 'M34: create_order not found'; end if;
  if position('ticket_types' in v_src) > 0 then
    raise notice 'M34: create_order already enforces ticket rules — skipping';
  else
    if position(v_decl_old in v_src) = 0 then
      raise exception 'M34: the M26 declaration anchor is missing from create_order'; end if;
    if position(v_old in v_src) = 0 then
      raise exception 'M34: the RR007 stock anchor is missing from create_order'; end if;
    v_src := replace(v_src, v_decl_old, v_decl_new);
    v_src := replace(v_src, v_old, v_new);
    execute v_src;
  end if;
end;
$$;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_order';

  -- New behaviour present.
  if position('RR015' in v_src) = 0 then raise exception 'M34: sales-window guard missing'; end if;
  if position('RR016' in v_src) = 0 then raise exception 'M34: per-order limit guard missing'; end if;

  -- The entire M6→M26 chain must have survived a fifth surgery.
  if position('for update of v' in v_src) = 0 then raise exception 'M34: stock row lock lost'; end if;
  if position('RR012' in v_src) = 0 then raise exception 'M34: expected-total guard lost'; end if;
  if position('RR013' in v_src) = 0 then raise exception 'M34: reservation cap lost'; end if;
  if position('order_amounts(' in v_src) = 0 then raise exception 'M34: pricing authority lost'; end if;
  if position('p_guest_email' in v_src) = 0 then raise exception 'M34: guest identity lost'; end if;
  if position('resolve_commission_rate' in v_src) = 0 then raise exception 'M34: commission resolution lost'; end if;
  if position('orders_order_number_key' in v_src) = 0 then raise exception 'M34: order-number retry lost'; end if;

  -- A non-ticket variant must be unaffected.
  if not ticket_sales_open('00000000-0000-0000-0000-000000000000') then
    raise exception 'M34: ticket_sales_open refuses a plain product'; end if;

  if has_table_privilege('anon', 'ticket_types', 'INSERT') then
    raise exception 'M34: anon can write ticket types'; end if;
end;
$$;
