-- M43 — Event organisers: a real identity, scoped to their own events, that is
--       NOT a marketplace merchant.
--
-- ── THE DECISION THIS IMPLEMENTS (owner, 2026-08-08, evening) ───────────────
-- Reverses the morning's rule. Organisers now DO get accounts and a dashboard:
-- they manage their own events, packages, reservations, payment proofs and
-- scanner. What does NOT change is the boundary:
--
--     EVENT ORGANISER  ≠  MARKETPLACE MERCHANT
--
-- ── WHY THIS CANNOT REUSE merchant_staff ────────────────────────────────────
-- It would look like the obvious reuse. It is a trap, and the live schema shows
-- exactly why:
--
--   is_store_staff(_store) = exists (
--     select 1 from stores s join merchant_staff ms on ms.merchant_id = s.merchant_id
--     where s.id = _store and ms.user_id = auth.uid())
--
-- M40 gave EVERY event store the SAME system-owned merchant
-- ('Roulé Rodrigues Events'). So one merchant_staff row against that merchant
-- would not grant access to one event — it would grant access to **every event
-- on the platform**, plus a working merchant dashboard, plus whatever the
-- marketplace grants store staff. Event scoping is impossible through that
-- table by construction.
--
-- Hence a dedicated pair of tables whose grain is (organiser, ONE event).
--
-- ── WHY INVITE-BY-EMAIL RATHER THAN CREATING ACCOUNTS ───────────────────────
-- auth.users is managed by Supabase Auth; minting rows in it from SQL means
-- hand-rolling password hashing and confirmation state. So the admin invites an
-- EMAIL, the organiser signs up through the normal front door, and
-- claim_organizer_invite() links the two on first sign-in — matched on the
-- caller's own CONFIRMED address, never on a parameter.
--
-- That is deliberately the same shape as claim_guest_orders() (M20/M21), which
-- is already proven in this codebase, and it means there is still exactly one
-- authentication system.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ────────────────────────────
-- No dashboard, no packages, no payment proof, no scanner, no capacity model,
-- no reservation-window change. Those all depend on the predicate this file
-- creates and would otherwise be built on nothing.

-- ── 1. The organiser ────────────────────────────────────────────────────────
create table if not exists event_organizers (
  id             uuid primary key default gen_random_uuid(),

  -- The invitation is the identity until it is claimed. Lower-cased on write so
  -- the unique index and the claim lookup can never disagree about case.
  invite_email   text not null,

  -- NULL until the invited person signs up and claims it. Unique so one auth
  -- user can never be two organisers.
  user_id        uuid unique references auth.users(id) on delete set null,

  display_name   text not null,
  contact_phone  text,

  --   invited   → emailed, not yet signed up. No access.
  --   active    → claimed and permitted.
  --   suspended → claimed but revoked. No access, history preserved.
  status         text not null default 'invited'
                 check (status in ('invited','active','suspended')),

  -- Pre-launch test accounts must be distinguishable from real organisers.
  -- Earned during M23: a cleanup predicate nearly deleted a real customer order
  -- because nothing marked test data. Same control as orders.is_test (M33).
  is_test        boolean not null default false,

  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint event_organizers_email_shape
    check (invite_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- An unclaimed invite cannot be active: status must follow the account.
  constraint event_organizers_active_needs_user
    check (status <> 'active' or user_id is not null)
);

create unique index if not exists event_organizers_invite_email_key
  on event_organizers (lower(invite_email));

comment on table event_organizers is
  'An event organiser: a real, admin-invited account that is explicitly NOT a marketplace merchant. merchant_staff cannot express this — M40 gave every event store the same system-owned merchant, so a merchant_staff row there would grant access to EVERY event plus a merchant dashboard. Identity is the invited email until claimed on first sign-in (M43).';
comment on column event_organizers.status is
  'invited = emailed, no access yet. active = claimed and permitted. suspended = revoked, history kept. Suspension takes effect immediately because every gate reads status live.';

-- ── 2. Which events they may touch ──────────────────────────────────────────
create table if not exists event_organizer_assignments (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references event_organizers(id) on delete cascade,

  -- The event, addressed by its store (M33: an event IS a store, PK is FK).
  -- restrict, not cascade: deleting a store out from under a live assignment
  -- should fail loudly. The M31/M32 admin delete already refuses event stores.
  store_id      uuid not null references stores(id) on delete restrict,

  -- Whether THIS organiser may approve payment proofs for THIS event.
  -- Defaults FALSE: admin-only verification is the safe default, and turning it
  -- on is one boolean per organiser per event rather than a policy change.
  can_verify_payments boolean not null default false,

  assigned_by   uuid,
  assigned_at   timestamptz not null default now(),

  constraint event_organizer_assignments_unique unique (organizer_id, store_id)
);

-- The scanner and dashboard both ask "who may manage this event?" far more
-- often than "what does this organiser have?", so store_id leads.
create index if not exists eoa_store_idx on event_organizer_assignments (store_id);
create index if not exists eoa_organizer_idx on event_organizer_assignments (organizer_id);

comment on table event_organizer_assignments is
  'Grain is (organiser, ONE event). This is the scoping merchant_staff cannot express. Unique on (organizer_id, store_id) so re-assigning is idempotent rather than an error (M43).';

drop trigger if exists event_organizers_set_updated_at on event_organizers;
create trigger event_organizers_set_updated_at
  before update on event_organizers
  for each row execute function set_updated_at();

-- ── 3. The predicates every later feature will read ─────────────────────────
-- Deliberately the same shape as is_store_staff(): STABLE, SECURITY DEFINER,
-- takes no identity parameter, derives everything from auth.uid(). A function
-- that accepted an organiser id would be an invitation to pass someone else's.
create or replace function public.is_event_organizer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from event_organizers o
    where o.user_id = auth.uid() and o.status = 'active'
  );
