-- ══════════════════════════════════════════════════════════════════════════
-- M128 — rotation revokes what the token WROTE, not just the token
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE HOLE M126 LEFT ────────────────────────────────────────────────────
-- M126 gave the owner a button that replaces a driver's link. It replaced the
-- link and nothing else — and the link is not the only thing a token holder
-- gets. It is the thing they use to CREATE durable state that outlives it.
--
-- ── THE COMPLETE BYPASS ───────────────────────────────────────────────────
-- register_taxi_push authenticates by the token alone:
--
--     select * into v_t from taxi_drivers where driver_token = p_token;
--     insert into taxi_push_subscriptions (driver_id, endpoint, ...) values (v_t.id, ...)
--
-- so anybody holding a leaked link can register their own device. The row is
-- keyed on driver_id, and taxi_push_targets joins on driver_id ALONE — no
-- driver_token, no "registered since" floor (there is no such column to compare
-- against). So the rogue subscription survives rotation untouched.
--
-- What it then receives is not a harmless ping. The payload carries
--     url: /r/<ride_offers.token>
-- and accept_ride_by_token(p_token) resolves that offer token with
--     select * into v_o from ride_offers where token = p_token;
-- and never reads driver_token at all. Verified: pg_get_functiondef for
-- accept_ride_by_token contains no reference to driver_token.
--
-- So the holder taps, wins the compare-and-swap, and ride_offer_by_token hands
-- back the customer's name and phone. Rotation revoked the link and revoked
-- nothing that mattered. Even losing that race, they have already read the
-- pickup, dropoff, price, passenger count and notes.
--
-- ── AND THE POSITION ──────────────────────────────────────────────────────
-- driver_tracking_context is token-keyed too, so a holder can pin a false taxi
-- position via /api/tracking/ping. driver_locations has no expiry and no sweep
-- for taxi rows, so a fake fix sits in the dispatch ranking for ever —
-- ride_candidates prefers a live fix over the driver's base.
--
-- Both are the same shape: state the TOKEN wrote, keyed on the DRIVER, which
-- rotation left behind. Both go with the token now.
--
-- ── THE COST, STATED PLAINLY ──────────────────────────────────────────────
-- The real driver's own subscription is deleted too — the join is on driver_id,
-- so there is no way to tell his row from a rogue one, and preferring to keep
-- his would keep theirs. He stops receiving push until he opens the new link
-- and presses Turn on again.
--
-- That is the correct trade and it is not merely damage control: his
-- re-subscription through the new link is PROOF OF POSSESSION, which is what the
-- token was supposed to mean in the first place.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
-- It does not refuse on a live OFFER the way it refuses on a live RIDE. They
-- are not the same: a ride is a commitment the driver cannot finish without his
-- link, an offer is an invitation he has not accepted. Refusing to re-key a
-- leaked link because a ten-minute offer is open would put the leak second.
-- The offer is simply re-offered on the next round.

