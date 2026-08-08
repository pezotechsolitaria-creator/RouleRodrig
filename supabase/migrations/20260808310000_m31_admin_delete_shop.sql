-- M31 — Delete a shop, and the account behind it, for real.
--
-- THE ASK
-- The owner wants deleting a shop in /admin to remove the merchant's account
-- from the database entirely, so that person has to sign up again from scratch.
-- There was no delete of any kind before this: /api/admin/stores had GET, PUT
-- and PATCH only, so the only way to retire a shop was to set its status and
-- leave every row in place.
--
-- WHAT THE FOREIGN KEYS ALREADY DECIDE (read from the live schema, not assumed)
--   merchants  --cascade-->  merchant_staff, merchant_subscriptions,
--                            subscription_invoices, stores
--   stores     --cascade-->  coupons, products, reviews, store_hours,
--                            store_payment_settings
--   products   --cascade-->  product_variants -> product_media,
--                            inventory_movements, reviews
--   orders     --cascade-->  order_items, payments, qr_pickup_tokens,
--                            order_financials, notifications
--   orders  <--RESTRICT--    stores        ← the ONLY thing that blocks
--   auth.users <--RESTRICT-- merchants.owner_id
--
-- So the whole operation is three statements in one transaction, in this order:
--   1. delete the store's orders   (clears the RESTRICT on stores)
--   2. delete the merchant row     (cascades everything else)
--   3. delete the auth user        (now that merchants.owner_id is gone)
-- Step 3 is the route's job — auth.users belongs to the Auth Admin API, not to
-- application SQL.
--
-- THE ONE JUDGEMENT CALL: ORDERS
-- orders is RESTRICT for a reason. Deleting a shop deletes the CUSTOMER's copy
-- of their order too, and for an order that is still in flight that means
-- somebody who paid, or is about to collect a bag of honey, silently loses
-- every trace of it. So:
--   * finished orders (collected / cancelled / refunded) are deleted freely,
--   * an order with money owed or fulfilment in flight BLOCKS the delete,
--   * unless the caller passes p_force, which is the admin explicitly saying
--     "cancel those and delete anyway" after being shown exactly what they are.
-- Nothing is silently destroyed and no irreversible default is baked in — the
-- choice is made at the moment of deletion, with the numbers on screen.
--
-- THE RECORD SURVIVES THE ROWS
-- Every deletion writes an audit_logs row FIRST, carrying the full inventory of
-- what is about to disappear — shop, owner email, order count, sales total,
-- each order number and status. The rows go; the fact that they existed, and
-- what they were, does not.

-- ── 1. What would be destroyed ──────────────────────────────────────────────
-- Read-only, and the delete calls it too, so the confirmation dialog and the
-- deletion can never disagree about what is at stake.
create or replace function public.admin_store_deletion_preview(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_store    stores%rowtype;
  v_merchant merchants%rowtype;
  v_out      jsonb;
begin
  -- The /admin dashboard authenticates with the ADMIN_PASSWORD cookie and then
  -- reaches Postgres as service_role, where auth.uid() is NULL — so a gate of
  -- `is_platform_admin()` alone would be unsatisfiable from the only UI that
  -- calls this. A caller WITH a session must be a platform admin; a caller
  -- without one can only be service_role, because anon and authenticated are
  -- revoked below. (M25 established this; see rr-two-admin-identities.)
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_store from stores where id = p_store_id;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_merchant from merchants where id = v_store.merchant_id;

  select jsonb_build_object(
    'storeId',      v_store.id,
    'storeName',    v_store.name,
    'storeSlug',    v_store.slug,
    'storeStatus',  v_store.status,
    'merchantId',   v_merchant.id,
    'merchantName', v_merchant.display_name,
    'ownerId',      v_merchant.owner_id,
    'ownerEmail',   (select u.email from auth.users u where u.id = v_merchant.owner_id),
    'products',     (select count(*) from products where store_id = v_store.id),
    'reviews',      (select count(*) from reviews where store_id = v_store.id),
    'invoices',     (select count(*) from subscription_invoices where merchant_id = v_merchant.id),
    -- Staff other than the owner keep their auth accounts: those may also be
    -- customer logins, and "delete this shop" is not consent to delete a third
    -- party's account. They lose their merchant_staff row by cascade.
    'otherStaff',   (select coalesce(jsonb_agg(jsonb_build_object('userId', ms.user_id, 'role', ms.role)), '[]'::jsonb)
                       from merchant_staff ms
                      where ms.merchant_id = v_merchant.id and ms.user_id is distinct from v_merchant.owner_id),
    'orders',       (select count(*) from orders where store_id = v_store.id),
    'ordersByStatus', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                         from (select status::text s, count(*) n from orders
                                where store_id = v_store.id group by 1) x),
    -- Money that actually changed hands, so the admin sees what history they
    -- are about to erase rather than just a row count.
    'salesTotal',   (select coalesce(sum(total), 0) from orders
                      where store_id = v_store.id and status = 'collected'),
    'liveOrders',   (select coalesce(jsonb_agg(jsonb_build_object(
                              'orderNumber', o.order_number, 'status', o.status,
                              'total', o.total, 'customerEmail', o.customer_email)
                            order by o.created_at), '[]'::jsonb)
                       from orders o
                      where o.store_id = v_store.id
                        and o.status in ('pending_payment','awaiting_payment_confirmation',
                                         'paid','preparing','ready_for_pickup')),
    -- Exact storage paths, so the route deletes files rather than guessing.
    'receiptPaths', (select coalesce(jsonb_agg(o.payment_receipt_path), '[]'::jsonb)
                       from orders o where o.store_id = v_store.id
                        and o.payment_receipt_path is not null),
    -- merchant-media is laid out as "<storeId>/logo/…" and "<storeId>/products/…".
    'mediaPrefix',  v_store.id::text
  ) into v_out;

  return v_out;
