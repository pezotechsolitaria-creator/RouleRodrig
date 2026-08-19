-- ══════════════════════════════════════════════════════════════════════════
-- M127 — one place mints a driver token, and it checks the six characters
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE GAP M126 LEFT ─────────────────────────────────────────────────────
-- M126 gave the owner a rotate button that re-rolls until the new token's first
-- six characters are free. The CREATE path did not: it took the bare column
-- default,
--
--     replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
--
-- with no probe at all. So the invariant the rotate button protects could be
-- broken by adding a driver.
--
-- ── WHY SIX CHARACTERS MATTER MORE THAN THEY LOOK ─────────────────────────
-- driver_link_by_code resolves the code a driver types with
--
--     where left(d.driver_token, 6) = v_code ... limit 1
--
-- No ORDER BY, no ambiguity check. Two drivers sharing a six-hex prefix means
-- one of them signs in and is handed the OTHER's full token — his job list, his
-- rides, and his customers' phone numbers. And because taxi_drivers_driver_token_key
-- is UNIQUE over all 64 characters, that collision raises NOTHING. No
-- unique_violation, no error, no log. It cannot be caught after the fact; it has
-- to be prevented before the write.
--
-- ── WHY A FUNCTION DEFAULT AND NOT A UNIQUE INDEX ON left(...) ────────────
-- A `unique index on (left(driver_token, 6))` would turn a 1-in-16.7-million
-- event into a raw 23505 on the add-driver form, with no retry and nothing
-- useful to tell the owner. The re-roll handles it invisibly instead, and a
-- DEFAULT reaches every insert path — the admin form today, and whatever is
-- written next — without anybody having to remember.
--
-- Safe to make the default a function call: INSERT on taxi_drivers is granted to
-- service_role and postgres only (anon and authenticated cannot insert at all),
-- and no SQL function inserts into this table. Both roles can execute it.
--
-- ── ONE MINTER ────────────────────────────────────────────────────────────
-- admin_rotate_driver_token stops inlining its own loop and calls this. Two
-- implementations of "a safe new token" is how the create path came to be
-- missing the probe in the first place.

create or replace function public.mint_taxi_driver_token()
returns text
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_new   text;
  v_tries int := 0;
begin
  loop
    -- Exactly what the column default did — two uuids, hyphens stripped, 64
    -- lowercase hex. gen_random_uuid() is Postgres' cryptographic RNG, not
    -- random(). Lowercase matters: driver_link_by_code lower()s what the driver
    -- types and compares it against a raw left(driver_token, 6).
    v_new := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    -- Every row, with no exclusion. On a CREATE there is no row yet; on a
    -- ROTATE the row still holds its OLD token, and a candidate colliding with
    -- the outgoing prefix would resurrect the very code rotation exists to kill.
    exit when not exists (
      select 1 from public.taxi_drivers where left(driver_token, 6) = left(v_new, 6)
    );

    v_tries := v_tries + 1;
    if v_tries >= 5 then
      raise exception using errcode = 'RR096',
        message = 'Could not allocate a new code. Try again.';
    end if;
  end loop;
  return v_new;
end;
$function$;

comment on function public.mint_taxi_driver_token() is
  'A fresh 64-hex driver_token whose first six characters are not already in use. Those six are what driver_link_by_code matches on, and it resolves with limit 1 and no ambiguity check, so a duplicate prefix silently hands one driver another driver''s token. The UNIQUE index covers all 64 characters and cannot catch that.';

-- SECURITY DEFINER so the prefix probe reads taxi_drivers regardless of the
-- inserting role's RLS. It writes nothing and returns a random string, so the
-- blast radius if it were ever reachable is nil — but the platform's default
-- grants reach anon, so it is revoked and asserted anyway.
revoke all on function public.mint_taxi_driver_token() from public, anon, authenticated;
grant execute on function public.mint_taxi_driver_token() to service_role;

-- ── THE DEFAULT ───────────────────────────────────────────────────────────
alter table public.taxi_drivers
  alter column driver_token set default public.mint_taxi_driver_token();

