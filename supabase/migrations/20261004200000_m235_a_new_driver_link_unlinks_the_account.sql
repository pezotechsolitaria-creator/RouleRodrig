-- ── M235 · A NEW DRIVER LINK ALSO UNLINKS THE ACCOUNT ───────────────────────
--
-- M232 made the taxi account door work: a signed-in person who types a
-- driver's 6-character code on /account has taxi_drivers.user_id set, and
-- /account then opens that driver's page — always at the CURRENT token
-- (my_taxi_driver()).
--
-- A review of M232 (4 Oct 2026) found what that does to the owner's one tool
-- for a leaked code. admin_rotate_driver_token (M126-M128) mints a new token
-- and revokes what the old one wrote — push subscriptions, stored locations —
-- but it never touched user_id, because no binding had ever happened. So an
-- account bound with a leaked code would follow the driver to every new link,
-- with his jobs and his customers' numbers, and the owner could neither see
-- nor undo it. "Change the link" must revoke the account door exactly as it
-- revokes the phones.
--
-- Body identical to the live definition (pg_get_functiondef, 4 Oct 2026)
-- except the UPDATE, which now also clears user_id, and one more field in the
-- result so the desk can say an account was unlinked. Same signature, so no
-- overload. A legitimately bound driver simply types the new code once on
-- /account to be remembered again.

create or replace function public.admin_rotate_driver_token(p_driver_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_new      text;
  v_row      public.taxi_drivers%rowtype;
  v_push     integer := 0;
  v_fixes    integer := 0;
  v_unlinked boolean := false;
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_row from public.taxi_drivers where id = p_driver_id for update;
  if not found then
    raise exception using errcode = 'RR090', message = 'Driver not found.';
  end if;

  if exists (
    select 1 from public.ride_requests
     where driver_id = p_driver_id
       and status in ('assigned','driver_on_way','arrived','on_trip')
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'on_ride',
      'message', v_row.name || ' is out on a ride. A new link would stop him '
              || 'finishing it. Complete or cancel the ride first, then change the link.'
    );
  end if;

  v_unlinked := v_row.user_id is not null;
  v_new := public.mint_taxi_driver_token();

  -- M235 · the account door goes with the old token.
  update public.taxi_drivers
     set driver_token = v_new,
         user_id      = null
   where id = p_driver_id
  returning * into v_row;

  -- M128 · REVOKE WHAT THE OLD TOKEN WROTE. Atomic with the re-key.
  delete from public.taxi_push_subscriptions where driver_id = p_driver_id;
  get diagnostics v_push = row_count;

  delete from public.driver_locations
   where driver_kind = 'taxi' and driver_id = p_driver_id;
  get diagnostics v_fixes = row_count;

  return jsonb_build_object(
    'ok',       true,
    'name',     v_row.name,
    'whatsapp', v_row.whatsapp,
    'phone',    v_row.phone,
    'link',     '/d/' || v_new,
    'pushRevoked', v_push,
    'fixesCleared', v_fixes,
    'accountUnlinked', v_unlinked
  );
end;
$function$;
