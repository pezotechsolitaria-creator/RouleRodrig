-- M6 step 1 of 2 — enum values only.
-- Postgres cannot use a newly added enum value in the same transaction that
-- adds it, and Supabase wraps each migration in one, so these are deliberately
-- split from the tables/functions that consume them (20260805100100).

-- Bank transfer is a first-class marketplace payment rail alongside cash and
-- the QR rails. 'paypal' stays in the enum because vehicle rentals and place
-- bookings still use it — they are a separate ecosystem and must not be touched.
alter type payment_provider add value if not exists 'bank_transfer';

-- The customer has told us they paid out-of-band (bank transfer / QR) and, when
-- the merchant requires it, uploaded a receipt. The money is between customer
-- and merchant; the platform never sees it. Only the merchant can confirm.
--
-- This is deliberately a DISTINCT status rather than a flag on pending_payment:
-- create_order()'s abandoned-checkout reaper cancels stale 'pending_payment'
-- rows, and an order where the customer has actually sent money must never be
-- reachable by that path.
alter type order_status add value if not exists 'awaiting_payment_confirmation' after 'pending_payment';
