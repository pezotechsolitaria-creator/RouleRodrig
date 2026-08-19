-- ══════════════════════════════════════════════════════════════════════════
-- M126 — the driver's link can be changed
-- ══════════════════════════════════════════════════════════════════════════
--
-- taxi_drivers.driver_token IS the credential. app/d/[token] says "No account,
-- no password, no install" and deliberately does not validate the token, so it
-- cannot become a guessing oracle. Seven deployed RPCs read it: taxi_driver_home,
-- driver_advance_ride_by_token, set_taxi_availability_by_token,
-- report_ride_no_show_by_token, register_taxi_push, driver_tracking_context and
-- driver_link_by_code. A holder reads the driver's job list, flips him on and
-- off duty, advances and completes rides, and files no-shows.
--
-- Until now nothing WROTE it. driver_token is absent from the ALLOWED whitelist
-- in app/api/admin/taxi, and no function set it — so a leaked link could only be
-- answered with hand-written SQL against production. This is that answer, as a
-- button.
--
-- ── WHY THE PREFIX PROBE IS NOT THE UNIQUE INDEX ──────────────────────────
-- taxi_drivers_driver_token_key is UNIQUE on the whole 64 characters. But
-- driver_link_by_code resolves the spoken 6-character code with
--
--     where left(d.driver_token, 6) = v_code ... limit 1
--
-- with no ORDER BY and no ambiguity check. Two drivers sharing a 6-hex prefix
-- would silently hand one driver the OTHER's full token, his job list and his
-- customers' phone numbers. That collision raises NO unique_violation, so an
-- exception handler could never catch it. It has to be probed before the write.
--
-- ── WHY IT REFUSES MID-RIDE RATHER THAN WARNING ───────────────────────────
-- The old token stops working in the same statement — and so does the driver's
-- 6-character recovery code, because driver_link_by_code matches
-- left(driver_token, 6). The code is a VIEW of the token, not a second secret.
-- So a driver rotated mid-ride cannot press Completed, cannot report a no-show,
-- and cannot get himself back in.
--
-- The owner CAN finish the ride from /admin/rides via admin_set_ride_status, so
-- nobody is stranded — but that leaves trip_tracking.ended_at NULL and a driver
-- location pinned mid-trip until the sweep runs, and the correct action is one
-- click away on the same screen. Finish or cancel first, then re-key.

