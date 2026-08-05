-- M6 — architecture update: MCB Juice removed as a merchant payment method.
-- Marketplace payments are Cash and Direct Bank Transfer only.
--
-- Ordered BEFORE create_order v4 (20260805120000), which is the version of the
-- RPC that no longer references Juice — matching the sequence actually applied
-- to production.

-- Constraints that reference the Juice columns must go before the columns do.
alter table store_payment_settings drop constraint if exists qr_present_when_juice_enabled;
alter table store_payment_settings drop constraint if exists at_least_one_method;

alter table store_payment_settings
  drop column if exists accepts_juice_qr,
  drop column if exists qr_image_url,
  drop column if exists qr_label;

alter table store_payment_settings add constraint at_least_one_method
  check (accepts_cash or accepts_bank_transfer);

-- Narrow the marketplace payment rail. 'mcb_juice' survives as an unreachable
-- label in the payment_provider enum only because Postgres has no DROP VALUE;
-- this CHECK is what actually enforces the rule, and it now rejects Juice the
-- same way it already rejects cards. The payments table is marketplace-only —
-- vehicle rentals settle on bookings.paypal_capture_id and place bookings on
-- place_bookings — so the rental ecosystem is unaffected.
alter table payments drop constraint if exists payments_no_card_providers;
alter table payments add constraint payments_marketplace_providers_only
  check (provider in ('cash', 'bank_transfer', 'manual'));
