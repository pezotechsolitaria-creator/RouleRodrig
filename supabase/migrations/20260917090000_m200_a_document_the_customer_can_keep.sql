-- ── M200 · INVOICING, PHASE 1 · THE UNIT, END TO END ────────────────────────
--
-- The riskiest assumption in this whole system is that ONE document type can
-- carry money from a rupee source and a cents source without a 100x error.
-- This platform has shipped that error four times: the admin money desk, then
-- M162 on /track, then M165 on /orders, then the Activity model again, where a
-- Rs 1,800 transfer was shown to the customer as "Rs 180,000".
--
-- Every one of those was a RENDERER fixed after the fact. So this schema does
-- not ask an implementer to remember the unit. It makes a 100x error a
-- constraint violation at INSERT: an invoice stores the raw source value and
-- the unit it was in, and a CHECK proves the conversion. A wrong unit cannot
-- reach a document a customer keeps; it fails loudly in the transaction.
--
-- Nothing existing is migrated. bookings.total_amount and friends stay whole
-- rupees, untouched, because they are read by priceBreakdown(), the PayPal
-- capture route, the admin money desk, two email senders and the customer
-- receipt — and changing all of those in lockstep on a live platform is how a
-- fifth recurrence would happen.

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.invoice_subject_type as enum (
    'booking',                    -- vehicle rental            (RUPEES source)
    'place_booking',              -- activity / stay           (RUPEES source)
    'order',                      -- marketplace / food        (CENTS source)
    'ride_request',               -- taxi / transfer           (CENTS source)
    'delivery',                   -- Deliver Anything          (CENTS source)
    'service_booking',            -- car wash, haircut         (no money column)
    'subscription_invoice',       -- merchant billing          (CENTS source)
    'managed_ticketing_agreement' -- ticketing fee             (CENTS source)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_doc_kind as enum ('invoice','receipt','credit_note');
exception when duplicate_object then null; end $$;

-- 'part_paid' is not optional here: the commonest rental flow is a 25-50%
-- deposit, and neither of the platform's existing payment vocabularies can
-- express a partly-settled document. 'written_off' is kept distinct from
-- 'void' because a waiver and an uncollectible debt are different lines.
do $$ begin
  create type public.invoice_state as enum
    ('draft','issued','part_paid','paid','void','written_off');
exception when duplicate_object then null; end $$;

-- ── Issuer identity, snapshotted onto every document at issue time ──────────
-- Single-row config, the house pattern used by delivery_settings and
-- marketplace_settings. The only legal-identity string on the platform today
-- is hardcoded inside a React component; it belongs here.
create table if not exists public.invoice_settings (
  id                text primary key default 'main' check (id = 'main'),
  legal_name        text        not null default 'Roule Rodrigues',
  address_line      text        not null default 'Rodrigues Island, Republic of Mauritius',
  brn               text,
  -- If this is NULL no invoice may carry a tax line — enforced by a CHECK on
  -- invoices. Claiming VAT without a VAT number is the kind of error that is
  -- somebody else's problem to unpick months later.
  vat_number        text,
  bank_name         text,
  bank_account_name text,
  bank_account_no   text,
  payment_note      text,
  footer_note       text        not null default 'Thank you for choosing Roule Rodrigues.',
  updated_at        timestamptz not null default now()
);
insert into public.invoice_settings (id) values ('main') on conflict (id) do nothing;

-- ── Numbering ──────────────────────────────────────────────────────────────
-- A counter row, not a sequence. nextval() is deliberately non-transactional:
-- a rolled-back insert burns the number for ever, and a gap in a book of
-- issued invoices is a question an accountant has to answer. This increment
-- lives in the SAME transaction as the insert, so a rollback releases it.
create table if not exists public.invoice_counters (
  series     text     not null check (series in ('INV','RCP','CRN')),
  year       smallint not null check (year between 2026 and 2100),
  next_value integer  not null check (next_value > 0),
  primary key (series, year)
);

create or replace function public.next_invoice_seq(p_series text, p_year smallint)
returns integer
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare v_seq integer;
begin
  -- ON CONFLICT DO UPDATE takes a row-level exclusive lock on (series, year).
  -- A second transaction running this blocks until the first commits, then
  -- re-reads under the lock. Two concurrent issues get n and n+1 — never the
  -- same value, never a lost update — at READ COMMITTED, which is the default.
  insert into public.invoice_counters (series, year, next_value)
  values (p_series, p_year, 2)
  on conflict (series, year)
    do update set next_value = public.invoice_counters.next_value + 1
  returning next_value - 1 into v_seq;
  return v_seq;
end;
$fn$;

-- Supabase GRANTs EXECUTE on new public functions to anon and authenticated by
-- default, and REVOKE ... FROM PUBLIC does not remove a named-role grant. Both
-- roles are revoked explicitly. This has bitten this project before.
revoke all on function public.next_invoice_seq(text, smallint) from public;
revoke all on function public.next_invoice_seq(text, smallint) from anon;
revoke all on function public.next_invoice_seq(text, smallint) from authenticated;
grant execute on function public.next_invoice_seq(text, smallint) to service_role;

-- ── invoices ───────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),

  doc_kind           public.invoice_doc_kind not null default 'invoice',
  series             text        not null check (series in ('INV','RCP','CRN')),
  issue_year         smallint    not null check (issue_year between 2026 and 2100),
  seq                integer     not null check (seq > 0),
  number             text        not null,
  parent_invoice_id  uuid        references public.invoices(id) on delete restrict,

  -- Polymorphic. Every candidate primary key on this platform is a uuid, so no
  -- FK is possible across eight tables; the issuing function reads the source
  -- row, which is the integrity check that matters.
  subject_type       public.invoice_subject_type not null,
  subject_id         uuid        not null,
  reference          text        not null,

  -- Bill-to is a SNAPSHOT, never joined at render time. A customer who changes
  -- their name next year must not silently restate a document they already
  -- hold.
  bill_to_name       text        not null check (btrim(bill_to_name) <> ''),
  bill_to_email      text,
  bill_to_phone      text,
  bill_to_address    text,

  -- Issuer, snapshotted from invoice_settings at issue time, same reasoning.
  seller_name        text        not null,
  seller_address     text        not null,
  seller_brn         text,
  seller_vat         text,
  seller_bank        jsonb,

  -- Money. INTEGER MINOR UNITS. Every column name ends in _cents so that no
  -- variable called "amount" can ever hold either unit again.
  currency           bpchar(3)   not null default 'MUR',
  subtotal_cents     integer     not null default 0 check (subtotal_cents >= 0),
  discount_cents     integer     not null default 0 check (discount_cents >= 0),
  tax_cents          integer     not null default 0 check (tax_cents      >= 0),
  delivery_cents     integer     not null default 0 check (delivery_cents >= 0),
  total_cents        integer     not null            check (total_cents   >= 0),
  paid_cents         integer     not null default 0 check (paid_cents     >= 0),
  -- NOT constrained >= 0 on purpose: an overpayment is a negative balance and
  -- the document should be able to say so.
  balance_cents      integer generated always as (total_cents - paid_cents) stored,

  -- ── THE 100x TRIPWIRE ────────────────────────────────────────────────────
  -- The raw value read from the source column, and the unit it was in. The
  -- CHECK below proves the conversion. This is what makes a unit mistake a
  -- failed INSERT instead of a wrong number on a customer's document.
  source_amount_unit text        not null check (source_amount_unit in ('rupees','cents')),
  source_amount_raw  integer     not null check (source_amount_raw >= 0),
  source_total_cents integer     not null check (source_total_cents >= 0),

  state              public.invoice_state not null default 'draft',
  issued_at          timestamptz,
  due_at             timestamptz,
  paid_at            timestamptz,
  voided_at          timestamptz,
  void_reason        text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint invoices_number_unique unique (number),
  constraint invoices_seq_unique    unique (series, issue_year, seq),

  constraint invoices_reconciles check (
    total_cents = subtotal_cents - discount_cents + tax_cents + delivery_cents
  ),

  constraint invoices_unit_provenance check (
    source_total_cents = case source_amount_unit
                           when 'cents'  then source_amount_raw
                           when 'rupees' then source_amount_raw * 100
                         end
  ),

  -- An invoice may never bill more than the source transaction is worth.
  -- delivery and service_booking are excluded: the first can settle above its
  -- fee (the shopper is reimbursed) and the second has no money column at all.
  constraint invoices_not_above_source check (
    subject_type in ('delivery','service_booking')
    or doc_kind <> 'invoice'
    or total_cents <= source_total_cents
  ),

  constraint invoices_tax_needs_vat_identity check (tax_cents = 0 or seller_vat is not null),
  constraint invoices_draft_has_no_issue_date check ((state = 'draft') = (issued_at is null)),
  constraint invoices_paid_has_date           check ((state = 'paid') = (paid_at is not null)),
  constraint invoices_credit_note_has_parent  check ((doc_kind = 'credit_note') = (parent_invoice_id is not null)),
  constraint invoices_series_matches_kind     check (
    (doc_kind = 'invoice'     and series = 'INV') or
    (doc_kind = 'receipt'     and series = 'RCP') or
    (doc_kind = 'credit_note' and series = 'CRN')
  )
);

