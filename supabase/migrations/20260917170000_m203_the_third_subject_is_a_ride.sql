-- ═══════════════════════════════════════════════════════════════════════════
-- M203 — THE THIRD SUBJECT IS A RIDE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- invoice_issue() handled two subjects, one of each unit, because the point of
-- phase 1 was to prove a unit could survive the trip. It did. This adds the
-- third, and it is the one with real money already in it: taxis, airport and
-- ferry transfers, private hire.
--
-- THE UNIT. ride_requests.quoted_price is CENTS. Not asserted from the column
-- name — read from the live rows before this was written:
--
--   8 priced rides, from 25000 to 180000
--   = Rs 250 to Rs 1,800, which is what an island transfer costs
--
-- A rupee reading would make the cheapest taxi Rs 25,000. The invoices CHECK
-- (source_total_cents = raw when 'cents') records the decision on the row, so
-- a wrong one is visible on the document rather than inferred from code.
--
-- THE REFERENCE. It must be the reference the customer already holds. They
-- track a ride at /taxi/track?ref=RR-XXXXXX, built by rideReference() in
-- lib/rides/model.ts as the first six hex of the id, uppercased. The SQL below
-- produces the same string, and rides.test pins the two together. An invoice
-- carrying a reference nobody recognises is a document that generates an email
-- instead of settling one.
--
-- THE DESCRIPTION. The service labels are RIDE_SERVICE_META's, word for word —
-- "Airport transfer", not "airport". The route follows, because "Taxi" alone
-- on a receipt is not something anyone can check against their memory of the
-- day. A private hire has no dropoff at all, which is why the label is built
-- with a case rather than a concatenation that would print " to ".
--
-- WHAT IS NOT HERE. No fare breakdown: there is no distance on the row to
-- break it down by, and dividing a quote into invented kilometres would put a
-- number on a customer document that nothing in the database supports. The
-- line is the quoted fare, and the quote is what the customer agreed to.

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

  elsif p_subject_type = 'ride_request' then
    -- ALREADY CENTS. quoted_price is server-set from ride_pricing; a customer
    -- never types it, which is why it can be trusted as the invoice total.
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

  else
    -- Still refuses rather than guessing. Each remaining subject arrives with
    -- its own adapter and its own test.
    raise exception 'invoice_issue: subject % is not supported yet', p_subject_type;
  end if;

  if v_raw is null then
    -- A ride with no quote is the common case here: four of nine live rides
    -- never got one. There is nothing to invoice, and inventing a figure is
    -- the one thing this function must never do.
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
  -- invoice_lines_arithmetic whenever the total does not divide evenly. Rather
  -- than round money into agreement, the line states the total it actually is
  -- and says the period in its description.
  insert into public.invoice_lines (invoice_id, position, kind, description, qty,
                                    unit_price_cents, line_total_cents)
  values (v_inv.id, 1, 'charge',
          case when v_qty > 1 then v_desc || ' — ' || v_qty::integer::text || ' days'
               else v_desc end,
          1, v_cents, v_cents);

  return v_inv;
end;
$fn$;

-- create or replace keeps the existing ACL, so the grants from M200 still
-- stand. Re-stated anyway: this project has twice found a function that
-- inherited anon EXECUTE from Supabase's default privileges after a migration
-- said it had revoked it, and a function that issues documents in the
-- company's name is not one to assume about.
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
