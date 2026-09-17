-- ── M201 · INVOICING, PHASE 2 · MONEY IN, AND WHAT WINS A RACE ─────────────
--
-- Phase 1 proved a document can carry the right amount. This is the part that
-- changes as money arrives: partial payments, the state machine, and the two
-- orderings where a cancellation and a payment collide.
--
-- The rule underneath all of it: MONEY WINS. A void may never erase a payment
-- that has landed, and a payment may never be silently absorbed by a voided
-- document. Both are enforced in the database, on a locked row, because a
-- decision this consequential cannot live in application code where two
-- requests can interleave.

-- ── invoice_payments — an allocation, not a second ledger ──────────────────
-- The marketplace already has `payments` (order-scoped, provider-shaped, 8
-- rows) and `refunds` (with Mauritian bank destination and chase tracking).
-- Neither is extended or made polymorphic: payments.order_id is NOT NULL and a
-- CHECK constrains its providers, so relaxing either touches live checkout.
-- This table POINTS AT payments.id when the money already has a row there.
create table if not exists public.invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete restrict,
  amount_cents  integer not null check (amount_cents > 0),

  -- mcb_juice IS allowed here, unlike checkoutSchema which rejects it.
  -- Those are different acts: Juice was removed as an ONLINE option a customer
  -- can pick, but recording that somebody actually paid by Juice is recording
  -- a fact. MCB Juice is ubiquitous on the island and the owner listed it
  -- explicitly. A system that cannot represent money it received is worse than
  -- one that offers a method it no longer takes online.
  method        public.payment_provider not null,

  received_at   timestamptz not null default now(),

  -- When the money already has a row in the marketplace ledger, point at it
  -- rather than restating it. NULL for a cash rental or a bank transfer.
  payment_id    uuid references public.payments(id) on delete restrict,
  external_ref  text,
  proof_bucket  text check (proof_bucket in ('order-receipts','booking-receipts','delivery-payments')),
  proof_path    text,
  recorded_by   text not null default 'admin-session',
  note          text,
  created_at    timestamptz not null default now(),
  constraint invoice_payments_proof_pair check ((proof_bucket is null) = (proof_path is null))
);

-- Idempotency. These two indexes are the whole reason a double-tapped button
-- cannot take the same money twice.
create unique index if not exists invoice_payments_one_per_payment
  on public.invoice_payments (payment_id) where payment_id is not null;
create unique index if not exists invoice_payments_one_per_external_ref
  on public.invoice_payments (invoice_id, external_ref) where external_ref is not null;
create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id, received_at);

alter table public.invoice_payments enable row level security;
revoke all on public.invoice_payments from anon, authenticated;
grant select, insert on public.invoice_payments to service_role;

-- ── The state machine, enforced on the row ─────────────────────────────────
create or replace function public.invoice_guard_transition()
returns trigger
language plpgsql
as $fn$
begin
  -- IMMUTABILITY AFTER ISSUE.
  -- This is what makes "store no PDF, regenerate on demand" honest: a document
  -- regenerated next year cannot disagree with the one the customer is holding,
  -- because the numbers it came from cannot have moved.
  if old.state <> 'draft' then
    if new.number         is distinct from old.number
    or new.series         is distinct from old.series
    or new.seq            is distinct from old.seq
    or new.issue_year     is distinct from old.issue_year
    or new.subject_type   is distinct from old.subject_type
    or new.subject_id     is distinct from old.subject_id
    or new.total_cents    is distinct from old.total_cents
    or new.subtotal_cents is distinct from old.subtotal_cents
    or new.tax_cents      is distinct from old.tax_cents
    or new.currency       is distinct from old.currency
    or new.seller_name    is distinct from old.seller_name
    or new.seller_vat     is distinct from old.seller_vat
    or new.issued_at      is distinct from old.issued_at
    then
      raise exception
        'Invoice % cannot be altered once issued. Void it and reissue, or raise a credit note.',
        old.number using errcode = 'RRINV';
    end if;
  end if;

  if old.state = new.state then return new; end if;

  if (old.state::text, new.state::text) not in (
      ('draft','issued'),
      ('issued','part_paid'), ('issued','paid'), ('issued','void'), ('issued','written_off'),
      ('part_paid','paid'), ('part_paid','void'), ('part_paid','written_off')
  ) then
    raise exception 'Illegal invoice transition % to % on %',
      old.state, new.state, old.number using errcode = 'RRINV';
  end if;

  -- MONEY WINS. A void may not erase a payment that has landed.
  if new.state = 'void' and old.paid_cents > 0 then
    raise exception
      'Invoice % already has money received against it and cannot be voided. Raise a credit note instead.',
      old.number using errcode = 'RRINV';
  end if;

  return new;
end;
$fn$;

drop trigger if exists invoices_guard_transition on public.invoices;
create trigger invoices_guard_transition
  before update on public.invoices
  for each row execute function public.invoice_guard_transition();

