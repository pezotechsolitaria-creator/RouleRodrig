-- M108 — Admin-assisted onboarding for merchants and delivery partners.
--
-- ── WHY A MIGRATION AT ALL ──────────────────────────────────────────────────
--
-- The platform already knows how to let an admin create somebody's account
-- without ever touching their password. It does it twice:
--
--   kitchen_staff     invite_email + user_id NULL → claim_kitchen_invites()
--   event_organizers  invite_email + user_id NULL → claim_organizer_invite()
--
-- Both work the same way and neither invents a credential: the ROW is created
-- against an email address, the person signs up normally with that email, and a
-- claim function links them on first sign-in. The admin never sees a password
-- because no password is ever generated.
--
-- Merchants and delivery partners cannot do this today for one reason only:
--
--   merchants.owner_id       NOT NULL
--   delivery_drivers.user_id NOT NULL
--
-- Neither row can exist before the person does. That is the whole gap, and it
-- is why this migration exists rather than a second invitation system. What
-- follows is the organiser pattern applied to two more tables — same columns,
-- same claim shape, same audit action names.

begin;

-- ── 1. The two tables learn to hold an invitation ───────────────────────────

alter table public.merchants
  alter column owner_id drop not null,
  add column if not exists invite_email text,
  add column if not exists invited_at   timestamptz,
  add column if not exists invited_by   text;

alter table public.delivery_drivers
  alter column user_id drop not null,
  add column if not exists invite_email text,
  add column if not exists invited_at   timestamptz,
  add column if not exists invited_by   text;

comment on column public.merchants.invite_email is
  'Set when an admin created this merchant on somebody''s behalf. The identity until they sign in and claim it (M108).';
comment on column public.delivery_drivers.invite_email is
  'Set when an admin created this driver on somebody''s behalf. The identity until they sign in and claim it (M108).';

-- A row must be SOMEBODY: either a real user, or an outstanding invitation.
-- Without this, dropping NOT NULL would allow an ownerless merchant that
-- nobody could ever claim and nobody would notice.
alter table public.merchants
  drop constraint if exists merchants_owner_or_invite,
  add constraint merchants_owner_or_invite
    check (owner_id is not null or invite_email is not null);

alter table public.delivery_drivers
  drop constraint if exists drivers_user_or_invite,
  add constraint drivers_user_or_invite
    check (user_id is not null or invite_email is not null);

-- One outstanding invitation per address. Re-inviting the same person is an
-- idempotent no-op rather than a second account they will never find.
create unique index if not exists merchants_open_invite_idx
  on public.merchants (lower(invite_email)) where owner_id is null;
create unique index if not exists drivers_open_invite_idx
  on public.delivery_drivers (lower(invite_email)) where user_id is null;

-- ── 2. Creating the invitation ──────────────────────────────────────────────
--
-- Modelled on admin_invite_organizer: validate, look for an existing identity,
-- return `created:false` rather than duplicating, write the audit row inside
-- the function so the trail cannot be forgotten by a caller.

