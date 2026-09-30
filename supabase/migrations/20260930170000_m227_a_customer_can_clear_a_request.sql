-- ── M227: A CUSTOMER CAN CLEAR A REQUEST FROM THEIR OWN LIST ────────────────
--
-- Owner: "let users clear/hide their own past requests. Admin must keep 100%
-- of all records forever (soft delete only)."
--
-- ── A MARKER TABLE, NOT A COLUMN — AND WHY ──────────────────────────────────
-- The obvious shape is `delivery_requests.user_hidden_at`. It is wrong here:
-- delivery_requests carries an UNCONDITIONAL set_updated_at trigger, so
-- stamping any column bumps updated_at — and archive_old_delivery_requests()
-- (M193) reads updated_at as "last activity". Clearing a finished job would
-- restart its 30-day archive clock, and anything sorted by recency would jump.
--
-- A marker row beside the request touches nothing about the request. The admin
-- board, the tracker URL, the driver's history and the money all read the
-- untouched row; only my_delivery_requests() looks at the marker. "Undo"
-- deletes the MARKER, never a request. No request is ever deleted.
--
-- ── WHAT CANNOT BE CLEARED ──────────────────────────────────────────────────
-- A job that is going to happen: a delivery that is created, being re-matched
-- to a new driver, or has a driver on it. Hiding that would take the tracker
-- and the driver's call button away from the person waiting at the door.
-- Everything else can be cleared — open requests, finished ones, and the ones
-- a human is sorting out (requires_admin, driver_unavailable/unresponsive):
-- staff still see those on the board, whatever the customer's list shows.
-- lib/delivery/clear.ts holds the same list for the UI; a test keeps the two
-- in step.

create table if not exists public.delivery_request_hidden (
  request_id uuid primary key references public.delivery_requests(id) on delete cascade,
  hidden_at  timestamptz not null default now(),
  -- auth.uid() for a signed-in customer; null for a guest, who proved
  -- ownership with the request's email instead.
  hidden_by  uuid
);

-- Only the SECURITY DEFINER functions below touch it: RLS on, no policies,
-- no grants. Nothing reads it through PostgREST directly.
alter table public.delivery_request_hidden enable row level security;
revoke all on table public.delivery_request_hidden from public, anon, authenticated;

create or replace function public.set_delivery_request_hidden(p_id uuid, p_hidden boolean, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_customer uuid;
  v_guest    text;
begin
  select r.customer_id, r.guest_email
    into v_customer, v_guest
    from delivery_requests r
   where r.id = p_id;

  -- One answer for "no such request" and "not yours": which one it was is not
  -- the caller's business.
  if not found or not (
       (auth.uid() is not null and v_customer = auth.uid())
    or (v_customer is null and p_email is not null
        and lower(btrim(v_guest)) = lower(btrim(p_email)))
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not p_hidden then
    delete from delivery_request_hidden where request_id = p_id;
    return jsonb_build_object('ok', true, 'hidden', false);
  end if;

  if exists (
    select 1 from deliveries d
     where d.request_id = p_id
       and d.status in ('created', 'searching_driver', 'assigned', 'going_to_pickup',
                        'arrived_at_pickup', 'picked_up', 'out_for_delivery', 'arrived')
  ) then
    return jsonb_build_object('ok', false, 'error', 'in_progress');
  end if;

  insert into delivery_request_hidden (request_id, hidden_by)
  values (p_id, auth.uid())
  on conflict (request_id) do nothing;

  return jsonb_build_object('ok', true, 'hidden', true);
end;
$function$;

revoke all on function public.set_delivery_request_hidden(uuid, boolean, text) from public;
grant execute on function public.set_delivery_request_hidden(uuid, boolean, text) to anon, authenticated;

-- The ids a signed-in customer has cleared, so a copy of one remembered on
-- ANOTHER device (lib/delivery/my-requests.ts) does not bring it back.
create or replace function public.my_hidden_delivery_requests()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(h.request_id), '[]'::jsonb)
    from delivery_request_hidden h
    join delivery_requests r on r.id = h.request_id
   where auth.uid() is not null
     and r.customer_id = auth.uid();
$function$;

revoke all on function public.my_hidden_delivery_requests() from public;
-- Supabase's default privileges grant anon EXECUTE explicitly, so revoking
-- from public alone left it callable (verified with has_function_privilege).
revoke execute on function public.my_hidden_delivery_requests() from anon;
grant execute on function public.my_hidden_delivery_requests() to authenticated;

-- ── And the customer's list stops showing them ──────────────────────────────
-- Rebuilt from pg_get_functiondef() (the deployed body is the truth), with one
-- line added: the not-exists on the marker.
create or replace function public.my_delivery_requests()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'kind', r.kind,
           'what', r.what,
           'status', r.status,
           'pickupText', r.pickup_text,
           'dropoffText', r.dropoff_text,
           'createdAt', r.created_at,
           'expiresAt', r.expires_at,
           'scheduleKind', r.schedule_kind,
           'timeSlot', r.time_slot,
           'windowStart', r.window_start,
           'windowEnd', r.window_end,
           'deliveryStatus', (select d.status from deliveries d
                               where d.request_id = r.id
                               order by d.created_at desc limit 1),
           'quoteCount', (select count(*) from delivery_quotes q
                           where q.request_id = r.id and q.status = 'offered'),
           'bestQuote', (select min(q.fee) from delivery_quotes q
                          where q.request_id = r.id and q.status = 'offered'))
         order by greatest(r.window_start, now()) asc, r.created_at desc), '[]'::jsonb)
    from delivery_requests r
   where auth.uid() is not null
     and r.customer_id = auth.uid()
     and r.archived_at is null
     and not exists (select 1 from delivery_request_hidden h where h.request_id = r.id);
$function$;
