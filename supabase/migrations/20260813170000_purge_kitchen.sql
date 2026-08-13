-- ══════════════════════════════════════════════════════════════════════════
-- M91 — PERMANENTLY DELETE A KITCHEN, ON PURPOSE
-- ══════════════════════════════════════════════════════════════════════════
--
-- M90 let the owner delete a kitchen that had never taken an order. Anything that
-- had fed somebody was refused and told to hide instead. The owner's answer was
-- direct: as the platform, I want to delete permanently, not archive — and I want
-- that choice even for a real customer's kitchen.
--
-- Fair. It is their platform and their record. So the choice becomes explicit
-- rather than decided for them:
--
--   HIDE      — reversible, keeps every order and every receipt. Still the default.
--   DELETE    — irreversible. The kitchen, its dishes, its orders, its payments.
--
-- ── WHAT MAKES THIS HARDER THAN IT LOOKS ─────────────────────────────────
-- stores → orders is ON DELETE RESTRICT, not CASCADE. That is the real wall: no
-- store with a single order can be dropped until the orders go first. And orders
-- cascade to payments, order_items, order_financials, qr_pickup_tokens and
-- deliveries — so "delete the kitchen" silently means "delete the money record".
--
-- That is worth saying out loud rather than discovering later, so this migration
-- does three things the naive version would not:
--
--   1. admin_kitchen_delete_preview() — tells the owner exactly what is about to
--      be destroyed BEFORE they confirm. Counts, money, and what is blocking.
--   2. The confirmation is checked IN THE DATABASE, not just in the browser. A
--      confirm dialog that only the UI enforces is theatre; anything that can
--      reach the API skips it.
--   3. The books survive. Every order, line item and payment is snapshotted into
--      audit_logs before the delete. Personal data is NOT snapshotted in full —
--      first name and last four digits only — because "permanently delete" should
--      mean the customer's details are actually gone, not quietly relocated.
--
-- ── THE ONE THING THIS STILL REFUSES ─────────────────────────────────────
-- An order that is still in flight — somebody has paid and is waiting for food,
-- or holds a pickup code, or has a driver on the way. Deleting that is not the
-- owner disposing of their own record; it is a stranger losing the meal they paid
-- for. So RR042 refuses, names the count, and tells the owner how to clear it.
-- It is a fixable condition, not a wall: cancel or complete those orders and the
-- delete goes through.

-- ── 1. PREVIEW ────────────────────────────────────────────────────────────
-- Read-only. Answers "what happens if I press the red button", so the dialog can
-- state real numbers instead of a generic "this cannot be undone".

