-- M17 — Exactly-once order-placement notifications, via a claim.
--
-- WHY A CLAIM RATHER THAN A `replayed` FLAG ON create_order
-- The original plan was to have create_order return `replayed boolean` and
-- notify only when false. That would have required DROP FUNCTION + recreate
-- (PostgreSQL cannot change a return type with CREATE OR REPLACE) on a function
-- six chained migrations have amended — with a real chance of silently
-- reverting M13's order_hold_hours(p_provider) or M14's accepted_at-is-null
-- sweep predicate. Checkout would have kept working while both fixes vanished.
--
-- And it would have bought less. A replayed flag covers ONE failure mode, the
-- client retry. It does not cover:
--   * two concurrent submits, each of which is a genuine "first" creation
--   * the route crashing after create_order commits but before the email sends
--     — order exists, nobody notified, and the 7-day acceptance clock is
--     already running
--
-- A claim covers all three, and is additive: create_order is not touched.
--
--   update orders set notified_at = now()
--    where id = $1 and notified_at is null
--   returning id
--
-- One statement. Concurrent callers contend on the row and exactly one sees a
-- row returned. No check-then-act, so no race to lose.
--
-- It also yields free observability — every order that silently failed to
-- notify is one query away:
--   select count(*) from orders
--    where notified_at is null and placed_at < now() - interval '5 minutes';
--
-- FAILED SENDS RELEASE THE CLAIM. A merchant missing an order costs a sale; a
-- duplicate email costs nothing. Release is a separate function so it is a
-- deliberate, auditable act rather than a nullable side effect of claiming.

alter table orders add column if not exists notified_at timestamptz;

comment on column orders.notified_at is
  'When placement notifications were CLAIMED for this order (not necessarily delivered). Set by claim_order_notification() in a single atomic UPDATE so exactly one caller ever sends, whatever races or retries occur (M17).';

-- Partial index: the only query that matters is "orders still owing a
-- notification", which is a tiny slice of the table and stays tiny. Indexing
-- the whole column would be mostly dead weight.
create index if not exists orders_notified_at_pending_idx
  on orders (placed_at) where notified_at is null;

-- M16 lesson: orders has NO table-level SELECT grant (M8 revoked it and
-- re-granted per column so internal_notes stays hidden), so every new column is
-- unreadable until granted. Forgetting this is what produced "Failed to load
-- orders" earlier today.
grant select (notified_at) on orders to authenticated;

-- SECURITY DEFINER because checkout runs on the CUSTOMER's session, which has
-- no UPDATE grant on orders (and could not evaluate the WHERE clause without
-- column privilege either). Ownership is re-verified here rather than trusted
-- from the route.
create or replace function public.claim_order_notification(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed uuid;
  v_owner   uuid;
begin
  select customer_id into v_owner from orders where id = p_order_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    -- Same message shape as elsewhere: never reveal whether the id exists.
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  update orders
     set notified_at = now()
   where id = p_order_id
     and notified_at is null
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_order_notification(uuid) from public, anon;
grant execute on function public.claim_order_notification(uuid) to authenticated, service_role;

comment on function public.claim_order_notification(uuid) is
  'Atomically claims the right to send placement notifications for an order. Returns true to exactly one caller; false to every retry or concurrent duplicate. Re-verifies caller ownership independently of RLS (M17).';

create or replace function public.release_order_notification(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  select customer_id into v_owner from orders where id = p_order_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  update orders set notified_at = null where id = p_order_id;
end;
$$;

revoke all on function public.release_order_notification(uuid) from public, anon;
grant execute on function public.release_order_notification(uuid) to authenticated, service_role;

do $$
begin
  if not has_column_privilege('authenticated', 'orders', 'notified_at', 'SELECT') then
    raise exception 'M17: notified_at not readable by authenticated';
  end if;
  if has_column_privilege('authenticated', 'orders', 'internal_notes', 'SELECT') then
    raise exception 'M17: internal_notes became readable — column lockdown regressed';
  end if;
  -- create_order must be untouched by this migration.
  if position('order_hold_hours(p_provider)' in
       (select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='create_order')) = 0 then
    raise exception 'M17: M13 provider-aware window missing from create_order';
  end if;
  if position('o.accepted_at is null' in
       (select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='create_order')) = 0 then
    raise exception 'M17: M14 sweep predicate missing from create_order';
  end if;
end;
$$;
