-- M69 — An organiser could accept a payment but never decline one.
--
-- confirm_order_payment() existed and PaymentReview had a Confirm button. There
-- was no counterpart anywhere: not an RPC, not an API action, not a button. An
-- organiser looking at a receipt that is blurry, for the wrong amount, or that
-- never arrived had exactly two options — approve it and issue a ticket they
-- were not paid for, or leave the buyer waiting indefinitely.
--
-- Rejection is deliberately NOT a cancellation. The order stays alive and drops
-- back to `pending_payment`, so the buyer can upload a better photo or pay
-- again. Cancelling would release their seats to someone else while they were
-- still trying to pay, which turns a blurry photo into a lost sale.
create or replace function public.organizer_reject_payment(
  p_order_id uuid,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_o    orders%rowtype;
  v_note text;
begin
  select * into v_o from orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  -- Same authority as confirming. Reusing can_verify_event_payments() rather
  -- than inventing a second rule is what keeps "can approve" and "can decline"
  -- from ever drifting apart.
  if not can_verify_event_payments(v_o.store_id) then
    raise exception using errcode = '42501', message = 'Not permitted.';
  end if;

  -- Only a payment actually awaiting a decision can be declined. Rejecting an
  -- already-paid order would strand tickets that have been issued.
  if v_o.status <> 'awaiting_payment_confirmation' then
    raise exception using errcode = 'RR004',
      message = 'That order is not waiting for a payment decision.';
  end if;

  v_note := coalesce(nullif(btrim(coalesce(p_reason, '')), ''),
                     'The payment could not be verified.');

  update orders
     set status = 'pending_payment',
         -- The receipt is cleared so the buyer is prompted for a new one rather
         -- than staring at the file that was just refused.
         payment_receipt_path = null,
         receipt_submitted_at = null,
         internal_notes = concat_ws(E'\n', internal_notes,
                            format('[%s] Payment rejected: %s', now()::date, v_note))
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'orderId', p_order_id, 'reason', v_note);
end;
$function$;

revoke execute on function public.organizer_reject_payment(uuid, text) from public, anon;
grant execute on function public.organizer_reject_payment(uuid, text) to authenticated;

-- Verified in a rolled-back transaction as a REAL organiser with verify rights:
-- reject moves the order to pending_payment and clears the receipt; a second
-- reject is refused ("not waiting for a payment decision"); a different
-- signed-in user is refused 42501.
