-- ═══════════════════════════════════════════════════════════════════════════
-- M208 — A DELIVERY IS BILLED FOR THE FEE, AND ONLY THE FEE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The fourth subject, and the one with the sharpest edge on it.
--
-- WHAT IS BEING SOLD. Roule Rodrigues does not sell the parcel, the shopping or
-- the errand. It sells the journey. deliveries.customer_fee is what the
-- customer owes the platform, and it is the only figure on this document.
--
-- WHAT IS DELIBERATELY NOT ON IT:
--
--   delivery_requests.max_budget — on a shop_and_deliver job this is the cap on
--     the SHOPPING, the cash the customer hands over for goods. One live row
--     has max_budget 25500 against a customer_fee of 30000: a Rs 255 shopping
--     budget and a Rs 300 service charge, two completely different pockets.
--     Billing it would be invoicing a customer for their own groceries.
--
--   deliveries.payment_amount — NULL on every live row, and not a price. It is
--     what the customer SAID they sent by bank transfer, unverified, recorded
--     next to payment_proof_path for an admin to check. An unconfirmed claim
--     about a payment is not a figure to bill from; if the transfer is real it
--     becomes a PAYMENT against this invoice, not the invoice itself.
--
--   deliveries.driver_earning and platform_fee — the split of customer_fee
--     (80/20 on every live row). How the fee is divided internally is nobody's
--     business but ours; the customer owes the whole fee.
--
-- THE UNIT IS CENTS. Proved twice rather than assumed from the column name:
-- app/admin/deliveries/DeliveryBoard.tsx renders it with centsToDecimalString(),
-- and the live rows run 100 to 500000 — Rs 1 to Rs 5,000 — with
-- driver_earning + platform_fee equal to customer_fee on every one.
--
-- ── THE DOUBLE-BILLING TRAP, WHICH IS THE REASON THIS TOOK CARE ────────────
--
-- A delivery has exactly one origin. deliveries_one_origin enforces
--   (order_id is not null) <> (request_id is not null)
--
-- When it comes from a store ORDER, the fee is already billed. Checked against
-- the live function rather than a migration file, because the arithmetic has
-- moved between files more than once: order_amounts() ends
--
--   return query select v_tax, v_fee, p_subtotal + v_tax + v_fee;
--
-- where v_fee is the delivery zone's fee, and create_order() writes that third
-- column straight into orders.total. So the fee is inside orders.total, and
-- inside the invoice issued for that order. A second invoice for the delivery
-- would charge the same journey twice, on two separate numbered documents, to
-- the same customer.
--
-- So an order-backed delivery is REFUSED here, by name, with the remedy in the
-- message. Only a deliver-anything request — where the fee is the entire
-- transaction and no other document exists — can be invoiced.
--
-- ── ISSUED, NOT PAID — AND WHY THAT IS STILL RIGHT ────────────────────────
--
-- By the time a job is 'delivered' the fee has usually already been collected:
-- on a cash job the driver takes it at the door, on a transfer it was sent
-- before. So this issues a document for money that is, in practice, in hand.
--
-- It is still issued in state 'issued' rather than 'paid', because the only
-- thing this function KNOWS is that the customer's PIN confirmed arrival — not
-- that anybody counted the money. Marking it paid on that evidence would be
-- inventing a payment record nobody witnessed. The operator records the cash
-- (one click) and then issues the receipt, which is the document a delivery
-- customer actually wants: they have already paid, and they want it in writing.
--
-- THE REFERENCE is requestRef() from lib/delivery/request-status.ts: the first
-- six hex of the REQUEST id, not the delivery id. That is the string the
-- customer was shown and asked to keep, and the one they type into the lookup
-- form with their email. An invoice quoting the delivery id instead would carry
-- a reference the customer has never seen.

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

  elsif p_subject_type = 'delivery' then
    -- ALREADY CENTS. The fee, and nothing else — see the header.
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
      -- ONLY A COMPLETED JOB EARNED THE FEE, and the site already promises it:
      -- the failed-delivery tracker says, in as many words, "You have not been
      -- charged a delivery fee." (lib/delivery/request-status.ts). Invoicing a
      -- failed, cancelled or returned job would contradict a promise the
      -- customer has already read on their own tracking page.
      --
      -- Nothing ever writes customer_fee after insert — a repo-wide search for
      -- "set customer_fee" matches nothing — so a cancelled row still carries
      -- its full fee and would invoice cleanly. This check is the only thing
      -- standing between that row and a customer's document.
      --
      -- 'delivered' is reachable only through complete_delivery_with_pin(),
      -- where the CUSTOMER's own PIN confirms arrival. That is as good a proof
      -- of service as this platform has.
      raise exception
        'That delivery is %, not delivered, so the fee was not earned.', v_status
        using errcode = 'RRINV';
    end if;

    if coalesce(v_raw, 0) = 0 then
      raise exception 'That delivery has no fee to invoice.' using errcode = 'RRINV';
    end if;

    -- deliveries_one_origin guarantees request_id is set once order_id is not.
    select coalesce(nullif(btrim(r.contact_name), ''), 'Customer'),
           -- delivery_requests_identity guarantees one of these two exists: a
           -- guest gives an email, an account holder is one.
           coalesce(nullif(btrim(coalesce(r.guest_email, '')), ''), u.email),
           r.contact_phone,
           'RR-' || upper(substr(replace(r.id::text,'-',''), 1, 6)),
           -- The site's OWN names for the three kinds, from copy.i18n.ts:
           -- "Collect & deliver", "Buy & deliver", and the noun the errand
           -- flow itself uses ("What kind of errand is it?"). Nothing invented:
           -- a customer reading this line has already seen these words.
           case r.kind
             when 'shop_and_deliver' then 'Buy & deliver'
             when 'errand'           then 'Errand'
             when 'package'          then 'Collect & deliver'
             else 'Delivery'
           end || ' — ' || btrim(r.pickup_text) || ' to ' || btrim(r.dropoff_text)
      into v_name, v_email, v_phone, v_ref, v_desc
      from public.delivery_requests r
      left join auth.users u on u.id = r.customer_id
     where r.id = v_request_id;
    if not found then
      raise exception 'delivery % has no request row', p_subject_id;
    end if;

    -- WHAT IS BEING CHARGED FOR, ON THE DOCUMENT ITSELF. A customer reading an
    -- invoice headed "Buy & deliver" needs to know it does not bill what was
    -- bought. Said on the invoice, not only in a schema comment.
    --
    -- The wording reuses the site's own, rather than inventing a commercial
    -- term. "separate" is the word the /deliver form already uses for exactly
    -- this boundary — "The delivery fee is separate and each driver names
    -- their own" (copy.i18n.ts) — and "what the driver spent" is the tracker's
    -- phrase. Deliberately NOT "cash at the door": on this site that is the
    -- label of a payment METHOD FOR THE FEE, so borrowing it for the goods
    -- money would contradict copy the customer has already read.
    v_notes := coalesce(
      p_notes,
      'This is the delivery fee only. What the driver spent at the shop or on a bill is separate — it is repaid to them directly and is not billed here.'
    );

    v_unit  := 'cents';
    v_cents := v_raw;
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
    'issued', now(), v_notes
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
