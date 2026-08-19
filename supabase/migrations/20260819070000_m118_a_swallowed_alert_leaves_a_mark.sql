-- ══════════════════════════════════════════════════════════════════════════
-- M118 — a swallowed alert leaves a mark, and "nobody is listening" says so
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE REPORT ────────────────────────────────────────────────────────────
-- "Fix the enqueue_notification silent swallow."
--
-- enqueue_notification loops over the subscribed slots and inserts one job per
-- slot. On a dedupe collision it did:
--
--     exception when unique_violation then
--       null;
--
-- No error, no log line, no row, no counter. The message ceased to exist and
-- the function returned a number that could not say so. That is how M117's
-- second alert — the one saying a driver had disappeared with a customer's
-- goods — was destroyed rather than merely mislabelled.
--
-- ── THE AMBIGUITY UNDERNEATH IT ───────────────────────────────────────────
-- `return 0` meant two opposite things:
--
--   (a) every subscribed slot already had this exact message   -> healthy
--   (b) NO ACTIVE SLOT TAKES THIS CATEGORY                     -> outage
--
-- (b) is not hypothetical. It has already destroyed a real alert in this
-- database:
--
--   app_secrets key='email_alert_state'
--     value = {"reserve:insufficient":"2026-08-11"}
--   notification_jobs: 17 rows, NONE of type 'email.quota.%'
--   notification_slots created_at: 2026-08-11 10:28 and 16:21
--
-- lib/email/alerts.ts burns its once-per-day claim BEFORE enqueueing. On
-- 2026-08-09 06:41 the daily cron raised "TICKETING RESERVE MAY BE TOO SMALL",
-- wrote the claim, and called this function — at a moment when zero
-- notification_slots existed. The loop ran zero times, returned 0 with no
-- error and no log, and the claim was already spent. The alert was never sent
-- and never retried. The burned claim in app_secrets is the only surviving
-- evidence that it was ever raised.
--
-- ── WHY NOT A RICHER RETURN TYPE ──────────────────────────────────────────
-- Returning jsonb would need DROP + CREATE, and DROP discards proacl.
-- Schema `public` carries pg_default_acl rows granting EXECUTE to anon and
-- authenticated, and that default is live rather than theoretical: 84 of 285
-- functions in this schema are anon-callable today. A recreated SECURITY
-- DEFINER enqueue_notification is an unauthenticated endpoint that writes
-- attacker-controlled text into a queue the cron delivers to the owner's two
-- phones — with no rate limit, since p_dedupe_key defaults to null and the
-- partial index only covers non-null keys.
--
-- CREATE OR REPLACE preserves proacl and has no window in which the function
-- does not exist. So the return stays `integer`, and one sentinel below the
-- range a count can occupy carries the missing fact:
--
--     n > 0   queued to n slots
--     0       (a) they already had it — see suppressed_count on the winning row
--     -1      (b) nobody is subscribed to this category
--
-- lib/notifications/queue.ts normalises -1 to 0 before any caller sees it, so
-- the public Promise<number> contract is unchanged and no call site moves.
--
-- ── WHAT DOES NOT CHANGE ──────────────────────────────────────────────────
-- The dedupe. It is WANTED. No time window on notification_jobs_dedupe_key, no
-- status predicate, no re-queue of a key that once landed. A key is still
-- claimed for ever — the only difference is that claiming it a second time now
-- leaves a mark.

-- ── 1 · the mark ───────────────────────────────────────────────────────────
-- Non-volatile defaults, so this is a catalogue write and not a table rewrite.
-- All 17 existing rows read 0 / null, which is correct: nothing before this
-- could have recorded a suppression.
alter table public.notification_jobs
  add column if not exists suppressed_count   integer not null default 0,
  add column if not exists last_suppressed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_jobs'::regclass
                    and conname  = 'notification_jobs_suppressed_count_check') then
    alter table public.notification_jobs
      add constraint notification_jobs_suppressed_count_check check (suppressed_count >= 0);
  end if;
