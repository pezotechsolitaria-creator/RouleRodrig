-- ═══════════════════════════════════════════════════════════════════════════
-- M204 — AN INVOICE NOBODY SENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Everything so far produces a document an ADMIN can download. The customer
-- has no idea it exists. Between "the invoice is issued" and "the customer has
-- it" there was nothing at all — not a column, not a log line — so the only
-- way to answer "did we send this one?" was to remember.
--
-- Three columns, on the invoice itself rather than in a side table, because
-- the question is asked while looking at the invoice:
--
--   sent_at     when the document last left the building
--   sent_to     the address it went to, AS SENT. Not a join to the customer
--               record: if their email is corrected next month, the answer to
--               "where did we send it?" must still be the old address, which
--               is precisely the address that explains why they never got it.
--   send_count  how many times. A resend is normal — people lose emails — and
--               a count distinguishes "sent once, never followed up" from
--               "chased four times and still unpaid".
--
-- The guard trigger needs no change: it whitelists the fields that may NOT
-- move once issued (number, totals, issued_at), so these three are free while
-- the document itself stays immutable.
--
-- Nothing here sends anything. The mail is sent by the application, which owns
-- the providers, the quotas and the failover; this only records what happened.

alter table public.invoices
  add column if not exists sent_at    timestamptz,
  add column if not exists sent_to    text,
  add column if not exists send_count integer not null default 0;

-- A count and a timestamp that disagree describe an event nobody can date.
alter table public.invoices
  drop constraint if exists invoices_sent_consistent;
alter table public.invoices
  add constraint invoices_sent_consistent check (
    (send_count = 0 and sent_at is null)
    or (send_count > 0 and sent_at is not null)
  );

comment on column public.invoices.sent_to is
  'The address the document was last sent to, as sent. Deliberately not a join: a corrected customer email must not rewrite where this actually went.';

-- The desk asks "what is issued and never sent?" — that is the follow-up list.
create index if not exists invoices_unsent_idx
  on public.invoices (issued_at)
  where sent_at is null and state <> 'void';

-- PostgREST caches the schema. Without this, the first update naming these
-- columns fails with "column does not exist" against a database where they
-- plainly do — a trap this project has already been caught by.
notify pgrst, 'reload schema';
