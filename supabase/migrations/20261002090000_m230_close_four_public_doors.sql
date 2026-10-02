-- ── M230 · FOUR FUNCTIONS THE PUBLIC KEY COULD CALL ─────────────────────────
--
-- Found by the 1 Oct 2026 architecture audit from the repo record, then
-- confirmed LIVE with has_function_privilege on 2 Oct 2026. All four are
-- SECURITY DEFINER, and all four were executable by `anon` — that is, by
-- anybody holding the public key shipped in every page of the website:
--
--   claim_notification_jobs   claims the owner's alert queue and RETURNS each
--                             job's channel credential (CallMeBot api_key) and
--                             message text, which carries customer names and
--                             numbers. Calling it also marks the jobs 'sending',
--                             so the real worker would skip them: the owner's
--                             alerts could be read AND swallowed. M166 revoked it
--                             from PUBLIC only, which never removes the explicit
--                             grant Supabase's default privileges give anon.
--   dispatch_candidates       the delivery-driver ranking, driver by driver.
--   log_ride_event            writes ride_events. M132's pacing reads them, and
--                             since 15313333 so do the owner's "nobody was told"
--                             alerts — a forged row could stall a ride's ladder
--                             or silence an alert.
--   create_delivery_request   the code says "not granted to anon"
--                             (app/api/delivery-requests/route.ts) and it was:
--                             a guest could post requests straight at the RPC,
--                             past the route's validation and rate limit.
--
-- Every caller was checked first:
--   * app code calls claim_notification_jobs and log_ride_event only with the
--     service role (the notifications cron; lib/rides/notify.ts);
--   * create_delivery_request is called with the SIGNED-IN customer's own
--     session (auth.uid() files the request) or, for a guest, the service role
--     — so `authenticated` keeps it and only `anon` loses it;
--   * every SQL caller (offer_delivery; offer_ride, auto_dispatch_rides,
--     accept/decline/advance/no-show by token, admin_assign_ride,
--     admin_set_ride_status, create_ride_request) is itself SECURITY DEFINER,
--     so it runs as the owner and needs no grant from its caller.
--
-- Revoked from anon and authenticated BY NAME: `revoke … from public` alone is
-- what left these open (see rr-rls-policy-without-grant).

revoke all on function public.claim_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;

revoke all on function public.dispatch_candidates(
  double precision, double precision, uuid, integer, integer, uuid[], text, text
) from public, anon, authenticated;
grant execute on function public.dispatch_candidates(
  double precision, double precision, uuid, integer, integer, uuid[], text, text
) to service_role;

revoke all on function public.log_ride_event(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_ride_event(uuid, text, text, text, text, text, jsonb)
  to service_role;

revoke all on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision,
  text, text, text, text, text, date, text, text, text
) from public, anon;
grant execute on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision,
  text, text, text, text, text, date, text, text, text
) to authenticated, service_role;

-- ── Post-conditions: the migration fails rather than leave a door open ──────
do $$
declare
  v_claim  text := 'public.claim_notification_jobs(integer)';
  v_cands  text := 'public.dispatch_candidates(double precision, double precision, uuid, integer, integer, uuid[], text, text)';
  v_log    text := 'public.log_ride_event(uuid, text, text, text, text, text, jsonb)';
  v_create text := 'public.create_delivery_request(text, text, text, text, text, text, text, integer, text, text, double precision, double precision, double precision, double precision, text, text, text, text, text, date, text, text, text)';
begin
  if has_function_privilege('anon', v_claim, 'EXECUTE')
     or has_function_privilege('authenticated', v_claim, 'EXECUTE') then
    raise exception 'M230: claim_notification_jobs is still callable by a client role';
  end if;
  if has_function_privilege('anon', v_cands, 'EXECUTE')
     or has_function_privilege('authenticated', v_cands, 'EXECUTE') then
    raise exception 'M230: dispatch_candidates is still callable by a client role';
  end if;
  if has_function_privilege('anon', v_log, 'EXECUTE')
     or has_function_privilege('authenticated', v_log, 'EXECUTE') then
    raise exception 'M230: log_ride_event is still callable by a client role';
  end if;
  if has_function_privilege('anon', v_create, 'EXECUTE') then
    raise exception 'M230: create_delivery_request is still callable by anon';
  end if;
  -- And nothing that should keep working lost its grant.
  if not has_function_privilege('authenticated', v_create, 'EXECUTE') then
    raise exception 'M230: signed-in customers can no longer post a delivery request';
  end if;
  if not (has_function_privilege('service_role', v_claim, 'EXECUTE')
          and has_function_privilege('service_role', v_cands, 'EXECUTE')
          and has_function_privilege('service_role', v_log, 'EXECUTE')
          and has_function_privilege('service_role', v_create, 'EXECUTE')) then
    raise exception 'M230: the service role lost a grant it needs';
  end if;
end $$;

notify pgrst, 'reload schema';
