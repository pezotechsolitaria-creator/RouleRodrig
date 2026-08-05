-- M6 — create_order v2.
--
-- Changes vs the M5.1 version (the whole body is reproduced because
-- CREATE OR REPLACE cannot patch a single statement, and the signature gains
-- three GPS parameters so the old function is dropped first):
--   * enforces merchant_subscription_active() — a lapsed shop cannot take orders
--   * validates the chosen method against that shop's own store_payment_settings
--     instead of a global whitelist, and accepts the new 'bank_transfer' rail
--   * derives delivery_fee SERVER-SIDE from marketplace_settings, so the client
--     cannot influence what delivery costs
--   * PERSISTS fulfillment_method + GPS, which the previous version validated
--     and then silently discarded
--   * sets auto_release_at instead of relying on a hardcoded "cancel anything
--     pending_payment for 30 minutes" sweep, and notifies the customer when the
--     sweep does release an order
--   * stops computing commission (business rule: monthly subscription instead);
--     commission_amount is written as 0 to keep the NOT NULL column valid

-- Live definition applied as migration 20260805034123 (m6_create_order_v2).
-- Reproduced here verbatim so this repo mirrors production.

drop function if exists create_order(uuid, jsonb, text, text, text, text, text);

create or replace function create_order(
  p_store_id       uuid,
  p_items          jsonb,
  p_customer_name  text,
  p_customer_phone text,
  p_fulfillment    text,
  p_notes          text,
  p_provider       text,
  p_delivery_lat          double precision default null,
  p_delivery_lng          double precision default null,
  p_delivery_instructions text default null
) returns table (order_id uuid, order_number text, total integer, currency text, delivery_fee integer)
language plpgsql security definer set search_path = public as $$
declare
  v_customer      uuid := auth.uid();
  v_store         record;
  v_pay           record;
  v_settings      record;
  v_variant_ids   uuid[];
  v_stale         record;
  v_item          jsonb;
  v_variant       record;
  v_qty           integer;
  v_subtotal      integer := 0;
  v_tax           integer := 0;
  v_delivery_fee  integer := 0;
  v_total         integer := 0;
  v_order_id      uuid;
  v_order_number  text;
