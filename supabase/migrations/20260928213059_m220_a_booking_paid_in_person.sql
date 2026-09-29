-- ── M220 · A BOOKING THE CUSTOMER PAYS IN PERSON ───────────────────────────
--
-- The owner, 29 Sept 2026: "add an option in admin dashboard where we can
-- accept a booking directly without paying on the website as people tend to
-- pay on cash by hand".
--
-- He already does it — with the wrong button. All 4 confirmed rentals and the
-- 1 confirmed place booking were moved to 'confirmed' with the status pill and
-- have NO payment recorded anywhere. That pill means "the transfer arrived"
-- (app/api/admin/bookings/route.ts), so for a cash customer:
--   · nobody is told anything in writing — a web push at most;
--   · the booking page says "Confirmed" beside "Deposit to confirm Rs X";
--   · every reminder prints "Balance at pickup = total − deposit" although no
--     deposit was paid — RR-329D81 was told Rs 3,864 when Rs 5,152 was owed,
--     and the owner reads the same figure at the door;
--   · when the cash is handed over, nothing can record it: no method, no
--     amount, no receipt, and "Est. Revenue" counts money never collected.
--
-- ── TWO FACTS, NOT ONE BUTTON ─────────────────────────────────────────────
--   1. CONFIRMED, PAYS IN PERSON — the promise. status 'confirmed' (which
--      holds the vehicle or slot unconditionally, lib/holds.ts) plus
--      pay_in_person. It NEVER writes deposit_paid_at or amount_paid: those
--      mean money received, and writing them here would show "Deposit paid",
--      promise refunds of cash never taken and fire receipts.
--   2. PAYMENT RECEIVED — the evidence. A row in booking_payments; the
--      booking's amount_paid is kept as the running total and deposit_paid_at
--      is stamped on the first payment, which is what makes PayPal refuse a
--      second payment and the receipt code accept the booking as paid.
--
-- A no-show is 'cancelled' with no_show_at, not a new status: every screen
-- already knows 'cancelled', and a no-show must never read as a refund owed.
--
-- The customer's own preference (payment_preference) is recorded when they
-- book; the owner still decides.
--
-- Money stays in WHOLE RUPEES on both tables (see rupees-vs-cents): the ledger
-- names its unit in the column.

begin;

-- ── The facts on each booking ─────────────────────────────────────────────
alter table public.bookings
  add column if not exists pay_in_person boolean not null default false,
  add column if not exists confirmed_at timestamptz,
  add column if not exists payment_preference text,
  add column if not exists no_show_at timestamptz;

