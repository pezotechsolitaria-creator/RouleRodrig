-- ════════════════════════════════════════════════════════════════════════════
-- M70 — The platform operator can finish an event sale
--
-- The gap, in one sentence: a ticket exists only once its order reaches 'paid',
-- and nothing reachable from /admin could put it there.
--
-- Tickets are issued by the orders_sync_tickets trigger → issue_order_tickets,
-- which fires on the transition to 'paid'. The only function that performs that
-- transition for a manual payment is confirm_order_payment(), and it opens with
--
--     if auth.uid() is null then raise exception 'not authenticated';
--
-- then requires is_store_staff(). /admin authenticates with a signed password
-- cookie and reaches Postgres as service_role with NO Supabase user, so
-- auth.uid() is null there and that first line refuses outright. Its two
-- callers both run on a signed-in user's client: the organiser dashboard and
-- the merchant dashboard.
--
-- Consequence for a platform-run event — one with no organiser account, which
-- is exactly the managed-ticketing case: the buyer pays by bank transfer or
-- cash, the order sits at awaiting_payment_confirmation forever, no ticket row
-- is ever created, and no ticket email is ever sent. The sale simply stops.
--
-- This adds the /admin-shaped counterparts. Same effects, same locking, same
-- refusals — only the identity check differs, following M25's established
-- pattern for every other admin_* function in this schema.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Read: every order for one event ─────────────────────────────────────────
-- Scoped to a store that actually has an event, so this can never become a
-- back door onto a merchant's shop orders.
create or replace function admin_event_orders(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_out jsonb;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  if not exists (select 1 from events e where e.store_id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'Not an event.';
  end if;

  select jsonb_build_object(
    'storeId', p_store_id,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            o.id,
               'orderNumber',   o.order_number,
               'status',        o.status,
               'total',         o.total,
               'currency',      o.currency,
               'customerName',  o.customer_name,
               'customerEmail', o.customer_email,
               'customerPhone', o.customer_phone,
               'placedAt',      coalesce(o.placed_at, o.created_at),
               'receiptPath',   o.payment_receipt_path,
               'payment', (select jsonb_build_object('provider', pay.provider, 'status', pay.status)
                             from payments pay where pay.order_id = o.id
                            order by pay.created_at desc limit 1),
               'items', coalesce((select jsonb_agg(jsonb_build_object(
                                    'name', oi.product_name, 'variant', oi.variant_name,
                                    'quantity', oi.quantity, 'lineTotal', oi.line_total)
                                  order by oi.product_name)
                                   from order_items oi where oi.order_id = o.id), '[]'::jsonb),
               -- How many tickets this order actually produced, and how many
               -- have walked through the door. Both are the operator's answer
               -- to "did this work?".
               'ticketsIssued',  (select count(*) from tickets t where t.order_id = o.id),
               'ticketsScanned', (select count(*) from tickets t
                                   where t.order_id = o.id and t.used_at is not null)
             ) order by coalesce(o.placed_at, o.created_at) desc)
        from orders o where o.store_id = p_store_id
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'orders',  count(*),
        'paid',    count(*) filter (where o.status in ('paid','preparing','ready_for_pickup','collected')),
        'waiting', count(*) filter (where o.status in ('pending_payment','awaiting_payment_confirmation')),
        'revenue', coalesce(sum(o.total) filter (
                     where o.status in ('paid','preparing','ready_for_pickup','collected')), 0))
      from orders o where o.store_id = p_store_id
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function admin_event_orders(uuid) from public, anon, authenticated;

-- ── Write: confirm the payment, which is what issues the tickets ────────────
create or replace function admin_confirm_event_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order   orders%rowtype;
  v_tickets integer;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  -- EVENT orders only. Without this the function would confirm payment on any
  -- shop or kitchen order in the database, which is the merchant's decision to
  -- make, not the platform's.
  if not exists (select 1 from events e where e.store_id = v_order.store_id) then
    raise exception using errcode = 'RR003', message = 'Not an event order.';
  end if;

  if v_order.status not in ('pending_payment', 'awaiting_payment_confirmation') then
    raise exception using errcode = 'RR004',
      message = format('Cannot confirm payment on an order that is "%s".', v_order.status);
  end if;

  update payments set status = 'captured', updated_at = now() where payments.order_id = p_order_id;
  -- The transition that matters: orders_sync_tickets fires here and
  -- issue_order_tickets creates the ticket rows.
  update orders set status = 'paid', auto_release_at = null where id = p_order_id;

  if v_order.customer_id is not null then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values ('customer', v_order.customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order.order_number, '') || ' confirmed',
      'Your payment is confirmed — your tickets are on their way.',
      jsonb_build_object('new_status', 'paid'));
  end if;

  select count(*) into v_tickets from tickets t where t.order_id = p_order_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'event.payment_confirmed', 'order', p_order_id::text,
          jsonb_build_object('orderNumber', v_order.order_number,
                             'total', v_order.total,
                             'ticketsIssued', v_tickets));

  return jsonb_build_object('ok', true, 'orderNumber', v_order.order_number, 'ticketsIssued', v_tickets);
end;
$$;

revoke all on function admin_confirm_event_payment(uuid) from public, anon, authenticated;

-- ── Write: refuse a payment without cancelling the order ───────────────────
-- Mirrors organizer_reject_payment. A rejection is not a cancellation: the
-- order drops back to pending_payment so the buyer can try again, because
-- cancelling would release their seats while they were still trying to pay.
create or replace function admin_reject_event_payment(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order orders%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  if not exists (select 1 from events e where e.store_id = v_order.store_id) then
    raise exception using errcode = 'RR003', message = 'Not an event order.';
  end if;
  if v_order.status <> 'awaiting_payment_confirmation' then
    raise exception using errcode = 'RR004',
      message = format('Only an order awaiting confirmation can be rejected — this one is "%s".', v_order.status);
  end if;

  update payments set status = 'pending', updated_at = now() where payments.order_id = p_order_id;
  update orders set status = 'pending_payment' where id = p_order_id;

  if v_order.customer_id is not null then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values ('customer', v_order.customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order.order_number, '') || ' — payment not confirmed',
      coalesce(nullif(btrim(p_reason), ''), 'We could not confirm your payment. Please try again.'),
      jsonb_build_object('new_status', 'pending_payment'));
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'event.payment_rejected', 'order', p_order_id::text,
          jsonb_build_object('orderNumber', v_order.order_number, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'orderNumber', v_order.order_number);
end;
$$;

revoke all on function admin_reject_event_payment(uuid, text) from public, anon, authenticated;
