-- ═══════════════════════════════════════════════════════════════════════════
-- M214 — RECEIPTLY DOCUMENTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- M211 built booking_documents for the confirmation the owner typed by hand.
-- Receiptly then replaced that document with a richer one — four kinds, eight
-- currencies, a brand, a service block, notes and terms — and kept its drafts
-- in localStorage, which means nothing is findable a week later. This is the
-- merge: Receiptly's document, in the database.
--
-- The old table is DROPPED rather than migrated. It has never held a row —
-- checked before writing this, along with its lines and its counter — so there
-- is nothing to preserve and a column-by-column ALTER would leave a shape
-- nobody designed.
--
-- TWO NAMES ARE CORRECTED WHILE IT IS FREE TO DO SO:
--
--   booking_documents -> receiptly_documents. The table now holds quotes and
--   invoices too, and a table called booking_documents holding a quote is a
--   lie the next reader has to work around.
--
--   *_cents -> *_minor. Receiptly bills in eight currencies and a yen HAS no
--   cents; calling the column cents would make every JPY document a hundred
--   times wrong in the mind of whoever reads the schema next. The unit is
--   "minor units of currency_code", which is the only true description.
--
-- The counter is NOT reset and the series stays 'BKG'. Numbers are shared with
-- the invoice register through next_invoice_seq, which is what stops a
-- Receiptly document and an invoice ever colliding.

-- The old saver RETURNS the old table's row type, so it holds a dependency on
-- it. Dropped by name rather than with CASCADE: cascade would also take
-- anything else that had come to depend on the table without telling me what.
drop function if exists public.booking_doc_save(
  uuid, text, text, text, text, jsonb, jsonb, integer, integer, text, uuid);

drop table if exists public.booking_document_lines;
drop table if exists public.booking_documents;

create table if not exists public.receiptly_documents (
  id             uuid primary key default gen_random_uuid(),

  series         text        not null default 'BKG' check (series = 'BKG'),
  issue_year     smallint    not null check (issue_year between 2026 and 2100),
  seq            integer     not null check (seq > 0),
  number         text        not null,

  kind           text        not null default 'confirmation'
                             check (kind in ('receipt', 'confirmation', 'invoice', 'quote')),
  -- The owner's own reference, typed: RR-COCOS-SB. Free text on purpose — it
  -- is not the RR-XXXXXX six-hex shape /track validates, and this document is
  -- not looked up there.
  reference      text        not null check (btrim(reference) <> ''),

  -- ── The business, SNAPSHOTTED ────────────────────────────────────────────
  -- Not joined at render time. A business that rebrands next year must not
  -- silently restate a document a customer already holds.
  biz_name       text        not null check (btrim(biz_name) <> ''),
  biz_tagline    text,
  biz_website    text,
  biz_accent     text        not null default '#0a7d3b'
                             check (biz_accent ~ '^#[0-9a-fA-F]{6}$'),
  -- A JPEG data URL and nothing else. The studio downscales and re-encodes
  -- before it gets here, so this cap is the backstop rather than the rule: an
  -- unbounded column would let one 4MB phone photo be copied onto every
  -- document that business ever issues.
  biz_logo       text        check (
                               biz_logo is null
                               or (biz_logo like 'data:image/jpeg;base64,%'
                                   and length(biz_logo) <= 120000)
                             ),

  customer_name  text        not null check (btrim(customer_name) <> ''),
  customer_email text,
  customer_phone text,

  service_name   text,
  -- [{label, value}] in the order they are printed.
  details        jsonb       not null default '[]'::jsonb,

  -- ── Money, in MINOR UNITS of currency_code ───────────────────────────────
  currency_code  text        not null default 'MUR' check (currency_code ~ '^[A-Z]{3}$'),
  total_minor    integer     not null default 0 check (total_minor    >= 0),
  deposit_pct    integer                  check (deposit_pct between 0 and 100),
  deposit_fixed_minor integer             check (deposit_fixed_minor  >= 0),
  deposit_minor  integer     not null default 0 check (deposit_minor  >= 0),
  received_minor integer     not null default 0 check (received_minor >= 0),

  constraint receiptly_deposit_within_total check (deposit_minor <= total_minor),
  -- A percentage or a flat figure, never both: two sources for one number is
  -- how a document ends up disagreeing with itself.
  constraint receiptly_one_deposit_basis
    check (deposit_pct is null or deposit_fixed_minor is null),

  pay_method     text,
  pay_reference  text,

  issued_on      date        not null default current_date,
  due_on         date,
  constraint receiptly_due_after_issue check (due_on is null or due_on >= issued_on),

  notes          text,
  terms          text,
  footer         text,

  -- A PREFILL HINT, never authority. It records which reservation a document
  -- was started from; nothing reads back from here into place_bookings.
  place_booking_id uuid references public.place_bookings(id) on delete set null,

  state          text        not null default 'open'
                             check (state in ('open', 'cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint receiptly_number_unique unique (number),
  constraint receiptly_seq_unique    unique (series, issue_year, seq)
);

create index if not exists receiptly_documents_recent_idx
  on public.receiptly_documents (created_at desc);
create index if not exists receiptly_documents_customer_idx
  on public.receiptly_documents (lower(customer_name));

create table if not exists public.receiptly_document_lines (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.receiptly_documents(id) on delete cascade,
  position          integer not null check (position > 0),
  description       text    not null check (btrim(description) <> ''),
  qty               numeric(12,3) not null check (qty > 0),
  unit_price_minor  integer not null check (unit_price_minor >= 0),
  line_total_minor  integer not null check (line_total_minor >= 0),

  constraint receiptly_lines_arithmetic
    check (line_total_minor = round(qty * unit_price_minor)),
  constraint receiptly_lines_position_unique unique (document_id, position)
);

-- ── Locked down, like every other table that holds money ───────────────────
-- RLS on with NO policy denies every command to anon and authenticated; the
-- grants below are the only door, and service_role is the only one through it.
alter table public.receiptly_documents      enable row level security;
alter table public.receiptly_document_lines enable row level security;

revoke all on table public.receiptly_documents      from anon, authenticated;
revoke all on table public.receiptly_document_lines from anon, authenticated;
grant select, insert, update, delete on public.receiptly_documents      to service_role;
grant select, insert, update, delete on public.receiptly_document_lines to service_role;

-- ── The business profile the studio starts from ────────────────────────────
--
-- One jsonb rather than five columns: it is genuinely one object, it is read
-- and written as one, and the studio snapshots it onto each document at save.
-- Changing it here never rewrites a document already issued.
alter table public.invoice_settings
  add column if not exists receiptly_profile jsonb;

comment on column public.invoice_settings.receiptly_profile is
  'Default business identity for Receiptly: {name, tagline, website, accent, logo, payMethod, payReference, terms, footer}. Snapshotted onto each document at save, so editing it never changes a document already sent.';

notify pgrst, 'reload schema';