alter table public.place_bookings
  add column if not exists pay_in_person boolean not null default false,
  add column if not exists confirmed_at timestamptz,
  add column if not exists payment_preference text,
  add column if not exists no_show_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_payment_preference_check') then
    alter table public.bookings add constraint bookings_payment_preference_check
      check (payment_preference is null or payment_preference in ('online', 'in_person'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'place_bookings_payment_preference_check') then
    alter table public.place_bookings add constraint place_bookings_payment_preference_check
      check (payment_preference is null or payment_preference in ('online', 'in_person'));
  end if;
end $$;

comment on column public.bookings.pay_in_person is
  'M220. Confirmed by the owner to be paid in person (cash at pickup). Never implies money received — see booking_payments / amount_paid.';
comment on column public.place_bookings.pay_in_person is
  'M220. Confirmed by the owner to be paid in person (on arrival / at the jetty). Never implies money received.';

-- ── The ledger ─────────────────────────────────────────────────────────────
create table if not exists public.booking_payments (
  id             uuid primary key default gen_random_uuid(),
  booking_kind   text not null check (booking_kind in ('vehicle', 'place')),
  booking_id     uuid not null,
  amount_rupees  integer not null check (amount_rupees > 0),
  method         text not null check (method in ('cash', 'mcb_juice', 'bank_transfer', 'card', 'paypal')),
  received_at    timestamptz not null default now(),
  note           text check (note is null or length(note) <= 300),
  created_at     timestamptz not null default now()
);
create index if not exists booking_payments_booking_idx
  on public.booking_payments (booking_kind, booking_id);
create index if not exists booking_payments_received_idx
  on public.booking_payments (received_at);

-- Admin-only. RLS on with no policies and no client grants: the service role
-- (the admin routes, after their own session check) is the only reader.
alter table public.booking_payments enable row level security;
revoke all on table public.booking_payments from public, anon, authenticated;

-- ── The owner confirms: pays in person ─────────────────────────────────────
-- Optionally with money taken at the same moment (a cash deposit at the
-- counter, or the whole price), recorded as the first ledger row.
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
  v_status text; v_total integer; v_paid integer; v_in_person boolean;
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
    select b.status, b.total_amount, coalesce(b.amount_paid, 0), b.pay_in_person
      into v_status, v_total, v_paid, v_in_person
      from bookings b where b.id = p_id for update;
  else
    -- deposit_amount IS the whole price of a place booking (M210).
    select p.status, p.deposit_amount, coalesce(p.amount_paid, 0), p.pay_in_person
      into v_status, v_total, v_paid, v_in_person
      from place_bookings p where p.id = p_id for update;
  end if;

  if v_status is null then
    raise exception using errcode = 'RR003', message = 'Booking not found.';
  end if;

  -- Idempotent: pressing it twice changes nothing and records nothing twice.
  if v_status = 'confirmed' and v_in_person then
    return jsonb_build_object('status', v_status, 'total', v_total, 'paid', v_paid,
                              'balance', greatest(coalesce(v_total, 0) - v_paid, 0), 'already', true);
  end if;

  if v_status not in ('pending', 'approved') then
    raise exception using errcode = 'RR004',
      message = format('This booking is %s and cannot be confirmed as paid in person.', v_status);
  end if;

  if v_total is not null and v_now > greatest(v_total - v_paid, 0) then
    raise exception using errcode = 'RR005',
      message = format('That is more than the booking costs (Rs %s still to pay).', greatest(v_total - v_paid, 0));
  end if;

  if p_kind = 'vehicle' then
    update bookings set
      status = 'confirmed', pay_in_person = true, confirmed_at = now(),
      approved_at = coalesce(approved_at, now()),
      payment_due_by = null, unavailable_note = null
     where id = p_id;
  else
    update place_bookings set
      status = 'confirmed', pay_in_person = true, confirmed_at = now(),
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

-- ── The money arrives ──────────────────────────────────────────────────────
create or replace function public.admin_record_booking_payment(
  p_kind text,
  p_id uuid,
  p_amount_rupees integer,
  p_method text default 'cash',
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_status text; v_total integer; v_paid integer; v_first boolean; v_payment uuid;
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
  -- Money is recorded against a booking that is happening or happened. A
  -- pending one is confirmed first ("Confirm — pays in person", which can take
  -- the cash at the same moment).
  if v_status not in ('confirmed', 'completed') then
    raise exception using errcode = 'RR004',
      message = format('This booking is %s. Confirm it before recording a payment.', v_status);
  end if;
  if v_total is not null and v_paid + p_amount_rupees > v_total then
    raise exception using errcode = 'RR005',
      message = format('That is more than is owed (Rs %s left to pay).', greatest(v_total - v_paid, 0));
  end if;

  insert into booking_payments (booking_kind, booking_id, amount_rupees, method, note)
  values (p_kind, p_id, p_amount_rupees, p_method, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_payment;

  if p_kind = 'vehicle' then
    update bookings set amount_paid = v_paid + p_amount_rupees,
                        deposit_paid_at = coalesce(deposit_paid_at, now())
     where id = p_id;
  else
    update place_bookings set amount_paid = v_paid + p_amount_rupees,
                              deposit_paid_at = coalesce(deposit_paid_at, now())
     where id = p_id;
  end if;

  return jsonb_build_object(
    'paymentId', v_payment, 'first', v_first,
    'total', v_total, 'paid', v_paid + p_amount_rupees,
    'balance', greatest(coalesce(v_total, 0) - (v_paid + p_amount_rupees), 0));
end
$fn$;

-- ── They did not come ──────────────────────────────────────────────────────
-- 'cancelled' + no_show_at: frees the vehicle or slot like any cancellation,
-- but tells the reminders and screens this was a no-show, not a refund owed.
create or replace function public.admin_mark_no_show(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_status text;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR004', message = 'Not authorized.';
  end if;
  if p_kind not in ('vehicle', 'place') then
    raise exception using errcode = 'RR005', message = 'Unknown booking kind.';
  end if;

  if p_kind = 'vehicle' then
    select b.status into v_status from bookings b where b.id = p_id for update;
  else
    select p.status into v_status from place_bookings p where p.id = p_id for update;
  end if;
  if v_status is null then
    raise exception using errcode = 'RR003', message = 'Booking not found.';
  end if;
  if v_status <> 'confirmed' then
    raise exception using errcode = 'RR004',
      message = format('Only a confirmed booking can be a no-show (this one is %s).', v_status);
  end if;

  if p_kind = 'vehicle' then
    update bookings set status = 'cancelled', no_show_at = now() where id = p_id;
  else
    update place_bookings set status = 'cancelled', no_show_at = now() where id = p_id;
  end if;
  return jsonb_build_object('status', 'cancelled', 'noShow', true);
end
$fn$;

revoke all on function public.admin_confirm_in_person(text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_record_booking_payment(text, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_mark_no_show(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_confirm_in_person(text, uuid, integer, text) to service_role;
grant execute on function public.admin_record_booking_payment(text, uuid, integer, text, text) to service_role;
grant execute on function public.admin_mark_no_show(text, uuid) to service_role;

-- ── The customer's page is told ───────────────────────────────────────────
-- Anchored additions to lookup_booking (read live 29 Sept 2026, md5
-- 0a026a3d599f75f45d6c4d4033d1b311), count-guarded like M201/M216.
do $rw$
declare r record; v_src text; v_n int;
begin
  for r in select * from (values
    (1, '''unavailableNote'', b.unavailable_note)',
        '''unavailableNote'', b.unavailable_note,' || chr(10) ||
        '           -- M220' || chr(10) ||
        '           ''payInPerson'',  b.pay_in_person,' || chr(10) ||
        '           ''paymentPreference'', b.payment_preference,' || chr(10) ||
        '           ''noShow'',       b.no_show_at is not null)'),
    (2, '''status'',      p.status)',
        '''status'',      p.status,' || chr(10) ||
        '           -- M220' || chr(10) ||
        '           ''payInPerson'',  p.pay_in_person,' || chr(10) ||
        '           ''paymentPreference'', p.payment_preference,' || chr(10) ||
        '           ''noShow'',       p.no_show_at is not null)')
  ) t(ord, needle, repl) order by ord
  loop
    select pg_get_functiondef('public.lookup_booking(text,text)'::regprocedure) into v_src;
    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    if v_n = 0 and position('payInPerson' in v_src) > 0 and r.ord = 1 then continue; end if;
    if v_n <> 1 then
      raise exception 'M220: lookup_booking has % x "%", expected 1 — shape changed, refusing', v_n, r.needle;
    end if;
    execute replace(v_src, r.needle, r.repl);
  end loop;
end
$rw$;

-- ── What already happened: confirmed with no money recorded ────────────────
-- These were confirmed by hand with nothing paid online. Recording them as
-- paid in person makes their reminders print the real amount to collect, and
-- puts the past ones on the owner's "cash to collect" list, where he can mark
-- the cash received or the booking a no-show.
update public.bookings
   set pay_in_person = true, confirmed_at = coalesce(confirmed_at, created_at)
 where status = 'confirmed'
   and deposit_paid_at is null and amount_paid is null
   and payment_reported_at is null and paypal_capture_id is null;

update public.place_bookings
   set pay_in_person = true, confirmed_at = coalesce(confirmed_at, created_at)
 where status = 'confirmed'
   and deposit_paid_at is null and amount_paid is null
   and payment_reported_at is null and paypal_capture_id is null;

notify pgrst, 'reload schema';

-- ── Proof, on real rows, rolled back inside sealed sub-transactions ─────────
do $assert$
declare v_id uuid; v_out jsonb; v_ok boolean := false;
begin
  if has_table_privilege('anon', 'public.booking_payments', 'select')
     or has_table_privilege('authenticated', 'public.booking_payments', 'select') then
    raise exception 'M220: the payments ledger is readable by a client role';
  end if;
  if has_function_privilege('authenticated', 'public.admin_record_booking_payment(text, uuid, integer, text, text)', 'execute')
     or has_function_privilege('anon', 'public.admin_confirm_in_person(text, uuid, integer, text)', 'execute') then
    raise exception 'M220: a client role can record payments or confirm bookings';
  end if;

  -- A confirmed in-person rental takes a payment and reports its balance.
  select id into v_id from bookings where status = 'confirmed' and pay_in_person and total_amount > 1 limit 1;
  if v_id is not null then
    begin
      v_out := admin_record_booking_payment('vehicle', v_id, 1, 'cash', 'M220 proof');
      if (v_out->>'paid')::int < 1 or (select deposit_paid_at from bookings where id = v_id) is null then
        raise exception 'M220: recording a payment did not update the booking';
      end if;
      -- …and refuses more than is owed.
      begin
        perform admin_record_booking_payment('vehicle', v_id, 10000000, 'cash', null);
        raise exception 'M220: an overpayment was accepted';
      exception when sqlstate 'RR005' then v_ok := true;
      end;
      raise exception using errcode = 'P0220', message = 'rollback';
    exception when sqlstate 'P0220' then null;
    end;
    if not v_ok then raise exception 'M220: overpayment guard never ran'; end if;
    if exists (select 1 from booking_payments where note = 'M220 proof') then
      raise exception 'M220: the proof payment leaked';
    end if;
  end if;

  if position('payInPerson' in pg_get_functiondef('public.lookup_booking(text,text)'::regprocedure)) = 0 then
    raise exception 'M220: lookup_booking does not report pay_in_person';
  end if;
end
$assert$;

commit;
