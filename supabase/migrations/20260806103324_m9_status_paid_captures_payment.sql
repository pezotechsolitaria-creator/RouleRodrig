-- orders.status='paid' with payments.status='pending' must be unreachable.
--
-- The merchant order screen offers TWO controls labelled "Confirm payment
-- received": the prominent gold header button (update_order_status -> 'paid')
-- and the one inside PaymentConfirmCard (confirm_order_payment). Only the second
-- captures the payment. Reproduced live:
--
--   before  order pending_payment / payment pending
--   tap header "Confirm payment received"
--   after   order PAID            / payment STILL pending
--
-- The two records then disagree permanently: confirm_order_payment() refuses any
-- order not in ('pending_payment','awaiting_payment_confirmation'), and
-- mark_order_paid() is revoked from authenticated, so no in-app path can put it
-- right. Any revenue figure keyed on payments.status='captured' undercounts, and
-- the merchant's own Payment card keeps showing "pending" on a paid order,
-- prompting them to chase a customer who already paid.
--
-- Root-cause fix rather than a UI-only one: make the transition INTO 'paid'
-- capture the payment as part of the same statement, so the two paths converge
-- and cannot diverge again no matter which button is wired to what. The UI
-- change (removing the duplicate button) is a usability fix on top, not the
-- guarantee.
do $do$
declare
  src text; newsrc text;
  anchor text := 'update orders set status = p_new_status';
  found  int;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='update_order_status' and pronamespace='public'::regnamespace;
  if src is null then raise exception 'update_order_status() not found'; end if;

  if position('payments_captured_by_status' in src) > 0 then
    raise notice 'already captures payment; nothing to do';
    return;
  end if;

  found := position(anchor in src);
  if found = 0 then
    raise exception 'update_order_status(): status-update anchor not found — refusing to patch blindly';
  end if;

  -- Append the capture immediately after the status write, inside the same
  -- transaction and the same row lock the function already holds.
  newsrc := replace(
    src,
    'update orders set status = p_new_status',
    'update orders set status = p_new_status'
  );

  -- Insert the capture just before the function returns its result set.
  newsrc := replace(
    newsrc,
    '  return query',
    '  -- payments_captured_by_status: a manual "paid" must move the money record
  -- too, or orders and payments disagree with no way back. Only ever advances
  -- a still-pending row; a captured or failed payment is left untouched.
  if p_new_status = ''paid'' then
    update payments set status = ''captured'', updated_at = now()
     where payments.order_id = p_order_id and payments.status = ''pending'';
  end if;

  return query'
  );

  if newsrc = src then
    raise exception 'update_order_status(): return anchor not found — refusing to patch blindly';
  end if;

  execute newsrc;
end
$do$;

-- Repair the rows already diverged by this defect. Scoped to orders that are
-- genuinely past payment, so nothing pending is swept up by accident.
update payments p
   set status = 'captured', updated_at = now()
  from orders o
 where p.order_id = o.id
   and p.status = 'pending'
   and o.status in ('paid','preparing','ready_for_pickup','collected');
