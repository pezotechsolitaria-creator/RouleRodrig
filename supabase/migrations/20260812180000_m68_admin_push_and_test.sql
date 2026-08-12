-- M68 — The owner could not turn web push on, or test it.
--
-- Reported as "web push not working". It was not broken: VAPID keys were live,
-- the deployed service worker carried both handlers, and targeting was verified
-- in a rolled-back transaction. There were simply ZERO subscriptions, because
-- every "Turn on" button was gated behind something the owner did not have:
--
--   /driver          — rendered only for an APPROVED driver; there are none.
--   /orders          — requires a signed-in account; the owner has none.
--   /orders/track    — requires looking up a real order first.
--   /manage-booking  — requires looking up a real booking first.
--
-- Every path assumed a customer or a driver. The one person who most needed to
-- verify the feature had no route to it, and nothing anywhere sent a test.
-- A feature nobody can reach is indistinguishable from a broken one.
--
-- The admin has no auth.uid() (ADMIN_PASSWORD cookie, empty platform_admins),
-- so an admin subscription is keyed the way a guest's is: by a reserved
-- contact_email. That reuses the existing table, its identity constraint and
-- its dead-endpoint pruning rather than inventing a parallel identity.
create or replace function public.register_admin_push(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    return false;
  end if;

  -- Service-role only (see the revoke below), so reaching this function at all
  -- already proves the ADMIN_PASSWORD cookie was verified by the route.
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, contact_email, user_agent)
  values (null, p_endpoint, p_p256dh, p_auth, 'admin@roulerodrig.internal',
          left(coalesce(p_user_agent,''), 300));
  return true;
end;
$function$;

revoke execute on function public.register_admin_push(text, text, text, text)
  from public, anon, authenticated;

-- Every device the owner has enabled. `.internal` is not a routable TLD and no
-- order can carry it, so this can never collide with a real customer.
create or replace function public.admin_push_targets()
returns table (endpoint text, p256dh text, auth text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.endpoint, s.p256dh, s.auth
    from push_subscriptions s
   where s.contact_email = 'admin@roulerodrig.internal';
$function$;

revoke execute on function public.admin_push_targets() from public, anon, authenticated;

create or replace function public.unregister_admin_push(p_endpoint text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  delete from push_subscriptions
   where endpoint = p_endpoint and contact_email = 'admin@roulerodrig.internal';
$function$;

revoke execute on function public.unregister_admin_push(text) from public, anon, authenticated;
