-- ═══════════════════════════════════════════════════════════════════════════
-- M215 — SAVING A RECEIPTLY DOCUMENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The invoicing rule is "the caller supplies no money": invoice_issue() reads
-- the authoritative row itself, because a caller that can pass an amount can
-- pass the wrong unit. Receiptly has no authoritative row — nothing in this
-- database holds "Rs 1,800 per person for Îles aux Cocos" — so the owner types
-- it, and the rule adapts rather than disappears:
--
--   the caller supplies the TYPED figures once;
--   every DERIVED figure is computed here, in SQL.
--
-- Line totals, the document total and the deposit are all worked out from the
-- typed inputs by this function. The browser draws a PDF from what comes back;
-- it never sends a total it calculated itself. That is what stops the page
-- disagreeing with the row behind it — the two cannot diverge because only one
-- of them ever does the arithmetic.
--
-- Money is in MINOR UNITS of the document's own currency. The deposit is a
-- percentage OR a flat figure, never both, and the flat one wins if somebody
-- manages to send both, because it is the more explicit statement.

create or replace function public.receiptly_doc_save(
  p_id                 uuid,
  p_kind               text,
  p_reference          text,
  p_business           jsonb,
  p_customer           jsonb,
  p_service_name       text,
  p_details            jsonb,
  p_lines              jsonb,
  p_currency_code      text,
  p_deposit_pct        integer,
  p_deposit_fixed_minor integer,
  p_received_minor     integer,
  p_pay_method         text,
  p_pay_reference      text,
  p_issued_on          date,
  p_due_on             date,
  p_notes              text,
  p_terms              text,
  p_footer             text,
  p_place_booking_id   uuid
)
returns public.receiptly_documents
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare
  v_doc     public.receiptly_documents;
  v_year    smallint := extract(year from (now() at time zone 'Indian/Mauritius'))::smallint;
  v_seq     integer;
  v_total   integer := 0;
  v_deposit integer := 0;
  v_line    jsonb;
  v_pos     integer := 0;
  v_qty     numeric(12,3);
  v_unit    integer;
  v_kind    text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'confirmation');
  v_cur     text := upper(coalesce(nullif(btrim(coalesce(p_currency_code, '')), ''), 'MUR'));
  v_name    text := btrim(coalesce(p_business->>'name', ''));
  v_cust    text := btrim(coalesce(p_customer->>'name', ''));
  v_logo    text := nullif(btrim(coalesce(p_business->>'logo', '')), '');
  v_accent  text := coalesce(nullif(btrim(coalesce(p_business->>'accent', '')), ''), '#0a7d3b');
