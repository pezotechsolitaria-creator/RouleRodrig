-- ── M222 · CASH HAS A DATE, AND A DECLARED TRANSFER WINS ────────────────────
--
-- Two holes the review of M220 found (29 Sept 2026, before it shipped):
--
-- 1. "Yes — pays in person" was accepted on a booking whose customer had
--    already declared a bank transfer (payment_reported_at set). The booking
--    became pay_in_person with nothing paid; the customer was emailed "pay
--    Rs <total> in cash at pickup — nothing to pay online"; and the transfer
--    left the Money desk's queue (it lists pending/approved rows only), so
--    nobody would ever reconcile it. A declared transfer must be checked, not
--    overwritten: admin_confirm_in_person now refuses it with a sentence.
--
-- 2. admin_record_booking_payment stamped every payment now(). The rentals the
--    M220 backfill put on the "cash to collect" list were paid in August and
--    September; recording them today emailed a receipt "received on 29
--    September" and put weeks-old cash in "payments recorded today". It now
--    takes the day the money actually changed hands (never in the future).
--
-- Adding a parameter to a function makes a SECOND overload (the PGRST203
-- trap), so the old signature is dropped first and the grants restated.

begin;

create or replace function public.admin_confirm_in_person(
  p_kind text,
  p_id uuid,
  p_cash_now_rupees integer default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_status text; v_total integer; v_paid integer; v_in_person boolean; v_reported boolean; v_paid_at boolean;
  v_now integer := coalesce(p_cash_now_rupees, 0);
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR004', message = 'Not authorized.';
  end if;
  if p_kind not in ('vehicle', 'place') then
    raise exception using errcode = 'RR005', message = 'Unknown booking kind.';
  end if;
  if v_now < 0 then
    raise exception using errcode = 'RR005', message = 'The amount cannot be negative.';
  end if;

  if p_kind = 'vehicle' then
    select b.status, b.total_amount, coalesce(b.amount_paid, 0), b.pay_in_person,
           b.payment_reported_at is not null, b.deposit_paid_at is not null
      into v_status, v_total, v_paid, v_in_person, v_reported, v_paid_at
      from bookings b where b.id = p_id for update;
  else
    select p.status, p.deposit_amount, coalesce(p.amount_paid, 0), p.pay_in_person,
           p.payment_reported_at is not null, p.deposit_paid_at is not null
      into v_status, v_total, v_paid, v_in_person, v_reported, v_paid_at
      from place_bookings p where p.id = p_id for update;
  end if;

  if v_status is null then
    raise exception using errcode = 'RR003', message = 'Booking not found.';
  end if;

  if v_status = 'confirmed' and v_in_person then
    return jsonb_build_object('status', v_status, 'total', v_total, 'paid', v_paid,
                              'balance', greatest(coalesce(v_total, 0) - v_paid, 0), 'already', true);
  end if;

  if v_status not in ('pending', 'approved') then
    raise exception using errcode = 'RR004',
      message = format('This booking is %s and cannot be confirmed as paid in person.', v_status);
  end if;

  -- M222: a transfer the customer says they sent is checked, never overwritten.
  if v_reported and not v_paid_at then
    raise exception using errcode = 'RR004',
      message = 'The customer says they already sent a transfer. Check your statement: if it arrived, use Confirmed; if not, ask them before switching to cash.';
  end if;

  if v_total is not null and v_now > greatest(v_total - v_paid, 0) then
    raise exception using errcode = 'RR005',
      message = format('That is more than the booking costs (Rs %s still to pay).', greatest(v_total - v_paid, 0));
  end if;

  if p_kind = 'vehicle' then
    update bookings set status = 'confirmed', pay_in_person = true, confirmed_at = now(),
                        approved_at = coalesce(approved_at, now()), payment_due_by = null, unavailable_note = null
     where id = p_id;
  else
    update place_bookings set status = 'confirmed', pay_in_person = true, confirmed_at = now(),
                              availability_checked_at = coalesce(availability_checked_at, now()),
                              payment_due_by = null, unavailable_note = null
     where id = p_id;
  end if;

  if v_now > 0 then
    insert into booking_payments (booking_kind, booking_id, amount_rupees, method, note)
    values (p_kind, p_id, v_now, 'cash', nullif(btrim(coalesce(p_note, '')), ''));
    if p_kind = 'vehicle' then
      update bookings set amount_paid = v_paid + v_now, deposit_paid_at = coalesce(deposit_paid_at, now()) where id = p_id;
    else
      update place_bookings set amount_paid = v_paid + v_now, deposit_paid_at = coalesce(deposit_paid_at, now()) where id = p_id;
    end if;
    v_paid := v_paid + v_now;
  end if;

  return jsonb_build_object('status', 'confirmed', 'total', v_total, 'paid', v_paid,
                            'balance', greatest(coalesce(v_total, 0) - v_paid, 0), 'already', false);
end
$fn$;

drop function if exists public.admin_record_booking_payment(text, uuid, integer, text, text);

create function public.admin_record_booking_payment(
  p_kind text,
  p_id uuid,
  p_amount_rupees integer,
  p_method text default 'cash',
  p_note text default null,
  p_received_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_status text; v_total integer; v_paid integer; v_first boolean; v_payment uuid;
  v_when timestamptz := coalesce(p_received_at, now());
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR004', message = 'Not authorized.';
  end if;
  if p_kind not in ('vehicle', 'place') then
    raise exception using errcode = 'RR005', message = 'Unknown booking kind.';
  end if;
  if p_amount_rupees is null or p_amount_rupees <= 0 then
    raise exception using errcode = 'RR005', message = 'Enter the amount received.';
  end if;
  if p_method not in ('cash', 'mcb_juice', 'bank_transfer', 'card', 'paypal') then
    raise exception using errcode = 'RR005', message = 'Unknown payment method.';
  end if;
  -- A little slack for clocks; money cannot arrive tomorrow.
  if v_when > now() + interval '10 minutes' then
    raise exception using errcode = 'RR005', message = 'The payment date cannot be in the future.';
  end if;

  if p_kind = 'vehicle' then
    select b.status, b.total_amount, coalesce(b.amount_paid, 0), b.deposit_paid_at is null
      into v_status, v_total, v_paid, v_first
      from bookings b where b.id = p_id for update;
  else
    select p.status, p.deposit_amount, coalesce(p.amount_paid, 0), p.deposit_paid_at is null
      into v_status, v_total, v_paid, v_first
      from place_bookings p where p.id = p_id for update;
  end if;

  if v_status is null then
    raise exception using errcode = 'RR003', message = 'Booking not found.';
  end if;
  if v_status not in ('confirmed', 'completed') then
    raise exception using errcode = 'RR004',
      message = format('This booking is %s. Confirm it before recording a payment.', v_status);
  end if;
  if v_total is not null and v_paid + p_amount_rupees > v_total then
    raise exception using errcode = 'RR005',
      message = format('That is more than is owed (Rs %s left to pay).', greatest(v_total - v_paid, 0));
  end if;

  insert into booking_payments (booking_kind, booking_id, amount_rupees, method, note, received_at)
  values (p_kind, p_id, p_amount_rupees, p_method, nullif(btrim(coalesce(p_note, '')), ''), v_when)
  returning id into v_payment;

  if p_kind = 'vehicle' then
    update bookings set amount_paid = v_paid + p_amount_rupees,
                        deposit_paid_at = coalesce(deposit_paid_at, v_when)
     where id = p_id;
  else
    update place_bookings set amount_paid = v_paid + p_amount_rupees,
                              deposit_paid_at = coalesce(deposit_paid_at, v_when)
     where id = p_id;
  end if;

  return jsonb_build_object(
    'paymentId', v_payment, 'first', v_first,
    'total', v_total, 'paid', v_paid + p_amount_rupees,
    'balance', greatest(coalesce(v_total, 0) - (v_paid + p_amount_rupees), 0));
end
$fn$;

revoke all on function public.admin_confirm_in_person(text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_record_booking_payment(text, uuid, integer, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_confirm_in_person(text, uuid, integer, text) to service_role;
grant execute on function public.admin_record_booking_payment(text, uuid, integer, text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';

do $assert$
begin
  if (select count(*) from pg_proc where proname = 'admin_record_booking_payment') <> 1 then
    raise exception 'M222: admin_record_booking_payment has more than one overload';
  end if;
  if has_function_privilege('authenticated', 'public.admin_record_booking_payment(text, uuid, integer, text, text, timestamptz)', 'execute') then
    raise exception 'M222: a client role can record payments';
  end if;
  if position('already sent a transfer' in pg_get_functiondef('public.admin_confirm_in_person(text, uuid, integer, text)'::regprocedure)) = 0 then
    raise exception 'M222: the declared-transfer guard is missing';
  end if;
end
$assert$;

commit;
