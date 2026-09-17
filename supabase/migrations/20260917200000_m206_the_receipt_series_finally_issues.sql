-- ═══════════════════════════════════════════════════════════════════════════
-- M206 — THE RECEIPT SERIES FINALLY ISSUES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- M200 built the whole apparatus for three document kinds — the enum, the RCP
-- and CRN series, the per-series counter, the CHECK that ties kind to series —
-- and then only ever issued an invoice. RR-RCP-2026-000001 was a number the
-- schema could produce and no code would ask for.
--
-- A receipt is not a nicer invoice. It is the acknowledgement that the money
-- arrived, with its own number, which is what somebody puts in front of an
-- accountant. The invoice says "this is owed"; the receipt says "this was
-- paid", and a business that only ever hands over the first is asking its
-- customers to prove a negative.
--
-- DERIVED, NEVER RECOMPUTED. Every figure is copied from the invoice, source
-- provenance included. Nothing is read from the source table a second time and
-- nothing is added up again: two documents about one transaction that compute
-- their own totals are two documents that can disagree, and the customer holds
-- both.
--
-- One relaxation first. invoices_credit_note_has_parent was an EQUIVALENCE —
-- exactly the credit notes have a parent — which made it impossible for a
-- receipt to name the invoice it acknowledges. That was an accident of the
-- credit note being the only child anyone had thought about. It becomes a
-- case: a credit note must have a parent, an invoice must not, a receipt may.

alter table public.invoices drop constraint if exists invoices_credit_note_has_parent;
alter table public.invoices add constraint invoices_parent_matches_kind check (
  case doc_kind
    when 'credit_note' then parent_invoice_id is not null
    when 'invoice'     then parent_invoice_id is null
    when 'receipt'     then true
  end
);

create or replace function public.invoice_issue_receipt(
  p_invoice_id uuid,
  p_notes      text default null
)
returns public.invoices
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare
  v_src  public.invoices;
  v_rcp  public.invoices;
  v_year smallint := extract(year from (now() at time zone 'Indian/Mauritius'))::smallint;
  v_seq  integer;
begin
  -- Locked for the same reason a payment is: a receipt must not be written
  -- from a state that is being changed underneath it.
  select * into v_src from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'RRINV';
  end if;

  if v_src.doc_kind <> 'invoice' then
    raise exception 'Only an invoice can be receipted. % is a %',
      v_src.number, v_src.doc_kind using errcode = 'RRINV';
  end if;

  if v_src.state <> 'paid' then
    -- A receipt for money that has not all arrived is a document that says
    -- something untrue. Part payments are visible on the invoice itself.
    raise exception
      'Invoice % is not paid in full, so there is nothing to receipt.',
      v_src.number using errcode = 'RRINV';
  end if;

  if exists (
    select 1 from public.invoices
     where doc_kind = 'receipt' and parent_invoice_id = v_src.id and state <> 'void'
  ) then
    raise exception 'Invoice % already has a receipt.', v_src.number using errcode = 'RRINV';
  end if;

  v_seq := public.next_invoice_seq('RCP', v_year);

  insert into public.invoices (
    doc_kind, series, issue_year, seq, number, parent_invoice_id,
    subject_type, subject_id, reference,
    bill_to_name, bill_to_email, bill_to_phone, bill_to_address,
    seller_name, seller_address, seller_brn, seller_vat, seller_bank,
    currency,
    subtotal_cents, discount_cents, tax_cents, delivery_cents,
    total_cents, paid_cents,
    source_amount_unit, source_amount_raw, source_total_cents,
    state, issued_at, paid_at, notes
  ) values (
    'receipt', 'RCP', v_year, v_seq,
    'RR-RCP-' || v_year::text || '-' || lpad(v_seq::text, 6, '0'), v_src.id,
    v_src.subject_type, v_src.subject_id, v_src.reference,
    v_src.bill_to_name, v_src.bill_to_email, v_src.bill_to_phone, v_src.bill_to_address,
    v_src.seller_name, v_src.seller_address, v_src.seller_brn, v_src.seller_vat,
    v_src.seller_bank,
    v_src.currency,
    v_src.subtotal_cents, v_src.discount_cents, v_src.tax_cents, v_src.delivery_cents,
    v_src.total_cents, v_src.paid_cents,
    v_src.source_amount_unit, v_src.source_amount_raw, v_src.source_total_cents,
    'paid', now(), coalesce(v_src.paid_at, now()),
    coalesce(nullif(btrim(p_notes), ''), 'Receipt for ' || v_src.number)
  ) returning * into v_rcp;

  -- The same lines, in the same order. A receipt that itemises differently
  -- from the invoice it acknowledges is a second version of the same sale.
  insert into public.invoice_lines (invoice_id, position, kind, description, qty,
                                    unit_price_cents, line_total_cents)
  select v_rcp.id, l.position, l.kind, l.description, l.qty,
         l.unit_price_cents, l.line_total_cents
    from public.invoice_lines l
   where l.invoice_id = v_src.id
   order by l.position;

  return v_rcp;
end;
$fn$;

revoke all on function public.invoice_issue_receipt(uuid, text) from public;
revoke all on function public.invoice_issue_receipt(uuid, text) from anon;
revoke all on function public.invoice_issue_receipt(uuid, text) from authenticated;
grant execute on function public.invoice_issue_receipt(uuid, text) to service_role;

do $assert$
begin
  if has_function_privilege('anon','public.invoice_issue_receipt(uuid,text)','EXECUTE') then
    raise exception 'anon can issue receipts';
  end if;
  if has_function_privilege('authenticated','public.invoice_issue_receipt(uuid,text)','EXECUTE') then
    raise exception 'authenticated can issue receipts';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
