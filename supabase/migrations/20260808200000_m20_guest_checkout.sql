-- M20 — Guest checkout.
--
-- WHY
-- /checkout hard-redirected to /login. A tourist with a full cart had to create
-- an account, leave the site for a confirmation email, come back and sign in —
-- and if they had forgotten their password there was no reset flow at all, so
-- they simply could not buy. Meanwhile the VEHICLE side of the same product has
-- always been account-free ("No account needed" on /manage-booking). The login
-- wall was the single largest drop in the marketplace funnel.
--
-- WHAT THIS DOES NOT CHANGE
-- Every existing protection stays exactly where it is. Prices are still derived
-- inside this function from the DB, stock is still locked with `for update`,
-- the RR012 expected-total guard still refuses a moved price, the abandoned-
-- checkout sweep still runs, and the registered-user path is byte-for-byte the
-- behaviour it had before — `auth.uid()` still wins whenever a session exists.
--
-- IDENTITY MODEL
-- A guest order is an order with `customer_id IS NULL` and a `customer_email`.
-- No shadow auth.users row is created, so a guest who later signs up with the
-- same address gets ONE account, and claim_guest_orders() adopts their previous
-- orders at that point.
--
-- `customer_email` is populated for BOTH paths. For a registered order it is
-- read from auth.users inside this function — never from the client — which
-- also removes the need for the notification layer to call
-- auth.admin.getUserById just to find an address.

-- ── 1. The column ───────────────────────────────────────────────────────────
alter table orders add column if not exists customer_email text;

comment on column orders.customer_email is
  'Contact address for the order. For a registered order it is copied from auth.users inside create_order (never client-supplied); for a guest order it is the validated address the buyer typed. Guest order lookup and every confirmation email key off this (M20).';

-- M8 revoked the table-level SELECT on orders and re-granted per column, so a
-- new column is invisible to the client until granted. Forgetting this is what
-- produced "Failed to load orders" during M16.
grant select (customer_email) on orders to authenticated;

-- ── 2. Idempotency that actually holds for guests ───────────────────────────
-- The existing index is UNIQUE (customer_id, idempotency_key). In Postgres
-- NULL <> NULL, so for a guest (customer_id IS NULL) it enforces NOTHING: every
-- retry of a dropped request would have created another real order holding
-- another stock reservation. This is the guest-side equivalent, keyed on the
-- email instead, and it is what makes the advisory lock below a belt to the
-- index's braces rather than the only protection.
create unique index if not exists orders_guest_idempotency_key
  on orders (lower(customer_email), idempotency_key)
  where customer_id is null and idempotency_key is not null;

-- Guest order lookup reads by number + email; keep it indexed.
create index if not exists orders_customer_email_idx
  on orders (lower(customer_email)) where customer_email is not null;