end;
$function$;

revoke all on function public.admin_store_deletion_preview(uuid) from public, anon, authenticated;
grant execute on function public.admin_store_deletion_preview(uuid) to service_role;

comment on function public.admin_store_deletion_preview(uuid) is
  'Everything admin_delete_shop() would destroy, so the confirmation dialog and the deletion cannot disagree. Read-only; service_role (the /admin cookie session) or a platform admin (M31).';

-- ── 2. The deletion ─────────────────────────────────────────────────────────
create or replace function public.admin_delete_shop(
  p_store_id   uuid,
  p_force      boolean default false,
  p_actor_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_store    stores%rowtype;
  v_merchant merchants%rowtype;
  v_preview  jsonb;
  v_live     integer;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  -- Lock the store for the whole operation so a checkout cannot slip a new
  -- order in between the preview and the delete — which would otherwise either
  -- trip the RESTRICT or quietly destroy an order nobody was shown.
  select * into v_store from stores where id = p_store_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_merchant from merchants where id = v_store.merchant_id for update;

  v_preview := admin_store_deletion_preview(p_store_id);
  v_live := jsonb_array_length(v_preview -> 'liveOrders');

  if v_live > 0 and not coalesce(p_force, false) then
    raise exception using errcode = 'RR040',
      message = format(
        '%s has %s order%s still in progress. Deleting the shop would delete the customer''s copy too. Review them, then confirm again to cancel and delete.',
        v_store.name, v_live, case when v_live = 1 then '' else 's' end);
  end if;

  -- The record outlives the rows. Written BEFORE anything is destroyed, so a
  -- failure halfway through still leaves the evidence of what was attempted.
  -- actor_id is null by construction: the /admin cookie session has no user id,
  -- which is what p_actor_note is for.
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'shop.delete', 'store', p_store_id::text,
          jsonb_build_object('forced', coalesce(p_force, false),
                             'note', p_actor_note,
                             'destroyed', v_preview));

  -- 1. Orders first — the only RESTRICT on stores. Children (order_items,
  --    payments, qr_pickup_tokens, order_financials, notifications) go by
  --    cascade; inventory_movements and reviews keep their rows with a null
  --    order_id, and both are deleted a moment later with the store anyway.
  delete from orders where store_id = v_store.id;

  -- 2. The merchant row. stores, merchant_staff, merchant_subscriptions and
  --    subscription_invoices all cascade from here, and stores in turn takes
  --    products, variants, media, reviews, coupons, hours and payment settings.
  delete from merchants where id = v_merchant.id;

  -- 3. auth.users is deliberately NOT touched here. Deleting an auth user from
  --    application SQL skips everything GoTrue does around it (sessions,
  --    identities, refresh tokens), so the route finishes the job through the
  --    Auth Admin API using the ownerId returned below. merchants.owner_id was
  --    RESTRICT and is gone now, so that delete will succeed.
  return jsonb_build_object('ok', true, 'destroyed', v_preview);
end;
$function$;

revoke all on function public.admin_delete_shop(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_delete_shop(uuid, boolean, text) to service_role;

comment on function public.admin_delete_shop(uuid, boolean, text) is
  'Hard-delete a shop, its merchant, and everything that cascades from them. Refuses while orders are in flight unless p_force. Writes an audit_logs row with the full inventory BEFORE deleting. Returns the owner auth id for the route to remove through the Auth Admin API (M31).';

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  -- The gate must be reachable from the cookie-session admin (service_role) and
  -- from nobody else. Getting this backwards is the M23 bug.
  if not has_function_privilege('service_role', 'public.admin_delete_shop(uuid,boolean,text)', 'EXECUTE') then
    raise exception 'M31: the admin route cannot execute admin_delete_shop().';
  end if;
  if has_function_privilege('anon', 'public.admin_delete_shop(uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_delete_shop(uuid,boolean,text)', 'EXECUTE') then
    raise exception 'M31: a client role can execute admin_delete_shop().';
  end if;
  -- The preview must not be able to write.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='admin_store_deletion_preview'
                    and p.provolatile='s') then
    raise exception 'M31: admin_store_deletion_preview() is not STABLE.';
  end if;
  -- If orders ever stops being RESTRICT, the "delete orders first" step becomes
  -- a silent data loss instead of a deliberate one. Fail loudly if that changes.
  if not exists (select 1 from pg_constraint c
                   join pg_class s on s.oid = c.conrelid
                   join pg_class t on t.oid = c.confrelid
                  where c.conname='orders_store_id_fkey' and s.relname='orders'
                    and t.relname='stores' and c.confdeltype='r') then
    raise exception 'M31: orders.store_id is no longer RESTRICT — re-read this migration before trusting it.';
  end if;
end;
$$;
