-- M19 — record how much a customer ACTUALLY paid.
--
-- THE BUG
-- PayPalDeposit offers two modes: pay the deposit, or pay in full. Both write
-- exactly the same row — deposit_paid_at + paypal_capture_id + status — and
-- `bookings` had no column for the captured amount. So a customer who paid
-- 100% was still recorded as having paid only a deposit:
--
--   * /manage-booking rendered "Deposit paid: Rs 400" beside
--     "Estimated total: Rs 1,600", implying Rs 1,200 was still owed;
--   * the confirmation email had already told them "the remaining Rs 1,200 is
--     paid at pickup";
--   * and the owner, reading the same row, would ask for that balance on
--     handover — charging a paid-in-full customer twice.
--
-- There was no way to detect this after the fact either: the only evidence was
-- in PayPal's dashboard, not in the booking.
--
-- THE FIX
-- One nullable integer, in the same minor-unit convention as every other money
-- column here (whole rupees). NULL means "predates this migration / not paid by
-- card" and every reader falls back to the old deposit-based display, so
-- existing rows keep behaving exactly as they do today.
--
-- The value is derived SERVER-side in the capture route by comparing the amount
-- PayPal actually captured against the two amounts we could legitimately have
-- charged. The client never states how much it paid.

alter table bookings       add column if not exists amount_paid integer;
alter table place_bookings add column if not exists amount_paid integer;

comment on column bookings.amount_paid is
  'What the customer actually paid, in whole rupees, derived server-side from the PayPal capture. NULL = not paid by card, or the row predates M19 — readers then fall back to deposit_amount. Distinguishes a deposit from a pay-in-full so the balance at pickup is correct (M19).';

comment on column place_bookings.amount_paid is
  'What the customer actually paid, in whole rupees, derived server-side from the PayPal capture. NULL = not paid by card or predates M19 (M19).';

-- M8 revoked the table-level SELECT on several tables and re-granted per
-- column, so a NEW column is invisible to the client until granted — the
-- lesson M16/M17 both had to relearn. bookings is read by the guest lookup RPC
-- (SECURITY DEFINER, unaffected) but grant explicitly so any future direct
-- read behaves.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_name = 'bookings' and privilege_type = 'SELECT' and grantee = 'authenticated'
  ) then
    execute 'grant select (amount_paid) on bookings to authenticated';
  end if;
exception when others then
  -- A table-level grant already covers the column; nothing to do.
  null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='bookings' and column_name='amount_paid'
  ) then
    raise exception 'M19: bookings.amount_paid was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='place_bookings' and column_name='amount_paid'
  ) then
    raise exception 'M19: place_bookings.amount_paid was not created';
  end if;
end;
$$;
