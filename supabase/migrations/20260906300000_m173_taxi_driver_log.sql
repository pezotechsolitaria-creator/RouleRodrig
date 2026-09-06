-- ── Thirty days for a taxi driver ──────────────────────────────────────────
--
-- The owner: "DO LOGS FOR TAXI TOO."
--
-- The third console to get one, and the same story as the other two: nothing
-- needed retaining, `ride_requests` has kept every row. The driver's home shows
-- what is happening NOW and nothing about last week, so "how many airport runs
-- did I do this month" had no answer.
--
-- ── WHY THIS ONE TAKES A TOKEN ─────────────────────────────────────────────
-- driver_delivery_log() reads current_driver() from auth.uid(), because a
-- delivery driver is a Supabase account. A TAXI driver is not — they reach
-- /d/<token> with a code, and /api/driver-home calls every *_by_token function
-- through the service-role client. So the token is the identity here, exactly
-- as it is for set_taxi_availability_by_token and the rest.
--
-- The token is matched in FULL, never by prefix: driver_link_by_code compares
-- the first six characters because a human types those, but that is a
-- deliberately narrow door with a rate limit in front of it. A log that
-- accepted six characters would be a different, much wider one. Verified: a
-- 6-character prefix returns an empty log.
--
-- ── THE SAME MONEY RULE AS THE OTHER TWO ───────────────────────────────────
-- `earned` counts COMPLETED rides only. A cancelled or no-show ride still
-- carries quoted_price, and this is the number a driver would quote back at
-- the platform — so it may never be the optimistic reading.
create or replace function public.taxi_driver_log_by_token(
  p_token text,
  p_days integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id   uuid;
  v_days int := greatest(1, least(coalesce(p_days, 30), 90));
  v_from timestamptz;
begin
  select id into v_id from taxi_drivers
   where driver_token = btrim(coalesce(p_token, ''))
     and btrim(coalesce(p_token, '')) <> '';
  if v_id is null then
    -- Same shape as a real answer, so a bad token cannot be told apart from a
    -- driver who has done nothing.
    return jsonb_build_object('days', v_days, 'rows', '[]'::jsonb, 'totals', null);
  end if;

  v_from := now() - (v_days || ' days')::interval;

  return (
    with r as (
      select rr.*,
             coalesce(rr.completed_at, rr.cancelled_at, rr.no_show_at, rr.updated_at) as finished_at
        from ride_requests rr
       where rr.driver_id = v_id
         and rr.status in ('completed', 'cancelled', 'no_driver')
         and coalesce(rr.completed_at, rr.cancelled_at, rr.no_show_at, rr.updated_at) >= v_from
    )
    select jsonb_build_object(
      'days', v_days,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', r.id,
                 'status', r.status,
                 'service', r.service,
                 'finishedAt', r.finished_at,
                 'earning', r.quoted_price,
                 'from', r.pickup_label,
                 'to', r.dropoff_label,
                 'passengers', r.passengers,
                 'noShow', r.no_show_at is not null
               ) order by r.finished_at desc)
          from r
      ), '[]'::jsonb),
      'totals', (
        select jsonb_build_object(
          'jobs', count(*),
          'completed', count(*) filter (where status = 'completed'),
          'cancelled', count(*) filter (where status <> 'completed'),
          'noShows', count(*) filter (where no_show_at is not null),
          -- Completed only. See the note above.
          'earned', coalesce(sum(quoted_price) filter (where status = 'completed'), 0)
        ) from r
      ),
      -- Which kinds of work actually pay: an airport run and a town taxi are
      -- different afternoons, and the split is the thing a driver plans around.
      'byService', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'service', d.service, 'jobs', d.jobs, 'earned', d.earned)
                 order by d.jobs desc, d.service)
          from (
            select service,
                   count(*) filter (where status = 'completed') as jobs,
                   coalesce(sum(quoted_price) filter (where status = 'completed'), 0) as earned
              from r group by service
          ) d where d.jobs > 0
      ), '[]'::jsonb)
    )
  );
end;
$function$;

revoke all on function public.taxi_driver_log_by_token(text, integer)
  from public, anon, authenticated;