end $$;

-- ── 2 · the function ───────────────────────────────────────────────────────
create or replace function public.enqueue_notification(
  p_type       text,
  p_category   notification_category,
  p_message    text,
  p_payload    jsonb default '{}'::jsonb,
  p_dedupe_key text  default null,
  p_order_id   uuid  default null,
  p_booking_id uuid  default null)
returns integer
language plpgsql security definer set search_path to 'public','pg_temp'
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
    select id from notification_slots
     where is_active
       and (cardinality(categories) = 0 or p_category = any (categories))
  loop
    v_slots  := v_slots + 1;
    -- Minted up front so RETURNING can tell an insert from an update. xmax = 0
    -- also works but reads an internal column; this is documented behaviour.
    v_new_id := gen_random_uuid();

    insert into notification_jobs (id, type, category, slot_id, message, payload,
                                   dedupe_key, related_order_id, related_booking_id)
    values (v_new_id, p_type, p_category, v_slot.id, p_message, coalesce(p_payload, '{}'::jsonb),
            case when p_dedupe_key is null then null else p_dedupe_key || ':' || v_slot.id::text end,
            p_order_id, p_booking_id)
    -- The arbiter must restate the index predicate, because
    -- notification_jobs_dedupe_key is PARTIAL (where dedupe_key is not null).
    -- A null-keyed row cannot satisfy it, so it never conflicts and always
    -- inserts — which probe step (6) exists to prove.
    on conflict (dedupe_key) where dedupe_key is not null
    do update set suppressed_count   = notification_jobs.suppressed_count + 1,
                  last_suppressed_at = now()
    returning id into v_ret_id;

    if v_ret_id = v_new_id then
      v_count := v_count + 1;
    end if;
    -- else: the key was already claimed. THE ROW THAT CLAIMED IT NOW CARRIES
    -- THE COUNT, so a suppression is a record rather than an absence. This
    -- replaces `exception when unique_violation then null`, which is the whole
    -- point of the migration — and it also drops a per-slot subtransaction.
  end loop;

  -- NOT a count. Nobody is subscribed to this category: this message reached
  -- no one, and neither will the next one. Distinct from 0, which means the
  -- recipients already had it.
  if v_slots = 0 then
    return -1;
  end if;

  return v_count;
end;
$function$;

-- ── 3 · verification ───────────────────────────────────────────────────────
-- plpgsql bodies are not resolved until first CALL, so every path is executed
-- here. The whole block is one atomic statement: the probe rows are never
-- visible to the cron worker, and any assertion failure rolls all of it back.
do $$
declare
  v_slot uuid; v_active uuid[]; v_expect integer; v_marked integer; v_n integer;