-- ── 3. create_order with a guest path ───────────────────────────────────────
-- Reproduced from the CURRENT pg_get_functiondef output rather than
-- string-patched, so every amendment M6→M14 already in the live function is
-- carried forward verbatim: the provider-aware hold window, the accepted_at
-- sweep predicate, the guarded cancel-then-restock, order_amounts() as the sole
-- pricing authority, and the RR012 guard. The ONLY differences are the guest
-- identity block, the idempotency keys, and customer_email on the insert.
create or replace function public.create_order(
  p_store_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment text,
  p_notes text,
  p_provider text,
  p_delivery_lat double precision default null,
  p_delivery_lng double precision default null,
  p_delivery_instructions text default null,
  p_delivery_zone_id uuid default null,
  p_expected_total integer default null,
  p_idempotency_key uuid default null,
  p_guest_email text default null
)
returns table(order_id uuid, order_number text, total integer, currency text, delivery_fee integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sched record;
  v_customer uuid := auth.uid(); v_store record; v_pay record; v_settings record;
  v_variant_ids uuid[]; v_stale record; v_item jsonb; v_variant record; v_qty integer;
  v_subtotal integer := 0; v_tax integer := 0; v_delivery_fee integer := 0; v_total integer := 0;
  v_order_id uuid; v_order_number text;
  v_existing record;
  v_email text;
begin
  -- ── Identity ──
  -- A session always wins. p_guest_email is IGNORED for a signed-in caller, so
  -- a logged-in user cannot attach someone else's address to their order, and
  -- the registered path behaves exactly as it did before this migration.
  if v_customer is not null then
    select u.email into v_email from auth.users u where u.id = v_customer;
  else
    v_email := lower(btrim(coalesce(p_guest_email, '')));
    if v_email = '' then
      raise exception using errcode='RR005',
        message='An email address is required to place an order.';
    end if;
    -- Deliberately permissive but structural: the API route validates with Zod
    -- as well. This exists so the RPC cannot be driven into storing junk even
    -- if it is ever called from somewhere else.
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception using errcode='RR005', message='That email address is not valid.';
    end if;
    if length(v_email) > 254 then
      raise exception using errcode='RR005', message='That email address is too long.';
    end if;
  end if;

  -- Idempotency. The advisory lock serialises concurrent attempts carrying the
  -- SAME key for this buyer — identified by user id when signed in, by email
  -- when a guest — so the second request blocks until the first commits and
  -- then finds the order below instead of racing to create a twin.
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(coalesce(v_customer::text, v_email) || ':' || p_idempotency_key::text, 0));

    select o.id, o.order_number, o.total, o.currency, o.delivery_fee
      into v_existing
      from orders o
     where o.idempotency_key = p_idempotency_key
       and (
         (v_customer is not null and o.customer_id = v_customer)
         or (v_customer is null and o.customer_id is null and lower(o.customer_email) = v_email)
       )
     limit 1;

    if v_existing.id is not null then
      return query select v_existing.id, v_existing.order_number, v_existing.total,
                          v_existing.currency::text, v_existing.delivery_fee;
      return;
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode='RR005', message='Your cart is empty.'; end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception using errcode='RR005', message='Too many items in one order.'; end if;
  if p_fulfillment not in ('pickup','customer_delivery','rr_delivery') then
    raise exception using errcode='RR005', message='Invalid fulfillment option.'; end if;
  if p_provider not in ('cash','bank_transfer','manual') then
    raise exception using errcode='RR005', message='Invalid payment method.'; end if;

  select s.id, s.currency, s.tax_inclusive, s.default_tax_rate, s.fulfillment, s.merchant_id
    into v_store from stores s where s.id = p_store_id;
  if v_store.id is null or not store_is_visible(p_store_id) then
    raise exception using errcode='RR003', message='Shop not found.'; end if;
  if not merchant_subscription_active(v_store.merchant_id) then
    raise exception using errcode='RR008', message='This shop is not accepting orders at the moment.'; end if;
  select * into v_sched from store_schedule_status(p_store_id);
  if not v_sched.is_open then
    raise exception using errcode='RR010', message='This shop is closed right now.'; end if;
  if p_fulfillment = 'rr_delivery' and not v_sched.delivery_available then
    raise exception using errcode='RR011',
      message='Delivery is not running right now. You can still choose pickup or your own driver.'; end if;

  select * into v_pay from store_payment_settings where store_id = p_store_id;

  if p_fulfillment = 'rr_delivery' and not coalesce(v_pay.offers_rr_delivery, true) then
    raise exception using errcode='RR005', message='This shop does not offer Roulé Rodrigues delivery.'; end if;
  if p_fulfillment = 'pickup' and not coalesce(v_pay.offers_pickup, true) then
    raise exception using errcode='RR005', message='This shop does not offer pickup.'; end if;
  if p_fulfillment = 'customer_delivery' and not coalesce(v_pay.offers_customer_delivery, true) then
    raise exception using errcode='RR005', message='This shop does not accept your own driver.'; end if;
  if p_provider='cash' and not coalesce(v_pay.accepts_cash,true) then
    raise exception using errcode='RR009', message='This shop does not accept cash.'; end if;
  if p_provider='bank_transfer' and not coalesce(v_pay.accepts_bank_transfer,false) then
    raise exception using errcode='RR009', message='This shop does not accept bank transfer.'; end if;

  if p_fulfillment in ('customer_delivery','rr_delivery') then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception using errcode='RR005', message='A delivery location is required.'; end if;
    if p_delivery_lat not between -90 and 90 or p_delivery_lng not between -180 and 180 then
      raise exception using errcode='RR005', message='That delivery location is not valid.'; end if;
    if p_fulfillment='rr_delivery' then
      if not coalesce(v_pay.offers_rr_delivery, true) then
        raise exception using errcode='RR005', message='This shop does not offer Roule Rodrigues delivery.'; end if;
      select * into v_settings from marketplace_settings where id='main';
      if not coalesce(v_settings.delivery_enabled,false) then
        raise exception using errcode='RR005', message='Roule Rodrigues delivery is not available at the moment.'; end if;
      if p_delivery_zone_id is null then
        raise exception using errcode='RR005', message='Choose the area we are delivering to.'; end if;
      if not exists (select 1 from delivery_zones z where z.id = p_delivery_zone_id and z.is_active) then
        raise exception using errcode='RR005', message='We do not deliver to that area right now.'; end if;
    end if;
  end if;

  select array_agg(nullif(elem ->> 'variant_id','')::uuid) into v_variant_ids from jsonb_array_elements(p_items) elem;
  if v_variant_ids is null or array_position(v_variant_ids,null) is not null then
    raise exception using errcode='RR005', message='Invalid item in cart.'; end if;

  for v_stale in
    select distinct o.id from orders o join order_items oi on oi.order_id=o.id
    where o.status='pending_payment' and o.accepted_at is null and o.auto_release_at is not null
      and o.auto_release_at < now() and oi.variant_id = any(v_variant_ids)
  loop
    update orders set status='cancelled'
      where id=v_stale.id and status='pending_payment';
    if not found then continue; end if;
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select oi.variant_id, oi.quantity, 'restock', v_stale.id, 'auto-released: abandoned checkout'
    from order_items oi where oi.order_id=v_stale.id;
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    select 'customer', o.customer_id, o.id, 'order_status_changed',
           'Order '||o.order_number||' expired','The reservation window passed before the shop confirmed it, so the items were released. You have not been charged.',
           jsonb_build_object('new_status','cancelled')
    from orders o where o.id=v_stale.id and o.customer_id is not null;
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    select 'merchant', ms.user_id, o.id, 'order_status_changed',
           'Order '||o.order_number||' expired',
           'It was not confirmed in time, so the reservation was released and the stock returned.',
           jsonb_build_object('new_status','cancelled')
    from orders o join stores s on s.id = o.store_id
    join merchant_staff ms on ms.merchant_id = s.merchant_id
    where o.id = v_stale.id;
  end loop;

  v_order_number := 'RR'||to_char(now(),'YYMMDD')||'-'||upper(substr(md5(random()::text),1,5));
  insert into orders (order_number, store_id, customer_id, customer_email, customer_name, customer_phone, status, currency, notes, placed_at,
    fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, auto_release_at, delivery_zone_id, idempotency_key)
  values (v_order_number, p_store_id, v_customer, v_email, nullif(trim(p_customer_name),''), nullif(trim(p_customer_phone),''),
    'pending_payment', v_store.currency, nullif(trim(p_notes),''), now(), p_fulfillment, v_delivery_fee,
    case when p_fulfillment<>'pickup' then p_delivery_lat end,
    case when p_fulfillment<>'pickup' then p_delivery_lng end,
    nullif(trim(p_delivery_instructions),''), now() + make_interval(hours => order_hold_hours(p_provider)), p_delivery_zone_id, p_idempotency_key)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) e order by (e ->> 'variant_id') loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 100 then
      raise exception using errcode='RR005', message='Invalid quantity.'; end if;
    select v.id, v.price, v.stock_quantity, v.is_active, v.name, p.name as product_name, p.status as product_status, p.store_id
      into v_variant from product_variants v join products p on p.id=v.product_id
      where v.id=(v_item ->> 'variant_id')::uuid for update of v;
    if v_variant.id is null or v_variant.store_id <> p_store_id then
      raise exception using errcode='RR003', message='One of the items in your cart is no longer available.'; end if;
    if not v_variant.is_active or v_variant.product_status <> 'active' then
      raise exception using errcode='RR006', message=format('"%s" is no longer available.', v_variant.product_name); end if;
    if v_variant.stock_quantity < v_qty then
      raise exception using errcode='RR007', message=format('Only %s left of "%s".', v_variant.stock_quantity, v_variant.product_name); end if;
    insert into order_items (order_id, variant_id, product_name, variant_name, unit_price, quantity, line_total)
    values (v_order_id, v_variant.id, v_variant.product_name, v_variant.name, v_variant.price, v_qty, v_variant.price*v_qty);
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    values (v_variant.id, -v_qty, 'sale', v_order_id, 'order '||v_order_number);
    v_subtotal := v_subtotal + v_variant.price*v_qty;
  end loop;

  select a.tax, a.delivery_fee, a.total into v_tax, v_delivery_fee, v_total
  from order_amounts(p_store_id, v_subtotal, p_fulfillment, p_delivery_zone_id) a;
  if p_expected_total is not null and p_expected_total <> v_total then
    raise exception using errcode='RR012',
      message=format('The price changed while you were checking out — it is now Rs %s, not Rs %s. Please review and try again.',
                     to_char(v_total/100.0, 'FM999999990.00'),
                     to_char(p_expected_total/100.0, 'FM999999990.00'));
  end if;

  update orders set subtotal=v_subtotal, tax=v_tax, delivery_fee=v_delivery_fee, total=v_total, commission_amount=0 where id=v_order_id;
  insert into payments (order_id, provider, amount, currency, status)
  values (v_order_id, p_provider::payment_provider, v_total, v_store.currency, 'pending');
  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, v_order_id, 'order_created', 'New order '||v_order_number,
         'A new order just came in.', jsonb_build_object('total',v_total,'currency',v_store.currency)
  from merchant_staff ms where ms.merchant_id = v_store.merchant_id;

  return query select v_order_id, v_order_number, v_total, v_store.currency::text, v_delivery_fee;
