-- M32 — Delete the login that can actually sign in, not the one on paper.
--
-- THE BUG M31 WOULD HAVE SHIPPED
-- M31 deleted the auth user named by merchants.owner_id. Verifying it against
-- the live database — inside a rolled-back transaction — showed that column is
-- NOT reliably the account a merchant signs in with:
--
--   merchants.owner_id            = rr.m4.merchant@example.internal   (an E2E
--                                   fixture, created by the test seed)
--   merchant_staff role='owner'   = the human's real Google login, last sign-in
--                                   the same day
--
-- provision_merchant_owner() and onboard_merchant() both write merchant_staff,
-- and a shop can be handed over or re-provisioned, so the two drift. Deleting
-- only owner_id would have removed the shop, removed an unused fixture, and
-- left the real person able to log in — the exact opposite of "force them to
-- create a new one", and silently so.
--
-- THE FIX
-- The set of accounts that can reach a shop is merchant_staff ∪ {owner_id}, so
-- the preview now returns EVERY one of them with the facts needed to judge it:
-- email, last sign-in, whether it belongs to another shop as well, and how many
-- orders it placed as a CUSTOMER. That last one matters — on a small island the
-- merchant's login is often the same address they shop with, and deleting it
-- orphans their own purchase history (orders.customer_id is ON DELETE SET NULL,
-- so the orders survive as guest orders, but they leave that person's account).
--
-- The route deletes exactly the accounts the admin ticked. Nothing about which
-- humans lose their login is decided in SQL, or by me, on a hunch about which
-- column is authoritative.
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
  -- /admin authenticates by cookie then reaches Postgres as service_role, where
  -- auth.uid() is NULL — so is_platform_admin() alone would be unsatisfiable
  -- from the only UI that calls this (M25).
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
    'orders',       (select count(*) from orders where store_id = v_store.id),
    'ordersByStatus', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                         from (select status::text s, count(*) n from orders
                                where store_id = v_store.id group by 1) x),
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
    'receiptPaths', (select coalesce(jsonb_agg(o.payment_receipt_path), '[]'::jsonb)
                       from orders o where o.store_id = v_store.id
                        and o.payment_receipt_path is not null),
    'mediaPrefix',  v_store.id::text,

    -- EVERY account that can reach this shop: the staff rows and owner_id,
    -- unioned, because neither alone is complete.
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'userId',          a.user_id,
               'email',           u.email,
               'role',            a.role,
               'isOwnerColumn',   a.user_id = v_merchant.owner_id,
               'lastSignInAt',    u.last_sign_in_at,
               -- Orders this person placed as a BUYER. Deleting the login does
               -- not delete these (SET NULL), but it does detach them from any
               -- account, so the admin should see the number before ticking.
               'ordersAsCustomer', (select count(*) from orders o where o.customer_id = a.user_id),
               -- Belongs to another shop too → deleting the login would lock
               -- them out of a business this deletion has nothing to do with.
               'otherMerchants',  (select count(*) from merchant_staff ms2
                                    where ms2.user_id = a.user_id
                                      and ms2.merchant_id <> v_merchant.id)
                                  + (select count(*) from merchants m2
                                      where m2.owner_id = a.user_id and m2.id <> v_merchant.id),
               'isPlatformAdmin', exists (select 1 from platform_admins pa where pa.user_id = a.user_id))
             order by a.user_id), '[]'::jsonb)
      from (
        select ms.user_id, ms.role::text as role
          from merchant_staff ms where ms.merchant_id = v_merchant.id
        union
        select v_merchant.owner_id, 'owner_id column'
         where v_merchant.owner_id is not null
           and not exists (select 1 from merchant_staff ms3
                            where ms3.merchant_id = v_merchant.id
                              and ms3.user_id = v_merchant.owner_id)
      ) a
      join auth.users u on u.id = a.user_id
    )
  ) into v_out;

  return v_out;
end;
$function$;

revoke all on function public.admin_store_deletion_preview(uuid) from public, anon, authenticated;
grant execute on function public.admin_store_deletion_preview(uuid) to service_role;

comment on function public.admin_store_deletion_preview(uuid) is
  'Everything admin_delete_shop() would destroy, plus EVERY login that can reach the shop (merchant_staff union merchants.owner_id — the two drift, see M32) with what else each account is used for. Read-only; service_role or a platform admin.';

-- ── Post-condition ──────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='admin_store_deletion_preview';
  if position('merchant_staff ms where ms.merchant_id' in v_src) = 0
     or position('otherMerchants' in v_src) = 0 then
    raise exception 'M32: the preview is not reporting every login for the shop.';
  end if;
end;
$$;
