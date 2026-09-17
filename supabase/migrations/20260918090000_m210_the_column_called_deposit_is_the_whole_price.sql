-- ═══════════════════════════════════════════════════════════════════════════
-- M210 — THE COLUMN CALLED DEPOSIT IS THE WHOLE PRICE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The fifth subject: a reservation at a place — a stay, a boat charter, a
-- guided tour. Zero rows have ever existed, which is exactly why this needed
-- reading rather than guessing: there is no live figure to sanity-check a
-- wrong unit against.
--
-- ── THE NAME IS A FOSSIL, AND IT LIES ─────────────────────────────────────
--
-- place_bookings.deposit_amount is NOT a deposit. lib/defaults.ts says so in
-- as many words:
--
--   "What the customer pays, in Rs, to confirm this booking — IN FULL. This
--    was a deposit until 2026-08-13, with a balance settled on arrival. The
--    owner's decision: activities are now paid in full at the point of
--    booking, so this number is the whole price and nothing is owed later.
--    The key keeps its old name because it is the same stored value in the
--    same place_bookings.deposit_amount column, and renaming it would have
--    meant migrating live reservations to change a word."
--
-- So an invoice built from this column must NOT say "deposit". A document
-- headed "Deposit" against a figure that is the entire price tells a customer
-- a balance is coming that never will, and invites them to hold money back.
-- The line says what was reserved and for when.
--
-- ── THE UNIT IS WHOLE RUPEES, CONFIRMED FOUR TIMES ────────────────────────
--
-- Not from the column name, and with no live row to measure:
--
--   lib/activity.ts:393        rupeesToCents(row.amount_paid ?? row.deposit_amount)
--   lib/activity.test.ts:262   deposit_amount 4000 -> amountCents 400000
--   lib/email.ts:1400          "bookings.deposit_amount and
--                               place_bookings.deposit_amount are whole RUPEES"
--   app/api/admin/money:115    "place_bookings.deposit_amount is whole rupees
--                               — convert at the edge"
--
-- That last comment exists because printing a rupee column and a cents column
-- through one formatter once announced a Rs 320.00 order to the owner as
-- "Rs 32,000". The multiplication below is the second place in this function
-- where rupees become cents, and the invoices_unit_provenance CHECK is what
-- proves it on the row.
--
-- ── NOT MULTIPLIED BY QUANTITY ────────────────────────────────────────────
--
-- place_bookings.quantity exists and is NOT NULL, and multiplying by it is the
-- obvious mistake. lib/defaults.ts again: "Flat per reservation, NOT per
-- person — a boat charter is priced by the boat, and there is no per-head
-- field to multiply by." The stored figure is already what quoteStay()
-- computed for this reservation; the admin money desk bills it as-is and calls
-- it amountDue.
--
-- ── A REAL DUE DATE, FOR THE FIRST TIME ───────────────────────────────────
--
-- Every adapter so far has left invoices.due_at NULL, because nothing upstream
-- had a deadline. This one does: place_bookings_approved_has_deadline enforces
-- that an approved reservation HAS a payment_due_by. Carrying it onto the
-- invoice means the document states the date the customer was already given,
-- rather than a second deadline invented by the invoicing system.
--
-- ── WHAT IS REFUSED ───────────────────────────────────────────────────────
--
--   pending      the owner has not accepted it yet; there is no agreement to
--                bill, and payment_due_by is not even set
--   unavailable  the owner said those dates are not free
--   cancelled    no
--   0 or NULL    "0 or unset keeps the listing request-only: nothing to
--                charge, so the owner confirms it by hand as before"
--                (lib/defaults.ts) — a request-only listing has no agreed
--                price, and an invoice for zero is not a document

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
  v_notes      text := p_notes;
  v_order_id   uuid;
  v_request_id uuid;
  v_status     text;
  v_due        timestamptz;
