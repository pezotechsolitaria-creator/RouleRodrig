-- ═══════════════════════════════════════════════════════════════════════════
-- M202 — A COURTESY MUST NOT FAIL THE MONEY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- M201 ended invoice_record_payment() with a kindness: when an ORDER invoice
-- is overpaid, open a refund row so the operator does not have to remember.
--
--   insert into public.refunds (..., opened_by) values (..., 'invoicing')
--
-- refunds carries
--   check (opened_by = any (array['system','merchant','admin','customer']))
--
-- so that insert raises. It is the LAST statement in the function, and in
-- Postgres a raised exception rolls back the whole transaction — the payment
-- row, the recomputed paid_cents, the state change, all of it. A customer
-- handing over more cash than they owed would have had their payment refused
-- and nothing recorded, with an error naming a constraint on a table they
-- have never heard of.
--
-- Found while exercising the function inside a transaction that was rolled
-- back afterwards, so it never reached a real row. Two changes here:
--
--   1. 'invoicing' -> 'system'. It is the platform opening the row, which is
--      exactly what 'system' means in the existing workflow.
--   2. The insert is wrapped. Even with a legal value, this block is a
--      convenience — a note to the operator. A convenience may never be able
--      to reject money that has already been handed over. If it fails for any
--      reason at all, the payment still stands and a warning says so.
--
-- The live database was corrected the day this was found. This migration is
-- what makes the repository reproduce the live database: without it, a fresh
-- environment built from these files gets the version that eats payments.

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
  -- the invoice row, so the loser re-reads the COMMITTED state.
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'RRINV';
  end if;

  if v_inv.state = 'void' then
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

  -- Recomputed from the allocations, never incremented.
  select coalesce(sum(amount_cents), 0) into v_paid
    from public.invoice_payments where invoice_id = p_invoice_id;

  v_state := case when v_paid >= v_inv.total_cents then 'paid'::public.invoice_state
                  else 'part_paid'::public.invoice_state end;

  update public.invoices
     set paid_cents = v_paid,
         state      = v_state,
         paid_at    = case when v_state = 'paid' then coalesce(paid_at, now()) else null end,
         updated_at = now()
   where id = p_invoice_id
   returning * into v_inv;

  -- THE COURTESY, AND ITS NET.
  --
  -- The money above is committed whatever happens in here. A refund row that
  -- cannot be opened is a note somebody has to write by hand; a payment that
  -- cannot be recorded is a customer standing at a counter being told their
  -- cash does not exist. The warning goes to the Postgres log with the
  -- invoice number, the amount and the reason, so nothing is lost silently.
  v_over := v_paid - v_inv.total_cents;
  if v_over > 0 and v_inv.subject_type = 'order' then
    begin
      insert into public.refunds (order_id, amount, currency, status, reason, opened_by)
      values (v_inv.subject_id, v_over, v_inv.currency, 'owed',
              'Overpayment on ' || v_inv.number, 'system');
    exception when others then
      raise warning 'invoice %: overpaid by % cents, refund row not opened (%)',
        v_inv.number, v_over, sqlerrm;
    end;
  end if;

  return v_inv;
end;
$fn$;
