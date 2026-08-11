-- M59 — scan-only door staff.
--
-- ── WHY A ROLE ON THE ASSIGNMENT, AND NOT A NEW TABLE ───────────────────────
-- The question "may this person touch this event" is already answered in one
-- place: event_organizer_assignments, read live by can_manage_event(). A second
-- table would mean two places to ask, and the failure mode of two places is
-- that one of them is forgotten — which is exactly how the four is_store_staff()
-- gaps in M49 happened. So door staff are an assignment with a different ROLE.
--
-- ── THE DANGER THIS MIGRATION HAS TO AVOID ──────────────────────────────────
-- can_manage_event() currently means "assigned and active", full stop. Adding a
-- row to that table therefore grants, today:
--   organizer_event_detail          (bank details, customer emails, revenue)
--   organizer_set_capacity          (change the venue size)
--   organizer_set_payment_settings  (change where money goes)
--   upsert_ticket_package / set_ticket_package_active (prices, capacity)
--   redeem_ticket                   (the door — the ONLY one door staff want)
--   RLS on events, ticket_types, tickets, and merchant-media writes
-- Adding door staff without narrowing that predicate would hand a gate scanner
-- the organiser's bank account. So can_manage_event() is narrowed to
-- role='organizer' in the SAME migration that introduces the role, and the door
-- gets its own predicate.
--
-- DEFAULT 'organizer' is the regression guarantee: every existing assignment
-- keeps precisely the access it had, and the narrowed predicate is a no-op for
-- them.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_assignment_role') then
    create type event_assignment_role as enum ('organizer', 'door_staff');
  end if;
end;
$$;

alter table event_organizer_assignments
  add column if not exists role event_assignment_role not null default 'organizer';

comment on column event_organizer_assignments.role is
  'organizer = full event management. door_staff = scan tickets at the door, nothing else. Narrowed by can_manage_event(); widened by can_scan_event().';

-- ── The three predicates, stated together so the difference is readable ─────