end;
$function$;

-- The 13-arg signature is now unreachable from the app and would silently keep
-- the old "not authenticated" behaviour if anything still called it. Dropping
-- it makes an out-of-date caller fail loudly at deploy rather than quietly.
drop function if exists public.create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid);

revoke all on function public.create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid, text) from public, anon;
-- authenticated: the signed-in path, on the user's own session (auth.uid() set).
-- service_role: the GUEST path only, called from /api/checkout, which is
-- rate-limited and Zod-validated. anon is deliberately NOT granted — a guest
-- never talks to this function directly, so there is no public entry point that
-- could be hammered to reserve stock.
grant execute on function public.create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid, text)
  to authenticated, service_role;

-- ── 4. Guest order lookup ───────────────────────────────────────────────────
-- Guests have no session, so RLS (customer_id = auth.uid()) can never show them
-- their own order. This mirrors lookup_booking() exactly — the pattern this
-- codebase already uses for account-free vehicle bookings — rather than
-- inventing a second mechanism: order number + the email that placed it,
-- resolved by a SECURITY DEFINER function that is service_role only.
--
-- The order number is the authenticator alongside the email, so it is compared
-- in full and case-insensitively; no wildcard can reach the LIKE-free equality.
create or replace function public.lookup_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_num   text;
  v_email text;
  v_out   jsonb;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_num) < 6 or v_email = '' then
    return null;
  end if;

  select jsonb_build_object(
           'id',            o.id,
           'orderNumber',   o.order_number,
           'status',        o.status,
           'total',         o.total,
           'currency',      o.currency,
           'placedAt',      o.placed_at,
           'fulfillment',   o.fulfillment_method,
           'autoReleaseAt', o.auto_release_at,
           'acceptedAt',    o.accepted_at,
           'isGuest',       o.customer_id is null,
           'storeName',     s.name,
           'storeSlug',     s.slug,
           'items',         coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', oi.product_name, 'variant', oi.variant_name,
                      'qty', oi.quantity, 'lineTotal', oi.line_total)
                    order by oi.product_name)
             from order_items oi where oi.order_id = o.id), '[]'::jsonb))
    into v_out
  from orders o
  join stores s on s.id = o.store_id
  where o.order_number = v_num
    and lower(o.customer_email) = v_email
  limit 1;

  return v_out;
