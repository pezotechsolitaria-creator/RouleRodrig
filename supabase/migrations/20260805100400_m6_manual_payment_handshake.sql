-- M6 — the manual-payment handshake, applied as migration 20260805034154.
--
-- Marketplace money never touches the platform: the customer pays the merchant
-- directly (cash, bank transfer, or by scanning the shop's QR), and the
-- MERCHANT is the only party who can attest that it arrived. These two RPCs are
-- the whole protocol, and each one re-derives its own authority rather than
-- trusting the caller or the route that invoked it.

-- Customer side: "I have paid." Moves the order out of pending_payment into
-- awaiting_payment_confirmation, which is deliberately a distinct status —
-- create_order()'s abandoned-checkout sweep only ever touches pending_payment,
-- so an order where real money has already moved can never be auto-cancelled.
create or replace function submit_payment_receipt(
  p_order_id     uuid,
  p_receipt_path text default null
) returns table (order_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_customer  uuid := auth.uid();
  v_order     record;
  v_require   boolean;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;

  select o.id, o.status, o.store_id, o.customer_id, o.order_number
    into v_order
  from orders o where o.id = p_order_id
  for update;

  -- Same message whether the order does not exist or is not theirs, so this
  -- cannot be used to probe which order ids are real.
  if v_order.id is null or v_order.customer_id is distinct from v_customer then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception using errcode = 'RR004',
      message = 'This order is no longer awaiting payment.';
  end if;

  select coalesce(require_receipt, false) into v_require
  from store_payment_settings where store_id = v_order.store_id;

  if coalesce(v_require, false) and nullif(trim(coalesce(p_receipt_path, '')), '') is null then
    raise exception using errcode = 'RR005', message = 'This shop requires proof of payment.';
  end if;

  -- The receipt must live under THIS order's folder. Without this a customer
  -- could point their order at another customer's uploaded receipt and reuse
  -- someone else's proof of payment.
  if p_receipt_path is not null and p_receipt_path !~ ('^' || p_order_id::text || '/') then
    raise exception using errcode = 'RR005', message = 'Invalid receipt reference.';
  end if;

  update orders set
    status               = 'awaiting_payment_confirmation',
    payment_receipt_path = coalesce(nullif(trim(coalesce(p_receipt_path, '')), ''), payment_receipt_path),
    receipt_submitted_at = now(),
    auto_release_at      = null
  where id = p_order_id;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, p_order_id, 'order_status_changed',
         'Payment reported for ' || v_order.order_number,
         'The customer says they have paid. Please confirm you received it.',
         jsonb_build_object('new_status', 'awaiting_payment_confirmation')
  from merchant_staff ms
  join stores s on s.merchant_id = ms.merchant_id
  where s.id = v_order.store_id;

  return query select p_order_id, 'awaiting_payment_confirmation'::text;
end;
$$;

revoke execute on function submit_payment_receipt(uuid, text) from public, anon;
grant execute on function submit_payment_receipt(uuid, text) to authenticated;

-- Merchant side: "the money arrived." Store staff only — is_store_staff() is
-- checked here rather than in the API route, so it holds even if a future
-- caller reaches the RPC directly. Accepts pending_payment too, because a cash
-- order is paid at handover and never passes through the receipt step.
create or replace function confirm_order_payment(p_order_id uuid)
returns table (order_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_store_id     uuid;
  v_status       order_status;
  v_customer_id  uuid;
  v_order_number text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select o.store_id, o.status, o.customer_id, o.order_number
    into v_store_id, v_status, v_customer_id, v_order_number
  from orders o where o.id = p_order_id
  for update;

  if v_store_id is null or not is_store_staff(v_store_id) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  if v_status not in ('pending_payment', 'awaiting_payment_confirmation') then
    raise exception using errcode = 'RR004',
      message = format('Cannot confirm payment on an order that is "%s".', v_status);
  end if;

  update payments set status = 'captured', updated_at = now() where payments.order_id = p_order_id;
  update orders set status = 'paid', auto_release_at = null where id = p_order_id;

  if v_customer_id is not null then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values ('customer', v_customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order_number, '') || ' confirmed',
      'The shop confirmed your payment — your order is being prepared.',
      jsonb_build_object('new_status', 'paid'));
  end if;

  return query select p_order_id, 'paid'::text;
end;
$$;

revoke execute on function confirm_order_payment(uuid) from public, anon;
grant execute on function confirm_order_payment(uuid) to authenticated;
