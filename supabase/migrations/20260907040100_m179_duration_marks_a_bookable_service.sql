-- ── The slot finder learns the same rule ───────────────────────────────────
--
-- A variant with no duration is not a service with an unknown length; it is not
-- a service. Offering slots for a bottle of wax and then refusing the booking
-- would be the slot finder and the booker disagreeing, which is the one thing
-- m178 set out to prevent.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.service_slots(uuid,uuid,timestamptz)'::regprocedure) into v_def;
  if position('not_bookable' in v_def) > 0 then
    raise notice 'already marks unbookable variants'; return;
  end if;
  v_def := replace(v_def,
E'  select minutes into v_minutes from service_durations where variant_id = p_variant_id;\n  v_minutes := coalesce(v_minutes, v_tp.slot_minutes);',
E'  -- A DURATION IS WHAT MAKES A VARIANT BOOKABLE. A trade sells two kinds of\n'
||E'  -- thing — a full valet, and a bottle of wax on the shelf beside it — and\n'
||E'  -- giving one a length is the act that says which it is.\n'
||E'  select minutes into v_minutes from service_durations where variant_id = p_variant_id;\n'
||E'  if p_variant_id is not null and v_minutes is null then\n'
||E'    return query select (p_now at time zone v_zone)::date, null::time, null::timestamptz,\n'
||E'                        ''not_bookable''::text;\n'
||E'    return;\n'
||E'  end if;\n'
||E'  -- No variant named at all is a different question: "when are they free in\n'
||E'  -- general", answered on the provider''s own grid.\n'
||E'  v_minutes := coalesce(v_minutes, v_tp.slot_minutes);');
  if position('not_bookable' in v_def) = 0 then
    raise exception 'anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;

-- ── A service is not something you put in a basket ─────────────────────────
--
-- create_order would have taken money for "Full valet — Rs 1,200" with no
-- appointment attached to it, and the customer would have had a paid order and
-- no time booked. Worse, it would have refused for the WRONG REASON first:
-- service variants carry stock_quantity 0, so the sentence was "Only 0 left of
-- Full valet" — which sends the buyer to ask a car wash to restock time.
--
-- Placed BEFORE the stock check for exactly that reason. A trade can still sell
-- goods through the basket; what it cannot sell there is booked time.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='create_order';
  if v_def is null then raise exception 'create_order missing'; end if;
  if position('service_durations' in v_def) > 0 then
    raise notice 'create_order already refuses booked time'; return;
  end if;
  v_def := replace(v_def,
E'    if v_variant.stock_quantity < v_qty then',
E'    if exists (select 1 from service_durations sd where sd.variant_id = v_variant.id) then\n'
||E'      raise exception using errcode=''RR006'',\n'
||E'        message=format(''"%s" is booked, not bought. Choose a time on their page.'', v_variant.product_name);\n'
||E'    end if;\n'
||E'    if v_variant.stock_quantity < v_qty then');
  if position('service_durations' in v_def) = 0 then
    raise exception 'create_order anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;