create or replace function public.admin_invite_merchant(
  p_email text, p_business_name text, p_owner_name text,
  p_phone text default null, p_category text default null,
  p_address text default null, p_description text default null
) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_email text; v_m record; v_store_id uuid; v_slug text; v_try int := 0;
begin
  v_email := lower(btrim(coalesce(p_email,'')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode='RR005', message='That email address is not valid.'; end if;
  if coalesce(btrim(p_business_name),'') = '' then
    raise exception using errcode='RR005', message='A business name is required.'; end if;

  -- ── DUPLICATE PROTECTION ──────────────────────────────────────────────────
  -- An outstanding invitation, OR a merchant already owned by a user with this
  -- address. Either way we return what exists instead of creating a second one.
  select m.* into v_m from merchants m
   where lower(m.invite_email) = v_email
      or m.owner_id in (select u.id from auth.users u where lower(u.email) = v_email)
   limit 1;
  if found then
    return jsonb_build_object(
      'merchantId', v_m.id, 'created', false,
      'claimed', v_m.owner_id is not null, 'status', v_m.status);
  end if;

  insert into merchants (owner_id, invite_email, invited_at, invited_by,
                         legal_name, display_name, contact_email, contact_phone, status)
  values (null, v_email, now(), 'admin-session',
          btrim(p_business_name), btrim(p_business_name),
          v_email, nullif(btrim(p_phone),''), 'pending')
  returning * into v_m;

  -- A shop, DRAFT and closed. A merchant with no store cannot be helped to
  -- fill in opening hours or a description, which is the whole point of the
  -- admin sitting beside them — but it must not be on sale before they exist.
  loop
    v_slug := regexp_replace(lower(btrim(p_business_name)), '[^a-z0-9]+', '-', 'g')
              || '-' || substr(gen_random_uuid()::text, 1, 8);
    begin
      insert into stores (merchant_id, name, slug, description, category_hint, phone, address, status)
      values (v_m.id, btrim(p_business_name), v_slug, nullif(btrim(p_description),''),
              nullif(btrim(p_category),''), nullif(btrim(p_phone),''),
              nullif(btrim(p_address),''), 'draft')
      returning id into v_store_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 5 then raise exception using errcode='RR005',
        message='Could not generate a unique shop link — try a slightly different business name.'; end if;
    end;
  end loop;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'admin-session', 'merchant.invited', 'merchant', v_m.id::text,
          jsonb_build_object('email', v_email, 'business', v_m.display_name,
                             'owner', nullif(btrim(p_owner_name),''), 'storeId', v_store_id));

  return jsonb_build_object('merchantId', v_m.id, 'storeId', v_store_id,
                            'created', true, 'claimed', false, 'status', v_m.status);
end $$;

create or replace function public.admin_invite_driver(
  p_email text, p_full_name text, p_phone text,
  p_vehicle_type text, p_vehicle_details text default null,
  p_zone_ids uuid[] default '{}'
) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_email text; v_d record;
begin
  v_email := lower(btrim(coalesce(p_email,'')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode='RR005', message='That email address is not valid.'; end if;
  if coalesce(btrim(p_full_name),'') = '' then
    raise exception using errcode='RR005', message='A name is required.'; end if;
  if coalesce(btrim(p_phone),'') = '' then
    raise exception using errcode='RR005', message='A phone number is required.'; end if;
  if coalesce(btrim(p_vehicle_type),'') = '' then
    raise exception using errcode='RR005', message='A vehicle type is required.'; end if;

  select d.* into v_d from delivery_drivers d
   where lower(d.invite_email) = v_email
      or d.user_id in (select u.id from auth.users u where lower(u.email) = v_email)
   limit 1;
  if found then
    return jsonb_build_object('driverId', v_d.id, 'created', false,
                              'claimed', v_d.user_id is not null, 'status', v_d.status);
  end if;

  -- ── PENDING AND OFFLINE, ALWAYS ───────────────────────────────────────────
  -- A driver created by an admin must never be dispatchable. Both columns say
  -- so, and lib/admin/people.ts refuses to show a non-active account as
  -- available regardless — belt and braces, because dispatch reads this row.
  insert into delivery_drivers (user_id, invite_email, invited_at, invited_by,
                                full_name, phone, vehicle_type, vehicle_details,
                                service_zone_ids, status, availability)
  values (null, v_email, now(), 'admin-session',
          btrim(p_full_name), btrim(p_phone), btrim(p_vehicle_type),
          nullif(btrim(p_vehicle_details),''), coalesce(p_zone_ids,'{}'),
          'pending', 'offline')
  returning * into v_d;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'admin-session', 'driver.invited', 'driver', v_d.id::text,
          jsonb_build_object('email', v_email, 'name', v_d.full_name, 'vehicle', v_d.vehicle_type));

  return jsonb_build_object('driverId', v_d.id, 'created', true, 'claimed', false, 'status', v_d.status);
end $$;

-- ── 3. Claiming it, on first sign-in ────────────────────────────────────────
--
-- Byte-for-byte the shape of claim_organizer_invite: the CONFIRMED email of the
-- signed-in user against an unclaimed invitation. An unconfirmed address must
-- never claim anything, or an invitation could be taken by somebody who merely
-- typed the address.
--
-- Claiming does NOT approve anybody. The account stays `pending` and an admin
-- still decides — the invitation proves who they are, not that they are ready.

create or replace function public.claim_merchant_invite()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid(); v_email text; v_m record;
begin
  if v_uid is null then return jsonb_build_object('claimed', false); end if;
  select lower(u.email) into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('claimed', false); end if;

  select * into v_m from merchants where owner_id = v_uid limit 1;
  if found then return jsonb_build_object('claimed', true, 'merchantId', v_m.id, 'status', v_m.status); end if;

  update merchants set owner_id = v_uid
   where lower(invite_email) = v_email and owner_id is null
  returning * into v_m;
  if v_m.id is null then return jsonb_build_object('claimed', false); end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (v_uid, 'merchant', 'merchant.invite_claimed', 'merchant', v_m.id::text,
          jsonb_build_object('email', v_email));

  return jsonb_build_object('claimed', true, 'merchantId', v_m.id, 'status', v_m.status);
end $$;

create or replace function public.claim_driver_invite()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid(); v_email text; v_d record;
begin
  if v_uid is null then return jsonb_build_object('claimed', false); end if;
  select lower(u.email) into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('claimed', false); end if;

  select * into v_d from delivery_drivers where user_id = v_uid limit 1;
  if found then return jsonb_build_object('claimed', true, 'driverId', v_d.id, 'status', v_d.status); end if;

  update delivery_drivers set user_id = v_uid
   where lower(invite_email) = v_email and user_id is null
  returning * into v_d;
  if v_d.id is null then return jsonb_build_object('claimed', false); end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (v_uid, 'driver', 'driver.invite_claimed', 'driver', v_d.id::text,
          jsonb_build_object('email', v_email));

  return jsonb_build_object('claimed', true, 'driverId', v_d.id, 'status', v_d.status);
end $$;

-- ── 3b. The owner-provisioning trigger must tolerate an ownerless merchant ──
--
-- provision_merchant_owner() copies merchants.owner_id into merchant_staff as
-- the 'owner' row. merchant_staff.user_id is NOT NULL, so with owner_id now
-- nullable the trigger aborts every admin-created invitation. It has to wait
-- for the claim instead -- and then fire, which is why it is an UPDATE trigger
-- as well as an INSERT one.

create or replace function public.provision_merchant_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- An invited merchant has no owner yet. claim_merchant_invite() sets
  -- owner_id, and the update fires this same trigger to create the staff row.
  if new.owner_id is null then
    return new;
  end if;

  insert into public.merchant_staff (merchant_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (merchant_id, user_id) do update set role = 'owner';
  return new;
end $$;

drop trigger if exists provision_merchant_owner_on_claim on public.merchants;
create trigger provision_merchant_owner_on_claim
  after update of owner_id on public.merchants
  for each row
  when (old.owner_id is null and new.owner_id is not null)
  execute function public.provision_merchant_owner();

-- ── 4. Grants ───────────────────────────────────────────────────────────────
--
-- EXECUTE on a new function is granted to PUBLIC by default, AND Supabase runs
-- `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role`. Those are EXPLICIT grants: a
-- `revoke ... from public` leaves them standing. The first draft of this
-- migration did exactly that, and the assertion below caught anon executing
-- admin_invite_merchant. Every role that must not call these has to be named.
--
-- The two admin_invite_* functions are SECURITY DEFINER and would create
-- merchants for anybody who could call them; they go to service_role ONLY,
-- which is the role lib/supabase/admin uses behind guardAdminApi.

revoke all on function public.admin_invite_merchant(text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_invite_driver(text,text,text,text,text,uuid[]) from public, anon, authenticated;
grant execute on function public.admin_invite_merchant(text,text,text,text,text,text,text) to service_role;
grant execute on function public.admin_invite_driver(text,text,text,text,text,uuid[]) to service_role;

-- The claim functions are the opposite: they are how an invited person takes
-- ownership on first sign-in, so `authenticated` is exactly right. They read
-- auth.uid() themselves and can only ever claim a row addressed to that user's
-- own email, so a signed-in stranger calling one gets claimed:false.
revoke all on function public.claim_merchant_invite() from public, anon;
revoke all on function public.claim_driver_invite() from public, anon;
grant execute on function public.claim_merchant_invite() to authenticated, service_role;
grant execute on function public.claim_driver_invite() to authenticated, service_role;

commit;

-- ── 5. Assertions ───────────────────────────────────────────────────────────
--
-- A migration that "succeeded" has only proved its SQL parsed. A plpgsql body
-- is not checked until it runs, and this project has shipped an RPC that 42P01d
-- on its first real call. So the migration calls its own functions, as the real
-- roles, before anybody trusts them.
--
-- These three caught two real defects on the first run and are kept for that
-- reason, not for decoration:
--
--   1. `revoke ... from public` did NOT stop anon. Supabase runs ALTER DEFAULT
--      PRIVILEGES granting EXECUTE to anon and authenticated, and those are
--      explicit grants that a revoke-from-public leaves untouched. A1 caught
--      anon successfully calling admin_invite_merchant.
--   2. provision_merchant_owner() copied owner_id into merchant_staff.user_id,
--      which is NOT NULL, so it aborted every ownerless merchant. Section 3b.
--
-- A3 writes real rows and then throws ROLLBACK_SENTINEL. A plpgsql block with
-- an EXCEPTION clause is a subtransaction, so catching that sentinel discards
-- everything the block wrote. That is how a create-then-claim path gets tested
-- against production without leaving a test merchant behind.

-- A1 · neither admin function is reachable by an anonymous caller.
do $$
begin
  begin
    set local role anon;
    perform public.admin_invite_merchant('a1@example.com','X','X');
    reset role; raise exception 'FAIL A1: anon executed admin_invite_merchant';
  exception when insufficient_privilege then reset role;
  end;
  begin
    set local role anon;
    perform public.admin_invite_driver('a1@example.com','X','+23050000000','scooter');
    reset role; raise exception 'FAIL A1: anon executed admin_invite_driver';
  exception when insufficient_privilege then reset role;
  end;
end $$;

-- A2 · a signed-in caller with no matching invitation claims nothing. The claim
-- functions are reachable by `authenticated` on purpose; what protects them is
-- that they read auth.uid() themselves rather than taking an id from the caller.
do $$
declare v jsonb;
begin
  set local role authenticated;
  v := public.claim_merchant_invite();
  if (v->>'claimed')::boolean is distinct from false then reset role; raise exception 'FAIL A2: merchant claimed with no uid'; end if;
  v := public.claim_driver_invite();
  if (v->>'claimed')::boolean is distinct from false then reset role; raise exception 'FAIL A2: driver claimed with no uid'; end if;
  reset role;
end $$;

-- A3 · the whole round trip, then rolled back.
do $$
declare v jsonb; v_id uuid; v_did uuid; v_user uuid; v_staff int;
begin
  begin
    select id into v_user from auth.users order by created_at limit 1;
    if v_user is null then raise exception 'FAIL A3: no auth user to test the claim with'; end if;

    v := public.admin_invite_merchant('m108-selftest@example.com','M108 Self Test','Tester');
    if not (v->>'created')::boolean then raise exception 'FAIL A3: first merchant invite did not create'; end if;
    v_id := (v->>'merchantId')::uuid;
    if (select status::text from merchants where id=v_id) <> 'pending' then raise exception 'FAIL A3: new merchant not pending'; end if;
    if (select count(*) from merchant_staff where merchant_id=v_id) <> 0 then raise exception 'FAIL A3: ownerless merchant got a staff row'; end if;

    -- Inviting the same address twice is a mistake an admin WILL make. It must
    -- return the row that already exists, not a second merchant.
    v := public.admin_invite_merchant('M108-SelfTest@Example.com','M108 Self Test','Tester');
    if (v->>'created')::boolean then raise exception 'FAIL A3: DUPLICATE merchant created'; end if;
    if (v->>'merchantId')::uuid <> v_id then raise exception 'FAIL A3: duplicate returned a different merchant'; end if;

    -- Claiming is what makes the person the owner. Section 3b's trigger.
    update merchants set owner_id = v_user where id = v_id;
    select count(*) into v_staff from merchant_staff where merchant_id=v_id and user_id=v_user and role='owner';
    if v_staff <> 1 then raise exception 'FAIL A3: claim did not provision the owner staff row (got %)', v_staff; end if;

    -- delivery_drivers.phone is CHECKed against E.164 (^\+[1-9][0-9]{6,15}$).
    -- A local number typed as "5800 0000" raises a bare 23514, which is why the
    -- API normalises before it ever reaches this function.
    v := public.admin_invite_driver('m108-driver@example.com','M108 Driver','+23058000000','scooter');
    if not (v->>'created')::boolean then raise exception 'FAIL A3: first driver invite did not create'; end if;
    v_did := (v->>'driverId')::uuid;
    if (select status::text from delivery_drivers where id=v_did) <> 'pending' then raise exception 'FAIL A3: new driver not pending'; end if;
    -- The rule that matters most on this table: a driver who is not active is
    -- never offerable. A brand new one starts offline.
    if (select availability::text from delivery_drivers where id=v_did) <> 'offline' then raise exception 'FAIL A3: new driver not offline'; end if;

    v := public.admin_invite_driver('M108-Driver@Example.com','M108 Driver','+23058000000','scooter');
    if (v->>'created')::boolean then raise exception 'FAIL A3: DUPLICATE driver created'; end if;
    if (v->>'driverId')::uuid <> v_did then raise exception 'FAIL A3: duplicate returned a different driver'; end if;

    raise exception 'ROLLBACK_SENTINEL';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_SENTINEL' then raise; end if;
  end;
end $$;
