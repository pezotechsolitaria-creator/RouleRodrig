-- ════════════════════════════════════════════════════════════════════════════
-- M69 — Deleting things without deleting the money
--
-- (Applied to production under the name "m62_safe_deletes" before a parallel
-- session's own M62 landed; renamed here so the numbering stays unique. The
-- follow-up REVOKE went up as "m62b_revoke_kitchen_delete_from_public".)
--
-- Three problems, one theme: what a delete takes with it.
--
-- 1. admin_delete_shop() ran exactly two statements —
--       delete from orders where store_id = …;
--       delete from merchants where id = …;
--    and those two cascades destroyed the ledger. From orders: payments
--    (provider, provider_ref, amount, the raw gateway payload) and
--    order_financials, both ON DELETE CASCADE. From merchants:
--    subscription_invoices, also CASCADE. The audit row kept a COUNT of
--    invoices and a sum of collected sales — useful for a summary, useless
--    for answering "what did this merchant actually pay us in March".
--
--    The rows themselves are now archived first, in full, into an
--    append-only table. Deleting a shop stays possible; erasing its financial
--    history does not.
--
-- 2. A kitchen could not be deleted by ANY path. No DELETE handler, no UI, and
--    even raw SQL was refused: every kitchen belongs to the system-owned 'food'
--    merchant, and admin_delete_shop() rejects system_key IS NOT NULL — a rule
--    that exists for good reason (events hang off the same mechanism) but that
--    left "remove this test kitchen" with no answer at all. admin_delete_kitchen()
--    is the narrow door: kitchen stores only, refused once anyone has ordered.
--
-- 3. /admin/stores listed every kitchen and every event store next to the real
--    shops, each with a fully-armed Delete panel that always failed with RR041.
--    Those stores are managed on their own screens; they are now excluded from
--    the shops list rather than being offered a button that cannot work.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The archive ──────────────────────────────────────────────────────────
-- Deliberately dumb: a store id, a timestamp and three jsonb arrays. It is
-- evidence, not a working table, so it has no foreign keys (the rows it
-- describes are gone by design) and no update or delete path.
create table if not exists deleted_store_ledger (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null,
  store_name     text,
  merchant_id    uuid,
  merchant_name  text,
  deleted_at     timestamptz not null default now(),
  actor_note     text,
  orders         jsonb not null default '[]'::jsonb,
  payments       jsonb not null default '[]'::jsonb,
  financials     jsonb not null default '[]'::jsonb,
  invoices       jsonb not null default '[]'::jsonb
);

comment on table deleted_store_ledger is
  'Append-only financial record of deleted shops. Written by admin_delete_shop() '
  'before the cascade. Never updated, never deleted — see M69.';

create index if not exists deleted_store_ledger_store_idx on deleted_store_ledger (store_id);
create index if not exists deleted_store_ledger_at_idx    on deleted_store_ledger (deleted_at desc);

-- RLS on with NO policy: reachable by the service role alone. This holds
-- provider references and customer emails; a merchant must never read another
-- merchant's, and a customer must never read any of it.
alter table deleted_store_ledger enable row level security;
revoke all on deleted_store_ledger from anon, authenticated;

-- ── 2. Shop deletion, with the ledger kept ──────────────────────────────────
create or replace function admin_delete_shop(
  p_store_id   uuid,
  p_force      boolean default false,
  p_actor_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_store    stores%rowtype;
  v_merchant merchants%rowtype;
  v_preview  jsonb;
  v_live     integer;
begin
  -- M25 gate. /admin authenticates with a cookie and no Supabase user, so
  -- auth.uid() is null there and the check passes; a SIGNED-IN user must be a
  -- platform admin. Unchanged.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_store from stores where id = p_store_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_merchant from merchants where id = v_store.merchant_id for update;

  if v_merchant.system_key is not null then
    raise exception using errcode = 'RR041',
      message = format(
        '"%s" is platform infrastructure (%s), not a merchant shop. It cannot be deleted here — every event, ticket and attendance record hangs off it.',
        v_store.name, v_merchant.system_key);
  end if;

  v_preview := admin_store_deletion_preview(p_store_id);
  v_live := jsonb_array_length(v_preview -> 'liveOrders');

  if v_live > 0 and not coalesce(p_force, false) then
    raise exception using errcode = 'RR040',
      message = format(
        '%s has %s order%s still in progress. Deleting the shop would delete the customer''s copy too. Review them, then confirm again to cancel and delete.',
        v_store.name, v_live, case when v_live = 1 then '' else 's' end);
  end if;

  -- THE ARCHIVE. Written before anything is destroyed, so a failure here
  -- aborts the whole transaction and the shop survives — the correct order:
  -- better a delete that did not happen than a ledger that did not survive.
  insert into deleted_store_ledger
    (store_id, store_name, merchant_id, merchant_name, actor_note,
     orders, payments, financials, invoices)
  values (
    v_store.id, v_store.name, v_merchant.id, v_merchant.display_name, p_actor_note,
    coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at)
                from orders o where o.store_id = v_store.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(pay) order by pay.created_at)
                from payments pay
                join orders o on o.id = pay.order_id
               where o.store_id = v_store.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(f))
                from order_financials f
                join orders o on o.id = f.order_id
               where o.store_id = v_store.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(i) order by i.period_start)
                from subscription_invoices i
               where i.merchant_id = v_merchant.id), '[]'::jsonb)
  );

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'shop.delete', 'store', p_store_id::text,
          jsonb_build_object('forced', coalesce(p_force, false),
                             'note', p_actor_note,
                             'ledgerArchived', true,
                             'destroyed', v_preview));

  delete from orders where store_id = v_store.id;
  delete from merchants where id = v_merchant.id;

  return jsonb_build_object('ok', true, 'destroyed', v_preview, 'ledgerArchived', true);
