-- M59b — an organiser can staff their own door.
--
-- Every assigned organiser can do this (the owner's call, 2026-08-11): a door on
-- a small island is staffed by whoever is free that evening, and routing that
-- through platform admin would make the feature useless in practice.
--
-- ── THE TWO ESCALATION PATHS THIS HAS TO CLOSE ──────────────────────────────
-- 1. An organiser must not be able to mint another ORGANISER. organizer_add_
--    door_staff() hard-codes role='door_staff'; there is no role parameter to
--    pass, so the escalation is not "checked for", it is unrepresentable. Only
--    platform admin creates organizer assignments.
-- 2. An organiser must not be able to remove a peer. organizer_revoke_staff()
--    deletes only rows with role='door_staff'. Removing an organiser stays an
--    admin action, so a falling-out between two organisers cannot end with one
--    locking the other out of their own event mid-sale.
--
-- Door staff themselves reach none of this: every function here is gated by
-- can_manage_event(), which M59 narrowed to exclude them.
--
-- Accounts are the EXISTING ones. A door staffer is an event_organizers row with
-- role='door_staff' on their assignment, claimed by the same
-- claim_organizer_invite() flow on first sign-in. No second auth system.

create or replace function public.organizer_add_door_staff(
  p_store_id uuid,
  p_email    text,
  p_name     text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_email text; v_name text; v_org record; v_assignment uuid;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  v_name  := btrim(coalesce(p_name, ''));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode='RR005', message='Enter a valid email address.';
  end if;
  if v_name = '' then
    raise exception using errcode='RR005', message='Give this person a name so the list means something.';
  end if;

  -- Reuse the person if they already exist — someone may work the door at two
  -- events, or already be an organiser elsewhere. A second row for the same
  -- human would fragment their access and break claim_organizer_invite, which
  -- matches on email.
  select * into v_org from event_organizers where lower(invite_email) = v_email;
  if v_org.id is null then
    insert into event_organizers (invite_email, display_name, status, created_by)
    values (v_email, v_name, 'invited', auth.uid())
    returning * into v_org;
  end if;

  if v_org.status = 'suspended' then
    raise exception using errcode='RR004',
      message='That person is suspended platform-wide and cannot be given access.';
  end if;

  -- Already on this event? Report it rather than silently duplicating or,
  -- worse, DOWNGRADING an organiser to door staff.
  select a.id into v_assignment
    from event_organizer_assignments a
   where a.organizer_id = v_org.id and a.store_id = p_store_id;
  if v_assignment is not null then
    raise exception using errcode='RR004',
      message='That person already has access to this event.';
  end if;

  -- role is a literal. There is no parameter that could make this 'organizer'.
  insert into event_organizer_assignments (organizer_id, store_id, role, can_verify_payments, assigned_by)
  values (v_org.id, p_store_id, 'door_staff', false, auth.uid())
  returning id into v_assignment;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'event_organizer', 'event.door_staff_added',
          'event_organizer_assignments', v_assignment::text,
          jsonb_build_object('storeId', p_store_id, 'email', v_email, 'role', 'door_staff'));

  return jsonb_build_object(
    'assignmentId', v_assignment,
    'organizerId', v_org.id,
    'email', v_email,
    'name', coalesce(nullif(v_org.display_name,''), v_name),
    'status', v_org.status,
    'role', 'door_staff');
end;
$function$;

revoke all on function public.organizer_add_door_staff(uuid, text, text) from public, anon;
grant execute on function public.organizer_add_door_staff(uuid, text, text) to authenticated, service_role;

create or replace function public.organizer_revoke_staff(
  p_store_id uuid,
  p_assignment_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_row record;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  -- Scoped to THIS store AND to door staff only. An organiser cannot reach into
  -- another event by id, and cannot remove a fellow organiser.
  delete from event_organizer_assignments a
   where a.id = p_assignment_id
     and a.store_id = p_store_id
     and a.role = 'door_staff'
  returning * into v_row;

  if v_row.id is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'event_organizer', 'event.door_staff_revoked',
          'event_organizer_assignments', p_assignment_id::text,
          jsonb_build_object('storeId', p_store_id, 'organizerId', v_row.organizer_id));

  return jsonb_build_object('revoked', true);
end;
$function$;

revoke all on function public.organizer_revoke_staff(uuid, uuid) from public, anon;
grant execute on function public.organizer_revoke_staff(uuid, uuid) to authenticated, service_role;

-- Who can get into this event, and how. No money, no customer data — this is an
-- access list, and an access list that also leaked revenue would be a reason not
-- to open it.
create or replace function public.organizer_event_staff(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'assignmentId', a.id,
             'name',  o.display_name,
             'email', o.invite_email,
             'role',  a.role,
             -- 'invited' until they sign in and claim it; 'active' after.
             'status', o.status,
             'hasSignedIn', o.user_id is not null,
             'canVerifyPayments', a.can_verify_payments,
             'assignedAt', a.assigned_at)
           order by a.role, o.display_name)
    from event_organizer_assignments a
    join event_organizers o on o.id = a.organizer_id
   where a.store_id = p_store_id), '[]'::jsonb);
end;
$function$;

revoke all on function public.organizer_event_staff(uuid) from public, anon;
grant execute on function public.organizer_event_staff(uuid) to authenticated, service_role;

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='organizer_add_door_staff';
  -- The literal is the guarantee. If a role parameter ever appears here, the
  -- escalation becomes representable and this assertion should stop it.
  if position('''door_staff''' in v_src) = 0 then
    raise exception 'M59b: add_door_staff no longer hard-codes the role.'; end if;
  if position('p_role' in v_src) > 0 then
    raise exception 'M59b: add_door_staff gained a role parameter — an organiser could mint an organiser.'; end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='organizer_revoke_staff';
  if position('a.role = ''door_staff''' in v_src) = 0 then
    raise exception 'M59b: revoke is not restricted to door staff — an organiser could remove a peer.'; end if;
  if position('a.store_id = p_store_id' in v_src) = 0 then
    raise exception 'M59b: revoke is not scoped to the store — IDOR across events.'; end if;
end;
$$;
