-- ── A PRICE THE CUSTOMER COULD NOT ACTUALLY BOOK ───────────────────────────
--
-- delivery_request_view() lists every quote whose status is 'offered', joined
-- to delivery_drivers for the name and vehicle, and tests the driver not at
-- all.
--
-- accept_delivery_quote() applies three tests:
--
--     d.status = 'approved'
--     d.availability <> 'offline'
--     vehicle_can_handle(d.vehicle_type, v_r.size_class, v_r.cargo_kind)
--
-- So a driver who quotes and then goes off duty — the ordinary way of saying
-- "not tonight" — leaves a live-looking price that cannot be taken. The
-- customer reads the quote, taps it, chooses cash or bank transfer, confirms,
-- and only THEN is told "That driver is not available any more."
--
-- The refusal lands at the payment step because that is the only moment the
-- page talks to the server. Reproduced against this database: an offered quote
-- from an off-duty driver fails on accept with exactly that message, for every
-- payment method.
--
-- ── WHY A FLAG AND NOT A FILTER ───────────────────────────────────────────
-- Hiding the row would make a price the customer had already read vanish
-- between two polls, and this screen refreshes itself every twenty seconds.
-- The house pattern is the one ConfirmSheet already uses for the cash cap: do
-- the server's arithmetic up front so the option is "greyed with a reason
-- instead of failing on the tap".
--
-- The flag is computed from the SAME three tests. If they ever drift, the
-- customer is back to being refused after committing.
do $$
declare
  v_def text;
  v_old constant text := E'               ''ratingCount'', coalesce(m.rating_count, 0))';
  v_new constant text := E'               ''ratingCount'', coalesce(m.rating_count, 0),\n'
    || E'               -- The three tests accept_delivery_quote() applies. A quote\n'
    || E'               -- that fails any of them is shown, and shown as unbookable,\n'
    || E'               -- rather than vanishing between two twenty-second polls.\n'
    || E'               ''available'', (d.status = ''approved''\n'
    || E'                               and d.availability <> ''offline''\n'
    || E'                               and vehicle_can_handle(d.vehicle_type, v_r.size_class, v_r.cargo_kind)))';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'delivery_request_view';

  if v_def is null then
    raise exception 'delivery_request_view not found';
  end if;

  -- Already applied. Re-running is a no-op.
  if position('''available''' in v_def) > 0 then
    return;
  end if;

  if position(v_old in v_def) = 0 then
    raise exception 'the quote block moved — refusing to rewrite blind';
  end if;

  v_def := replace(v_def, v_old, v_new);

  if (select count(*) from regexp_matches(v_def, '''available''', 'g')) <> 1 then
    raise exception 'expected exactly one availability flag';
  end if;

  execute v_def;
end $$;