end;
$$;

-- ── 3. Deleting a kitchen ───────────────────────────────────────────────────
-- Narrow on purpose. A kitchen store belongs to the shared system-owned 'food'
-- merchant, so the merchant must survive; only this store and its dishes go.
-- Refused outright once an order exists, because a kitchen that has cooked for
-- somebody is history, not clutter — and orders.store_id is ON DELETE RESTRICT
-- anyway, so the alternative is a Postgres error the operator cannot act on.
create or replace function admin_delete_kitchen(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_store  stores%rowtype;
  v_orders integer;
  v_dishes integer;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_store from stores where id = p_store_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  -- This function deletes KITCHENS. A store without a food_kitchens row is a
  -- shop or an event, and must go through its own path with its own rules.
  if not exists (select 1 from food_kitchens fk where fk.store_id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'Not a kitchen.';
  end if;

  select count(*) into v_orders from orders where store_id = p_store_id;
  if v_orders > 0 then
    raise exception using errcode = 'RR004',
      message = format(
        '%s has taken %s order%s. Hide it instead — set its visibility to hidden — so the record of what people ordered survives.',
        v_store.name, v_orders, case when v_orders = 1 then '' else 's' end);
  end if;

  select count(*) into v_dishes from products where store_id = p_store_id;

  -- Explicit, in dependency order. products CASCADEs to variants, media,
  -- inventory_movements and food_item_* — but naming the tables makes the
  -- blast radius readable here rather than only in the schema.
  -- food_items and food_item_categories are keyed by PRODUCT, not by store —
  -- a dish IS a product, which is the whole reason food inherits the
  -- marketplace's pricing and stock locking.
  delete from food_item_categories
   where product_id in (select id from products where store_id = p_store_id);
  delete from food_items
   where product_id in (select id from products where store_id = p_store_id);
  delete from products         where store_id = p_store_id;
  delete from store_hours      where store_id = p_store_id;
  delete from store_payment_settings where store_id = p_store_id;
  delete from food_kitchen_ops where store_id = p_store_id;
  delete from food_kitchens    where store_id = p_store_id;
  delete from stores           where id = p_store_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'kitchen.delete', 'store', p_store_id::text,
          jsonb_build_object('name', v_store.name, 'dishes', v_dishes));

  return jsonb_build_object('ok', true, 'name', v_store.name, 'dishes', v_dishes);
end;
$$;

-- PUBLIC, not just anon and authenticated.
--
-- The gate at the top of this function is `auth.uid() is not null and not
-- is_platform_admin()`, which PASSES for an anonymous caller because auth.uid()
-- is null there. That is deliberate — /admin holds a signed cookie and reaches
-- Postgres as service_role with no Supabase user — but it means the gate is not
-- the security boundary. This REVOKE is.
--
-- Revoking from anon and authenticated alone leaves the default PUBLIC grant
-- that both roles inherit, so the function stays callable with the anon key.
-- Every other admin RPC carries {postgres=X, service_role=X} and nothing else.
revoke all on function admin_delete_kitchen(uuid) from public, anon, authenticated;

-- ── 4. Keep platform stores out of the shops list ───────────────────────────
-- Kitchens are run from the Food screen and events from the Events screen.
-- Listing them under Shops offered a Delete button that could only ever fail,
-- and made the shop count wrong.
create or replace function admin_store_schedules()
returns table(
  store_id uuid, store_name text, slug text, store_status text,
  merchant_id uuid, merchant_name text, merchant_status text,
  offers_rr_delivery boolean, offers_pickup boolean, offers_customer_delivery boolean,
  accepts_cash boolean, accepts_bank_transfer boolean, has_bank_details boolean,
  has_schedule boolean, is_open boolean, delivery_available boolean,
  opens_at time without time zone, closes_at time without time zone, is_closed boolean,
  delivery_opens_at time without time zone, delivery_closes_at time without time zone,
  delivery_closed boolean, weekday smallint, next_open_at timestamptz,
  sub_plan text, sub_status text, sub_period_end timestamptz, sub_grace_days integer,
  sub_started_at timestamptz, sub_cancelled_at timestamptz, selling boolean,
  last_paid_at timestamptz, last_paid_amount integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id, s.name, s.slug::text, s.status::text,
         m.id, m.display_name, m.status::text,
         coalesce(p.offers_rr_delivery, true),
         coalesce(p.offers_pickup, true),
         coalesce(p.offers_customer_delivery, true),
         coalesce(p.accepts_cash, true),
         coalesce(p.accepts_bank_transfer, false),
         (p.bank_name is not null and p.account_number is not null),
         st.has_schedule, st.is_open, st.delivery_available,
         st.opens_at, st.closes_at, st.is_closed,
         st.delivery_opens_at, st.delivery_closes_at, st.delivery_closed,
         st.weekday, st.next_open_at,
         ms.plan::text, ms.status::text, ms.current_period_end, ms.grace_days,
         ms.started_at, ms.cancelled_at,
         merchant_subscription_active(m.id),
         inv.paid_at, inv.amount
  from stores s
  join merchants m on m.id = s.merchant_id
  left join store_payment_settings p on p.store_id = s.id
  left join merchant_subscriptions ms on ms.merchant_id = m.id
  cross join lateral store_schedule_status(s.id) st
  left join lateral (
    select i.paid_at, i.amount
    from subscription_invoices i
    where i.merchant_id = m.id and i.status = 'paid'
    order by i.paid_at desc nulls last
    limit 1
  ) inv on true
  where m.system_key is null   -- M69: kitchens and event stores are not shops
  order by s.name;
$$;
