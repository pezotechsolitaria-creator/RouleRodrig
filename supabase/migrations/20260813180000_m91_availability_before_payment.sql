-- M91 — Availability is checked before anybody pays.
--
-- The owner: "add a step in rental booking … it shows him 'availability is to
-- be checked by admin, we will be right back' before making any payments, so as
-- to avoid lots of refunds involuntarily. The admin should check availability
-- with partners and then confirm it to the client. If not available it can
-- propose other vehicles."
--
-- The reason is real: the fleet is not all his. Confirming a scooter he cannot
-- actually get means taking money and giving it back, and a refund costs the
-- PayPal fee, the exchange spread and the customer's trust.
--
-- ── THE COLLISION, AND WHY THIS MIGRATION EXISTS ──────────────────────────
--
-- Today an unpaid vehicle booking holds NOTHING. lib/holds.ts is explicit
-- about it: for a payment-gated row, only `deposit_paid_at` reserves the dates,
-- so ten people may request the same scooter and the first to PAY wins. That
-- rule is what stops a stranger blocking the fleet with free requests.
--
-- Moving payment AFTER the owner's approval breaks it. If approval does not
-- reserve anything, he can tell three customers "yes, it's available", and two
-- of them pay for the same scooter — which is MORE involuntary refunds than he
-- started with, caused by the very step meant to prevent them.
--
-- So approval itself becomes the reservation. And because an approved-but-
-- unpaid booking now blocks other customers, it cannot be open-ended: it
-- carries a deadline, after which it is released automatically.
--
-- That deadline is disclosed to the customer in the approval email and on
-- /manage-booking. M-era note: the marketplace already shipped a silent 48h
-- auto-cancel and it is on the defect list precisely because nobody was told.
-- A deadline the customer cannot see is a trap, not a policy.
--
-- ── The lifecycle ─────────────────────────────────────────────────────────
--
--   pending    request received, availability NOT yet checked.
--              Holds nothing — unchanged, so requests still cannot block a bike.
--   approved   the owner confirmed with the partner. RESERVES the vehicle until
--              payment_due_by. The customer may now pay.
--   confirmed  paid.
--   cancelled  declined as unavailable, or the payment window expired.
--              unavailable_note carries which, in the owner's own words.

alter table public.bookings
  -- When the owner confirmed the partner actually has it.
  add column if not exists approved_at     timestamptz,
  -- When an approved-but-unpaid reservation stops holding the vehicle. NULL on
  -- any row that was never approved.
  add column if not exists payment_due_by  timestamptz,
  -- Why it could not happen, and what was offered instead. Shown to the
  -- customer verbatim, so it is written for them and not for the owner.
  add column if not exists unavailable_note text;

-- Finding the reservations that have run out, and the queue of requests waiting
-- on an availability check. Both are read on every admin page load and by the
-- expiry sweep; neither should ever become a full scan of the bookings table.
create index if not exists bookings_payment_due_by_idx
  on public.bookings (payment_due_by)
  where payment_due_by is not null;

create index if not exists bookings_status_created_idx
  on public.bookings (status, created_at desc);

comment on column public.bookings.payment_due_by is
  'M91: an approved booking reserves the vehicle only until this moment. Disclosed to the customer — never a silent expiry.';
