-- ── M161 (part 1) · A FOOD ORDER CAN SAY WHEN ──────────────────────────────
--
-- APPLIED TO PRODUCTION 2026-09-05 as migration 20260905184131.
--
-- The owner's ask: "There is no way for the user to choose when they want the
-- food (now vs later today vs tomorrow vs specific time)."
--
-- ── WHY THIS IS SMALL ──────────────────────────────────────────────────────
-- Three pieces of this feature were already built and never wired up:
--
--   1. orders.pickup_slot tstzrange has existed since
--      20260730000001_marketplace_core.sql and is written by NOTHING -- one
--      hit in the whole repo. NULL keeps meaning "as soon as it is ready", so
--      every order placed before today still reads correctly.
--   2. food_item_availability(p_product_id, p_at timestamptz) has ALWAYS taken
--      an instant. Every caller passes one argument and gets now().
--   3. store_schedule_at(store, local_ts) has always taken an arbitrary local
--      timestamp. store_schedule_status(store) is literally its now() wrapper.
--
-- So there is no new scheduling engine. There is a way to say WHICH instant
-- the existing gates should answer for.
--
-- ── HOW THE INSTANT TRAVELS ────────────────────────────────────────────────
-- create_order() is ~250 lines, shared by food, shop AND events, and its
-- "for update of v" lock ordering is asserted by six later migrations. It is
-- NOT touched and its signature does not change. The requested instant travels
-- in a transaction-local GUC, rr.fulfil_at, read by rr_fulfil_at(). Unset it
-- returns now(), so every existing path is byte-identical -- which the
-- assertions at the bottom prove before this migration may commit.

create or replace function public.rr_fulfil_at()
returns timestamptz
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(nullif(current_setting('rr.fulfil_at', true), '')::timestamptz, now());
$fn$;

comment on function public.rr_fulfil_at() is
  'The instant an order is being fulfilled FOR, not when it was placed. now() unless create_food_order set rr.fulfil_at for this transaction. M161.';

-- The RR010 gate ("This shop is closed right now") that made a 21:00 pre-order
-- for tomorrow impossible. One token changes. Signature and result columns are
-- identical, so all 19 callers -- including the food_catalog view's lateral
-- join -- are untouched while the GUC is unset.
create or replace function public.store_schedule_status(p_store_id uuid)
returns table(
  has_schedule boolean, is_open boolean, delivery_available boolean,
  local_date date, local_time time without time zone, weekday smallint,
  opens_at time without time zone, closes_at time without time zone,
  is_closed boolean,
  delivery_opens_at time without time zone, delivery_closes_at time without time zone,
  delivery_closed boolean, is_override boolean,
  next_open_at timestamp with time zone)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select * from store_schedule_at(p_store_id, (rr_fulfil_at() at time zone 'Indian/Mauritius')::timestamp);
$fn$;

-- The real blocker, and the cheapest to clear. This trigger fires on every
-- order_items insert and called food_item_availability with ONE argument, so a
-- pre-order that passed every check in the UI still raised RR006 at the last
-- possible moment.
create or replace function public.enforce_food_item_servable()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_product uuid;
  v_reason  text;
  v_name    text;
begin
  select p.id, p.name into v_product, v_name
    from product_variants pv join products p on p.id = pv.product_id
   where pv.id = new.variant_id;

  if v_product is null then return new; end if;

  -- The ONLY change from the M50 original: ask about the instant the food is
  -- FOR, which is now() for every walk-up order.
  v_reason := food_item_availability(v_product, rr_fulfil_at());
  if v_reason in ('available', 'not_food') then return new; end if;

  raise exception using errcode = 'RR006', message = case v_reason
    when 'sold_out'   then format('%s has sold out for today.', coalesce(v_name, 'That dish'))
    when 'wrong_day'  then format('%s is not cooked today.', coalesce(v_name, 'That dish'))
    when 'wrong_time' then format('%s is not being served right now.', coalesce(v_name, 'That dish'))
    when 'off_menu'   then format('%s is no longer on the menu.', coalesce(v_name, 'That dish'))
    else format('%s is unavailable.', coalesce(v_name, 'That dish'))
  end;
end $fn$;

-- ── Storage. The column existed; nothing ever wrote it. ───────────────────
comment on column public.orders.pickup_slot is
  'The 30-minute window the customer chose to collect in, Indian/Mauritius. NULL = as soon as it is ready, which is every order placed before M161.';

-- 20260804185000_orders_column_grant_lockdown.sql grants per COLUMN, so a
-- column nobody granted is one the customer cannot read on their own order.
grant select (pickup_slot) on public.orders to authenticated;

create index if not exists orders_pickup_slot_idx
  on public.orders (lower(pickup_slot))
  where pickup_slot is not null
    and status in ('pending_payment','awaiting_payment_confirmation','paid','preparing','ready_for_pickup');

-- The kitchen's consent. 0 = today only = exactly the pre-M161 behaviour, and
-- it is the default, so no cook wakes up to a feature nobody asked them about.
alter table public.food_kitchens
  add column if not exists preorder_days smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'food_kitchens_preorder_days_range') then
    alter table public.food_kitchens
      add constraint food_kitchens_preorder_days_range check (preorder_days between 0 and 3);
  end if;
end $$;

comment on column public.food_kitchens.preorder_days is
  '0 = today only (default, pre-M161 behaviour). 1 = today and tomorrow.';

-- The platform-wide rollback lever.
alter table public.marketplace_settings
  add column if not exists food_preorder_enabled boolean not null default false;

-- ── The assertions that decide whether this may commit ────────────────────
-- store_schedule_status() now reads a GUC and has nineteen callers. With the
-- GUC unset it must be indistinguishable from the function it replaced.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from stores s,
         lateral store_schedule_status(s.id) a,
         lateral store_schedule_at(s.id, (now() at time zone 'Indian/Mauritius')::timestamp) b
   where (a.has_schedule, a.is_open, a.delivery_available, a.opens_at, a.closes_at, a.is_closed)
      is distinct from
         (b.has_schedule, b.is_open, b.delivery_available, b.opens_at, b.closes_at, b.is_closed);

  if v_bad > 0 then
    raise exception 'M161 refused: store_schedule_status disagrees with store_schedule_at for % store(s) with rr.fulfil_at unset', v_bad;
  end if;
end $$;

do $$
begin
  if abs(extract(epoch from (rr_fulfil_at() - now()))) > 1 then
    raise exception 'M161 refused: rr_fulfil_at() is not now() with the GUC unset';
  end if;
end $$;
