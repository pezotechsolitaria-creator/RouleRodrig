-- ── A test event was a one-way door ────────────────────────────────────────
--
-- The owner: "when i click on events it shows lost on the island."
--
-- One of the two events that 404s is his own, "Meunier Rohan". It carries
-- is_test = true, and:
--   · store_is_visible() is false for a test store, so its public page 404s;
--   · admin_publish_event() refuses a test event on purpose;
--   · the Publish button in /admin/events is disabled for it, with no reason
--     given; and
--   · admin_update_event() cannot touch is_test, and nothing else can either.
--
-- So he created an event, it was flagged as a test at creation, and from that
-- moment it could never go live and its link showed a 404 with no explanation.
-- The flag was write-once with no way back.
--
-- This gives it a way back. Deliberately its own function rather than a
-- parameter on admin_update_event: turning a test into a real event is a
-- different kind of act from correcting a venue name, and it should be
-- impossible to do by accident while editing a field next to it.

create or replace function public.admin_set_event_test_flag(
  p_store_id uuid,
  p_is_test  boolean
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_exists boolean; v_status text;
begin
  -- The M25 gate, matching every other admin_* event function. /admin runs as
  -- service_role with auth.uid() NULL, so this passes for it; a signed-in user
  -- who is not a platform admin is refused. See admin_publish_event().
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select true, s.status::text into v_exists, v_status
    from stores s join events e on e.store_id = s.id
   where s.id = p_store_id;
  if v_exists is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  -- Marking a LIVE event as a test would strand it: still status='active', but
  -- store_is_visible() false, so it vanishes from the site while every screen
  -- reports it as published. Unpublish first, deliberately, as its own step.
  if p_is_test and v_status = 'active' then
    raise exception using errcode='RR004',
      message='Unpublish this event before marking it as a test, or it would disappear from the site while still showing as live.';
  end if;

  update stores set is_test = p_is_test where id = p_store_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'event.test_flag', 'stores', p_store_id::text,
          jsonb_build_object('isTest', p_is_test));

  return jsonb_build_object('storeId', p_store_id, 'isTest', p_is_test);
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────
-- The gate above PASSES an anonymous caller (auth.uid() is null), because that
-- is exactly what the /admin cookie session looks like to Postgres. So the
-- revoke IS the security boundary, not a formality — and it must include
-- PUBLIC, which anon and authenticated both inherit from. Missing that is how
-- admin_delete_kitchen briefly shipped callable with the publishable key.
revoke all on function public.admin_set_event_test_flag(uuid, boolean) from public;
revoke all on function public.admin_set_event_test_flag(uuid, boolean) from anon, authenticated;
grant execute on function public.admin_set_event_test_flag(uuid, boolean) to service_role;
