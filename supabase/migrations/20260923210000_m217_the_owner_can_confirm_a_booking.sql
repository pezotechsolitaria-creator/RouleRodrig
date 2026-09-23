-- ── M217 · THE OWNER CAN CONFIRM A BOOKING WITHOUT FAKING A PAYMENT ────────
--
-- M216 made Chez Banane pre-order only: an order is placed a day or two before
-- it is cooked, and paid in cash at handover. Who tells the cook? Not the
-- /kitchen board — the only kitchen login owns seven draft/test shops and last
-- signed in on 6 Sept. The real path is the owner's alert (ntfy / WhatsApp),
-- then a phone call to the cook.
--
-- The owner then had no way to say "the cook knows" on the platform:
--   · accept_order() — the merchant path — admits store staff and kitchen
--     owners only (is_store_staff), never a platform admin;
--   · admin_update_order_status() can move a pending order only to 'paid' or
--     'cancelled'. 'paid' also CAPTURES the pending cash row: pressing it on
--     Wednesday for a Friday order records money nobody has received, tells
--     the customer "paid", and turns any later no-show into a refund for cash
--     that never existed.
-- And an order nobody accepts is cancelled 30 minutes after its slot ends
-- (expire_order, path 2) — possibly after the food was handed over.
--
-- admin_accept_order() is accept_order() for the platform owner: it records
-- accepted_at (which is what stops the sweeper), clears the hold, and tells the
-- customer the booking is confirmed — and it touches no payment.
--
-- Called through the service role by /api/admin/food/orders after the route
-- has verified the admin, exactly like admin_update_order_status (M53). The
-- in-body guard refuses a signed-in non-admin should a grant ever widen.

begin;

create or replace function public.admin_accept_order(p_order_id uuid)
returns table(order_id uuid, accepted_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_order record;
  v_when  text;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR004', message = 'Not authorized.';
  end if;

  select o.id, o.status::text as status, o.customer_id, o.order_number,
         o.accepted_at, o.pickup_slot
    into v_order
    from orders o where o.id = p_order_id
   for update;

  if v_order.id is null then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  if v_order.status not in ('pending_payment', 'awaiting_payment_confirmation') then
    raise exception using errcode = 'RR004', message = 'This order can no longer be confirmed.';
  end if;

  -- Idempotent, like accept_order: a double tap returns the first confirmation
  -- and notifies nobody twice.
  if v_order.accepted_at is not null then
    return query select v_order.id, v_order.accepted_at;
    return;
  end if;

  update orders o set accepted_at = now(), auto_release_at = null where o.id = p_order_id;

  -- The day, in Rodrigues time, when the order has one.
  if v_order.pickup_slot is not null then
    v_when := to_char(lower(v_order.pickup_slot) at time zone 'Indian/Mauritius', 'FMDay FMDD FMMonth, HH24:MI');
  end if;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'customer', o.customer_id, o.id, 'order_status_changed',
         'Order ' || o.order_number || ' confirmed',
         case when v_when is not null
              then 'Confirmed for ' || v_when || '. Nothing has been charged — you pay the kitchen at handover.'
              else 'The shop has confirmed your order and is holding your items. Nothing has been charged — you pay the shop at handover.'
         end,
         jsonb_build_object('accepted', true, 'by', 'platform')
    from orders o where o.id = p_order_id and o.customer_id is not null;

  return query select o.id, o.accepted_at from orders o where o.id = p_order_id;
end;
$fn$;

revoke all on function public.admin_accept_order(uuid) from public, anon, authenticated;
grant execute on function public.admin_accept_order(uuid) to service_role;

do $assert$
begin
  if has_function_privilege('anon', 'public.admin_accept_order(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_accept_order(uuid)', 'execute') then
    raise exception 'M217: a client role can confirm orders';
  end if;
  if not has_function_privilege('service_role', 'public.admin_accept_order(uuid)', 'execute') then
    raise exception 'M217: the admin route cannot call it';
  end if;
  -- It must never write a payment.
  if position('payments' in lower(pg_get_functiondef('public.admin_accept_order(uuid)'::regprocedure))) > 0 then
    raise exception 'M217: admin_accept_order touches payments';
  end if;
end
$assert$;

commit;