begin
  select * into s from public.invoice_settings where id = 'main';
  if not found then
    raise exception 'invoice_settings row is missing';
  end if;

  if p_subject_type = 'booking' then
    -- WHOLE RUPEES.
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

  elsif p_subject_type = 'ride_request' then
    -- ALREADY CENTS.
    select r.quoted_price,
           coalesce(nullif(btrim(r.customer_name), ''), 'Customer'),
           r.customer_email, r.customer_phone,
           'RR-' || upper(substr(replace(r.id::text,'-',''), 1, 6)),
           case r.service
             when 'taxi'    then 'Taxi'
             when 'airport' then 'Airport transfer'
             when 'ferry'   then 'Ferry transfer'
             when 'hotel'   then 'Hotel transfer'
             when 'private' then 'Private hire'
             else 'Transfer'
           end
           || case
                when nullif(btrim(coalesce(r.dropoff_label, '')), '') is not null
                  then ' — ' || btrim(r.pickup_label) || ' to ' || btrim(r.dropoff_label)
                else ' — from ' || btrim(r.pickup_label)
              end,
           1
      into v_raw, v_name, v_email, v_phone, v_ref, v_desc, v_qty
      from public.ride_requests r where r.id = p_subject_id;
    if not found then raise exception 'ride % not found', p_subject_id; end if;
    v_unit  := 'cents';
    v_cents := v_raw;

  elsif p_subject_type = 'delivery' then
    -- ALREADY CENTS. The fee, and nothing else.
    select d.customer_fee, d.order_id, d.request_id, d.status::text
      into v_raw, v_order_id, v_request_id, v_status
      from public.deliveries d where d.id = p_subject_id;
    if not found then raise exception 'delivery % not found', p_subject_id; end if;

    if v_order_id is not null then
      raise exception
        'That delivery belongs to a store order, and the order total already includes its delivery fee. Invoice the order instead.'
        using errcode = 'RRINV';
    end if;

    if v_status <> 'delivered' then
      raise exception
        'That delivery is %, not delivered, so the fee was not earned.', v_status
        using errcode = 'RRINV';
    end if;

    if coalesce(v_raw, 0) = 0 then
      raise exception 'That delivery has no fee to invoice.' using errcode = 'RRINV';
    end if;

    select coalesce(nullif(btrim(r.contact_name), ''), 'Customer'),
           coalesce(nullif(btrim(coalesce(r.guest_email, '')), ''), u.email),
           r.contact_phone,
           'RR-' || upper(substr(replace(r.id::text,'-',''), 1, 6)),
           -- KIND_LABEL from lib/delivery/kind.ts, word for word.
           case r.kind
             when 'package'          then 'Collect & deliver'
             when 'shop_and_deliver' then 'Buy & deliver'
             when 'errand'           then 'Do it for me'
             else 'Collect & deliver'
           end || ' — ' || btrim(r.pickup_text) || ' to ' || btrim(r.dropoff_text)
      into v_name, v_email, v_phone, v_ref, v_desc
      from public.delivery_requests r
      left join auth.users u on u.id = r.customer_id
     where r.id = v_request_id;
    if not found then
      raise exception 'delivery % has no request row', p_subject_id;
    end if;

    -- APPENDED, NEVER REPLACED.
    v_notes := 'This is the delivery fee only. What the driver spent at the shop or on a bill is separate — it is repaid to them directly and is not billed here.'
               || coalesce(chr(10) || chr(10) || nullif(btrim(coalesce(p_notes, '')), ''), '');

    v_unit  := 'cents';
    v_cents := v_raw;
    v_qty   := 1;

  elsif p_subject_type = 'place_booking' then
    -- WHOLE RUPEES, and the WHOLE PRICE — see the header. The column name
    -- says deposit and the value is the full charge.
    select p.deposit_amount, p.status, p.payment_due_by,
           coalesce(nullif(btrim(p.name), ''), 'Customer'),
           p.email, p.phone,
           'RR-' || upper(substr(replace(p.id::text,'-',''), 1, 6)),
           btrim(p.place_name)
             || ' — ' || to_char(p.start_date, 'FMDD Mon')
             || case when p.end_date > p.start_date
                     then ' to ' || to_char(p.end_date, 'FMDD Mon YYYY')
                     else ' ' || to_char(p.start_date, 'YYYY') end
             || case when coalesce(nullif(btrim(coalesce(p.time_slot, '')), ''), '') <> ''
                     then ', ' || btrim(p.time_slot) else '' end
      into v_raw, v_status, v_due, v_name, v_email, v_phone, v_ref, v_desc
      from public.place_bookings p where p.id = p_subject_id;
    if not found then raise exception 'place booking % not found', p_subject_id; end if;

    if v_status = 'pending' then
      raise exception
        'That reservation has not been approved yet, so there is nothing agreed to invoice.'
        using errcode = 'RRINV';
    end if;
    if v_status in ('unavailable', 'cancelled') then
      raise exception
        'That reservation is %, so the price was never owed.', v_status
        using errcode = 'RRINV';
    end if;

    if coalesce(v_raw, 0) = 0 then
      -- "0 or unset keeps the listing request-only: nothing to charge, so the
      -- owner confirms it by hand as before." There is no agreed price to put
      -- on a document.
      raise exception
        'That listing is request-only, so no price was ever agreed for this reservation.'
        using errcode = 'RRINV';
    end if;

    -- NOT multiplied by quantity: flat per reservation, by the owner's rule.
    v_unit  := 'rupees';
    v_cents := v_raw * 100;
    v_qty   := 1;

  else
    -- Still refuses rather than guessing. Each remaining subject arrives with
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
    state, issued_at, due_at, notes
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
    -- The deadline the customer was ALREADY given, never a new one. NULL for
    -- every other subject, because nothing upstream of them has a due date.
    'issued', now(), v_due, v_notes
  ) returning * into v_inv;

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

do $assert$
begin
  if has_function_privilege('anon','public.invoice_issue(public.invoice_subject_type,uuid,text)','EXECUTE') then
    raise exception 'anon can issue invoices';
  end if;
  if has_function_privilege('authenticated','public.invoice_issue(public.invoice_subject_type,uuid,text)','EXECUTE') then
    raise exception 'authenticated can issue invoices';
  end if;
end
$assert$;
