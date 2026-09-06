-- ── The half of organiser alerts that was never built ──────────────────────
--
-- M125 built the SEND: organizer_push_targets() resolves organisers through
-- event_organizer_assignments (deliberately not merchant_staff, since an
-- organiser is never staff), pushToOrganizer() wraps it, and
-- lib/notifications/order-placed.ts already calls it on every ticket sale.
--
-- Nothing ever arrived, because there was no way to SUBSCRIBE. No
-- register_organizer_push, no /api/organizer/push, and no control anywhere on
-- /organizer — so organizer_push_targets() resolved to an empty set, and a send
-- to zero targets returns 0 and is indistinguishable from success.
--
-- That is the worst shape a notification can take: fully built, fully wired,
-- verified by its own tests, and silent, with nothing in any log to say so.
--
-- Mirrors register_merchant_push exactly, including the "attached to SOMETHING"
-- check rather than to a named event — targeting resolves the store at send
-- time, so an organiser given a second event is already subscribed for it.
create or replace function public.register_organizer_push(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;

  -- An ACTIVE organiser with at least one assignment. `invited` is deliberately
  -- refused: an unclaimed invitation is not yet a person, and subscribing a
  -- device against one would send somebody else's ticket sales to whoever
  -- happened to be signed in.
  if not exists (
    select 1
      from event_organizers o
      join event_organizer_assignments a on a.organizer_id = o.id
     where o.user_id = v_uid
       and o.status = 'active'
  ) then
    return false;
  end if;

  if coalesce(btrim(p_endpoint), '') = '' then return false; end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (v_uid, btrim(p_endpoint), p_p256dh, p_auth,
          nullif(btrim(coalesce(p_user_agent,'')), ''), now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = coalesce(excluded.user_agent, push_subscriptions.user_agent),
        last_seen_at = now(),
        -- A device that comes back is not a failing device.
        fail_count = 0;
  return true;
end;
$function$;

revoke all on function public.register_organizer_push(text, text, text, text) from public;
grant execute on function public.register_organizer_push(text, text, text, text)
  to anon, authenticated;
