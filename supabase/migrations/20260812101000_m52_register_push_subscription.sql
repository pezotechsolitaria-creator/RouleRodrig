-- M52 — Registering a push subscription, safely, when devices change hands.
--
-- `endpoint` is UNIQUE, so a plain upsert needs UPDATE rights on a row that may
-- belong to a *different* user: one phone, two accounts (a driver borrows a
-- handset, or signs out and a colleague signs in). No RLS policy can express
-- that — `using (user_id = auth.uid())` blocks precisely the row that must move.
-- Without this, the second person's alerts would silently fail to register and
-- the first person would keep receiving jobs they can no longer see.
--
-- Re-homing is safe because the browser only ever hands an endpoint to the page
-- that owns the subscription: possession of the endpoint is proof of possession
-- of the device. The old row is deleted, not shared.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = 'RR001', message = 'Sign in first.';
  end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception using errcode = 'RR002', message = 'Incomplete subscription.';
  end if;

  delete from push_subscriptions where endpoint = p_endpoint;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300));
end;
$function$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- Turning alerts off. Scoped to the caller so nobody can silence another driver.
create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  delete from push_subscriptions
   where endpoint = p_endpoint and user_id = auth.uid();
$function$;

revoke execute on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

do $$
declare a uuid; b uuid; n int; owner uuid;
begin
  select id into a from auth.users limit 1;
  select id into b from auth.users where id <> a limit 1;
  if b is null then return; end if;

  -- Driver A registers the handset.
  perform set_config('request.jwt.claims', json_build_object('sub', a::text)::text, true);
  perform register_push_subscription('https://probe.example/ep1', 'k', 'x', 'probe');

  -- Driver B signs in on the SAME handset. The row must move, not duplicate,
  -- and must not still wake A.
  perform set_config('request.jwt.claims', json_build_object('sub', b::text)::text, true);
  perform register_push_subscription('https://probe.example/ep1', 'k2', 'x2', 'probe');

  select count(*) into n from push_subscriptions where endpoint = 'https://probe.example/ep1';
  select user_id into owner from push_subscriptions where endpoint = 'https://probe.example/ep1' limit 1;
  if n <> 1 or owner is distinct from b then
    raise exception 'M52: handset re-home failed (rows=%, owner=%) — the previous user would keep getting jobs.', n, owner;
  end if;

  delete from push_subscriptions where endpoint = 'https://probe.example/ep1';
end;
$$;
