-- ── THE DRIVER WAS NEVER TOLD WHERE TO COLLECT ─────────────────────────────
--
-- `deliveries` has no pickup columns at all. The place to collect from lives
-- on `delivery_requests` (pickup_lat, pickup_lng, pickup_text, pickup_note) or
-- on the store's own row. driver_dashboard() already JOINED both — it read
-- s.address and r.pickup_text to print the address, and r.pickup_note for the
-- collection instructions — and selected neither coordinate.
--
-- So the console knew the NAME of the place and could not point at it. The one
-- Navigate button on the driver's screen went to the DROP-OFF on every leg of
-- every job: a driver on `assigned`, who has collected nothing, tapped
-- Navigate and was routed to the customer's house.
--
-- All eight live requests carry pickup coordinates. The data was there the
-- whole time; nothing selected it.
--
-- coalesce(store, request) in that order because a store job should navigate
-- to the shop's own pin, which is surveyed, rather than to whatever the
-- customer typed into the request.
--
-- Anchored replace with a count guard: this must patch BOTH the active-job
-- block and the offers block, or neither. Re-running is a no-op.
do $$
declare
  v_def    text;
  v_anchor constant text := E'               ''pickupNote'', r.pickup_note,';
  v_after  integer;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'driver_dashboard';

  if v_def is null then
    raise exception 'driver_dashboard not found';
  end if;

  -- Already applied.
  if position('''pickupLat''' in v_def) > 0 then
    return;
  end if;

  v_def := replace(
    v_def,
    v_anchor,
    v_anchor
      || E'\n               -- The place to COLLECT FROM. A store has its own pin; a'
      || E'\n               -- Deliver Anything job carries the customer''s. Without'
      || E'\n               -- these the driver''s only navigation control could point'
      || E'\n               -- at the drop-off, which is what shipped.'
      || E'\n               ''pickupLat'', coalesce(s.lat, r.pickup_lat),'
      || E'\n               ''pickupLng'', coalesce(s.lng, r.pickup_lng),'
  );

  select count(*) into v_after from regexp_matches(v_def, '''pickupLat''', 'g');
  if v_after <> 2 then
    raise exception
      'expected both blocks patched, got % — refusing to rewrite blind', v_after;
  end if;

  execute v_def;
end $$;
