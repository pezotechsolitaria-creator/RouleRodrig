-- ── THE QUOTE BOARD KNEW WHERE, AND SAID NOTHING ───────────────────────────
--
-- driver_open_requests() READS r.pickup_lat / r.pickup_lng twice — once to
-- compute 'distanceKm', once to sort the board by it — and then emits neither.
-- So the board can tell a driver a job is 3.2 km away and cannot tell them
-- 3.2 km in WHICH DIRECTION. Same for the drop-off, which it never reads at
-- all: a driver pricing a quote has the two addresses as text and no way to
-- know whether they are next to each other or at opposite ends of the island.
--
-- On a reverse-auction board that is the whole decision. m186 fixed this for
-- the job you already hold; this is the half that decides whether to bid.
--
-- Anchored replace with a guard: if the shape of the function ever moves, this
-- refuses rather than rewriting something it does not recognise. Re-running is
-- a no-op, so it is safe on a database that already has it.
do $$
declare
  v_def   text;
  v_pick  constant text := E'          ''pickupText'', r.pickup_text, ''pickupNote'', r.pickup_note,';
  v_drop  constant text := E'          ''dropoffText'', r.dropoff_text, ''dropoffNote'', r.dropoff_note,';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'driver_open_requests';

  if v_def is null then
    raise exception 'driver_open_requests not found';
  end if;

  -- Already applied.
  if position('''pickupLat''' in v_def) > 0 then
    return;
  end if;

  if position(v_pick in v_def) = 0 or position(v_drop in v_def) = 0 then
    raise exception 'the address lines moved — refusing to rewrite blind';
  end if;

  v_def := replace(v_def, v_pick,
    v_pick || E'\n          ''pickupLat'', r.pickup_lat, ''pickupLng'', r.pickup_lng,');
  v_def := replace(v_def, v_drop,
    v_drop || E'\n          ''dropoffLat'', r.dropoff_lat, ''dropoffLng'', r.dropoff_lng,');

  -- Both, or neither.
  if (select count(*) from regexp_matches(v_def, '''pickupLat''', 'g')) <> 1
     or (select count(*) from regexp_matches(v_def, '''dropoffLat''', 'g')) <> 1 then
    raise exception 'expected exactly one of each coordinate pair';
  end if;

  execute v_def;
end $$;
