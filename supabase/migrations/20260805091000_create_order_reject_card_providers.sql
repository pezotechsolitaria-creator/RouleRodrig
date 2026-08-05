-- M5.1 — enforce the marketplace payment rule at the database boundary.
--
-- Business rule: marketplace product orders take Cash, Bank Transfer or
-- Merchant QR only. PayPal / credit / debit cards are reserved exclusively for
-- vehicle rentals and place bookings, which are a separate system.
--
-- The UI button and the Zod enum have both been updated, but neither is a trust
-- boundary: /api/checkout is documented as a thin pass-through, so a hand-crafted
-- POST with provider:"paypal" previously sailed through Zod, through the route,
-- and into this function's own whitelist, which accepted it. This migration
-- removes 'paypal' from that whitelist so the rule holds even if a future caller
-- bypasses the app layer entirely.
--
-- Only the provider whitelist line changes; the rest of the function is byte-for-
-- byte the M5 version (row-locked stock validation, server-derived pricing,
-- atomic order/items/payment/movements/notification writes) and is reproduced in
-- full because create or replace cannot patch a single statement.
create or replace function create_order(
  p_store_id       uuid,
  p_items          jsonb,
  p_customer_name  text,
  p_customer_phone text,
  p_fulfillment    text,
  p_notes          text,
  p_provider       text
) returns table (order_id uuid, order_number text, total integer, currency text)
language plpgsql security definer set search_path = public as $$
declare
  v_customer      uuid := auth.uid();
  v_store         record;
  v_variant_ids   uuid[];
  v_stale         record;
  v_item          jsonb;
  v_variant       record;
  v_qty           integer;
  v_subtotal      integer := 0;
  v_tax           integer := 0;
  v_total         integer := 0;
  v_commission    integer := 0;
  v_commission_rate numeric;
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
  if p_provider not in ('cash', 'mcb_juice', 'manual') then
    raise exception using errcode = 'RR005', message = 'Invalid payment method.';
  end if;

  select s.id, s.currency, s.tax_inclusive, s.default_tax_rate, s.fulfillment, m.commission_rate
    into v_store
  from stores s join merchants m on m.id = s.merchant_id
  where s.id = p_store_id;

  if v_store.id is null or not store_is_visible(p_store_id) then
    raise exception using errcode = 'RR003', message = 'Shop not found.';
  end if;
  if not coalesce((v_store.fulfillment ->> p_fulfillment)::boolean, false) then
    raise exception using errcode = 'RR005', message = format('This shop does not offer %s.', p_fulfillment);
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
      and o.created_at < now() - interval '30 minutes'
      and oi.variant_id = any(v_variant_ids)
  loop
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select oi.variant_id, oi.quantity, 'restock', v_stale.id, 'auto-released: abandoned checkout'
    from order_items oi where oi.order_id = v_stale.id;
    update orders set status = 'cancelled' where id = v_stale.id;
  end loop;

  v_order_number := 'RR' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));
  insert into orders (order_number, store_id, customer_id, customer_name, customer_phone, status, currency, notes, placed_at)
  values (v_order_number, p_store_id, v_customer, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
          'pending_payment', v_store.currency, nullif(trim(p_notes), ''), now())
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
  v_total := v_subtotal + v_tax;
  -- DEPRECATED (marketplace business rule 1): revenue is a monthly merchant
  -- subscription, not a per-order commission. Still written so the column stays
  -- non-null and historical rows keep their shape; nothing reads or displays it.
  -- Removing the column is a future migration, tracked as technical debt.
  v_commission_rate := coalesce(v_store.commission_rate, 0);
  v_commission := round(v_total * v_commission_rate)::integer;

  update orders set subtotal = v_subtotal, tax = v_tax, total = v_total, commission_amount = v_commission
  where id = v_order_id;

  insert into payments (order_id, provider, amount, currency, status)
  values (v_order_id, p_provider::payment_provider, v_total, v_store.currency, 'pending');

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, v_order_id, 'order_created',
         'New order ' || v_order_number, 'A new order just came in.',
         jsonb_build_object('total', v_total, 'currency', v_store.currency)
  from merchant_staff ms
  where ms.merchant_id = (select merchant_id from stores where id = p_store_id);

  return query select v_order_id, v_order_number, v_total, v_store.currency::text;
end;
$$;
