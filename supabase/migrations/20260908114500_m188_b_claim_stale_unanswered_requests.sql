-- The claim half of m188. Returns the requests worth asking the board about a
-- second time, and STAMPS them in the same statement, so a job is re-announced
-- exactly once no matter how often the worker runs.
--
-- p_minutes has NO DEFAULT on purpose. Adding a defaulted parameter to a live
-- function creates a SECOND overload, and PostgREST then refuses the endpoint
-- outright with PGRST203 — that has already cost this project a broken RPC
-- once. One signature, and the caller says what it means.
create or replace function public.claim_stale_unanswered_requests(p_minutes integer)
 returns table(id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  update delivery_requests r
     set renotified_at = now()
   where r.id in (
     select r2.id
       from delivery_requests r2
      where r2.status = 'open'
        -- Once. A second silence is an answer.
        and r2.renotified_at is null
        -- The first announcement has to have had its chance.
        and r2.created_at <= now() - make_interval(mins => p_minutes)
        and (r2.expires_at is null or r2.expires_at > now())
        -- Matches request_push_targets: no point waking anyone for a job that
        -- has no eligible audience.
        and (r2.window_start is null or r2.window_start <= now() + interval '48 hours')
        -- NOBODY has answered. A request with a standing price does not need
        -- the board woken up; it needs the customer to choose.
        and not exists (
          select 1 from delivery_quotes q
           where q.request_id = r2.id and q.status = 'offered')
      order by r2.created_at
      -- This worker runs every minute. A backlog must not become a flood on
      -- somebody's phone.
      limit 20
      for update skip locked
   )
  returning r.id;
end
$function$;

revoke all on function public.claim_stale_unanswered_requests(integer) from public, anon, authenticated;
grant execute on function public.claim_stale_unanswered_requests(integer) to service_role;

-- ── Proved against the live schema, not assumed ────────────────────────────
-- Three requests: one unanswered and 40 minutes old, one the same age with a
-- standing quote, one posted that minute. The claim took exactly the first,
-- and a second call took nothing. Both probes cleaned up after themselves.