create or replace function public.admin_rotate_driver_token(p_driver_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_new   text;
  v_tries int := 0;
  v_row   public.taxi_drivers%rowtype;
begin
  -- The M25 gate. It PASSES for an anonymous caller, because auth.uid() is null
  -- there — /admin reaches Postgres as service_role with no Supabase user. This
  -- line is not the boundary. The REVOKE at the bottom of this file is.
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  -- FOR UPDATE so two open admin tabs cannot mint two tokens and leave the
  -- owner holding up a QR for the one that lost.
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

  -- Minted exactly as the column default does — two uuids, hyphens stripped,
  -- 64 lowercase hex. gen_random_uuid() is Postgres' cryptographic RNG, not
  -- random(). Lowercase matters: driver_link_by_code lower()s the typed code
  -- and compares it against a raw left(driver_token, 6).
  --
  -- No `id <> p_driver_id` exclusion in the probe. The row still holds its OLD
  -- token here, and a candidate colliding with the outgoing prefix would
  -- resurrect the very code this call exists to kill.
  loop
    v_new := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    exit when not exists (
      select 1 from public.taxi_drivers where left(driver_token, 6) = left(v_new, 6)
    );
    v_tries := v_tries + 1;
    if v_tries >= 5 then
      raise exception using errcode = 'RR096',
        message = 'Could not allocate a new code. Try again.';
    end if;
  end loop;

  update public.taxi_drivers
     set driver_token = v_new
   where id = p_driver_id
  returning * into v_row;

  -- phone travels back so the route can apply the SAME wa.me normalisation the
  -- ?linkFor= branch applies. The 6-character code is deliberately NOT returned:
  -- the client already derives it from the link, and one derivation is the
  -- reason the two can never drift.
  return jsonb_build_object(
    'ok',       true,
    'name',     v_row.name,
    'whatsapp', v_row.whatsapp,
    'phone',    v_row.phone,
    'link',     '/d/' || v_new
  );
end;
$function$;

comment on function public.admin_rotate_driver_token(uuid) is
  'Replaces taxi_drivers.driver_token with a fresh 64-hex value and returns the new /d link. The driver''s old link AND his 6-character code (which is left(driver_token,6)) both die immediately, so the caller must hand the new one over. Refuses while the driver has a ride in assigned/driver_on_way/arrived/on_trip. Never granted to anon.';

-- ── THE BOUNDARY ──────────────────────────────────────────────────────────
-- Schema `public` carries pg_default_acl rows granting EXECUTE to anon and
-- authenticated, and Postgres also grants EXECUTE to PUBLIC by default — which
-- both roles inherit. Revoking from the named roles alone is NOT enough.
revoke all on function public.admin_rotate_driver_token(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_rotate_driver_token(uuid) to service_role;

do $$
declare v_acl text[];
begin
  if has_function_privilege('anon', 'public.admin_rotate_driver_token(uuid)', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.admin_rotate_driver_token(uuid)', 'EXECUTE') then
    raise exception 'M126: admin_rotate_driver_token is EXECUTE-able by anon/authenticated. It re-keys a driver''s only credential.';
  end if;
  select array(select unnest(proacl)::text) into v_acl from pg_proc
   where oid = 'public.admin_rotate_driver_token(uuid)'::regprocedure;
  if exists (select 1 from unnest(v_acl) a where a like '=%') then
    raise exception 'M126: PUBLIC still holds a grant: %', v_acl;
  end if;
  if not has_function_privilege('service_role', 'public.admin_rotate_driver_token(uuid)', 'EXECUTE') then
    raise exception 'M126: service_role cannot execute it — the button would 500.';
  end if;
end $$;

-- ── CALL IT ───────────────────────────────────────────────────────────────
-- A plpgsql body is not checked when it is created, so a migration that
-- "succeeds" can still ship an RPC that fails on the first real call. The probe
-- driver is inactive and 'off' so it can never enter dispatch, and its phone is
-- E.164 because M119 now constrains that column.
do $$
declare
  v_id     uuid;
  v_ride   uuid;
  v_before text;
  v_mid    text;
  v_after  text;
  v_res    jsonb;
begin
  insert into public.taxi_drivers (name, phone, vehicle, active, availability)
  values ('M126 probe', '+2305550126', 'probe', false, 'off')
  returning id, driver_token into v_id, v_before;

  -- 1 · a free driver gets a new 64-hex token, and the link matches the row
  v_res := public.admin_rotate_driver_token(v_id);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'M126: rotation refused a driver with no live ride: %', v_res;
  end if;
  select driver_token into v_after from public.taxi_drivers where id = v_id;
  if v_after = v_before then raise exception 'M126: the token did not change'; end if;
  if v_after !~ '^[0-9a-f]{64}$' then
    raise exception 'M126: new token is not 64 lowercase hex (len %)', length(v_after);
  end if;
  if v_res->>'link' <> '/d/' || v_after then
    raise exception 'M126: the returned link does not match the stored token';
  end if;
  if v_res->>'name' <> 'M126 probe' then
    raise exception 'M126: the handover payload lost the driver name: %', v_res;
  end if;

  -- 2 · the OLD link is dead, the NEW link works
  if coalesce((public.taxi_driver_home(v_before)->>'ok')::boolean, false) then
    raise exception 'M126: the old token still opens the driver page';
  end if;
  if not coalesce((public.taxi_driver_home(v_after)->>'ok')::boolean, false) then
    raise exception 'M126: the new token does not open the driver page';
  end if;

  -- 3 · the spoken code follows the token. This is the whole reason the button
  --     has to end on the handover screen rather than a toast.
  if coalesce((public.driver_link_by_code(left(v_before, 6))->>'ok')::boolean, false) then
    raise exception 'M126: the old six-character code still resolves';
  end if;
  if public.driver_link_by_code(left(v_after, 6))->>'token' is distinct from v_after then
    raise exception 'M126: the new six-character code does not resolve to the new token';
  end if;

  -- 4 · no prefix collides with any other driver
  if exists (
    select 1 from public.taxi_drivers a join public.taxi_drivers b
      on b.id <> a.id and left(b.driver_token, 6) = left(a.driver_token, 6)
  ) then
    raise exception 'M126: two drivers now share a six-character code';
  end if;

  -- 5 · it REFUSES mid-ride, and the refusal is a true no-op
  v_mid := v_after;
  insert into public.ride_requests (service, pickup_label, customer_name, customer_phone, status, driver_id)
  values ('taxi', 'M126 probe', 'M126 probe', '+2305550126', 'assigned', v_id)
  returning id into v_ride;

  v_res := public.admin_rotate_driver_token(v_id);
  if coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'M126: rotated a driver who is out on a ride';
  end if;
  if v_res->>'reason' <> 'on_ride' then
    raise exception 'M126: wrong refusal reason: %', v_res;
  end if;
  if v_res->>'message' is null then
    raise exception 'M126: the refusal has no sentence for the owner to read';
  end if;
  select driver_token into v_after from public.taxi_drivers where id = v_id;
  if v_after <> v_mid then
    raise exception 'M126: the refusal still changed the token';
  end if;

  -- 6 · an unknown driver is a clean RR090, not a silent success
  begin
    perform public.admin_rotate_driver_token('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'M126: rotating a driver that does not exist did not raise';
  exception when sqlstate 'RR090' then null;
  end;

  delete from public.ride_requests where id = v_ride;
  delete from public.taxi_drivers where id = v_id;
  if exists (select 1 from public.taxi_drivers where id = v_id)
  or exists (select 1 from public.ride_requests where id = v_ride) then
    raise exception 'M126: the probe was left behind';
  end if;

  raise notice 'M126 verified: the link changes, the old link and the old code both die, and it refuses mid-ride.';
end $$;