-- One live invoice per source transaction. A voided one may be reissued.
create unique index if not exists invoices_one_live_per_subject
  on public.invoices (doc_kind, subject_type, subject_id) where state <> 'void';
create index if not exists invoices_subject_idx   on public.invoices (subject_type, subject_id);
create index if not exists invoices_state_due     on public.invoices (state, due_at) where state in ('issued','part_paid');
create index if not exists invoices_issued_at_idx on public.invoices (issued_at desc);

-- ── invoice_lines ──────────────────────────────────────────────────────────
create table if not exists public.invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  position         smallint not null check (position > 0),
  kind             text not null default 'charge'
                     check (kind in ('charge','discount','tax','delivery','deposit_applied','reimbursement')),
  description      text not null check (btrim(description) <> ''),
  qty              numeric(12,3) not null default 1 check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at       timestamptz not null default now(),
  constraint invoice_lines_position_unique unique (invoice_id, position),
  -- round() on numeric is IMMUTABLE, so this is legal in a CHECK. It makes
  -- "this line does not multiply out" impossible, one line at a time.
  constraint invoice_lines_arithmetic check (
    line_total_cents = round(qty * unit_price_cents)::integer
  )
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

-- ── Locked down: RLS on, zero policies, zero grants ─────────────────────────
-- Phase 1 is admin-only and every read goes through the service role. RLS is
-- enabled anyway rather than left off: a table with RLS disabled and a grant
-- added later is open, whereas RLS-on with no policy denies every command for
-- every non-superuser role. Customer and merchant policies arrive in phase 3
-- with the surfaces that need them.
alter table public.invoices          enable row level security;
alter table public.invoice_lines     enable row level security;
alter table public.invoice_counters  enable row level security;
alter table public.invoice_settings  enable row level security;

