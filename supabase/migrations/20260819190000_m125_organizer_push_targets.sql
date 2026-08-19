-- ── WAKING AN ORGANISER'S OWN PHONE (M125) ─────────────────────────────────
--
-- Organisers hold scoped accounts (M43) and reach their events through an
-- assignment to the platform merchant's store (M40), so they never become
-- merchants. That means merchant_push_targets does not find them: it walks
-- merchant_staff, and an organiser is not staff — it would return nobody and
-- report success.
create or replace function public.organizer_push_targets(p_store_id uuid)
returns table(endpoint text, p256dh text, auth text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select ps.endpoint, ps.p256dh, ps.auth
    from event_organizer_assignments a
    join event_organizers o on o.id = a.organizer_id
    join push_subscriptions ps on ps.user_id = o.user_id
   where a.store_id = p_store_id
     -- An invited organiser who never claimed the account has no business
     -- being woken, and a revoked one must stop being woken immediately.
     and o.status = 'active'
     and o.user_id is not null
     -- Stop hammering an endpoint the push service keeps rejecting; deliver()
     -- prunes dead ones, this stops them being picked up again in between.
     and coalesce(ps.fail_count, 0) < 5;
$function$;

-- ── THE BOUNDARY ────────────────────────────────────────────────────────────
--
-- A push target row IS the credential for sending to that device: endpoint,
-- p256dh and auth are everything needed. So this is service_role only, the
-- same as customer_push_targets. Default grants reach anon, so revoking from
-- PUBLIC is the actual lock, not an omission of GRANT.
revoke all on function public.organizer_push_targets(uuid) from public;
revoke all on function public.organizer_push_targets(uuid) from anon;
revoke all on function public.organizer_push_targets(uuid) from authenticated;
grant execute on function public.organizer_push_targets(uuid) to service_role;

-- ── AND THE SAME HOLE, ALREADY OPEN, ON THE MERCHANT ONE ────────────────────
--
-- merchant_push_targets was executable by anon and authenticated. Anyone who
-- could read or guess a store id could ask the database for that shop's push
-- endpoints and keys — which is the ability to send notifications to the
-- merchant's phone as us. It is only ever called from lib/push/send.ts with
-- the service role, so nothing legitimate loses anything here.
revoke all on function public.merchant_push_targets(uuid) from public;
revoke all on function public.merchant_push_targets(uuid) from anon;
revoke all on function public.merchant_push_targets(uuid) from authenticated;
grant execute on function public.merchant_push_targets(uuid) to service_role;

-- Assert it, rather than trusting that the revokes above did what they read
-- like. A migration that silently leaves a grant in place is how this got here.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('organizer_push_targets','merchant_push_targets','customer_push_targets')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if bad is not null then
    raise exception 'push target function still reachable without service_role: %', bad;
  end if;
end $$;
