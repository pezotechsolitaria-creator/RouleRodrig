-- ── One log, two doors ─────────────────────────────────────────────────────
--
-- The owner: "add the driver 30 day log to admin too."
--
-- The obvious way is a second function with the same query and a driver id
-- parameter. That is how the driver's history and the owner's history come to
-- disagree six months from now — one gets a status added to its filter, or
-- stops counting a cancelled job's earning, and the other does not. Then a
-- driver queries their pay and the two screens meant to settle it say different
-- numbers, which is worse than having no screen at all.
--
-- So the QUERY lives once, in an internal function nobody can call directly,
-- and the two callers differ only in who they are allowed to ask about:
--
--   driver_delivery_log(days)          -> current_driver().id, always
--   admin_driver_log(driver_id, days)  -> any driver, admin only
--
-- delivery_log_for is revoked from anon and authenticated. It is SECURITY
-- DEFINER and both wrappers are too, so they can reach it while a signed-in
-- user cannot call it with somebody else's id.
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
               -- The one timestamp that says WHEN IT ENDED, whichever way it
               -- ended. Sorting on created_at would put a job accepted on
               -- Monday and failed on Friday in Monday's place.
               'finishedAt', f.finished_at,
               'earning', f.driver_earning,
               'customerFee', f.customer_fee,
               -- A Deliver Anything job has no store; the request's own words
               -- are the only description it has ever had.
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
        -- was ever paid — on the owner's screen that becomes an argument.
        'earned', coalesce(sum(driver_earning) filter (where status = 'delivered'), 0),
        'errands', count(*) filter (where request_kind = 'errand'))
        from f
    )
  );
$function$;

revoke all on function public.delivery_log_for(uuid, integer)
  from public, anon, authenticated;

-- The driver's own door. Unchanged in behaviour; the body is now a call.
create or replace function public.driver_delivery_log(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d delivery_drivers%rowtype;
begin
  v_d := current_driver();
  if v_d.id is null then
    return jsonb_build_object('days', coalesce(p_days, 30), 'rows', '[]'::jsonb, 'totals', null);
  end if;
  -- The id comes from the SESSION and never from an argument. There is no
  -- parameter here that could be pointed at another driver.
  return delivery_log_for(v_d.id, p_days);
end;
$function$;

revoke all on function public.driver_delivery_log(integer) from public, anon;
grant execute on function public.driver_delivery_log(integer) to authenticated;

-- The owner's door. Same numbers, any driver, admin only — so that when a
-- driver queries their pay, both people are reading one function.
create or replace function public.admin_driver_log(
  p_driver_id uuid,
  p_days integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d delivery_drivers%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_d from delivery_drivers where id = p_driver_id;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  return delivery_log_for(p_driver_id, p_days)
         || jsonb_build_object('driverName', v_d.full_name);
end;
$function$;

revoke all on function public.admin_driver_log(uuid, integer)
  from public, anon, authenticated;