begin
  if nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'A document needs a reference' using errcode = 'RRRCP';
  end if;
  if v_name = '' then
    raise exception 'A document needs a business name' using errcode = 'RRRCP';
  end if;
  if v_cust = '' then
    raise exception 'Who is this document for?' using errcode = 'RRRCP';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'A document needs at least one line' using errcode = 'RRRCP';
  end if;
  -- MAX_LINES in lib/receiptly/model.ts. The renderer walks one page downward
  -- with no pagination, so more rows than fit would draw through the footer.
  if jsonb_array_length(p_lines) > 12 then
    raise exception 'A document fits twelve lines at most' using errcode = 'RRRCP';
  end if;

  -- A logo that is not a JPEG data URL is DROPPED rather than refused. It
  -- reaches here from a browser that was supposed to re-encode it, and
  -- failing the whole save over a picture would lose the document instead.
  if v_logo is not null and v_logo not like 'data:image/jpeg;base64,%' then
    v_logo := null;
  end if;
  if v_logo is not null and length(v_logo) > 120000 then
    v_logo := null;
  end if;
  if v_accent !~ '^#[0-9a-fA-F]{6}$' then
    v_accent := '#0a7d3b';
  end if;

  -- ── THE ARITHMETIC, ONCE, HERE ───────────────────────────────────────────
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce((v_line->>'qty')::numeric, 0);
    v_unit := coalesce((v_line->>'unitMinor')::integer, 0);
    if v_qty <= 0 then
      raise exception 'A line needs a quantity' using errcode = 'RRRCP';
    end if;
    if v_unit < 0 then
      raise exception 'A line cannot have a negative price' using errcode = 'RRRCP';
    end if;
    v_total := v_total + round(v_qty * v_unit)::integer;
  end loop;

  v_deposit := case
                 when p_deposit_fixed_minor is not null
                   then least(greatest(p_deposit_fixed_minor, 0), v_total)
                 when p_deposit_pct is not null
                   then round((v_total::numeric * least(greatest(p_deposit_pct, 0), 100)) / 100)::integer
                 else 0
               end;

  if p_id is null then
    v_seq := public.next_invoice_seq('BKG', v_year);
    insert into public.receiptly_documents (
      series, issue_year, seq, number, kind, reference,
      biz_name, biz_tagline, biz_website, biz_accent, biz_logo,
      customer_name, customer_email, customer_phone,
      service_name, details, currency_code,
      total_minor, deposit_pct, deposit_fixed_minor, deposit_minor, received_minor,
      pay_method, pay_reference, issued_on, due_on,
      notes, terms, footer, place_booking_id
    ) values (
      'BKG', v_year, v_seq,
      'RR-BKG-' || v_year::text || '-' || lpad(v_seq::text, 6, '0'),
      v_kind, btrim(p_reference),
      v_name,
      nullif(btrim(coalesce(p_business->>'tagline', '')), ''),
      nullif(btrim(coalesce(p_business->>'website', '')), ''),
      v_accent, v_logo,
      v_cust,
      nullif(btrim(lower(coalesce(p_customer->>'email', ''))), ''),
      nullif(btrim(coalesce(p_customer->>'phone', '')), ''),
      nullif(btrim(coalesce(p_service_name, '')), ''),
      coalesce(p_details, '[]'::jsonb),
      v_cur,
      v_total,
      case when p_deposit_fixed_minor is null then p_deposit_pct else null end,
      p_deposit_fixed_minor,
      v_deposit,
      greatest(coalesce(p_received_minor, 0), 0),
      nullif(btrim(coalesce(p_pay_method, '')), ''),
      nullif(btrim(coalesce(p_pay_reference, '')), ''),
      coalesce(p_issued_on, current_date),
      p_due_on,
      nullif(btrim(coalesce(p_notes, '')), ''),
      nullif(btrim(coalesce(p_terms, '')), ''),
      nullif(btrim(coalesce(p_footer, '')), ''),
      p_place_booking_id
    ) returning * into v_doc;
  else
    update public.receiptly_documents set
      kind = v_kind,
      reference = btrim(p_reference),
      biz_name = v_name,
      biz_tagline = nullif(btrim(coalesce(p_business->>'tagline', '')), ''),
      biz_website = nullif(btrim(coalesce(p_business->>'website', '')), ''),
      biz_accent = v_accent,
      biz_logo = v_logo,
      customer_name = v_cust,
      customer_email = nullif(btrim(lower(coalesce(p_customer->>'email', ''))), ''),
      customer_phone = nullif(btrim(coalesce(p_customer->>'phone', '')), ''),
      service_name = nullif(btrim(coalesce(p_service_name, '')), ''),
      details = coalesce(p_details, '[]'::jsonb),
      currency_code = v_cur,
      total_minor = v_total,
      deposit_pct = case when p_deposit_fixed_minor is null then p_deposit_pct else null end,
      deposit_fixed_minor = p_deposit_fixed_minor,
      deposit_minor = v_deposit,
      received_minor = greatest(coalesce(p_received_minor, 0), 0),
      pay_method = nullif(btrim(coalesce(p_pay_method, '')), ''),
      pay_reference = nullif(btrim(coalesce(p_pay_reference, '')), ''),
      issued_on = coalesce(p_issued_on, issued_on),
      due_on = p_due_on,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      terms = nullif(btrim(coalesce(p_terms, '')), ''),
      footer = nullif(btrim(coalesce(p_footer, '')), ''),
      place_booking_id = p_place_booking_id,
      updated_at = now()
    where id = p_id
    returning * into v_doc;
    if not found then
      raise exception 'Document % not found', p_id using errcode = 'RRRCP';
    end if;
    delete from public.receiptly_document_lines where document_id = p_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_pos  := v_pos + 1;
    v_qty  := (v_line->>'qty')::numeric;
    v_unit := (v_line->>'unitMinor')::integer;
    insert into public.receiptly_document_lines
      (document_id, position, description, qty, unit_price_minor, line_total_minor)
    values (v_doc.id, v_pos,
            coalesce(nullif(btrim(v_line->>'description'), ''), 'Item'),
            v_qty, v_unit, round(v_qty * v_unit)::integer);
  end loop;

  return v_doc;
end;
$fn$;

-- ── Cancelling one ─────────────────────────────────────────────────────────
-- Not deleted: a document that was sent to somebody exists whether or not it
-- was a mistake, and its number is never reused.
create or replace function public.receiptly_doc_set_state(
  p_id uuid, p_state text
)
returns public.receiptly_documents
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare v_doc public.receiptly_documents;
begin
  if p_state not in ('open', 'cancelled') then
    raise exception 'Unknown state %', p_state using errcode = 'RRRCP';
  end if;
  update public.receiptly_documents
     set state = p_state, updated_at = now()
   where id = p_id
   returning * into v_doc;
  if not found then
    raise exception 'Document % not found', p_id using errcode = 'RRRCP';
  end if;
  return v_doc;
end;
$fn$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on a new public function to anon and authenticated
-- by default, and REVOKE FROM PUBLIC does not remove a named-role grant. Both
-- are revoked explicitly, and the assertion below is what proves it.
revoke all on function public.receiptly_doc_save(uuid, text, text, jsonb, jsonb, text, jsonb, jsonb, text, integer, integer, integer, text, text, date, date, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.receiptly_doc_save(uuid, text, text, jsonb, jsonb, text, jsonb, jsonb, text, integer, integer, integer, text, text, date, date, text, text, text, uuid) to service_role;

revoke all on function public.receiptly_doc_set_state(uuid, text) from public, anon, authenticated;
grant execute on function public.receiptly_doc_set_state(uuid, text) to service_role;

do $assert$
begin
  if has_function_privilege('anon',
       'public.receiptly_doc_save(uuid,text,text,jsonb,jsonb,text,jsonb,jsonb,text,integer,integer,integer,text,text,date,date,text,text,text,uuid)',
       'EXECUTE') then
    raise exception 'anon can write Receiptly documents';
  end if;
  if has_function_privilege('authenticated',
       'public.receiptly_doc_save(uuid,text,text,jsonb,jsonb,text,jsonb,jsonb,text,integer,integer,integer,text,text,date,date,text,text,text,uuid)',
       'EXECUTE') then
    raise exception 'authenticated can write Receiptly documents';
  end if;
  if has_table_privilege('anon', 'public.receiptly_documents', 'SELECT') then
    raise exception 'anon can read Receiptly documents';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