$$;

create or replace function public.can_manage_event(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select is_platform_admin() or exists (
    select 1
      from event_organizer_assignments a
      join event_organizers o on o.id = a.organizer_id
     where a.store_id = p_store_id
       and o.user_id = auth.uid()
       -- Status is read LIVE, so suspending an organiser revokes access on the
       -- next request rather than on the next login.
       and o.status = 'active'
  );
$$;

create or replace function public.can_verify_event_payments(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select is_platform_admin() or exists (
    select 1
      from event_organizer_assignments a
      join event_organizers o on o.id = a.organizer_id
     where a.store_id = p_store_id
       and o.user_id = auth.uid()
       and o.status = 'active'
       and a.can_verify_payments
  );
$$;

revoke all on function public.is_event_organizer() from public;
revoke all on function public.can_manage_event(uuid) from public;
revoke all on function public.can_verify_event_payments(uuid) from public;
grant execute on function public.is_event_organizer() to authenticated, service_role;
grant execute on function public.can_manage_event(uuid) to authenticated, service_role;
grant execute on function public.can_verify_event_payments(uuid) to authenticated, service_role;

comment on function public.can_manage_event(uuid) is
  'THE authorization predicate for everything an organiser does. Platform admin, or an ACTIVE organiser explicitly assigned to this event. Takes no organiser id — identity comes from auth.uid(), so nobody can pass someone else''s (M43).';

-- ── 4. Claiming the invitation ──────────────────────────────────────────────
-- Same shape as claim_guest_orders(): the address comes from auth.users for the
-- CALLER and is never a parameter, so an invitation cannot be claimed by
-- guessing somebody else's email. Requires a CONFIRMED address, so an
-- unverified sign-up cannot take over an invited organiser identity.
create or replace function public.claim_organizer_invite()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_org   record;
begin
  if v_uid is null then return jsonb_build_object('claimed', false); end if;

  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('claimed', false); end if;

  -- Already linked: idempotent no-op.
  select * into v_org from event_organizers where user_id = v_uid;
  if found then
    return jsonb_build_object('claimed', true, 'organizerId', v_org.id, 'status', v_org.status);
  end if;

  update event_organizers
     set user_id = v_uid,
         status  = case when status = 'invited' then 'active' else status end
   where lower(invite_email) = v_email
     and user_id is null
  returning * into v_org;

  if v_org.id is null then
    return jsonb_build_object('claimed', false);
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (v_uid, 'event_organizer', 'organizer.invite_claimed', 'event_organizers', v_org.id::text,
          jsonb_build_object('email', v_email));

  return jsonb_build_object('claimed', true, 'organizerId', v_org.id, 'status', v_org.status);
end;
$$;

revoke all on function public.claim_organizer_invite() from public, anon;
grant execute on function public.claim_organizer_invite() to authenticated, service_role;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
alter table event_organizers enable row level security;
alter table event_organizer_assignments enable row level security;

-- An organiser sees ONLY their own profile row. Not the roster, not another
-- organiser's contact details.
drop policy if exists event_organizers_self_read on event_organizers;
create policy event_organizers_self_read on event_organizers
  for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());

-- Only their OWN assignments. This is the row that would leak "which other
-- events exist and who runs them" if it were readable.
drop policy if exists eoa_self_read on event_organizer_assignments;
create policy eoa_self_read on event_organizer_assignments
  for select to authenticated
  using (
    is_platform_admin()
    or exists (select 1 from event_organizers o
                where o.id = event_organizer_assignments.organizer_id and o.user_id = auth.uid())
  );

revoke all on event_organizers from anon, authenticated;
revoke all on event_organizer_assignments from anon, authenticated;
grant select on event_organizers to authenticated;
grant select on event_organizer_assignments to authenticated;
-- NO client writes anywhere. Every mutation goes through an admin RPC below.
-- An organiser who could INSERT an assignment could assign themselves to any
-- event on the platform.

-- ── 6. Organisers can reach their own events ────────────────────────────────
-- Extends the M33/M34/M35 policies rather than replacing them, so existing
-- staff/admin access is untouched.
drop policy if exists events_organizer_manage on events;
create policy events_organizer_manage on events
  for all to authenticated
  using (can_manage_event(store_id))
  with check (can_manage_event(store_id));

drop policy if exists ticket_types_organizer_manage on ticket_types;
create policy ticket_types_organizer_manage on ticket_types
  for all to authenticated
  using (exists (
    select 1 from product_variants v join products p on p.id = v.product_id
    where v.id = ticket_types.variant_id and can_manage_event(p.store_id)))
  with check (exists (
    select 1 from product_variants v join products p on p.id = v.product_id
    where v.id = ticket_types.variant_id and can_manage_event(p.store_id)));

-- Read only. Tickets remain unwritable by any client role (M35) — an organiser
-- who could UPDATE a ticket could mark it used, or un-void a refunded one.
drop policy if exists tickets_organizer_read on tickets;
create policy tickets_organizer_read on tickets
  for select to authenticated
  using (can_manage_event(store_id));

-- ── 7. Admin RPCs. Every mutation is audited ────────────────────────────────
-- Gate: `auth.uid() is not null and not is_platform_admin()`. A caller WITH a
-- session must be a platform admin; a caller without one can only be
-- service_role, because anon is revoked — the two-admin-identities rule this
-- codebase established in M25 (/admin authenticates by cookie and reaches
-- Postgres as service_role, where auth.uid() is NULL).
create or replace function public.admin_invite_organizer(
  p_email text, p_display_name text, p_phone text default null,
  p_is_test boolean default false, p_notes text default null,
  p_actor_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_email text; v_org record;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  v_email := lower(btrim(coalesce(p_email,'')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode='RR005', message='That email address is not valid.';
  end if;
  if coalesce(btrim(p_display_name),'') = '' then
    raise exception using errcode='RR005', message='A name is required.';
  end if;

  -- Idempotent: re-inviting the same address returns the existing organiser
  -- rather than failing, so a double-click cannot produce a confusing error.
  select * into v_org from event_organizers where lower(invite_email) = v_email;
  if found then
    return jsonb_build_object('organizerId', v_org.id, 'status', v_org.status, 'created', false);
  end if;

  insert into event_organizers (invite_email, display_name, contact_phone, is_test, notes, created_by)
  values (v_email, btrim(p_display_name), nullif(btrim(p_phone),''), coalesce(p_is_test,false),
          nullif(btrim(p_notes),''), auth.uid())
  returning * into v_org;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''),'platform_admin'),
          'organizer.invited', 'event_organizers', v_org.id::text,
          jsonb_build_object('email', v_email, 'name', v_org.display_name, 'isTest', v_org.is_test));

  return jsonb_build_object('organizerId', v_org.id, 'status', v_org.status, 'created', true);
end;
$$;

create or replace function public.admin_assign_organizer_event(
  p_organizer_id uuid, p_store_id uuid,
  p_can_verify_payments boolean default false, p_actor_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row record;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if not exists (select 1 from event_organizers where id = p_organizer_id) then
    raise exception using errcode='RR003', message='Organiser not found.';
  end if;
  -- Must be an EVENT store. Assigning an organiser to a marketplace shop would
  -- hand them a shop through the events door.
  if not exists (select 1 from events where store_id = p_store_id) then
    raise exception using errcode='RR005', message='That is not an event.';
  end if;

  insert into event_organizer_assignments (organizer_id, store_id, can_verify_payments, assigned_by)
  values (p_organizer_id, p_store_id, coalesce(p_can_verify_payments,false), auth.uid())
  on conflict on constraint event_organizer_assignments_unique
    do update set can_verify_payments = excluded.can_verify_payments,
                  assigned_by = excluded.assigned_by
  returning * into v_row;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''),'platform_admin'),
          'organizer.assigned', 'event_organizer_assignments', v_row.id::text,
          jsonb_build_object('organizerId', p_organizer_id, 'storeId', p_store_id,
                             'canVerifyPayments', v_row.can_verify_payments));

  return jsonb_build_object('assignmentId', v_row.id, 'canVerifyPayments', v_row.can_verify_payments);
