-- ── M232 · THE TAXI ACCOUNT DOOR NEVER BOUND ANYBODY ────────────────────────
--
-- M172 gave a signed-in driver a door to his /d/<token> page from /account:
-- type the 6-character code once, and driver_link_by_code remembers the
-- account by writing taxi_drivers.user_id = auth.uid().
--
-- It never could. The only caller, app/api/driver-signin, calls it with the
-- SERVICE ROLE (the function is deliberately not granted to any client: the
-- route's 6-attempts-a-minute limit is the whole defence against guessing 16.7M
-- codes, and a direct REST grant would bypass it). Under the service role
-- auth.uid() is NULL, so `if v_uid is not null` was always false and no driver
-- was ever bound. Found by the 1 Oct 2026 architecture audit.
--
-- The route now verifies the signed-in user from the request cookies and passes
-- the id explicitly. Trusted because only service_role can execute this.
--
-- DROP + CREATE, not a second CREATE OR REPLACE: a new defaulted parameter would
-- otherwise leave TWO functions named driver_link_by_code, and PostgREST then
-- refuses the endpoint with PGRST203 (see rr-rpc-overload-trap). The new
-- parameter defaults to NULL, so the route already deployed — which sends only
-- p_code and p_phone — keeps resolving to it and keeps signing drivers in until
-- the new route ships. Body otherwise unchanged from the live definition
-- (pg_get_functiondef, 2 Oct 2026).

drop function if exists public.driver_link_by_code(text, text);

create function public.driver_link_by_code(
  p_code    text,
  p_phone   text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code  text;
  v_phone text;
  v_token text;
  v_id    uuid;
  v_owner uuid;
  -- The explicit id first: under the service role auth.uid() is always null.
  v_uid   uuid := coalesce(p_user_id, auth.uid());
begin
  v_code := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if length(v_code) < 6 then
    return jsonb_build_object('ok', false);
  end if;
  v_code := left(v_code, 6);

  select d.id, d.driver_token, d.user_id into v_id, v_token, v_owner
  from public.taxi_drivers d
  where left(d.driver_token, 6) = v_code
    -- Only enforced when a number was actually given: an empty phone means
    -- "code only", a supplied one still has to be the right driver's.
    and (
      length(v_phone) < 6
      or right(regexp_replace(coalesce(d.phone, ''), '[^0-9]', '', 'g'), 8) = right(v_phone, 8)
    )
  limit 1;

  if v_token is null then
    return jsonb_build_object('ok', false);
  end if;

  -- Remember them, so they never have to find the code again. Only an
  -- UNCLAIMED row, and only if this account holds no other taxi driver — the
  -- unique index enforces the second, and catching it keeps a shared phone from
  -- turning a successful sign-in into an error.
  if v_uid is not null and v_owner is null then
    begin
      update taxi_drivers set user_id = v_uid where id = v_id and user_id is null;
    exception when unique_violation then
      null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$function$;

revoke all on function public.driver_link_by_code(text, text, uuid) from public, anon, authenticated;
grant execute on function public.driver_link_by_code(text, text, uuid) to service_role;

do $$
declare
  v_sig text := 'public.driver_link_by_code(text, text, uuid)';
  v_n   int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'driver_link_by_code';
  if v_n <> 1 then
    raise exception 'M232: expected exactly one driver_link_by_code, found %', v_n;
  end if;
  if has_function_privilege('anon', v_sig, 'EXECUTE')
     or has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    raise exception 'M232: driver_link_by_code is callable by a client role — the rate limit would be bypassable';
  end if;
  if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
    raise exception 'M232: service_role cannot call driver_link_by_code';
  end if;
end $$;

notify pgrst, 'reload schema';
