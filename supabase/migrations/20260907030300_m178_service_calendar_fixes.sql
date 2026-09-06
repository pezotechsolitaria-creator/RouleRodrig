-- ── Two corrections the probe found ────────────────────────────────────────
--
-- 1. `for v_d in 0..booking_days` is fifteen days when booking_days is 14.
--    Off by one, and the setting is shown to the provider as "how far ahead
--    people can book" — a number that lies by a day is worse than no number.
--
-- 2. THE CANCELLED ROW WAS BEING HIDDEN FROM THE DIARY. That contradicts the
--    reason cancelling is not a delete, written directly above it: "a cancelled
--    Saturday that vanishes takes with it the reason Saturday was empty." The
--    provider needs to see that Tuesday emptied out, not a blank Tuesday. It is
--    listed, marked, and it does not count towards the day's committed minutes.

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.service_slots(uuid,uuid,timestamptz)'::regprocedure) into v_def;
  if position('0..(v_tp.booking_days - 1)' in v_def) > 0 then
    raise notice 'already fixed'; return;
  end if;
  v_def := replace(v_def, 'for v_d in 0..v_tp.booking_days loop',
                          'for v_d in 0..(v_tp.booking_days - 1) loop');
  if position('0..(v_tp.booking_days - 1)' in v_def) = 0 then
    raise exception 'anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.service_calendar(uuid,integer,date)'::regprocedure) into v_def;
  if position(E'b.status <> ''cancelled''' in v_def) = 0 then
    raise notice 'already fixed'; return;
  end if;
  v_def := replace(v_def, E'                where b.store_id = p_store_id\n                  and b.status <> ''cancelled''\n',
                          E'                where b.store_id = p_store_id\n');
  if position(E'b.status <> ''cancelled''' in v_def) > 0 then
    raise exception 'anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;