end;
$$;

create or replace function public.admin_unassign_organizer_event(
  p_organizer_id uuid, p_store_id uuid, p_actor_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  delete from event_organizer_assignments
   where organizer_id = p_organizer_id and store_id = p_store_id;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
    values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''),'platform_admin'),
            'organizer.unassigned', 'event_organizers', p_organizer_id::text,
            jsonb_build_object('storeId', p_store_id));
  end if;
  return jsonb_build_object('removed', v_n);
end;
$$;

create or replace function public.admin_set_organizer_status(
  p_organizer_id uuid, p_status text, p_actor_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_before text; v_org record;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if p_status not in ('invited','active','suspended') then
    raise exception using errcode='RR005', message='Unknown status.';
  end if;

  select status into v_before from event_organizers where id = p_organizer_id;
  if v_before is null then
    raise exception using errcode='RR003', message='Organiser not found.';
  end if;

  update event_organizers set status = p_status where id = p_organizer_id
  returning * into v_org;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''),'platform_admin'),
          'organizer.status_changed', 'event_organizers', p_organizer_id::text,
          jsonb_build_object('before', v_before, 'after', p_status));

  return jsonb_build_object('organizerId', p_organizer_id, 'status', v_org.status);
end;
$$;

revoke all on function public.admin_invite_organizer(text,text,text,boolean,text,text) from public, anon;
revoke all on function public.admin_assign_organizer_event(uuid,uuid,boolean,text) from public, anon;
revoke all on function public.admin_unassign_organizer_event(uuid,uuid,text) from public, anon;
revoke all on function public.admin_set_organizer_status(uuid,text,text) from public, anon;
grant execute on function public.admin_invite_organizer(text,text,text,boolean,text,text) to authenticated, service_role;
grant execute on function public.admin_assign_organizer_event(uuid,uuid,boolean,text) to authenticated, service_role;
grant execute on function public.admin_unassign_organizer_event(uuid,uuid,text) to authenticated, service_role;
grant execute on function public.admin_set_organizer_status(uuid,text,text) to authenticated, service_role;