end;
$function$;

revoke all on function public.lookup_order(text, text) from public, anon, authenticated;
grant execute on function public.lookup_order(text, text) to service_role;

comment on function public.lookup_order(text, text) is
  'Account-free order lookup for guest checkout: order number + the email that placed it. SECURITY DEFINER and service_role only, so it is reachable exclusively through the rate-limited /api/orders/lookup route — mirrors lookup_booking() for vehicle bookings (M20).';

-- ── 5. Adopting guest orders into an account ────────────────────────────────
-- "If the guest email belongs to an existing account, do not create a second
-- account" is handled by never creating one. This closes the other half: when
-- someone signs in, any guest order placed with their VERIFIED address becomes
-- theirs, so /orders shows a complete history.
--
-- The email comes from auth.users for the CALLER — never a parameter — so this
-- cannot be used to adopt somebody else's orders by guessing an address.
create or replace function public.claim_guest_orders()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_count integer;
begin
  if v_uid is null then return 0; end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null or v_email = '' then return 0; end if;

  with adopted as (
    update orders o
       set customer_id = v_uid
     where o.customer_id is null
       and lower(o.customer_email) = v_email
    returning 1
  )
  select count(*) into v_count from adopted;

  return coalesce(v_count, 0);
end;
$function$;

revoke all on function public.claim_guest_orders() from public, anon;
grant execute on function public.claim_guest_orders() to authenticated, service_role;