create or replace function public.admin_rotate_driver_token(p_driver_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_new   text;
  v_row   public.taxi_drivers%rowtype;
  v_push  integer := 0;
  v_fixes integer := 0;
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

  v_new := public.mint_taxi_driver_token();

  update public.taxi_drivers
     set driver_token = v_new
   where id = p_driver_id
  returning * into v_row;

  -- M128 · REVOKE WHAT THE OLD TOKEN WROTE.
  --
  -- Atomic with the re-key on purpose. A push subscription registered with the
  -- leaked token is a standing delivery channel for ride offers, and the offer
  -- token in that payload is accepted by accept_ride_by_token with no reference
  -- to driver_token — so leaving it is leaving the door open with a new lock on
  -- it. The real driver's row goes too: the table cannot tell one from the
  -- other, and keeping his would keep theirs.
  delete from public.taxi_push_subscriptions where driver_id = p_driver_id;
  get diagnostics v_push = row_count;

  -- Same reasoning. A position pinned through the old token has no expiry and
  -- no sweep, and ride_candidates prefers a live fix over the driver's base —
  -- so a stale or forged fix keeps steering dispatch.
  delete from public.driver_locations
   where driver_kind = 'taxi' and driver_id = p_driver_id;
  get diagnostics v_fixes = row_count;

  return jsonb_build_object(
    'ok',       true,
    'name',     v_row.name,
    'whatsapp', v_row.whatsapp,
    'phone',    v_row.phone,
    'link',     '/d/' || v_new,
    -- So the handover card can tell the owner what he has to say out loud:
    -- the man's phone alerts are off until he opens the new link and turns
    -- them back on.
    'pushRevoked', v_push,
    'fixesCleared', v_fixes
  );
end;
$function$;

revoke all on function public.admin_rotate_driver_token(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_rotate_driver_token(uuid) to service_role;

-- ── VERIFICATION ──────────────────────────────────────────────────────────
do $$
declare
  v_id uuid; v_tok text; v_new text; v_res jsonb;
begin
  if has_function_privilege('anon', 'public.admin_rotate_driver_token(uuid)', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.admin_rotate_driver_token(uuid)', 'EXECUTE') then
    raise exception 'M128: admin_rotate_driver_token is EXECUTE-able by a client role';
  end if;

  insert into public.taxi_drivers (name, phone, vehicle, active, availability)
  values ('M128 probe', '+2305550128', 'probe', false, 'off')
  returning id, driver_token into v_id, v_tok;

  -- Stand in for the rogue: register a subscription using the token, exactly
  -- the way an attacker holding a leaked link would.
  if not coalesce((public.register_taxi_push(
        v_tok, 'https://example.invalid/m128-probe', 'p256dh-probe', 'auth-probe', 'M128'
      )->>'ok')::boolean, false) then
    raise exception 'M128: could not register the probe subscription';
  end if;
  if not exists (select 1 from public.taxi_push_subscriptions where driver_id = v_id) then
    raise exception 'M128: the probe subscription was not created';
  end if;

  -- And a position, the way a token holder pins one through /api/tracking/ping.
  insert into public.driver_locations (driver_kind, driver_id, lat, lng, recorded_at)
  values ('taxi', v_id, -19.70, 63.41, now())
  on conflict (driver_kind, driver_id) do update set lat = excluded.lat, lng = excluded.lng;

  v_res := public.admin_rotate_driver_token(v_id);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'M128: rotation refused a free driver: %', v_res;
  end if;

  -- THE POINT OF THE WHOLE MIGRATION.
  if exists (select 1 from public.taxi_push_subscriptions where driver_id = v_id) then
    raise exception 'M128: a push subscription survived rotation — the rogue device still gets ride offers';
  end if;
  if exists (select 1 from public.driver_locations where driver_kind='taxi' and driver_id = v_id) then
    raise exception 'M128: a taxi position survived rotation';
  end if;
  if (v_res->>'pushRevoked')::int < 1 then
    raise exception 'M128: pushRevoked did not report the deletion: %', v_res;
  end if;
  if (v_res->>'fixesCleared')::int < 1 then
    raise exception 'M128: fixesCleared did not report the deletion: %', v_res;
  end if;

  -- The re-key itself still works, and the old token is dead.
  select driver_token into v_new from public.taxi_drivers where id = v_id;
  if v_new = v_tok then raise exception 'M128: the token did not change'; end if;
  if coalesce((public.taxi_driver_home(v_tok)->>'ok')::boolean, false) then
    raise exception 'M128: the old token still opens the driver page';
  end if;
  if v_res->>'link' <> '/d/' || v_new then
    raise exception 'M128: the returned link does not match the stored token';
  end if;

  -- The old token can no longer register anything either.
  if coalesce((public.register_taxi_push(
        v_tok, 'https://example.invalid/m128-probe-2', 'p', 'a', 'M128'
      )->>'ok')::boolean, false) then
    raise exception 'M128: the OLD token could still register a push subscription';
  end if;

  -- Still refuses mid-ride.
  insert into public.ride_requests (service, pickup_label, customer_name, customer_phone, status, driver_id)
  values ('taxi', 'M128 probe', 'M128 probe', '+2305550128', 'assigned', v_id);
  v_res := public.admin_rotate_driver_token(v_id);
  if coalesce((v_res->>'ok')::boolean, false) or v_res->>'reason' <> 'on_ride' then
    raise exception 'M128: the live-ride refusal broke: %', v_res;
  end if;

  delete from public.ride_requests where driver_id = v_id;
  delete from public.taxi_push_subscriptions where driver_id = v_id;
  delete from public.driver_locations where driver_kind='taxi' and driver_id = v_id;
  delete from public.taxi_drivers where id = v_id;
  if exists (select 1 from public.taxi_drivers where id = v_id) then
    raise exception 'M128: the probe was left behind';
  end if;

  raise notice 'M128 verified: the push channel and the pinned position go with the token.';
end $$;