create or replace function public.admin_kitchen_delete_preview(p_store_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_store       stores%rowtype;
  v_orders      integer;
  v_inflight    integer;
  v_active_del  integer;
  v_money       bigint;
  v_dishes      integer;
  v_reviews     integer;
  v_storage     jsonb;
  v_blockers    text[] := '{}';
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_store from stores where id = p_store_id;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if not exists (select 1 from food_kitchens fk where fk.store_id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'Not a kitchen.';
  end if;

  select count(*),
         count(*) filter (where o.status::text not in ('collected','cancelled','refunded')),
         coalesce(sum(o.total), 0)
    into v_orders, v_inflight, v_money
    from orders o where o.store_id = p_store_id;

  -- A delivery that is still moving is its own reason to stop, even if the order
  -- somehow reads as finished.
  select count(*) into v_active_del
    from deliveries d
   where d.store_id = p_store_id
     and d.status::text in ('created','searching_driver','assigned','going_to_pickup',
                            'arrived_at_pickup','picked_up','out_for_delivery',
                            'arrived','requires_admin');

  select count(*) into v_dishes  from products p where p.store_id = p_store_id;
  select count(*) into v_reviews from reviews  r where r.store_id = p_store_id;

  -- Rows vanish with the cascade; uploaded files do not. Hand them back so the
  -- caller can clear the bucket in the same breath.
  select coalesce(jsonb_agg(distinct t.u), '[]'::jsonb) into v_storage
    from (
      select s.logo_url  as u from stores s where s.id = p_store_id and s.logo_url  is not null
      union
      select s.cover_url      from stores s where s.id = p_store_id and s.cover_url is not null
      union
      select pm.url from product_media pm
        join products pr on pr.id = pm.product_id
       where pr.store_id = p_store_id and pm.url is not null
      union
      select o.payment_receipt_path from orders o
       where o.store_id = p_store_id and o.payment_receipt_path is not null
    ) t(u);

  if v_inflight > 0 then
    v_blockers := v_blockers || format(
      '%s order%s still in progress — a customer is waiting. Mark them collected or cancelled first.',
      v_inflight, case when v_inflight = 1 then '' else 's' end);
  end if;
  if v_active_del > 0 then
    v_blockers := v_blockers || format(
      '%s delivery job%s still running. Let them finish or cancel them first.',
      v_active_del, case when v_active_del = 1 then '' else 's' end);
  end if;

  return jsonb_build_object(
    'id',                 v_store.id,
    'name',               v_store.name,
    'status',             v_store.status,
    'hidden',             (v_store.status <> 'active' or v_store.is_test),
    'dishes',             v_dishes,
    'orders',             v_orders,
    'orders_in_flight',   v_inflight,
    'orders_finished',    v_orders - v_inflight,
    'active_deliveries',  v_active_del,
    'reviews',            v_reviews,
    'money_minor',        v_money,
    'currency',           coalesce(v_store.currency, 'MUR'),
    'files',              v_storage,
    'can_delete',         (v_inflight = 0 and v_active_del = 0),
    'blockers',           to_jsonb(v_blockers)
  );
end;
$function$;

-- ── 2. THE PERMANENT DELETE ───────────────────────────────────────────────

create or replace function public.admin_purge_kitchen(
  p_store_id     uuid,
  p_confirm_name text
)
returns jsonb language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_store      stores%rowtype;
  v_orders     integer;
  v_inflight   integer;
  v_active_del integer;
  v_money      bigint;
  v_dishes     integer;
  v_orders_js  jsonb;
  v_storage    jsonb;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_store from stores where id = p_store_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if not exists (select 1 from food_kitchens fk where fk.store_id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'Not a kitchen.';
  end if;

  -- The confirmation, enforced here rather than in the browser. Typing the name is
  -- the difference between deciding and misclicking, and only the database can
  -- insist on it for every caller.
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_store.name)) then
    raise exception using errcode = 'RR043',
      message = format('To delete this kitchen permanently, type its name exactly: %s', v_store.name);
  end if;

  select count(*),
         count(*) filter (where o.status::text not in ('collected','cancelled','refunded')),
         coalesce(sum(o.total), 0)
    into v_orders, v_inflight, v_money
    from orders o where o.store_id = p_store_id;

  select count(*) into v_active_del
    from deliveries d
   where d.store_id = p_store_id
     and d.status::text in ('created','searching_driver','assigned','going_to_pickup',
                            'arrived_at_pickup','picked_up','out_for_delivery',
                            'arrived','requires_admin');

  -- The one refusal that survives. Not to protect the owner from themselves — to
  -- protect somebody who paid and is still waiting.
  if v_inflight > 0 or v_active_del > 0 then
    raise exception using errcode = 'RR042',
      message = format(
        '%s cannot be deleted yet: %s%s%s. Resolve those first — then this delete will go through.',
        v_store.name,
        case when v_inflight > 0
             then format('%s order%s still in progress', v_inflight, case when v_inflight = 1 then '' else 's' end)
             else '' end,
        case when v_inflight > 0 and v_active_del > 0 then ' and ' else '' end,
        case when v_active_del > 0
             then format('%s delivery job%s still running', v_active_del, case when v_active_del = 1 then '' else 's' end)
             else '' end);
  end if;

  select count(*) into v_dishes from products p where p.store_id = p_store_id;

  -- ── THE SNAPSHOT ───────────────────────────────────────────────────────
  -- Every figure the business needs to still have a record: order numbers, dates,
  -- line items, totals, commission, what was actually paid and by which provider.
  --
  -- What is deliberately NOT here: full customer names, phone numbers, email
  -- addresses, and payments.raw (the provider's payload, which carries tokens).
  -- The owner asked to delete permanently. Copying the customer's details into
  -- another table would make that a lie.
  select jsonb_agg(
           jsonb_build_object(
             'order_number',      o.order_number,
             'status',            o.status::text,
             'placed_at',         o.created_at,
             'currency',          o.currency,
             'subtotal',          o.subtotal,
             'discount',          o.discount,
             'tax',               o.tax,
             'delivery_fee',      o.delivery_fee,
             'total',             o.total,
             'commission_amount', o.commission_amount,
             'fulfillment',       o.fulfillment_method,
             'customer', jsonb_build_object(
               'first_name',  nullif(split_part(btrim(coalesce(o.customer_name, '')), ' ', 1), ''),
               'phone_last4', nullif(right(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), 4), '')
             ),
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'product',    oi.product_name,
                        'variant',    oi.variant_name,
                        'sku',        oi.sku,
                        'unit_price', oi.unit_price,
                        'quantity',   oi.quantity,
                        'line_total', oi.line_total)
                      order by oi.created_at)
               from order_items oi where oi.order_id = o.id), '[]'::jsonb),
             'payments', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'provider', p.provider,
                        'ref',      p.provider_ref,
                        'amount',   p.amount,
                        'currency', p.currency,
                        'status',   p.status::text,
                        'at',       p.created_at)
                      order by p.created_at)
               from payments p where p.order_id = o.id), '[]'::jsonb),
             'financials', (
               select to_jsonb(f) - 'order_id'
               from order_financials f where f.order_id = o.id)
           ) order by o.created_at)
    into v_orders_js
    from orders o where o.store_id = p_store_id;

  select coalesce(jsonb_agg(distinct t.u), '[]'::jsonb) into v_storage
    from (
      select s.logo_url  as u from stores s where s.id = p_store_id and s.logo_url  is not null
      union
      select s.cover_url      from stores s where s.id = p_store_id and s.cover_url is not null
      union
      select pm.url from product_media pm
        join products pr on pr.id = pm.product_id
       where pr.store_id = p_store_id and pm.url is not null
      union
      select o.payment_receipt_path from orders o
       where o.store_id = p_store_id and o.payment_receipt_path is not null
    ) t(u);

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'kitchen.purge', 'store', p_store_id::text,
          jsonb_build_object(
            'kitchen', jsonb_build_object(
              'id',         v_store.id,
              'name',       v_store.name,
              'slug',       v_store.slug,
              'status',     v_store.status,
              'created_at', v_store.created_at),
            'destroyed', jsonb_build_object(
              'dishes',      v_dishes,
              'orders',      v_orders,
              'money_minor', v_money,
              'currency',    coalesce(v_store.currency, 'MUR')),
            'files',  v_storage,
            'orders', coalesce(v_orders_js, '[]'::jsonb)));

  -- ── THE DELETE, IN DEPENDENCY ORDER ────────────────────────────────────
  -- deliveries first (stores → deliveries is RESTRICT), then orders (stores →
  -- orders is RESTRICT; this cascades payments, order_items, order_financials,
  -- qr_pickup_tokens and notifications), then the store itself, which cascades
  -- products, food_items, kitchen rows, staff, hours, payment settings, coupons
  -- and reviews.
  delete from deliveries where store_id = p_store_id;
  delete from orders     where store_id = p_store_id;

  -- Same transaction-local key M90 introduced. The platform Food merchant stays
  -- undeletable; this authorises exactly one store, for the length of one
  -- statement, and cannot be set by any client.
  perform set_config('app.allow_kitchen_delete', 'on', true);
  delete from stores where id = p_store_id;

  return jsonb_build_object(
    'ok',          true,
    'name',        v_store.name,
    'dishes',      v_dishes,
    'orders',      v_orders,
    'money_minor', v_money,
    'currency',    coalesce(v_store.currency, 'MUR'),
    'files',       v_storage);
end;
$function$;

-- ── 3. REACHABLE ONLY FROM THE SERVER ─────────────────────────────────────
-- The admin gate above passes anonymous callers by design (/admin runs on a signed
-- cookie with no auth.uid()). REVOKE is therefore the actual boundary, not the gate.

revoke all on function public.admin_kitchen_delete_preview(uuid) from public;
revoke all on function public.admin_kitchen_delete_preview(uuid) from anon, authenticated;
grant execute on function public.admin_kitchen_delete_preview(uuid) to service_role;

revoke all on function public.admin_purge_kitchen(uuid, text) from public;
revoke all on function public.admin_purge_kitchen(uuid, text) from anon, authenticated;
grant execute on function public.admin_purge_kitchen(uuid, text) to service_role;