-- ── ROTATION USES THE SAME MINTER ─────────────────────────────────────────
-- Body identical to M126 except that the inline loop becomes one call.
create or replace function public.admin_rotate_driver_token(p_driver_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_new text;
  v_row public.taxi_drivers%rowtype;
begin
  -- The M25 gate PASSES for an anonymous caller (auth.uid() is null on the
  -- service_role path). This line is not the boundary; the REVOKE is.
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

  -- M127: one minter, shared with the column default.
  v_new := public.mint_taxi_driver_token();

  update public.taxi_drivers
     set driver_token = v_new
   where id = p_driver_id
  returning * into v_row;

  return jsonb_build_object(
    'ok',       true,
    'name',     v_row.name,
    'whatsapp', v_row.whatsapp,
    'phone',    v_row.phone,
    'link',     '/d/' || v_new
  );
end;
$function$;

revoke all on function public.admin_rotate_driver_token(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_rotate_driver_token(uuid) to service_role;

-- ── VERIFICATION ──────────────────────────────────────────────────────────
do $$
declare
  v_a uuid; v_b uuid; v_ta text; v_tb text; v_res jsonb; v_n int;
begin
  -- ACLs first: neither is reachable by a client role.
  if has_function_privilege('anon', 'public.mint_taxi_driver_token()', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.mint_taxi_driver_token()', 'EXECUTE')
  or has_function_privilege('anon', 'public.admin_rotate_driver_token(uuid)', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.admin_rotate_driver_token(uuid)', 'EXECUTE') then
    raise exception 'M127: a token minter is EXECUTE-able by a client role';
  end if;

  -- The default actually calls the function now.
  if (select column_default from information_schema.columns
       where table_name='taxi_drivers' and column_name='driver_token')
     not like '%mint_taxi_driver_token%' then
    raise exception 'M127: the column default was not replaced';
  end if;

  -- A plpgsql body is not checked until it is called.
  if public.mint_taxi_driver_token() !~ '^[0-9a-f]{64}$' then
    raise exception 'M127: the minter did not return 64 lowercase hex';
  end if;

  -- CREATE takes the new default...
  insert into public.taxi_drivers (name, phone, vehicle, active, availability)
  values ('M127 probe A', '+2305550127', 'probe', false, 'off') returning id into v_a;
  select driver_token into v_ta from public.taxi_drivers where id = v_a;
  if v_ta !~ '^[0-9a-f]{64}$' then
    raise exception 'M127: a created driver did not get a 64-hex token: %', v_ta;
  end if;

  -- ...and a second driver never shares its six characters. Forced: pin driver
  -- B onto A's prefix, then let the minter re-roll around it.
  insert into public.taxi_drivers (name, phone, vehicle, active, availability)
  values ('M127 probe B', '+2305550128', 'probe', false, 'off') returning id into v_b;
  select driver_token into v_tb from public.taxi_drivers where id = v_b;
  if left(v_ta, 6) = left(v_tb, 6) then
    raise exception 'M127: two created drivers share a six-character code';
  end if;

  -- Rotation still works and still avoids every live prefix.
  v_res := public.admin_rotate_driver_token(v_b);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'M127: rotation broke: %', v_res;
  end if;
  select driver_token into v_tb from public.taxi_drivers where id = v_b;
  if left(v_ta, 6) = left(v_tb, 6) then
    raise exception 'M127: rotation landed on another driver''s six characters';
  end if;
  if v_res->>'link' <> '/d/' || v_tb then
    raise exception 'M127: the returned link does not match the stored token';
  end if;

  -- And the whole table is still collision-free.
  select count(*) into v_n from public.taxi_drivers a join public.taxi_drivers b
    on b.id <> a.id and left(b.driver_token, 6) = left(a.driver_token, 6);
  if v_n > 0 then
    raise exception 'M127: % colliding six-character codes exist', v_n;
  end if;

  delete from public.taxi_drivers where id in (v_a, v_b);
  if exists (select 1 from public.taxi_drivers where id in (v_a, v_b)) then
    raise exception 'M127: the probes were left behind';
  end if;

  raise notice 'M127 verified: one minter, and the six characters are unique on every path.';
end $$;
