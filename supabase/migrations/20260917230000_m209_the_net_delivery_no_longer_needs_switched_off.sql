-- ═══════════════════════════════════════════════════════════════════════════
-- M209 — THE NET DELIVERY NO LONGER NEEDS SWITCHED OFF
-- ═══════════════════════════════════════════════════════════════════════════
--
-- M200 wrote the tripwire that stops an invoice billing more than the source
-- transaction is worth, and exempted two subjects from it:
--
--   constraint invoices_not_above_source check (
--     subject_type in ('delivery','service_booking')
--     or doc_kind <> 'invoice'
--     or total_cents <= source_total_cents
--   )
--
-- The stated reason for the delivery exemption was that a delivery "can settle
-- above its fee (the shopper is reimbursed)" — written when a delivery invoice
-- was imagined as billing the whole door total, fee plus the money laid out at
-- the shop.
--
-- That is not what M208 does. It bills customer_fee alone and sets
-- total_cents = source_total_cents = customer_fee, every time. So the
-- exemption protects nothing and switches off a net on the one subject whose
-- other net is already inert: invoices_unit_provenance reduces to
-- source_total_cents = source_amount_raw when the unit is 'cents', which M208
-- satisfies by construction. Between them, a delivery invoice had no
-- structural protection at all against a wrong figure.
--
-- The exemption stays for service_booking, which genuinely has no money column
-- to compare against.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
--
-- It does not mark a delivery invoice paid. By M208's 'delivered' gate the fee
-- has, in practice, always been collected — cash into the driver's hand at the
-- door, or a transfer evidenced before the driver could leave 'assigned'. It
-- is tempting to issue these straight to 'paid'.
--
-- Two reasons not to. A cash collection is INSTRUCTED, not recorded: the
-- driver's card tells them to collect the fee, and nothing writes down that
-- they did. And a function whose job is to issue a document should not also
-- move money — an invoice that silently records a payment nobody counted is a
-- worse document than one that waits to be told.
--
-- Auto-settling a VERIFIED bank transfer (payment_verified_at is not null) was
-- considered and declined for now: zero live rows have ever been verified, so
-- it would add a money path inside issuance to serve a case that has never
-- occurred. What ships instead is the picker telling the operator what was
-- already collected, so recording it is one deliberate click.

alter table public.invoices drop constraint if exists invoices_not_above_source;

alter table public.invoices add constraint invoices_not_above_source check (
  subject_type = 'service_booking'
  or doc_kind <> 'invoice'
  or total_cents <= source_total_cents
);

comment on constraint invoices_not_above_source on public.invoices is
  'An invoice may never bill more than the source transaction is worth. service_booking is exempt because it has no money column to compare against; delivery was exempt until M208 made it bill customer_fee alone.';
