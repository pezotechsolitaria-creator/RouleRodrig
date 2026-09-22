-- ═══════════════════════════════════════════════════════════════════════════
-- M213 — THE COUNTER LEARNS A FOURTH SERIES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- next_invoice_seq(series, year) looks generic — it takes the series as a text
-- argument — but invoice_counters restricts the column it writes to:
--
--   check (series = any (array['INV','RCP','CRN']))
--
-- So M212 asking it for a 'BKG' number failed on the INSERT inside the
-- counter, not in its own code. It failed loudly, inside a transaction that
-- was rolled back, which is the only reason this is a comment rather than a
-- booking document with no number.
--
-- Widening the check is the whole fix. The counter is deliberately ONE table
-- for every series: that is what guarantees an invoice and a booking document
-- can never be handed the same number, and it is worth keeping when a fourth
-- kind of document arrives.

alter table public.invoice_counters drop constraint if exists invoice_counters_series_check;

alter table public.invoice_counters add constraint invoice_counters_series_check
  check (series = any (array['INV', 'RCP', 'CRN', 'BKG']));

comment on table public.invoice_counters is
  'One gap-free counter per (series, year). INV/RCP/CRN are the invoice register''s documents; BKG is the booking confirmation the owner composes by hand. One table so two documents can never share a number.';