-- ── Recording money ────────────────────────────────────────────────────────
create or replace function public.invoice_record_payment(
  p_invoice_id   uuid,
  p_amount_cents integer,
  p_method       public.payment_provider,
  p_received_at  timestamptz default now(),
  p_payment_id   uuid default null,
  p_external_ref text default null,
  p_note         text default null
)
returns public.invoices
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare
  v_inv     public.invoices;
  v_paid    integer;
  v_state   public.invoice_state;
  v_over    integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'A payment must be a positive amount' using errcode = 'RRINV';
  end if;

  -- FOR UPDATE is the whole race. Both this and invoice_void() serialise on
  -- the invoice row, so the loser re-reads the COMMITTED state and reacts to
  -- it rather than to what it saw a moment ago.
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'RRINV';
  end if;

  if v_inv.state = 'void' then
    -- Void landed first. The money is REAL, so it is never silently absorbed:
    -- the operator reissues (the partial index allows it, voided rows are
    -- excluded) or records it against the right document.
    raise exception
      'Invoice % was cancelled. The payment has not been recorded — reissue the invoice or record it against the correct one.',
      v_inv.number using errcode = 'RRINV';
  end if;
  if v_inv.state = 'draft' then
    raise exception 'Invoice % has not been issued yet', v_inv.number using errcode = 'RRINV';
  end if;

  insert into public.invoice_payments (invoice_id, amount_cents, method, received_at,
                                       payment_id, external_ref, note)
  values (p_invoice_id, p_amount_cents, p_method, coalesce(p_received_at, now()),
          p_payment_id, nullif(btrim(p_external_ref), ''), nullif(btrim(p_note), ''));

  -- Recomputed from the allocations, never incremented. An increment is a lost
  -- update waiting for two requests to arrive together.
  select coalesce(sum(amount_cents), 0) into v_paid
    from public.invoice_payments where invoice_id = p_invoice_id;

  -- No 'overpaid' state. paid >= total is paid; the generated balance_cents
  -- simply goes negative, which is why it carries no >= 0 check.
  v_state := case when v_paid >= v_inv.total_cents then 'paid'::public.invoice_state
                  else 'part_paid'::public.invoice_state end;

  update public.invoices
     set paid_cents = v_paid,
         state      = v_state,
         paid_at    = case when v_state = 'paid' then coalesce(paid_at, now()) else null end,
         updated_at = now()
   where id = p_invoice_id
   returning * into v_inv;

  -- An overpayment on an ORDER gets a real refund row, reusing the existing
  -- owed -> sent -> received workflow. Every other subject has no refund path,
  -- because refunds.order_id is NOT NULL and relaxing it touches live
  -- checkout. That is a named gap, settled by hand and noted on the invoice —
  -- not a reason to invent a second refunds table.
  v_over := v_paid - v_inv.total_cents;
  if v_over > 0 and v_inv.subject_type = 'order' then
    insert into public.refunds (order_id, amount, currency, status, reason, opened_by)
    values (v_inv.subject_id, v_over, v_inv.currency, 'owed',
            'Overpayment on ' || v_inv.number, 'invoicing')
    on conflict do nothing;
  end if;

  return v_inv;
end;
$fn$;

-- ── Cancelling ─────────────────────────────────────────────────────────────
create or replace function public.invoice_void(
  p_invoice_id uuid,
  p_reason     text
)
returns public.invoices
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare v_inv public.invoices;
begin
  if btrim(coalesce(p_reason, '')) = '' then
    -- A voided financial document with no stated reason is the thing an
    -- accountant cannot answer a question about a year later.
    raise exception 'Voiding an invoice needs a reason' using errcode = 'RRINV';
  end if;

  -- Same lock as invoice_record_payment(). Whichever gets it first wins, and
  -- the loser sees the committed truth.
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'RRINV';
  end if;

  -- The guard trigger enforces this too; raising here makes the message useful
  -- rather than leaving it to a generic transition error.
  if v_inv.paid_cents > 0 then
    raise exception
      'Invoice % already has money received against it and cannot be voided. Raise a credit note instead.',
      v_inv.number using errcode = 'RRINV';
  end if;

  update public.invoices
     set state       = 'void',
         voided_at   = now(),
         void_reason = btrim(p_reason),
         updated_at  = now()
   where id = p_invoice_id
   returning * into v_inv;

  return v_inv;
end;
$fn$;

revoke all on function public.invoice_record_payment(uuid, integer, public.payment_provider, timestamptz, uuid, text, text) from public;
revoke all on function public.invoice_record_payment(uuid, integer, public.payment_provider, timestamptz, uuid, text, text) from anon;
revoke all on function public.invoice_record_payment(uuid, integer, public.payment_provider, timestamptz, uuid, text, text) from authenticated;
grant execute on function public.invoice_record_payment(uuid, integer, public.payment_provider, timestamptz, uuid, text, text) to service_role;

revoke all on function public.invoice_void(uuid, text) from public;
revoke all on function public.invoice_void(uuid, text) from anon;
revoke all on function public.invoice_void(uuid, text) from authenticated;
grant execute on function public.invoice_void(uuid, text) to service_role;

do $assert$
begin
  if has_table_privilege('anon','public.invoice_payments','SELECT') then
    raise exception 'anon can read invoice_payments';
  end if;
  if has_function_privilege('anon','public.invoice_void(uuid,text)','EXECUTE') then
    raise exception 'anon can void invoices';
  end if;
  if has_function_privilege('authenticated','public.invoice_record_payment(uuid,integer,public.payment_provider,timestamptz,uuid,text,text)','EXECUTE') then
    raise exception 'authenticated can record payments';
  end if;
end
$assert$;
