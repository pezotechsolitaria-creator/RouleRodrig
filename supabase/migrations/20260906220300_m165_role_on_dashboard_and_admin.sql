-- Two payloads gain the role, patched in place rather than retyped: both
-- functions are long, owned by earlier work, and transcribing a body by hand to
-- add two fields is how a subtle difference gets introduced into something
-- nobody re-reads. Both guards are idempotent.

-- 1. The console has to know the role, or it cannot tell an errand runner from
--    a delivery driver and both get the same screen.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='driver_dashboard';
  if v_def is null then raise exception 'driver_dashboard missing'; end if;
  if position('canRunErrands' in v_def) > 0 then
    raise notice 'driver_dashboard already carries the role'; return;
  end if;
  v_def := replace(
    v_def,
    E'''vehicleType'', v_d.vehicle_type, ''statusReason'', v_d.status_reason,',
    E'''vehicleType'', v_d.vehicle_type, ''statusReason'', v_d.status_reason,\n      ''canDeliver'', v_d.can_deliver, ''canRunErrands'', v_d.can_run_errands,'
  );
  if position('canRunErrands' in v_def) = 0 then
    raise exception 'anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;

-- 2. The owner IS the confirmation step, so the owner has to be able to see
--    what they are confirming. Approving "Marie, on foot" without knowing
--    whether she asked to run errands or to carry parcels is approving a blank.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='admin_delivery_board';
  if v_def is null then raise exception 'admin_delivery_board missing'; end if;
  if position('canRunErrands' in v_def) > 0 then
    raise notice 'admin_delivery_board already carries the role'; return;
  end if;
  v_def := replace(
    v_def,
    E'''vehicle'', dr.vehicle_type, ''appliedAt'', dr.created_at,',
    E'''vehicle'', dr.vehicle_type, ''appliedAt'', dr.created_at,\n               ''canDeliver'', dr.can_deliver, ''canRunErrands'', dr.can_run_errands,'
  );
  if position('canRunErrands' in v_def) = 0 then
    raise exception 'anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;