begin
  if v_customer is null then
    raise exception 'not authenticated';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'RR005', message = 'Your cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception using errcode = 'RR005', message = 'Too many items in one order.';
  end if;
  if p_fulfillment not in ('pickup', 'delivery') then
    raise exception using errcode = 'RR005', message = 'Invalid fulfillment option.';
  end if;
  -- 'paypal' deliberately absent — see header.
  if p_provider not in ('cash', 'bank_transfer', 'mcb_juice', 'manual') then
    raise exception using errcode = 'RR005', message = 'Invalid payment method.';
  end if;

  select s.id, s.currency, s.tax_inclusive, s.default_tax_rate, s.fulfillment, s.merchant_id
    into v_store
  from stores s where s.id = p_store_id;

  if v_store.id is null or not store_is_visible(p_store_id) then
    raise exception using errcode = 'RR003', message = 'Shop not found.';
  end if;
  if not merchant_subscription_active(v_store.merchant_id) then
    raise exception using errcode = 'RR008',
      message = 'This shop is not accepting orders at the moment.';
  end if;

  if not coalesce((v_store.fulfillment ->> p_fulfillment)::boolean, false) then
    raise exception using errcode = 'RR005', message = format('This shop does not offer %s.', p_fulfillment);
  end if;

  select * into v_pay from store_payment_settings where store_id = p_store_id;

  if p_provider = 'cash' and not coalesce(v_pay.accepts_cash, true) then
    raise exception using errcode = 'RR009', message = 'This shop does not accept cash.';
  end if;
  if p_provider in ('bank_transfer', 'mcb_juice')
     and not coalesce(v_pay.accepts_bank_transfer, false) then
    raise exception using errcode = 'RR009', message = 'This shop does not accept bank transfer.';
  end if;

  if p_fulfillment = 'delivery' then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception using errcode = 'RR005', message = 'A delivery location is required.';
    end if;
    if p_delivery_lat not between -90 and 90 or p_delivery_lng not between -180 and 180 then
      raise exception using errcode = 'RR005', message = 'That delivery location is not valid.';
    end if;
    select * into v_settings from marketplace_settings where id = 'main';
    if not coalesce(v_settings.delivery_enabled, false) then
      raise exception using errcode = 'RR005', message = 'Delivery is not available at the moment.';
    end if;
    v_delivery_fee := coalesce(v_settings.delivery_base_fee, 0);
  end if;

  select array_agg(nullif(elem ->> 'variant_id', '')::uuid) into v_variant_ids
  from jsonb_array_elements(p_items) elem;
  if v_variant_ids is null or array_position(v_variant_ids, null) is not null then
    raise exception using errcode = 'RR005', message = 'Invalid item in cart.';
  end if;

  for v_stale in
    select distinct o.id from orders o
    join order_items oi on oi.order_id = o.id
    where o.status = 'pending_payment'
      and o.auto_release_at is not null
      and o.auto_release_at < now()
      and oi.variant_id = any(v_variant_ids)
  loop
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select oi.variant_id, oi.quantity, 'restock', v_stale.id, 'auto-released: abandoned checkout'
    from order_items oi where oi.order_id = v_stale.id;
    update orders set status = 'cancelled' where id = v_stale.id;
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    select 'customer', o.customer_id, o.id, 'order_status_changed',
           'Order ' || o.order_number || ' expired',
           'It was not paid in time, so the items were released.',
           jsonb_build_object('new_status', 'cancelled')
    from orders o where o.id = v_stale.id and o.customer_id is not null;
  end loop;

  v_order_number := 'RR' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));
  insert into orders (
    order_number, store_id, customer_id, customer_name, customer_phone, status, currency, notes, placed_at,
    fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, auto_release_at
  )
  values (
    v_order_number, p_store_id, v_customer, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    'pending_payment', v_store.currency, nullif(trim(p_notes), ''), now(),
    p_fulfillment, v_delivery_fee,
    case when p_fulfillment = 'delivery' then p_delivery_lat end,
    case when p_fulfillment = 'delivery' then p_delivery_lng end,
    nullif(trim(p_delivery_instructions), ''),
    now() + interval '48 hours'
  )
  returning id into v_order_id;

  for v_item in
    select * from jsonb_array_elements(p_items) e order by (e ->> 'variant_id')
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 100 then
      raise exception using errcode = 'RR005', message = 'Invalid quantity.';
    end if;

    select v.id, v.price, v.stock_quantity, v.is_active, v.name, p.name as product_name,
           p.status as product_status, p.store_id
      into v_variant
    from product_variants v join products p on p.id = v.product_id
    where v.id = (v_item ->> 'variant_id')::uuid
    for update of v;

    if v_variant.id is null or v_variant.store_id <> p_store_id then
      raise exception using errcode = 'RR003', message = 'One of the items in your cart is no longer available.';
    end if;
    if not v_variant.is_active or v_variant.product_status <> 'active' then
      raise exception using errcode = 'RR006', message = format('"%s" is no longer available.', v_variant.product_name);
    end if;
    if v_variant.stock_quantity < v_qty then
      raise exception using errcode = 'RR007',
        message = format('Only %s left of "%s".', v_variant.stock_quantity, v_variant.product_name);
    end if;

    insert into order_items (order_id, variant_id, product_name, variant_name, unit_price, quantity, line_total)
    values (v_order_id, v_variant.id, v_variant.product_name, v_variant.name, v_variant.price, v_qty, v_variant.price * v_qty);

    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    values (v_variant.id, -v_qty, 'sale', v_order_id, 'order ' || v_order_number);

    v_subtotal := v_subtotal + v_variant.price * v_qty;
  end loop;

  if not v_store.tax_inclusive then
    v_tax := round(v_subtotal * coalesce(v_store.default_tax_rate, 0))::integer;
  end if;
  -- Delivery is charged on top of goods + tax. The fee came from
  -- marketplace_settings above, never from the client.
  v_total := v_subtotal + v_tax + v_delivery_fee;
  -- DEPRECATED (business rule 1): revenue is a monthly merchant subscription,
  -- not a per-order commission. Written as 0 to keep the NOT NULL column valid;
  -- dropping it entirely is a later migration, tracked as technical debt.

  update orders set subtotal = v_subtotal, tax = v_tax, total = v_total, commission_amount = 0
  where id = v_order_id;

  insert into payments (order_id, provider, amount, currency, status)
  values (v_order_id, p_provider::payment_provider, v_total, v_store.currency, 'pending');

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, v_order_id, 'order_created',
         'New order ' || v_order_number, 'A new order just came in.',
         jsonb_build_object('total', v_total, 'currency', v_store.currency)
  from merchant_staff ms
  where ms.merchant_id = v_store.merchant_id;

  return query select v_order_id, v_order_number, v_total, v_store.currency::text, v_delivery_fee;
end;
$$;

revoke execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text) from public, anon;
grant execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text) to authenticated;