revoke all on public.invoices         from anon, authenticated;
revoke all on public.invoice_lines    from anon, authenticated;
revoke all on public.invoice_counters from anon, authenticated;
revoke all on public.invoice_settings from anon, authenticated;
grant select, insert, update on public.invoices        to service_role;
grant select, insert, update, delete on public.invoice_lines to service_role;
grant select, insert, update on public.invoice_counters to service_role;
grant select, update            on public.invoice_settings to service_role;

-- ── invoice_issue() — the only door ────────────────────────────────────────
-- Phase 1 handles exactly two subjects, one of each unit, because the point of
-- phase 1 is to prove the unit can survive the trip:
--   'booking'  bookings.total_amount  WHOLE RUPEES
--   'order'    orders.total           CENTS
--
-- The conversion happens HERE, once, in SQL. Never in TypeScript, never at a
-- render site. The caller supplies no money at all — it names a subject, and
-- this function reads the authoritative row itself. That is deliberate: a
-- caller that could pass an amount is a caller that could pass the wrong unit.
create or replace function public.invoice_issue(
  p_subject_type public.invoice_subject_type,
  p_subject_id   uuid,
  p_notes        text default null
)
returns public.invoices
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare
  s            public.invoice_settings;
  v_year       smallint := extract(year from (now() at time zone 'Indian/Mauritius'))::smallint;
  v_seq        integer;
  v_inv        public.invoices;
  v_unit       text;
  v_raw        integer;
  v_cents      integer;
  v_name       text;
  v_email      text;
  v_phone      text;
  v_ref        text;
  v_desc       text;
  v_qty        numeric(12,3) := 1;
