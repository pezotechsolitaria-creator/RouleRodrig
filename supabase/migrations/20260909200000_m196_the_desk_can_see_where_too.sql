-- ── THE DESK COULD READ THE ADDRESS AND NOT POINT AT IT ────────────────────
--
-- admin_delivery_board() emits pickupText and dropoffText and no coordinates,
-- on both of its blocks. So the operations desk saw a line of words and had no
-- way to ask where that actually is.
--
-- The words are frequently useless. A customer who taps "use my location"
-- stores a label like "Ma position actuelle" — literally "my current location"
-- — and on 9 Sept a real taxi request arrived reading exactly that, with a
-- precise GPS fix sitting in the row beside it that nothing displayed. The
-- dispatcher could not tell where to send a driver from a label meaning "here"
-- written by somebody who is no longer there.
--
-- The same pattern already fixed for the driver console (m186, m187) and the
-- customer's own page (m189). This was the last surface still blind: the one
-- the owner actually works from.
--
-- coalesce(store, request) on the pickup for the reason m186 gives — a store
-- job should point at the shop's own surveyed pin, not at whatever the customer
-- typed. coalesce(delivery, request) on the drop-off because a delivery carries
-- its own copy once it exists.
--
-- Verified against production and rolled back: a request with pickup
-- "Ma position actuelle" now comes back carrying
-- pickupLat -19.7343743540304, pickupLng 63.4663899164507.
do $$
declare
  v_def  text;
  v_live constant text := E'                 ''dropoffNote'', coalesce(d.dropoff_note, r.dropoff_text),';
  v_req  constant text := E'               ''dropoffText'', r.dropoff_text,';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'admin_delivery_board';

  if v_def is null then
    raise exception 'admin_delivery_board not found';
  end if;

  -- Already applied. Re-running is a no-op.
  if position('''pickupLat''' in v_def) > 0 then
    return;
  end if;

  if position(v_live in v_def) = 0 or position(v_req in v_def) = 0 then
    raise exception 'the board shape moved — refusing to rewrite blind';
  end if;

  v_def := replace(v_def, v_live,
    v_live
    || E'\n                 -- Where this actually is. The label alone can read\n'
    || E'                 -- "Ma position actuelle", which tells the desk nothing.\n'
    || E'                 ''pickupLat'', coalesce(s.lat, r.pickup_lat),\n'
    || E'                 ''pickupLng'', coalesce(s.lng, r.pickup_lng),\n'
    || E'                 ''dropoffLat'', coalesce(d.dropoff_lat, r.dropoff_lat),\n'
    || E'                 ''dropoffLng'', coalesce(d.dropoff_lng, r.dropoff_lng),');

  v_def := replace(v_def, v_req,
    v_req
    || E'\n               ''pickupLat'', r.pickup_lat,\n'
    || E'               ''pickupLng'', r.pickup_lng,\n'
    || E'               ''dropoffLat'', r.dropoff_lat,\n'
    || E'               ''dropoffLng'', r.dropoff_lng,');

  -- Both blocks, or neither.
  if (select count(*) from regexp_matches(v_def, '''pickupLat''', 'g')) <> 2 then
    raise exception 'expected both blocks patched';
  end if;

  execute v_def;
end $$;
