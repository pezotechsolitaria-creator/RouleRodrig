-- ═══════════════════════════════════════════════════════════════════════════
-- M207 — THE CREDIT NOTE THE ERRORS PROMISE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Three refusals in this system end with the same sentence:
--
--   'Invoice % cannot be altered once issued. Void it and reissue, or raise a
--    credit note.'
--   'Invoice % already has money received against it and cannot be voided.
--    Raise a credit note instead.'
--
-- There was no way to raise one. The enum had 'credit_note', the series check
-- had 'CRN', the counter would have produced RR-CRN-2026-000001 — and an admin
-- reading that error had nowhere to go. An error message that names a remedy
-- the software does not have is worse than one that says nothing.
--
-- WHEN IT IS THE RIGHT TOOL. Voiding says the document should never have
-- existed. Once a customer has paid against it, that is not true any more, and
-- the guard trigger refuses. A credit note is the honest alternative: the
-- invoice stands, as issued, and a second numbered document reduces what is
-- owed. That is also the only version an accountant can follow — a sale that
-- vanishes is a sale nobody can reconcile.
--
-- PARTIAL CREDITS. p_amount_cents defaults to the whole invoice. A smaller
-- figure credits part of it — one day of a rental that was never taken, a
-- damaged item in an order. It may never exceed the invoice, because a credit
-- note for more than was charged is not a correction, it is a payment.
--
-- WHAT IT DOES NOT TOUCH. Not the invoice's own totals: those are immutable by
-- trigger, and this function does not attempt what the trigger would refuse.
-- The one state change it does make is narrow and stated below.
--
-- ONE LIVE CREDIT NOTE PER SALE. invoices_one_live_per_subject already allows
-- exactly one live document of each kind per subject. Rather than let that
-- surface as a unique-violation nobody can read, the check is made here with a
-- message that says which document is in the way and what to do about it.

create or replace function public.invoice_credit_note(
  p_invoice_id   uuid,
  p_reason       text,
  p_amount_cents integer default null
)
returns public.invoices
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare
  v_src    public.invoices;
  v_note   public.invoices;
  v_exists public.invoices;
  v_amount integer;
  v_year   smallint := extract(year from (now() at time zone 'Indian/Mauritius'))::smallint;
  v_seq    integer;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    -- A credit note without a reason is an unexplained hole in the takings.
    raise exception 'A credit note needs a reason' using errcode = 'RRINV';
  end if;

  select * into v_src from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'RRINV';
  end if;

  if v_src.doc_kind <> 'invoice' then
    raise exception 'Only an invoice can be credited. % is a %',
      v_src.number, v_src.doc_kind using errcode = 'RRINV';
  end if;

  if v_src.state = 'draft' then
    raise exception 'Invoice % has not been issued. Edit or delete the draft instead.',
      v_src.number using errcode = 'RRINV';
  end if;

  if v_src.state = 'void' then
    raise exception 'Invoice % was cancelled. There is nothing left to credit.',
      v_src.number using errcode = 'RRINV';
  end if;

  select * into v_exists from public.invoices
   where doc_kind = 'credit_note' and parent_invoice_id = v_src.id and state <> 'void'
   limit 1;
  if found then
    raise exception
      'Invoice % already has credit note %. Cancel that one first if it was wrong.',
      v_src.number, v_exists.number using errcode = 'RRINV';
  end if;

  v_amount := coalesce(p_amount_cents, v_src.total_cents);
  if v_amount <= 0 then
    raise exception 'A credit note must be a positive amount' using errcode = 'RRINV';
  end if;
  if v_amount > v_src.total_cents then
    raise exception
      'A credit note cannot exceed the invoice. % is for % cents.',
      v_src.number, v_src.total_cents using errcode = 'RRINV';
  end if;

  v_seq := public.next_invoice_seq('CRN', v_year);

  insert into public.invoices (
    doc_kind, series, issue_year, seq, number, parent_invoice_id,
    subject_type, subject_id, reference,
    bill_to_name, bill_to_email, bill_to_phone, bill_to_address,
    seller_name, seller_address, seller_brn, seller_vat, seller_bank,
    currency,
    subtotal_cents, total_cents,
    source_amount_unit, source_amount_raw, source_total_cents,
    state, issued_at, notes
  ) values (
    'credit_note', 'CRN', v_year, v_seq,
    'RR-CRN-' || v_year::text || '-' || lpad(v_seq::text, 6, '0'), v_src.id,
    v_src.subject_type, v_src.subject_id, v_src.reference,
    v_src.bill_to_name, v_src.bill_to_email, v_src.bill_to_phone, v_src.bill_to_address,
    v_src.seller_name, v_src.seller_address, v_src.seller_brn, v_src.seller_vat,
    v_src.seller_bank,
    v_src.currency,
    v_amount, v_amount,
    -- The provenance of the ORIGINAL sale travels with the correction, so the
    -- pair can still be read back to the row they came from.
    v_src.source_amount_unit, v_src.source_amount_raw, v_src.source_total_cents,
    'issued', now(),
    'Credit note against ' || v_src.number || ' — ' || btrim(p_reason)
  ) returning * into v_note;

  insert into public.invoice_lines (invoice_id, position, kind, description, qty,
                                    unit_price_cents, line_total_cents)
  values (v_note.id, 1, 'charge',
          'Credit against ' || v_src.number || ' — ' || btrim(p_reason),
          1, v_amount, v_amount);

  -- THE ONE STATE CHANGE, AND ITS LIMITS.
  --
  -- An invoice credited in full that never received a payment is settled: it
  -- will never be paid and it is not a debt. 'written_off' is exactly that
  -- state, and leaving it in 'issued' would keep it in the outstanding figure
  -- for ever, which makes the register lie.
  --
  -- Anything else is left alone. A PAID invoice credited in full means money
  -- has to go back — that is a refund, decided by a person, not a state change
  -- made quietly here. A partial credit leaves a real balance.
  if v_amount = v_src.total_cents and v_src.paid_cents = 0 then
    update public.invoices
       set state = 'written_off', updated_at = now()
     where id = v_src.id;
  end if;

  return v_note;
end;
$fn$;

revoke all on function public.invoice_credit_note(uuid, text, integer) from public;
revoke all on function public.invoice_credit_note(uuid, text, integer) from anon;
revoke all on function public.invoice_credit_note(uuid, text, integer) from authenticated;
grant execute on function public.invoice_credit_note(uuid, text, integer) to service_role;

do $assert$
begin
  if has_function_privilege('anon','public.invoice_credit_note(uuid,text,integer)','EXECUTE') then
    raise exception 'anon can raise credit notes';
  end if;
  if has_function_privilege('authenticated','public.invoice_credit_note(uuid,text,integer)','EXECUTE') then
    raise exception 'authenticated can raise credit notes';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
