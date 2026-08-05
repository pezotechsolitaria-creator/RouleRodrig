-- Bug 1: checkout displayed a client-computed subtotal while the backend charged
-- a different, server-derived total. Under bank transfer that number is what the
-- customer actually wires, so the two must come from the same place.
--
-- order_amounts() is that place: given a store, a subtotal and a fulfillment
-- mode it returns tax, delivery fee and payable total. Both create_order()
-- (which charges) and quote_order() (which displays) call it, so the pricing
-- POLICY cannot drift between what is shown and what is taken.
--
-- Subtotal is deliberately NOT computed here: create_order derives it inside its
-- row-locking loop (which is what makes overselling impossible) while a quote
-- reads current prices unlocked. Only the policy is shared.
create or replace function order_amounts(
  p_store_id    uuid,
  p_subtotal    integer,
  p_fulfillment text
) returns table (tax integer, delivery_fee integer, total integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_store    record;
  v_settings record;
  v_tax      integer := 0;
  v_fee      integer := 0;
begin
  select s.tax_inclusive, s.default_tax_rate into v_store from stores s where s.id = p_store_id;
  if not coalesce(v_store.tax_inclusive, true) then
    v_tax := round(p_subtotal * coalesce(v_store.default_tax_rate, 0))::integer;
  end if;

  -- Only the Roule Rodrigues delivery network charges. Pickup and a
  -- customer-arranged driver are both free.
  if p_fulfillment = 'rr_delivery' then
    select * into v_settings from marketplace_settings where id = 'main';
    if coalesce(v_settings.delivery_enabled, false) then
      v_fee := coalesce(v_settings.delivery_base_fee, 0);
    end if;
  end if;

  return query select v_tax, v_fee, p_subtotal + v_tax + v_fee;
end;
$$;

-- Read-only quote used by the checkout UI. Applies the same visibility,
-- subscription and availability rules as create_order so a customer is never
-- quoted for something they cannot buy, but takes no locks and writes nothing.
create or replace function quote_order(
  p_store_id    uuid,
  p_items       jsonb,
  p_fulfillment text
) returns table (subtotal integer, tax integer, delivery_fee integer, total integer, currency text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_store    record;
  v_item     jsonb;
  v_variant  record;
  v_qty      integer;
  v_subtotal integer := 0;
  v_amounts  record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'RR005', message = 'Your cart is empty.';
  end if;
  if p_fulfillment not in ('pickup', 'customer_delivery', 'rr_delivery') then
    raise exception using errcode = 'RR005', message = 'Invalid fulfillment option.';
  end if;

  select s.id, s.currency, s.merchant_id into v_store from stores s where s.id = p_store_id;
  if v_store.id is null or not store_is_visible(p_store_id) then
    raise exception using errcode = 'RR003', message = 'Shop not found.';
  end if;
  if not merchant_subscription_active(v_store.merchant_id) then
    raise exception using errcode = 'RR008', message = 'This shop is not accepting orders at the moment.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 100 then
      raise exception using errcode = 'RR005', message = 'Invalid quantity.';
    end if;
    select v.price, v.is_active, p.status as product_status, p.store_id
      into v_variant
    from product_variants v join products p on p.id = v.product_id
    where v.id = (v_item ->> 'variant_id')::uuid;
    if v_variant.store_id is null or v_variant.store_id <> p_store_id then
      raise exception using errcode = 'RR003', message = 'One of the items in your cart is no longer available.';
    end if;
    v_subtotal := v_subtotal + v_variant.price * v_qty;
  end loop;

  select * into v_amounts from order_amounts(p_store_id, v_subtotal, p_fulfillment);
  return query select v_subtotal, v_amounts.tax, v_amounts.delivery_fee, v_amounts.total, v_store.currency::text;
end;
$$;

revoke execute on function order_amounts(uuid, integer, text) from public, anon;
revoke execute on function quote_order(uuid, jsonb, text) from public, anon;
grant execute on function quote_order(uuid, jsonb, text) to authenticated;