-- FULL MANAGEMENT. Now excludes door staff.
create or replace function public.can_manage_event(p_store_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select is_platform_admin() or exists (
    select 1 from event_organizer_assignments a
      join event_organizers o on o.id = a.organizer_id
     where a.store_id = p_store_id and o.user_id = auth.uid()
       and o.status = 'active' and a.role = 'organizer');
$function$;

-- THE DOOR. Organisers keep it (they run their own door on a small island);
-- door staff have this and nothing else.
create or replace function public.can_scan_event(p_store_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select is_platform_admin() or exists (
    select 1 from event_organizer_assignments a
      join event_organizers o on o.id = a.organizer_id
     where a.store_id = p_store_id and o.user_id = auth.uid()
       and o.status = 'active' and a.role in ('organizer', 'door_staff'));
$function$;

revoke all on function public.can_scan_event(uuid) from public, anon;
grant execute on function public.can_scan_event(uuid) to authenticated, service_role;

-- MONEY. Belt and braces: the role check is redundant beside can_verify_payments
-- (door staff are never granted that flag) but it means a future mistake needs
-- to be made twice before a scanner can confirm a payment.
create or replace function public.can_verify_event_payments(p_store_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select is_platform_admin() or exists (
    select 1 from event_organizer_assignments a
      join event_organizers o on o.id = a.organizer_id
     where a.store_id = p_store_id and o.user_id = auth.uid()
       and o.status = 'active' and a.role = 'organizer' and a.can_verify_payments);
$function$;

-- ── The door itself now asks the door question ──────────────────────────────
-- Only the gate changes; the row lock, the outcomes and the refusals are M56's
-- and are reproduced verbatim.
create or replace function public.redeem_ticket(p_public_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_t        record;
  v_event    record;
  v_outcome  text;
  v_paid     boolean;
begin
  if auth.uid() is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select t.id, t.store_id, t.state, t.used_at, t.serial, t.order_id,
         t.holder_name, t.ticket_type_name, t.event_name, t.event_starts_at,
         t.void_reason
    into v_t
    from tickets t
   where t.public_id = p_public_id
   for update;

  -- can_scan_event, not can_manage_event: this is the one thing door staff do.
  if v_t.id is null or not can_scan_event(v_t.store_id) then
    raise exception using errcode='RR003', message='Not a ticket for this event.';
  end if;

  select e.cancelled_at, e.starts_at, e.doors_open_at, e.timezone
    into v_event from events e where e.store_id = v_t.store_id;

  -- A ticket only exists once an order is paid (orders_sync_tickets), but say
  -- it out loud rather than relying on that: the door needs "not paid" as a
  -- distinct answer from "invalid", and an unpaid ticket must never be admitted.
  select o.status in ('paid','preparing','ready_for_pickup','collected')
    into v_paid from orders o where o.id = v_t.order_id;

  if v_t.state = 'void' then
    v_outcome := 'void';
  elsif not coalesce(v_paid, false) then
    v_outcome := 'not_paid';
  elsif v_t.state = 'used' then
    v_outcome := 'already_used';
  else
    update tickets set state = 'used', used_at = now() where id = v_t.id
      returning used_at into v_t.used_at;
    v_outcome := 'admitted';
  end if;

  return jsonb_build_object(
    'outcome',       v_outcome,
    'serial',        v_t.serial,
    'ticketType',    v_t.ticket_type_name,
    'holderName',    v_t.holder_name,
    'eventName',     v_t.event_name,
    'eventStartsAt', v_t.event_starts_at,
    'usedAt',        v_t.used_at,
    'voidReason',    v_t.void_reason,
    'eventCancelled', v_event.cancelled_at is not null,
    'earlyByHours',  case
                       when v_event.starts_at is null then null
                       else greatest(0, floor(extract(epoch from (v_event.starts_at - now())) / 3600))::int
                     end);
end;
$function$;

revoke all on function public.redeem_ticket(uuid) from public, anon;
grant execute on function public.redeem_ticket(uuid) to authenticated, service_role;

-- ── What a scanner is allowed to know ───────────────────────────────────────
-- Deliberately NOT organizer_event_detail, which carries bank details, customer
-- emails, receipt paths and revenue. A door needs a name and whether the event
-- is cancelled. Anything more is data a gate scanner has no reason to hold.
create or replace function public.scanner_my_events()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'storeId',   s.id,
             'slug',      s.slug,
             'name',      s.name,
             'startsAt',  e.starts_at,
             'venueName', e.venue_name,
             'cancelledAt', e.cancelled_at,
             'phase',     event_phase(s.id),
             'role',      a.role)
           order by e.starts_at)
    from event_organizer_assignments a
    join event_organizers o on o.id = a.organizer_id
    join stores s on s.id = a.store_id
    join events e on e.store_id = s.id
   where o.user_id = auth.uid() and o.status = 'active'), '[]'::jsonb);
end;
$function$;

revoke all on function public.scanner_my_events() from public, anon;
grant execute on function public.scanner_my_events() to authenticated, service_role;

create or replace function public.scanner_event_context(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare v_store uuid; v_out jsonb;
begin
  select s.id into v_store from stores s where s.slug = p_slug;
  -- Unknown slug and forbidden slug are the same answer, as everywhere else.
  if v_store is null or not can_scan_event(v_store) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select jsonb_build_object(
           'storeId', s.id, 'slug', s.slug, 'name', s.name,
           'startsAt', e.starts_at, 'venueName', e.venue_name,
           'cancelledAt', e.cancelled_at,
           -- So the UI can hide management links from door staff without
           -- guessing, and without a second round trip.
           'canManage', can_manage_event(s.id))
    into v_out
    from stores s join events e on e.store_id = s.id
   where s.id = v_store;
  return v_out;
end;
$function$;

revoke all on function public.scanner_event_context(text) from public, anon;
grant execute on function public.scanner_event_context(text) to authenticated, service_role;

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_manage_event';
  if position('a.role = ''organizer''' in v_src) = 0 then
    raise exception 'M59: can_manage_event was not narrowed — door staff would inherit full management.'; end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redeem_ticket';
  if position('can_scan_event' in v_src) = 0 then
    raise exception 'M59: redeem_ticket still asks the management question.'; end if;
  if position('for update' in v_src) = 0 then
    raise exception 'M59: redeem_ticket lost its row lock.'; end if;
end;
$$;
