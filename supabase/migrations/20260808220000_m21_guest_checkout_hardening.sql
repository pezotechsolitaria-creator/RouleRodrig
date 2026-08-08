-- M21 — The four things M20 left broken.
--
-- M20 removed the login wall correctly: prices are still derived server-side,
-- stock is still locked, RR012 still refuses a moved price. What it did not do
-- is follow the guest THROUGH the rest of the order lifecycle. Four defects,
-- found by walking a guest order end to end rather than re-reading the diff:
--
--  1. BANK TRANSFER IS A DEAD END FOR A GUEST.  store_bank_details() releases a
--     shop's account details on `exists (select 1 from orders where store_id=…
--     and customer_id = auth.uid())`. A guest order has customer_id NULL and no
--     session, so that test can never pass. submit_payment_receipt() opens with
--     `if v_customer is null then raise 'not authenticated'`. So a guest who
--     picks Bank transfer is shown "You'll see the shop's bank details and
--     upload your transfer receipt after placing the order" (CheckoutForm), is
--     then sent to /orders/track, and finds NEITHER. Worse: they cannot report
--     the payment, so auto_release_at fires 48h later and the order is cancelled
--     and restocked — potentially AFTER they wired real money. Latent today only
--     because no live shop has bank transfer switched on yet.
--
--  2. ORDER NUMBERS COLLIDE.  order_number is 'RR'+YYMMDD+5 hex under a UNIQUE
--     index, i.e. 1,048,576 values PER DAY, drawn at random with no retry. By
--     the birthday bound that is a ~0.5% chance of a lost checkout per day at
--     100 orders/day and ~38% at 1,000 — and the failure surfaces as a bare
--     "Something went wrong", because 23505 is not in the route's error map.
--     Phase 6 of the review asks for 100× today's traffic; this is the first
--     thing that breaks.
--
--  3. NOTHING CAPS OPEN RESERVATIONS.  Before M20, reserving stock cost an
--     account with a confirmed address. Now it costs an email string. Cash is
--     the default method and holds stock for 168h (M13), so a script can empty
--     a small shop's shelf for a week, anonymously, with no payment ever due.
--     Rate limiting is per-IP and in-memory per serverless instance, so it is
--     not the control here.
--
--  4. claim_guest_orders() TRUSTS auth.users.email UNCONDITIONALLY.  Its own
--     comment calls the address "verified", but nothing checks that. Email
--     confirmation is on in this project today; the day it is turned off — or a
--     provider returns an unverified address — signing up as somebody else's
--     address adopts their guest orders, which carry name, phone, GPS pin and
--     basket. One predicate closes it permanently.
--
-- WHAT IS DELIBERATELY NOT CHANGED
-- The expiry WINDOW. Guests keep the same hold as account customers (see the
-- decision review): the risk that needed managing was concurrent unpaid
-- reservations, which is what §2 caps, not the identity of the buyer.

-- ── 1. Owner-configurable reservation cap ───────────────────────────────────
-- Beside order_hold_hours (M13) and plan_prices, so every commercial dial the
-- owner may need to turn during an incident lives on one row and needs no
-- deploy. 5 is deliberately generous: a real customer ordering from three shops
-- in an afternoon is unaffected.
alter table marketplace_settings
  add column if not exists max_open_reservations integer not null default 5;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketplace_settings_max_open_sane') then
    alter table marketplace_settings
      add constraint marketplace_settings_max_open_sane
      check (max_open_reservations between 1 and 100);
  end if;
end;
$$;

comment on column marketplace_settings.max_open_reservations is
  'How many unpaid, unaccepted orders one buyer may hold at once — counted per account when signed in, per email address for a guest. The inventory-hoarding control that replaced "make guest orders expire sooner" (M21).';

-- ── 2. create_order: collision-proof numbers, a reservation cap, and an
--       honest refusal for guest bank transfer at receipt-required shops ─────
--
-- Reproduced from the M20 definition rather than string-patched, so every
-- amendment M6→M20 is carried forward verbatim; the post-conditions at the
-- bottom fail the migration loudly if any of them went missing.
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
  v_open integer;
  v_max_open integer;
  v_constraint text;
begin
  -- ── Identity ──
  -- A session always wins. p_guest_email is IGNORED for a signed-in caller, so
  -- a logged-in user cannot attach someone else's address to their order, and
  -- the registered path behaves exactly as it did before M20.
  if v_customer is not null then
    select u.email into v_email from auth.users u where u.id = v_customer;
  else
    v_email := lower(btrim(coalesce(p_guest_email, '')));
    if v_email = '' then
      raise exception using errcode='RR005',
        message='An email address is required to place an order.';
    end if;
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

  -- ── Concurrent unpaid reservations (M21) ──
  -- Placed AFTER the idempotency replay so a retry of an order that already
  -- exists is never counted against its own author, and BEFORE any stock is
  -- touched so a refused attempt reserves nothing.
  --
  -- Identity-neutral on purpose. The thing worth limiting is "how much stock is
  -- this buyer already sitting on without having paid", which is a risk signal;
  -- "did they create an account" is not. Lapsed-but-not-yet-swept holds are
  -- excluded (auto_release_at > now()), so a customer is never blocked by a
  -- reservation the system has already given up on.
  select coalesce(s.max_open_reservations, 5) into v_max_open
    from marketplace_settings s where s.id = 'main';
  v_max_open := coalesce(v_max_open, 5);

  -- Two branches rather than one OR, so each is a single indexable predicate on
  -- orders_open_reservations_idx instead of a scan the planner cannot split.
  if v_customer is not null then
    select count(*) into v_open
      from orders o
     where o.status = 'pending_payment' and o.accepted_at is null
       and o.customer_id = v_customer
       and (o.auto_release_at is null or o.auto_release_at > now());
  else
    select count(*) into v_open
      from orders o
     where o.status = 'pending_payment' and o.accepted_at is null
       and o.customer_id is null and lower(o.customer_email) = v_email
       and (o.auto_release_at is null or o.auto_release_at > now());
  end if;

  if v_open >= v_max_open then
    raise exception using errcode='RR013',
      message=format('You already have %s orders waiting to be confirmed. Please complete or cancel one before placing another.', v_open);
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

  -- Guest + bank transfer at a shop that REQUIRES a receipt file (M21).
  -- guest_report_payment() lets a guest declare a transfer, but uploading an
  -- image needs storage RLS, which needs a session — so this one shop setting
  -- genuinely cannot be served without an account. Refusing here, before any
  -- stock moves, is honest; letting them order into a state they can never
  -- leave is what M20 shipped.
  if v_customer is null and p_provider = 'bank_transfer' and coalesce(v_pay.require_receipt, false) then
    raise exception using errcode='RR009',
      message='This shop needs a photo of your transfer receipt, which needs an account. Please sign in, or pay cash instead.';
  end if;

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

  -- ── The order row, with a collision-safe number (M21) ──
  -- Six hex characters instead of five (16.7M/day instead of 1M) AND a retry,
  -- because widening alone only moves the birthday bound — it does not remove
  -- it. Only a clash on orders_order_number_key is retried; any other unique
  -- violation (an idempotency key racing in) is re-raised untouched, so this
  -- can never swallow a real conflict and spin.
  for i in 1..8 loop
    v_order_number := 'RR'||to_char(now(),'YYMMDD')||'-'||
                      upper(substr(md5(random()::text||clock_timestamp()::text),1,6));
    begin
      insert into orders (order_number, store_id, customer_id, customer_email, customer_name, customer_phone, status, currency, notes, placed_at,
        fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, auto_release_at, delivery_zone_id, idempotency_key)
      values (v_order_number, p_store_id, v_customer, v_email, nullif(trim(p_customer_name),''), nullif(trim(p_customer_phone),''),
        'pending_payment', v_store.currency, nullif(trim(p_notes),''), now(), p_fulfillment, v_delivery_fee,
        case when p_fulfillment<>'pickup' then p_delivery_lat end,
        case when p_fulfillment<>'pickup' then p_delivery_lng end,
        nullif(trim(p_delivery_instructions),''), now() + make_interval(hours => order_hold_hours(p_provider)), p_delivery_zone_id, p_idempotency_key)
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'orders_order_number_key' then raise; end if;
      v_order_id := null;
    end;
  end loop;

  if v_order_id is null then
    raise exception using errcode='RR014',
      message='We could not create your order reference. Please try again.';
  end if;

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

revoke all on function public.create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid, text)
  to authenticated, service_role;

-- ── 3. claim_guest_orders(): only ever from a CONFIRMED address ─────────────
-- The M20 comment already claimed the address was verified. This makes the
-- claim true rather than a property of the current Supabase Auth settings, so
-- turning email confirmation off (or adding a provider that returns an
-- unverified address) cannot quietly turn adoption into an account-takeover of
-- somebody else's order history.
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

  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid
     and u.email_confirmed_at is not null;
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
  'Attaches previously-placed GUEST orders to the calling account, matched on the caller''s own CONFIRMED auth.users email. Idempotent. Never takes an email parameter, and ignores an unconfirmed address, so it cannot adopt another person''s orders (M20, hardened M21).';

-- ── 4. lookup_order(): everything a guest needs to finish paying ───────────
-- The credential is unchanged — order number AND the address that placed it,
-- compared in full, service_role only, behind the rate-limited route. What
-- changes is that the answer now contains the actionable half of the order:
-- which method is owed, the shop's bank details, and the reservation deadline.
--
-- The bank details are released on exactly the same test the signed-in page
-- uses (store_bank_details: "you have an order with this shop"), and ONLY while
-- money is still owed — once the merchant confirms, the panel disappears rather
-- than inviting a second transfer.
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
           'storePhone',    s.phone,
           -- Which method is owed. Read from payments, the same row the
           -- signed-in order page reads, never inferred from the status.
           'provider',      (select pm.provider from payments pm
                              where pm.order_id = o.id order by pm.created_at limit 1),
           'receiptSubmittedAt', o.receipt_submitted_at,
           -- Released only while the money is still owed, and only for the
           -- method that needs them.
           'bank', case
             when o.status in ('pending_payment','awaiting_payment_confirmation')
              and exists (select 1 from payments pm
                           where pm.order_id = o.id and pm.provider = 'bank_transfer')
             then (select jsonb_build_object(
                            'bankName',      sp.bank_name,
                            'accountHolder', sp.account_holder,
                            'accountNumber', sp.account_number,
                            'instructions',  sp.payment_instructions,
                            'requireReceipt', coalesce(sp.require_receipt, false))
                     from store_payment_settings sp where sp.store_id = o.store_id)
             else null end,
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
  'Account-free order lookup for guest checkout: order number + the email that placed it. Returns the shop''s bank details only while a bank transfer is still owed, on the same "you have an order with this shop" test as store_bank_details(). SECURITY DEFINER, service_role only (M20, extended M21).';

-- ── 5. guest_report_payment(): the "I have sent the transfer" half ─────────
-- Business rule 3 of the marketplace: the customer pays out of band, says so,
-- and the MERCHANT confirms receipt — never the platform, never automatically.
-- submit_payment_receipt() implements that for an account. This is the same
-- transition for an order that has no account behind it, with the same
-- credential as lookup_order and the same three refusals (cash, wrong status,
-- receipt required).
--
-- It CANNOT touch a registered order: `o.customer_id is null` is part of the
-- match, so possessing a signed-in customer's order number and address still
-- routes through the authenticated path and its ownership check.
create or replace function public.guest_report_payment(p_order_number text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_num    text;
  v_email  text;
  v_order  record;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_num) < 6 or v_email = '' then
    raise exception using errcode='RR003', message='Order not found.';
  end if;

  select o.id, o.status, o.store_id, o.order_number
    into v_order
  from orders o
  where o.order_number = v_num
    and lower(o.customer_email) = v_email
    and o.customer_id is null
  for update;

  if v_order.id is null then
    raise exception using errcode='RR003', message='Order not found.';
  end if;

  if exists (select 1 from payments pm where pm.order_id = v_order.id and pm.provider = 'cash') then
    raise exception using errcode='RR009',
      message='Cash orders are paid to the shop at handover — there is nothing to report here.';
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception using errcode='RR004', message='This order is no longer awaiting payment.';
  end if;
  -- create_order refuses guest bank transfer at these shops, so this is a
  -- backstop for an order placed before the shop switched the setting on.
  if (select coalesce(require_receipt, false) from store_payment_settings where store_id = v_order.store_id) then
    raise exception using errcode='RR005',
      message='This shop needs a photo of your transfer receipt. Please sign in with this email address to upload it.';
  end if;

  -- auto_release_at is cleared for the same reason the signed-in path clears
  -- it: money may already be in flight, and a clock must never cancel an order
  -- the customer has paid for.
  update orders set
    status               = 'awaiting_payment_confirmation',
    receipt_submitted_at = now(),
    auto_release_at      = null
  where id = v_order.id;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, v_order.id, 'order_status_changed',
         'Payment reported for ' || v_order.order_number,
         'The customer says they have paid. Please check your account and confirm.',
         jsonb_build_object('new_status', 'awaiting_payment_confirmation')
  from merchant_staff ms
  join stores s on s.merchant_id = ms.merchant_id
  where s.id = v_order.store_id;

  return jsonb_build_object('orderId', v_order.id, 'status', 'awaiting_payment_confirmation');
end;
$function$;

revoke all on function public.guest_report_payment(text, text) from public, anon, authenticated;
grant execute on function public.guest_report_payment(text, text) to service_role;

comment on function public.guest_report_payment(text, text) is
  'A guest declares that a bank transfer has been sent: pending_payment → awaiting_payment_confirmation, clears the release fuse, notifies the shop. Matches on (order number, email) and customer_id IS NULL, so it can never move a registered customer''s order. service_role only, reached through the rate-limited /api/orders/report-payment (M21).';

-- Counting a buyer's open reservations on every checkout must not be a scan.
create index if not exists orders_open_reservations_idx
  on orders (customer_id, lower(customer_email))
  where status = 'pending_payment' and accepted_at is null;

-- ── 6. Post-conditions ──────────────────────────────────────────────────────
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_order';

  -- Everything M6→M20 must still be present.
  if position('for update of v' in v_src) = 0 then
    raise exception 'M21: the stock row lock vanished from create_order'; end if;
  if position('RR012' in v_src) = 0 then
    raise exception 'M21: the expected-total guard vanished from create_order'; end if;
  if position('order_hold_hours(p_provider)' in v_src) = 0 then
    raise exception 'M21: M13 provider-aware hold window vanished from create_order'; end if;
  if position('o.accepted_at is null' in v_src) = 0 then
    raise exception 'M21: M14 sweep predicate vanished from create_order'; end if;
  if position('order_amounts(' in v_src) = 0 then
    raise exception 'M21: order_amounts pricing authority vanished from create_order'; end if;
  if position('p_guest_email' in v_src) = 0 then
    raise exception 'M21: M20 guest identity vanished from create_order'; end if;
  -- And the three things this migration adds.
  if position('RR013' in v_src) = 0 then
    raise exception 'M21: the open-reservation cap is not in create_order'; end if;
  if position('orders_order_number_key' in v_src) = 0 then
    raise exception 'M21: the order-number retry is not in create_order'; end if;
  if position('require_receipt' in v_src) = 0 then
    raise exception 'M21: the guest receipt-required refusal is not in create_order'; end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='marketplace_settings'
                   and column_name='max_open_reservations') then
    raise exception 'M21: max_open_reservations missing'; end if;

  -- Neither guest entry point may be reachable without going through a route.
  if has_function_privilege('anon', 'public.lookup_order(text,text)', 'EXECUTE') then
    raise exception 'M21: lookup_order became executable by anon'; end if;
  if has_function_privilege('anon', 'public.guest_report_payment(text,text)', 'EXECUTE') then
    raise exception 'M21: guest_report_payment is executable by anon'; end if;
  if has_function_privilege('authenticated', 'public.guest_report_payment(text,text)', 'EXECUTE') then
    raise exception 'M21: guest_report_payment is executable by authenticated'; end if;

  if position('email_confirmed_at is not null' in
       (select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='claim_guest_orders')) = 0 then
    raise exception 'M21: claim_guest_orders still adopts on an unconfirmed address'; end if;
end;
$$;