-- Admin read model: the roster with assignment counts, one query.
create or replace function public.admin_list_organizers()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'email', o.invite_email, 'name', o.display_name,
      'phone', o.contact_phone, 'status', o.status, 'isTest', o.is_test,
      'claimed', o.user_id is not null, 'notes', o.notes, 'createdAt', o.created_at,
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'storeId', a.store_id, 'name', s.name, 'slug', s.slug,
          'startsAt', e.starts_at, 'canVerifyPayments', a.can_verify_payments)
          order by e.starts_at)
        from event_organizer_assignments a
        join stores s on s.id = a.store_id
        join events e on e.store_id = a.store_id
        where a.organizer_id = o.id), '[]'::jsonb))
      order by o.created_at desc)
    from event_organizers o), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_organizers() from public, anon;
grant execute on function public.admin_list_organizers() to authenticated, service_role;

-- ── 8. Post-conditions ──────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_tables where tablename='event_organizers')
     or not exists (select 1 from pg_tables where tablename='event_organizer_assignments') then
    raise exception 'M43: organiser tables missing'; end if;

  -- No client role may write organiser identity or assignments.
  if has_table_privilege('authenticated','event_organizers','INSERT')
     or has_table_privilege('authenticated','event_organizers','UPDATE')
     or has_table_privilege('authenticated','event_organizer_assignments','INSERT')
     or has_table_privilege('authenticated','event_organizer_assignments','UPDATE') then
    raise exception 'M43: a client role can write organiser data'; end if;
  if has_table_privilege('anon','event_organizers','SELECT')
     or has_table_privilege('anon','event_organizer_assignments','SELECT') then
    raise exception 'M43: anon can read organiser data'; end if;

  -- Tickets must still be unwritable by clients (M35).
  if has_table_privilege('authenticated','tickets','UPDATE') then
    raise exception 'M43: tickets became writable'; end if;

  -- The predicate must be safe on an unknown store rather than erroring.
  if can_manage_event('00000000-0000-0000-0000-000000000000') then
    raise exception 'M43: can_manage_event returned true for an unknown store'; end if;

  -- Checkout untouched.
  if position('for update of v' in
       (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='create_order')) = 0 then
    raise exception 'M43: the stock row lock vanished from create_order'; end if;
end;
$$;