comment on function public.claim_guest_orders() is
  'Attaches previously-placed GUEST orders to the calling account, matched on the caller''s own verified auth.users email. Idempotent. Never takes an email parameter, so it cannot adopt another person''s orders (M20).';

-- ── 6. Notification claim must work for guest orders ────────────────────────
-- M17's claim/release verify `customer_id = auth.uid()`, which is correct for a
-- registered order and impossible for a guest one (both sides null). Without
-- this, a guest order would never send its placement emails at all.
-- service_role is allowed to claim any order because the only caller is
-- /api/checkout, immediately after it created that order.
create or replace function public.claim_order_notification(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed uuid;
  v_owner   uuid;
  v_exists  boolean;
begin
  select true, customer_id into v_exists, v_owner from orders where id = p_order_id;
  if not coalesce(v_exists, false) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  -- A session may only claim its OWN order.
  --
  -- When auth.uid() IS NULL the caller cannot be a customer at all: `anon` has
  -- been revoked from this function, and any request carrying the
  -- `authenticated` role necessarily carries a uid. The only principals that
  -- reach here without one are service_role (the checkout route, which created
  -- this very row moments ago) and a direct database connection — both already
  -- fully trusted. That is what makes guest orders claimable without inventing
  -- a weaker ownership rule, and it relies on the GRANTs below rather than on
  -- introspecting a role name.
  if auth.uid() is not null and v_owner is distinct from auth.uid() then
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

create or replace function public.release_order_notification(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner  uuid;
  v_exists boolean;
begin
  select true, customer_id into v_exists, v_owner from orders where id = p_order_id;
  if not coalesce(v_exists, false) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  -- Same reasoning as claim_order_notification above.
  if auth.uid() is not null and v_owner is distinct from auth.uid() then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  update orders set notified_at = null where id = p_order_id;
end;
$$;

revoke all on function public.release_order_notification(uuid) from public, anon;
grant execute on function public.release_order_notification(uuid) to authenticated, service_role;

-- ── 7. Post-conditions ──────────────────────────────────────────────────────
do $$
declare v_src text;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='orders' and column_name='customer_email') then
    raise exception 'M20: orders.customer_email missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname='orders_guest_idempotency_key') then
    raise exception 'M20: guest idempotency index missing';
  end if;

  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_order';

  -- Every protection that predates this migration must still be present.
  if position('for update of v' in v_src) = 0 then
    raise exception 'M20: the stock row lock vanished from create_order';
  end if;
  if position('RR012' in v_src) = 0 then
    raise exception 'M20: the expected-total guard vanished from create_order';
  end if;
  if position('order_hold_hours(p_provider)' in v_src) = 0 then
    raise exception 'M20: M13 provider-aware hold window vanished from create_order';
  end if;
  if position('o.accepted_at is null' in v_src) = 0 then
    raise exception 'M20: M14 sweep predicate vanished from create_order';
  end if;
  if position('order_amounts(' in v_src) = 0 then
    raise exception 'M20: order_amounts pricing authority vanished from create_order';
  end if;

  -- anon must NOT be able to reach order creation or guest lookup directly.
  if has_function_privilege('anon', 'public.lookup_order(text,text)', 'EXECUTE') then
    raise exception 'M20: lookup_order became executable by anon';
  end if;
end;
$$;
