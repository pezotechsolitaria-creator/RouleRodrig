-- M5: payment settlement RPCs. Deliberately NOT callable by any client role
-- (revoked from public/anon/authenticated below) — the trust boundary here
-- is "did the payment provider confirm this," never "is the caller the
-- order's owner." A customer must never be able to mark their own order
-- paid by calling these directly. Only the server, using the service-role
-- client AFTER an independently-verified provider response (e.g. PayPal's
-- capture-order COMPLETED status), may call them — mirrors this repo's
-- existing /api/paypal/capture-order pattern for the legacy booking flow.
create or replace function mark_order_paid(p_order_id uuid, p_provider_ref text)
returns table (order_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_payment_status payment_status;
  v_customer_id    uuid;
  v_order_number   text;
begin
  select p.status, o.customer_id, o.order_number
    into v_payment_status, v_customer_id, v_order_number
  from payments p join orders o on o.id = p.order_id
  where p.order_id = p_order_id
  for update of p;

  if v_payment_status is null then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  -- Idempotent: a repeat capture callback (webhook retry, double-click)
  -- on an already-settled payment is a no-op success, not an error.
  if v_payment_status = 'captured' then
    return query select p_order_id, 'paid'::text;
    return;
  end if;
  if v_payment_status <> 'pending' then
    raise exception using errcode = 'RR004', message = format('Payment is already "%s".', v_payment_status);
  end if;

  update payments set status = 'captured', provider_ref = p_provider_ref, updated_at = now() where order_id = p_order_id;
  update orders set status = 'paid' where id = p_order_id;

  if v_customer_id is not null then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values ('customer', v_customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order_number, '') || ' confirmed', 'Payment received — your order is confirmed.',
      jsonb_build_object('new_status', 'paid'));
  end if;

  return query select p_order_id, 'paid'::text;
end;
$$;

-- Releases the stock this order reserved at checkout (compensating
-- 'restock' movements) and cancels it. Called when a provider explicitly
-- reports a failed/declined payment — never leaves stock reserved for a
-- purchase that didn't happen.
create or replace function mark_order_payment_failed(p_order_id uuid)
returns table (order_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_payment_status payment_status;
  v_order_status   order_status;
begin
  select p.status, o.status into v_payment_status, v_order_status
  from payments p join orders o on o.id = p.order_id
  where p.order_id = p_order_id
  for update of p;

  if v_payment_status is null then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  if v_payment_status = 'captured' then
    raise exception using errcode = 'RR004', message = 'Payment already captured — cannot mark as failed.';
  end if;
  if v_payment_status = 'failed' then
    return query select p_order_id, v_order_status::text; -- already released, idempotent
    return;
  end if;

  update payments set status = 'failed', updated_at = now() where order_id = p_order_id;

  if v_order_status = 'pending_payment' then
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select variant_id, quantity, 'restock', p_order_id, 'released: payment failed'
    from order_items where order_id = p_order_id;
    update orders set status = 'cancelled' where id = p_order_id;
  end if;

  return query select p_order_id, 'cancelled'::text;
end;
$$;

revoke execute on function mark_order_paid(uuid, text) from public, anon, authenticated;
revoke execute on function mark_order_payment_failed(uuid) from public, anon, authenticated;
