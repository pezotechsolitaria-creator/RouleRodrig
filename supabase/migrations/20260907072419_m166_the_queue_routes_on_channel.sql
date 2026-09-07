-- ── M166 · THE QUEUE ROUTES ON THE SLOT'S CHANNEL ──────────────────────────
--
-- APPLIED TO PRODUCTION 2026-09-07 as migration 20260907072419.
--
-- Companion to the migration that gave notification_slots its `channel` and
-- `target` columns. That one made a non-WhatsApp recipient EXPRESSIBLE; this
-- one makes it REACHABLE. Written defensively so the two are order-independent
-- and either can be applied first.
--
-- lib/notifications/ntfy.ts had existed, complete and commented, with ZERO
-- callers. Three things stood between it and a working alert, all in SQL:
--
--   1. enqueue_notification never stamped the job's channel, so every job took
--      notification_jobs.channel's default of 'whatsapp' whatever its slot said.
--   2. claim_notification_jobs returned phone and api_key only, so the worker
--      had nothing to route on.
--   3. notification_slots.phone was NOT NULL, so an ntfy slot could not exist.

-- ── 1. A slot only needs the address its channel actually uses ─────────────
alter table public.notification_slots alter column phone drop not null;

-- The reachability rule may already exist under another name from the
-- companion migration. One rule is enough; a second is noise in \d output.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.notification_slots'::regclass
       and conname in ('notification_slots_reachable', 'notification_slots_addressable')
  ) then
    alter table public.notification_slots
      add constraint notification_slots_reachable check (
        (channel = 'whatsapp' and phone is not null)
        or (channel in ('ntfy', 'email') and coalesce(btrim(target), '') <> '')
      );
  end if;
end $$;

-- ── 2. The job remembers which door it is for ──────────────────────────────
-- Stamped at enqueue so the queue and the admin card record what was actually
-- attempted, even if the slot is later re-pointed at another channel.
create or replace function public.enqueue_notification(
  p_type text,
  p_category notification_category,
  p_message text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_order_id uuid default null,
  p_booking_id uuid default null
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count  integer := 0;
  v_slots  integer := 0;
  v_new_id uuid;
  v_ret_id uuid;
  v_slot   record;
begin
  if btrim(coalesce(p_message, '')) = '' then
    raise exception using errcode = 'RR070', message = 'A notification needs a message.';
  end if;

  for v_slot in
    select id, channel from notification_slots
     where is_active
       and (cardinality(categories) = 0 or p_category = any (categories))
  loop
    v_slots  := v_slots + 1;
    v_new_id := gen_random_uuid();

    insert into notification_jobs (id, type, category, channel, slot_id, message, payload,
                                   dedupe_key, related_order_id, related_booking_id)
    values (v_new_id, p_type, p_category, v_slot.channel, v_slot.id, p_message,
            coalesce(p_payload, '{}'::jsonb),
            case when p_dedupe_key is null then null else p_dedupe_key || ':' || v_slot.id::text end,
            p_order_id, p_booking_id)
    -- The arbiter restates the index predicate: notification_jobs_dedupe_key is
    -- PARTIAL (where dedupe_key is not null), so a null-keyed row never
    -- conflicts and always inserts.
    on conflict (dedupe_key) where dedupe_key is not null
    do update set suppressed_count   = notification_jobs.suppressed_count + 1,
                  last_suppressed_at = now()
    returning id into v_ret_id;

    if v_ret_id = v_new_id then
      v_count := v_count + 1;
    end if;
  end loop;

  -- NOT a count. Nobody is subscribed to this category: this message reached
  -- no one, and neither will the next one.
  if v_slots = 0 then
    return -1;
  end if;

  return v_count;
end;
$function$;

-- ── 3. The worker gets what it needs to route ──────────────────────────────
-- RETURNS TABLE changes, so this is a drop and create rather than a replace.
-- One transaction, and the only caller is app/api/cron/notifications.
drop function if exists public.claim_notification_jobs(integer);

create function public.claim_notification_jobs(p_limit integer default 20)
returns table(
  job_id uuid, slot_id uuid, phone text, api_key text, message text,
  attempts integer, max_attempts integer,
  channel text, target text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with claimed as (
    update notification_jobs j
       set status = 'sending', attempts = j.attempts + 1
     where j.id in (
       select j2.id from notification_jobs j2
        where j2.status = 'pending'
          and j2.scheduled_at <= now()
        order by j2.scheduled_at
        limit greatest(1, least(coalesce(p_limit, 20), 100))
        for update skip locked
     )
    returning j.id, j.slot_id, j.message, j.attempts, j.max_attempts
  )
  select c.id, c.slot_id, s.phone, s.api_key, c.message, c.attempts, c.max_attempts,
         -- The SLOT is the authority at SEND time, not the stamp on the job:
         -- re-pointing a slot from WhatsApp to ntfy should take effect on the
         -- next send, not only on jobs enqueued after the change.
         s.channel, s.target
    from claimed c
    join notification_slots s on s.id = c.slot_id
   where s.is_active;
end;
$function$;

revoke all on function public.claim_notification_jobs(integer) from public;
grant execute on function public.claim_notification_jobs(integer) to service_role;

-- ── 4. Prove nothing moved for the recipients that already existed ─────────
do $$
declare v_bad integer;
begin
  select count(*) into v_bad from notification_slots
   where channel = 'whatsapp' and phone is null;
  if v_bad > 0 then
    raise exception 'M166 refused: % WhatsApp slot(s) lost their phone', v_bad;
  end if;

  select count(*) into v_bad from notification_slots where channel is null;
  if v_bad > 0 then
    raise exception 'M166 refused: % slot(s) have a null channel', v_bad;
  end if;
end $$;
