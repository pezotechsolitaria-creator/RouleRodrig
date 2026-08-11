-- M53 — An order-status path the platform admin can actually use.
--
-- ── THE PROBLEM, FOUND BY READING THE FUNCTION RATHER THAN ASSUMING ─────────
-- Food orders are managed by the Roulé Rodrigues operator, not by a merchant,
-- because a cooker has no login (M50). But the only sanctioned status path,
-- update_order_status(), opens with:
--
--     v_owner := auth.uid();
--     if v_owner is null then raise exception 'not authenticated'; end if;
--     ... if not is_store_staff(v_store_id) then raise RR003 ...
--
-- /admin authenticates with a signed password COOKIE and has no Supabase user
-- at all, so auth.uid() is null and the service-role client fails on the very
-- first line. This is the two-admin-identities situation already documented on
-- /api/admin/delivery-zones and /api/admin/subscriptions — the difference is
-- that here it would have silently made the entire food order queue unusable,
-- with an error message ("not authenticated") that points at the wrong thing.
--
-- ── THE FIX, AND WHY IT IS A SECOND FUNCTION ───────────────────────────────
-- The obvious shortcut is to weaken update_order_status() so a null auth.uid()
-- passes. That would hand every service-role code path in the system the right
-- to move any order to any status, forever, in exchange for one admin screen.
-- The gate is the point of that function.
--
-- So this is a SEPARATE, admin-scoped entry point with the SAME state machine
-- and the SAME side effects, gated the way every other admin_* RPC in this
-- schema is gated (`auth.uid() is null or is_platform_admin()`). Two doors, one
-- set of rules — exactly the shape M8 already established with
-- set_store_payment_settings / admin_update_store_payment.
--
-- ── WHAT IT DELIBERATELY DOES NOT CHANGE ───────────────────────────────────
-- The legal transitions are reproduced verbatim, not relaxed. An admin cannot
-- teleport an order from pending_payment to collected any more than a merchant
-- can: the reason that rule exists (a collected order that was never paid for
-- is unrecoverable) does not stop applying because the operator is trusted.
-- Stock release on cancel, the customer notification row, and the payment-row
-- advance on 'paid' are all reproduced for the same reason — a second door that
-- skips half the consequences is worse than no second door.
--
-- The pickup token is NOT issued here, because it is issued by the M28 trigger
-- on the orders row. Both doors get it, and neither has to remember to.

create or replace function public.admin_update_order_status(
  p_order_id      uuid,
  p_new_status    text,
  p_internal_note text default null
)
returns table(order_id uuid, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_store_id       uuid;
  v_current_status order_status;
  v_customer_id    uuid;
  v_order_number   text;
  v_legal          boolean;
begin
  -- The /admin cookie session (service role, auth.uid() null) and a real
  -- platform admin are both allowed. Anyone else signed in is not.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR004', message = 'Not authorized.';
  end if;

  select orders.store_id, orders.status, orders.customer_id, orders.order_number
    into v_store_id, v_current_status, v_customer_id, v_order_number
  from orders where orders.id = p_order_id
  for update;

  if v_store_id is null then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  -- Reproduced verbatim from update_order_status(). Not relaxed for admins:
  -- the reason a collected-but-never-paid order is forbidden does not stop
  -- applying because the operator is trusted.
  v_legal := (
    p_new_status = v_current_status::text or
    (v_current_status = 'pending_payment' and p_new_status in ('paid', 'cancelled')) or
    (v_current_status = 'awaiting_payment_confirmation' and p_new_status in ('paid', 'cancelled')) or
    (v_current_status = 'paid' and p_new_status in ('preparing', 'cancelled')) or
    (v_current_status = 'preparing' and p_new_status in ('ready_for_pickup', 'cancelled')) or
    (v_current_status = 'ready_for_pickup' and p_new_status in ('collected', 'cancelled'))
  );
  if not v_legal then
    raise exception using errcode = 'RR004',
      message = format('Cannot move an order from "%s" to "%s".', v_current_status, p_new_status);
  end if;

  update orders set status = p_new_status::order_status,
    internal_notes = case when p_internal_note is not null and trim(p_internal_note) <> ''
      then coalesce(internal_notes || E'\n\n', '') || '[' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || trim(p_internal_note)
      else internal_notes end
  where id = p_order_id;

  -- Cancelling returns the portions to the kitchen's count. Without this a
  -- cancelled food order would hold its portions until the next morning reset,
  -- and the last four curries of the evening would be invisible to everyone.
  if p_new_status = 'cancelled' and v_current_status not in ('cancelled', 'refunded') then
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select oi.variant_id, oi.quantity, 'restock', p_order_id, 'released: order cancelled by platform admin'
    from order_items oi where oi.order_id = p_order_id;
  end if;

  if v_customer_id is not null and p_new_status <> v_current_status::text then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values ('customer', v_customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order_number, '') || ' updated',
      'Your order is now: ' || p_new_status,
      jsonb_build_object('previous_status', v_current_status, 'new_status', p_new_status));
  end if;

  -- A manual "paid" must move the money record too, or orders and payments
  -- disagree with no way back. Only ever advances a still-pending row.
  if p_new_status = 'paid' then
    update payments set status = 'captured', updated_at = now()
     where payments.order_id = p_order_id and payments.status = 'pending';
  end if;

  return query select p_order_id, p_new_status;
end;
$fn$;

comment on function public.admin_update_order_status(uuid, text, text) is
  'The platform operator''s door to the order state machine. Same transitions, same stock release, same notification and same payment advance as update_order_status() — only the authorization differs, because /admin has a cookie session and no auth.uid(). Weakening the merchant function instead would have handed every service-role path in the system unrestricted order control (M53).';

-- Never reachable from the public API. The /admin cookie check in the route is
-- the security boundary; the service role is how the write lands.
revoke execute on function public.admin_update_order_status(uuid, text, text) from public, anon, authenticated;
