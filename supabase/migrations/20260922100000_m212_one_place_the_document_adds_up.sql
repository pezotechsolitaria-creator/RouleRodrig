-- ═══════════════════════════════════════════════════════════════════════════
-- M212 — ONE PLACE THE DOCUMENT ADDS UP
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The invoicing rule is "the caller supplies no money" — invoice_issue() reads
-- the authoritative row itself, because a caller that can pass an amount can
-- pass the wrong unit. A booking document has no authoritative row: the owner
-- types the unit price, because no column anywhere holds "Rs 1,800 per person
-- for Îles aux Cocos".
--
-- So the rule adapts rather than disappears. The caller supplies the typed
-- figures ONCE, and every derived figure — each line total, the document
-- total, the deposit — is computed HERE, in SQL, from those. The browser draws
-- a PDF from what this function returns; it never sends a total it worked out
-- itself. That is what stops the page disagreeing with the row behind it.
--
-- Cents throughout, as everywhere else money reaches a document.

create or replace function public.booking_doc_save(
  p_id               uuid,
  p_reference        text,
  p_guest_name       text,
  p_guest_email      text,
  p_guest_phone      text,
  p_details          jsonb,
  p_lines            jsonb,
  p_deposit_pct      integer,
  p_received_cents   integer,
  p_note             text,
  p_place_booking_id uuid
)
returns public.booking_documents
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare
  v_doc     public.booking_documents;
  v_year    smallint := extract(year from (now() at time zone 'Indian/Mauritius'))::smallint;
  v_seq     integer;
  v_total   integer := 0;
  v_deposit integer := 0;
  v_pay     text;
  v_line    jsonb;
  v_pos     integer := 0;
  v_qty     numeric(12,3);
  v_unit    integer;
  v_lineamt integer;
begin
  if nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'A booking document needs a reference' using errcode = 'RRBKG';
  end if;
  if nullif(btrim(coalesce(p_guest_name, '')), '') is null then
    raise exception 'Who is this booking for?' using errcode = 'RRBKG';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'A booking document needs at least one line' using errcode = 'RRBKG';
  end if;
  -- MAX_LINES in lib/booking-docs/model.ts. The renderer walks down one page
  -- with no overflow check, so a document with more rows than fit would draw
  -- through its own footer.
  if jsonb_array_length(p_lines) > 8 then
    raise exception 'A booking document fits eight lines at most' using errcode = 'RRBKG';
  end if;

  -- THE TOTAL IS ADDED UP HERE, from the typed figures, once.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce((v_line->>'qty')::numeric, 0);
    v_unit := coalesce((v_line->>'unitPriceCents')::integer, 0);
    if v_qty <= 0 then
      raise exception 'A line needs a quantity' using errcode = 'RRBKG';
    end if;
    if v_unit < 0 then
      raise exception 'A line cannot have a negative price' using errcode = 'RRBKG';
    end if;
    v_total := v_total + round(v_qty * v_unit)::integer;
  end loop;

  -- And the deposit from the percentage, so the document prints a figure that
  -- provably came from the percentage beside it.
  v_deposit := case
                 when p_deposit_pct is null then 0
                 else round((v_total::numeric * p_deposit_pct) / 100)::integer
               end;

  if p_id is null then
    v_seq := public.next_invoice_seq('BKG', v_year);
    -- Snapshotted at creation. If he changes his Juice number next year, a
    -- document already sent still says what it said when it was sent.
    select s.pay_instruction into v_pay from public.invoice_settings s where s.id = 'main';

    insert into public.booking_documents (
      series, issue_year, seq, number, reference,
      guest_name, guest_email, guest_phone, details,
      total_cents, deposit_pct, deposit_cents, received_cents,
      pay_instruction, note, place_booking_id
    ) values (
      'BKG', v_year, v_seq,
      'RR-BKG-' || v_year::text || '-' || lpad(v_seq::text, 6, '0'),
      btrim(p_reference),
      btrim(p_guest_name),
      nullif(btrim(lower(coalesce(p_guest_email, ''))), ''),
      nullif(btrim(coalesce(p_guest_phone, '')), ''),
      coalesce(p_details, '[]'::jsonb),
      v_total, p_deposit_pct, v_deposit, greatest(coalesce(p_received_cents, 0), 0),
      v_pay, nullif(btrim(coalesce(p_note, '')), ''), p_place_booking_id
    ) returning * into v_doc;
  else
    update public.booking_documents
       set reference      = btrim(p_reference),
           guest_name     = btrim(p_guest_name),
           guest_email    = nullif(btrim(lower(coalesce(p_guest_email, ''))), ''),
           guest_phone    = nullif(btrim(coalesce(p_guest_phone, '')), ''),
           details        = coalesce(p_details, '[]'::jsonb),
           total_cents    = v_total,
           deposit_pct    = p_deposit_pct,
           deposit_cents  = v_deposit,
           received_cents = greatest(coalesce(p_received_cents, 0), 0),
           note           = nullif(btrim(coalesce(p_note, '')), ''),
           place_booking_id = p_place_booking_id,
           updated_at     = now()
     where id = p_id
     returning * into v_doc;
    if not found then
      raise exception 'Booking document % not found', p_id using errcode = 'RRBKG';
    end if;
    delete from public.booking_document_lines where document_id = p_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_pos     := v_pos + 1;
    v_qty     := (v_line->>'qty')::numeric;
    v_unit    := (v_line->>'unitPriceCents')::integer;
    v_lineamt := round(v_qty * v_unit)::integer;
    insert into public.booking_document_lines
      (document_id, position, description, qty, unit_price_cents, line_total_cents)
    values (v_doc.id, v_pos,
            coalesce(nullif(btrim(v_line->>'description'), ''), 'Service'),
            v_qty, v_unit, v_lineamt);
  end loop;

  return v_doc;
end;
$fn$;

revoke all on function public.booking_doc_save(uuid, text, text, text, text, jsonb, jsonb, integer, integer, text, uuid) from public;
revoke all on function public.booking_doc_save(uuid, text, text, text, text, jsonb, jsonb, integer, integer, text, uuid) from anon;
revoke all on function public.booking_doc_save(uuid, text, text, text, text, jsonb, jsonb, integer, integer, text, uuid) from authenticated;
grant execute on function public.booking_doc_save(uuid, text, text, text, text, jsonb, jsonb, integer, integer, text, uuid) to service_role;

do $assert$
begin
  if has_function_privilege('anon',
       'public.booking_doc_save(uuid,text,text,text,text,jsonb,jsonb,integer,integer,text,uuid)',
       'EXECUTE') then
    raise exception 'anon can write booking documents';
  end if;
  if has_function_privilege('authenticated',
       'public.booking_doc_save(uuid,text,text,text,text,jsonb,jsonb,integer,integer,text,uuid)',
       'EXECUTE') then
    raise exception 'authenticated can write booking documents';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