begin
  -- (1) NO ACTIVE SLOT -> -1. The case that used to be indistinguishable from
  --     a healthy dedupe, and that already destroyed a real quota alert.
  select coalesce(array_agg(id), '{}') into v_active from notification_slots where is_active;
  update notification_slots set is_active = false where id = any(v_active);

  v_n := enqueue_notification('m118.probe', 'system', 'probe with no recipient');
  if v_n <> -1 then
    raise exception 'M118: a message nobody receives returned %, expected -1', v_n;
  end if;
  if exists (select 1 from notification_jobs where type = 'm118.probe') then
    raise exception 'M118: rows were written with no active slot';
  end if;

  update notification_slots set is_active = true where id = any(v_active);

  -- A probe recipient, so this also passes against an empty database.
  insert into notification_slots (name, role, phone, api_key, categories)
  values ('M118 probe', 'probe', '+23000000001', 'probe-key', '{}') returning id into v_slot;

  select count(*) into v_expect from notification_slots
   where is_active and (cardinality(categories) = 0
                        or 'system'::notification_category = any (categories));

  -- (2) fan-out unchanged
  v_n := enqueue_notification('m118.probe','system','probe message','{}'::jsonb,'m118-probe');
  if v_n <> v_expect then
    raise exception 'M118: fan-out created % jobs, expected %', v_n, v_expect;
  end if;

  -- (3) it STILL suppresses — and now says so
  v_n := enqueue_notification('m118.probe','system','probe message','{}'::jsonb,'m118-probe');
  if v_n <> 0 then
    raise exception 'M118: dedupe broke — a repeat enqueue created % jobs', v_n;
  end if;
  select count(*) into v_marked from notification_jobs
   where dedupe_key like 'm118-probe:%' and suppressed_count = 1 and last_suppressed_at is not null;
  if v_marked <> v_expect then
    raise exception 'M118: the swallow is still silent — % of % rows carry a mark', v_marked, v_expect;
  end if;

  -- (4) it COUNTS. This is the number that would have shown M117 in minutes.
  v_n := enqueue_notification('m118.probe','system','probe message','{}'::jsonb,'m118-probe');
  if v_n <> 0 then raise exception 'M118: third enqueue created % jobs', v_n; end if;
  select count(*) into v_marked from notification_jobs
   where dedupe_key like 'm118-probe:%' and suppressed_count = 2;
  if v_marked <> v_expect then
    raise exception 'M118: suppressed_count did not reach 2 on % of % rows', v_marked, v_expect;
  end if;

  -- (5) a NULL dedupe key must still insert every time. The arbiter's one real
  --     risk: a partial index the null row cannot satisfy.
  v_n := enqueue_notification('m118.probe.nokey','system','probe with no key');
  if v_n <> v_expect then
    raise exception 'M118: keyless enqueue created %, expected %', v_n, v_expect;
  end if;
  v_n := enqueue_notification('m118.probe.nokey','system','probe with no key');
  if v_n <> v_expect then
    raise exception 'M118: a second keyless enqueue created %, expected % — it is deduping rows that have no key', v_n, v_expect;
  end if;

  -- (6) the RR070 blank-message guard survived the rewrite
  begin
    perform enqueue_notification('m118.probe', 'system', '   ');
    raise exception 'M118: a blank message was accepted';
  exception when sqlstate 'RR070' then null;
  end;

  -- Cleanup. The probe wrote to the owner's REAL slots too, because both are
  -- catch-all — so dropping the probe slot is not enough. Every row goes.
  delete from notification_jobs where type in ('m118.probe','m118.probe.nokey');
  delete from notification_slots where id = v_slot;

  if exists (select 1 from notification_jobs where type like 'm118.probe%') then
    raise exception 'M118: the probe left rows behind';
  end if;
  if exists (select 1 from notification_slots where name = 'M118 probe') then
    raise exception 'M118: the probe left its slot behind';
  end if;

  raise notice 'M118 verified: a swallowed alert leaves a mark.';
end $$;

-- ── 4 · the ACL, asserted rather than assumed ──────────────────────────────
-- CREATE OR REPLACE preserves proacl, so this is belt-and-braces today. It is
-- also the line that stops an unauthenticated message-injection channel the
-- day somebody does need a DROP. See rr-supabase-default-grants-reach-anon.
do $$
begin
  if has_function_privilege('anon',
       'public.enqueue_notification(text,notification_category,text,jsonb,text,uuid,uuid)','EXECUTE')
  or has_function_privilege('authenticated',
       'public.enqueue_notification(text,notification_category,text,jsonb,text,uuid,uuid)','EXECUTE') then
    raise exception 'M118: enqueue_notification is EXECUTE-able by anon/authenticated. It is SECURITY DEFINER and writes to the owner''s phones.';
  end if;
  if not has_function_privilege('service_role',
       'public.enqueue_notification(text,notification_category,text,jsonb,text,uuid,uuid)','EXECUTE') then
    raise exception 'M118: service_role lost EXECUTE — every notification in the product is dead.';
  end if;
end $$;
