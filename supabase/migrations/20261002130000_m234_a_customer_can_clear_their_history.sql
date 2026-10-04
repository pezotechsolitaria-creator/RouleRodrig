-- ── M234 · A CUSTOMER CAN CLEAR THEIR OWN HISTORY; THE ADMIN KEEPS ALL OF IT ─
--
-- The brief: a customer can "clear" past orders, bookings and rides from
-- their own list, and the admin keeps 100% of the records. M227 did this for
-- /deliver requests; this does it for everything else /orders lists.
--
-- ── A MARKER TABLE, NOT A COLUMN (same reasoning as M227) ──────────────────
-- orders carries an unconditional set_updated_at trigger, ride_requests'
-- updated_at drives dispatch pacing (M132) and the no-driver alert keys
-- (no-driver-copy dedupeKeyFor), and bookings' recency feeds the money desk. A
-- user_hidden_at column stamped by a customer would move every one of those
-- clocks. So the hidden RECORD is never written: a row here says "this person
-- does not want to see that item in their list", and nothing else reads it.
--
-- ── WHAT CAN BE CLEARED ─────────────────────────────────────────────────────
-- Only what is FINISHED, and only by its owner:
--   order           orders.customer_id = auth.uid();  collected/cancelled/refunded
--   booking         rentals by the account's email;   cancelled/rejected/expired/
--                   completed, or the end date has passed
--   place_booking   stays/activities by email;        same rule
--   ride            ride_requests by email;           completed/cancelled/no_show,
--                   or no_driver 3h after its pickup (lib/activity.ts grace)
--   service_booking trade appointments by created_by; done/cancelled/no_show,
--                   or 3h after it started
-- Anything live — a held rental, a ride on its way, an order not yet
-- collected — is refused: hiding it would hide something the customer still
-- has to act on.
--
-- Email matching is EXACT (lower = lower), deliberately not the `.ilike` the
-- activity feed uses: in ilike an underscore is a wildcard, so j_doe@… would
-- match jxdoe@….
--
-- ── WHO CAN CALL WHAT ───────────────────────────────────────────────────────
-- The table: RLS on, no policies, no client grants — only these functions and
-- the service role touch it. The two functions: `authenticated` only. Guests
-- have no account list to clear. Revoked from anon BY NAME (default privileges
-- grant it; `revoke … from public` alone does not remove it).

create table if not exists public.customer_hidden_items (
  user_id   uuid        not null references auth.users(id) on delete cascade,
  kind      text        not null check (kind in ('order','booking','place_booking','ride','service_booking')),
  item_id   uuid        not null,
  hidden_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

alter table public.customer_hidden_items enable row level security;
revoke all on table public.customer_hidden_items from public, anon, authenticated;
grant all on table public.customer_hidden_items to service_role;

create or replace function public.set_my_item_hidden(p_kind text, p_id uuid, p_hidden boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid      uuid := auth.uid();
  v_email    text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_found    boolean := false;
  v_finished boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'signed_out');
  end if;
  if p_kind is null or p_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Un-hiding needs no ownership check beyond the marker's own user_id: a
  -- person can only delete their own marker.
  if not coalesce(p_hidden, true) then
    delete from customer_hidden_items where user_id = v_uid and kind = p_kind and item_id = p_id;
    return jsonb_build_object('ok', true, 'hidden', false);
  end if;

  if p_kind = 'order' then
    select true, o.status in ('collected','cancelled','refunded')
      into v_found, v_finished
      from orders o where o.id = p_id and o.customer_id = v_uid;
  elsif p_kind = 'booking' then
    if v_email is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    select true, (b.status in ('cancelled','rejected','expired','completed')
                  or coalesce(b.end_date, b.start_date) < current_date)
      into v_found, v_finished
      from bookings b where b.id = p_id and lower(btrim(b.email)) = v_email;
  elsif p_kind = 'place_booking' then
    if v_email is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    select true, (pb.status in ('cancelled','rejected','expired','completed')
                  or coalesce(pb.end_date, pb.start_date) < current_date)
      into v_found, v_finished
      from place_bookings pb where pb.id = p_id and lower(btrim(pb.email)) = v_email;
  elsif p_kind = 'ride' then
    if v_email is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    select true, (r.status in ('completed','cancelled','no_show')
                  or (r.status = 'no_driver'
                      and coalesce(r.scheduled_at, r.created_at) < now() - interval '3 hours'))
      into v_found, v_finished
      from ride_requests r where r.id = p_id and lower(btrim(r.customer_email)) = v_email;
  elsif p_kind = 'service_booking' then
    select true, (sb.status in ('done','cancelled','no_show')
                  or sb.starts_at < now() - interval '3 hours')
      into v_found, v_finished
      from service_bookings sb where sb.id = p_id and sb.created_by = v_uid;
  else
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- One answer for "not yours" and "does not exist": the difference would
  -- let anyone probe which ids are real.
  if not coalesce(v_found, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not coalesce(v_finished, false) then
    return jsonb_build_object('ok', false, 'reason', 'still_live');
  end if;

  insert into customer_hidden_items (user_id, kind, item_id)
  values (v_uid, p_kind, p_id)
  on conflict (user_id, kind, item_id) do nothing;
  return jsonb_build_object('ok', true, 'hidden', true);
end;
$function$;

create or replace function public.my_hidden_items()
returns table (kind text, item_id uuid, hidden_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select h.kind, h.item_id, h.hidden_at
    from customer_hidden_items h
   where h.user_id = auth.uid()
   order by h.hidden_at desc;
$function$;

revoke all on function public.set_my_item_hidden(text, uuid, boolean) from public, anon;
grant execute on function public.set_my_item_hidden(text, uuid, boolean) to authenticated, service_role;
revoke all on function public.my_hidden_items() from public, anon;
grant execute on function public.my_hidden_items() to authenticated, service_role;

do $$
begin
  if has_table_privilege('anon', 'public.customer_hidden_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.customer_hidden_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.customer_hidden_items', 'INSERT') then
    raise exception 'M234: a client role can touch customer_hidden_items directly';
  end if;
  if has_function_privilege('anon', 'public.set_my_item_hidden(text, uuid, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.my_hidden_items()', 'EXECUTE') then
    raise exception 'M234: anon can call the hide functions';
  end if;
  if not has_function_privilege('authenticated', 'public.set_my_item_hidden(text, uuid, boolean)', 'EXECUTE') then
    raise exception 'M234: signed-in customers cannot clear anything';
  end if;
end $$;

notify pgrst, 'reload schema';
