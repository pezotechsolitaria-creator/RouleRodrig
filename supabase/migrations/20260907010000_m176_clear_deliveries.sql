-- ── Getting test rows off the control centre ───────────────────────────────
--
-- The owner: "make me able to clear deliveries in admin dashboard."
--
-- The board is built around EXCEPTIONS — anything late or stuck sorts to the
-- top and wears colour, so that a calm page means nothing is wrong. Four rows
-- left over from testing ("2qw", "Ggu", "Gillet", "Apple") sat on it, one of
-- them stuck at requires_admin, and they would have demanded attention for
-- ever. That is worse than clutter: it teaches somebody to ignore the colour.
--
-- ── ARCHIVED, NOT DELETED ──────────────────────────────────────────────────
-- A delete is irreversible on a production table, and `deliveries` is now read
-- by the driver's 30-day log and their earnings. Removing a row would silently
-- change what a driver is shown they were paid — and if the clear was a
-- mistake, there would be nothing to put back.
--
-- So a timestamp. The row survives for audit; the board, the driver's console
-- and the log all skip it. Undoing is one update.
alter table deliveries
  add column if not exists cleared_at     timestamptz,
  add column if not exists cleared_reason text,
  add column if not exists cleared_by     uuid;

create index if not exists deliveries_not_cleared_idx
  on deliveries (status) where cleared_at is null;

comment on column deliveries.cleared_at is
  'Set when an operator clears a finished or stuck delivery off the board. The row is kept: the board, the driver console and the 30-day log all filter it out, and clearing is reversible.';

-- ── The action ─────────────────────────────────────────────────────────────
create or replace function public.admin_clear_delivery(
  p_delivery_id uuid,
  p_reason text default null,
  p_undo boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d deliveries%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  if coalesce(p_undo, false) then
    update deliveries
       set cleared_at = null, cleared_reason = null, cleared_by = null
     where id = p_delivery_id;

    insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
    values (auth.uid(),
            case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
            'delivery.uncleared', 'delivery', p_delivery_id::text,
            jsonb_build_object('status', v_d.status));

    return jsonb_build_object('ok', true, 'cleared', false);
  end if;

  -- ── A LIVE JOB IS NOT CLUTTER ──────────────────────────────────────────
  -- Somebody may be holding a customer's package right now. Clearing it would
  -- take the job off the board while the parcel is still in a van, and off the
  -- driver's screen while they are carrying it — which is precisely how a
  -- delivery gets lost with nobody watching.
  --
  -- The operator already has a control for a job that must stop:
  -- admin_force_delivery_status. Cancel it there, THEN clear it. Refusing here
  -- with that sentence is more useful than a confirmation dialog, and more
  -- useful than a greyed-out button whose reason nobody can see.
  if v_d.status not in ('delivered', 'cancelled', 'failed_delivery',
                        'returned_to_merchant', 'driver_unavailable',
                        'driver_unresponsive', 'requires_admin') then
    raise exception using errcode = 'RR089',
      message = 'This delivery is still running. Cancel it first, then clear it.';
  end if;

  update deliveries
     set cleared_at = now(),
         cleared_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         cleared_by = auth.uid()
   where id = p_delivery_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'delivery.cleared', 'delivery', p_delivery_id::text,
          jsonb_build_object('status', v_d.status, 'reason', p_reason,
                             'driverId', v_d.driver_id));

  return jsonb_build_object('ok', true, 'cleared', true, 'status', v_d.status);
end;
$function$;

revoke all on function public.admin_clear_delivery(uuid, text, boolean)
  from public, anon, authenticated;

-- ── Every reader skips a cleared row ───────────────────────────────────────
--
-- This is the half that makes clearing mean anything. Setting cleared_at and
-- leaving the board reading the row would be a button that does nothing — and
-- worse, a driver's earnings would still count a job the owner had declared
-- junk. Three readers, patched in place because all three are long and owned
-- by earlier work; each guard is idempotent.

-- 1. The control centre.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='admin_delivery_board';
  if v_def is null then raise exception 'admin_delivery_board missing'; end if;
  if position('d.cleared_at is null' in v_def) > 0 then
    raise notice 'board already skips cleared'; return;
  end if;
  v_def := replace(
    v_def,
    E'          left join delivery_drivers dr on dr.id = d.driver_id\n         where d',
    E'          left join delivery_drivers dr on dr.id = d.driver_id\n         where d.cleared_at is null and d'
  );
  if position('d.cleared_at is null' in v_def) = 0 then
    raise exception 'board anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;

-- 2. The driver's own screen. A cleared job must not sit there either.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='driver_dashboard';
  if position('d.cleared_at is null' in v_def) > 0 then
    raise notice 'driver dashboard already skips cleared'; return;
  end if;
  v_def := replace(
    v_def,
    E'        left join delivery_requests r on r.id = d.request_id\n       where d.driver_id ',
    E'        left join delivery_requests r on r.id = d.request_id\n       where d.cleared_at is null and d.driver_id '
  );
  if position('d.cleared_at is null' in v_def) = 0 then
    raise exception 'driver anchor not found — refusing to rewrite blind';
  end if;
  execute v_def;
end $$;

-- 3. The 30-day log, on BOTH doors at once — it is one function, which is why
--    the driver's history and the owner's cannot disagree about this either.
create or replace function public.delivery_log_for(
  p_driver_id uuid,
  p_days integer default 30
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with w as (
    select greatest(1, least(coalesce(p_days, 30), 90)) as days
  ),
  f as (
    select d.*, r.kind as request_kind, r.errand_kind, r.what as request_what,
           coalesce(d.delivered_at, d.cancelled_at, d.updated_at) as finished_at
      from deliveries d
      left join delivery_requests r on r.id = d.request_id, w
     where d.driver_id = p_driver_id
       -- A job the owner has declared junk must not count towards what a
       -- driver was paid, on either screen.
       and d.cleared_at is null
       and d.status in ('delivered','cancelled','failed_delivery',
                        'returned_to_merchant','driver_unavailable',
                        'driver_unresponsive')
       and coalesce(d.delivered_at, d.cancelled_at, d.updated_at)
           >= now() - (w.days || ' days')::interval
  )
  select jsonb_build_object(
    'days', (select days from w),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'status', f.status,
               'finishedAt', f.finished_at,
               'earning', f.driver_earning,
               'customerFee', f.customer_fee,
               'what', coalesce(f.request_what, s.name, 'Delivery'),
               'requestKind', f.request_kind,
               'errandKind', f.errand_kind,
               'jobKind', case when f.request_id is not null then 'direct' else 'store' end,
               'failureReason', f.failure_reason
             ) order by f.finished_at desc)
        from f left join stores s on s.id = f.store_id
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'jobs', count(*),
        'delivered', count(*) filter (where status = 'delivered'),
        -- Only DELIVERED work is counted as money. A cancelled job carries a
        -- driver_earning on the row, and summing it would show a figure nobody
        -- was ever paid.
        'earned', coalesce(sum(driver_earning) filter (where status = 'delivered'), 0),
        'errands', count(*) filter (where request_kind = 'errand'))
        from f
    )
  );
$function$;

revoke all on function public.delivery_log_for(uuid, integer)
  from public, anon, authenticated;