begin
  select * into s from public.invoice_settings where id = 'main';
  if not found then
    raise exception 'invoice_settings row is missing';
  end if;

  if p_subject_type = 'booking' then
    -- WHOLE RUPEES. The multiplication below is the only place it happens.
    select b.total_amount, b.name, b.email, b.phone,
           'RR-' || upper(substr(replace(b.id::text,'-',''), 1, 6)),
           coalesce(nullif(btrim(b.scooter), ''), 'Vehicle rental'),
           greatest(coalesce(b.days, 1), 1)
      into v_raw, v_name, v_email, v_phone, v_ref, v_desc, v_qty
      from public.bookings b where b.id = p_subject_id;
    if not found then raise exception 'booking % not found', p_subject_id; end if;
    v_unit  := 'rupees';
    v_cents := v_raw * 100;

  elsif p_subject_type = 'order' then
    -- ALREADY CENTS.
    select o.total, coalesce(nullif(btrim(o.customer_name), ''), 'Customer'),
           o.customer_email, o.customer_phone, o.order_number,
           'Order ' || o.order_number, 1
      into v_raw, v_name, v_email, v_phone, v_ref, v_desc, v_qty
      from public.orders o where o.id = p_subject_id;
    if not found then raise exception 'order % not found', p_subject_id; end if;
    v_unit  := 'cents';
    v_cents := v_raw;

  else
    -- Phase 1 refuses rather than guessing. Each remaining subject arrives with
    -- its own adapter and its own test.
    raise exception 'invoice_issue: subject % is not supported yet', p_subject_type;
  end if;

  if v_raw is null then
    raise exception 'invoice_issue: % % has no total to invoice', p_subject_type, p_subject_id;
  end if;

  -- Allocated LAST, after every other row this transaction touches has been
  -- read, so the counter lock is held for the shortest possible time and a
  -- fixed acquisition order makes a deadlock impossible.
  v_seq := public.next_invoice_seq('INV', v_year);

  insert into public.invoices (
    doc_kind, series, issue_year, seq, number,
    subject_type, subject_id, reference,
    bill_to_name, bill_to_email, bill_to_phone,
    seller_name, seller_address, seller_brn, seller_vat, seller_bank,
    subtotal_cents, total_cents,
    source_amount_unit, source_amount_raw, source_total_cents,
    state, issued_at, notes
  ) values (
    'invoice', 'INV', v_year, v_seq,
    'RR-INV-' || v_year::text || '-' || lpad(v_seq::text, 6, '0'),
    p_subject_type, p_subject_id, v_ref,
    v_name, lower(btrim(v_email)), v_phone,
    s.legal_name, s.address_line, s.brn, s.vat_number,
    case when s.bank_name is not null and s.bank_account_name is not null
              and s.bank_account_no is not null
         then jsonb_build_object('name', s.bank_name,
                                 'accountName', s.bank_account_name,
                                 'accountNo', s.bank_account_no)
         else null end,
    v_cents, v_cents,
    v_unit, v_raw, v_cents,
    'issued', now(), p_notes
  ) returning * into v_inv;

  -- ONE line, qty 1, and the day count in the words.
  --
  -- The obvious shape — qty = days, unit_price = total / days — cannot satisfy
  -- invoice_lines_arithmetic whenever the total does not divide evenly. A
  -- Rs 5,996.99 rental over 3 days rounds to 199900 a day, which multiplies
  -- back to 599700, not 599699, and the CHECK correctly rejects it. Rather
  -- than round money into agreement, the line states the total it actually is
  -- and says the period in its description. A real per-day breakdown arrives
  -- with the rental adapter, where the daily rate and the multi-day discount
  -- are known rather than inferred by division.
  insert into public.invoice_lines (invoice_id, position, kind, description, qty,
                                    unit_price_cents, line_total_cents)
  values (v_inv.id, 1, 'charge',
          case when v_qty > 1 then v_desc || ' — ' || v_qty::integer::text || ' days'
               else v_desc end,
          1, v_cents, v_cents);

  return v_inv;
end;
$fn$;

revoke all on function public.invoice_issue(public.invoice_subject_type, uuid, text) from public;
revoke all on function public.invoice_issue(public.invoice_subject_type, uuid, text) from anon;
revoke all on function public.invoice_issue(public.invoice_subject_type, uuid, text) from authenticated;
grant execute on function public.invoice_issue(public.invoice_subject_type, uuid, text) to service_role;

-- ── The migration proves its own guards ────────────────────────────────────
-- Not a comment claiming the tables are locked down — an assertion that fails
-- the migration if they are not. This project has twice found a function that
-- inherited anon EXECUTE from Supabase's default privileges after a migration
-- said it had revoked it.
do $assert$
begin
  if has_table_privilege('anon','public.invoices','SELECT') then
    raise exception 'anon can read invoices';
  end if;
  if has_table_privilege('authenticated','public.invoices','SELECT') then
    raise exception 'authenticated can read invoices';
  end if;
  if has_table_privilege('anon','public.invoice_settings','SELECT') then
    raise exception 'anon can read invoice_settings (it holds bank details)';
  end if;
  if has_function_privilege('anon','public.next_invoice_seq(text,smallint)','EXECUTE') then
    raise exception 'anon can burn invoice numbers';
  end if;
  if has_function_privilege('anon','public.invoice_issue(public.invoice_subject_type,uuid,text)','EXECUTE') then
    raise exception 'anon can issue invoices';
  end if;
  if has_function_privilege('authenticated','public.invoice_issue(public.invoice_subject_type,uuid,text)','EXECUTE') then
    raise exception 'authenticated can issue invoices';
  end if;
end
$assert$;

comment on table public.invoices is
  'Immutable financial documents. Money is INTEGER MINOR UNITS; every money '
  'column ends in _cents. source_amount_unit/source_amount_raw carry the proof '
  'of conversion so a 100x error fails at INSERT rather than printing on a '
  'document a customer keeps.';
