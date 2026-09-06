-- ── Thirty days of what you actually did ───────────────────────────────────
--
-- The owner: "for delivery dashboards, logs should be kept for 30 days."
--
-- There was no log at all. driver_dashboard() returns work IN FLIGHT, two
-- counters for TODAY, and lifetime totals — so the moment a job was delivered
-- it vanished from the only screen a driver has. A person asking "how much did
-- I make last week" or "did I ever deliver to that address" had nowhere to
-- look, and neither did the owner when somebody queried their pay.
--
-- Nothing needed to be retained to fix that: `deliveries` keeps every row
-- forever already, with delivered_at, cancelled_at and driver_earning on it.
-- What was missing was a way to READ it. So this is a window over data that was
-- always there, not a new store — which also means switching it on cannot lose
-- anything, and 30 days is a display choice the caller can narrow.
--
-- Runs as the CURRENT DRIVER and joins nothing that is not theirs: a driver can
-- only ever read their own history, exactly as with driver_dashboard. There is
-- no driver id parameter, deliberately — adding one would be the only way this
-- could become a read of somebody else's earnings.
create or replace function public.driver_delivery_log(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d    delivery_drivers%rowtype;
  v_days int := greatest(1, least(coalesce(p_days, 30), 90));
  v_from timestamptz;
begin
  v_d := current_driver();
  if v_d.id is null then
    return jsonb_build_object('days', v_days, 'rows', '[]'::jsonb, 'totals', null);
  end if;
  v_from := now() - (v_days || ' days')::interval;

  return (
    select jsonb_build_object(
      'days', v_days,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', d.id,
                 'status', d.status,
                 -- The one timestamp that says WHEN IT ENDED, whichever way it
                 -- ended. Sorting on created_at would put a job accepted on
                 -- Monday and failed on Friday in Monday's place.
                 'finishedAt', coalesce(d.delivered_at, d.cancelled_at, d.updated_at),
                 'earning', d.driver_earning,
                 -- A Deliver Anything job has no store; the request's own words
                 -- are the only description it has ever had.
                 'what', coalesce(r.what, s.name, 'Delivery'),
                 'requestKind', r.kind,
                 'errandKind', r.errand_kind,
                 'jobKind', case when d.request_id is not null then 'direct' else 'store' end,
                 'failureReason', d.failure_reason
               ) order by coalesce(d.delivered_at, d.cancelled_at, d.updated_at) desc)
          from deliveries d
          left join delivery_requests r on r.id = d.request_id
          left join stores s on s.id = d.store_id
         where d.driver_id = v_d.id
           and d.status in ('delivered','cancelled','failed_delivery',
                            'returned_to_merchant','driver_unavailable',
                            'driver_unresponsive')
           and coalesce(d.delivered_at, d.cancelled_at, d.updated_at) >= v_from
      ), '[]'::jsonb),
      'totals', (
        select jsonb_build_object(
          'jobs', count(*),
          'delivered', count(*) filter (where d.status = 'delivered'),
          -- Only DELIVERED work is counted as money. A cancelled job carries a
          -- driver_earning on the row, and summing it would show somebody a
          -- figure they were never paid.
          'earned', coalesce(sum(d.driver_earning) filter (where d.status = 'delivered'), 0),
          'errands', count(*) filter (where r.kind = 'errand'))
          from deliveries d
          left join delivery_requests r on r.id = d.request_id
         where d.driver_id = v_d.id
           and d.status in ('delivered','cancelled','failed_delivery',
                            'returned_to_merchant','driver_unavailable',
                            'driver_unresponsive')
           and coalesce(d.delivered_at, d.cancelled_at, d.updated_at) >= v_from
      )
    )
  );
end;
$function$;

revoke all on function public.driver_delivery_log(integer) from public, anon;
grant execute on function public.driver_delivery_log(integer) to authenticated;
