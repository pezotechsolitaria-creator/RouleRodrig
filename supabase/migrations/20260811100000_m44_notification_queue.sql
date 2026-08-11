-- M44 — The notification queue and its WhatsApp recipient slots.
--
-- WHY A QUEUE AT ALL
-- Today a notification is a side effect INSIDE the request that caused it:
-- /api/merchant/orders/[id] awaits dispatchNotification() in a try/catch and
-- swallows the failure. That is honest but lossy — if Brevo blinks, the customer
-- is simply never told their order is ready, and nothing remembers to try again.
-- It also couples the business transaction to a third party's uptime.
--
-- This makes the notification a ROW. Business code enqueues and returns; a
-- worker drains. If the messenger is down the job waits, it does not evaporate.
--
-- SUPABASE IS THE BRAIN, CALLMEBOT IS THE MESSENGER.
-- Nothing in this file lets a message decide anything. Who is eligible, who
-- accepted, whether a payment cleared — all of that stays in the database.
-- CallMeBot receives a finished string and delivers it, and if it disappears
-- entirely the platform keeps working with pending rows.
--
-- DYNAMIC SLOTS, NOT HARDCODED NUMBERS
-- The owner must be able to add "Driver Manager" or "Emergency Contact" from
-- the admin dashboard forever, without a deploy. So a recipient is a row with
-- its own credential and its own category subscriptions, and fan-out is a query
-- rather than a constant.

-- ── Categories ──────────────────────────────────────────────────────────────
-- A closed set, checked in the database. Free-text categories would silently
-- mis-route: a typo'd 'delivery' would match no slot and the message would
-- vanish with every job row claiming success.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_category') then
    create type notification_category as enum (
      'deliveries', 'rentals', 'ticketing', 'payments', 'bookings', 'system', 'admin'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_job_status') then
    create type notification_job_status as enum ('pending', 'sending', 'sent', 'failed', 'cancelled');
  end if;
end;
$$;

-- ── Recipient slots ─────────────────────────────────────────────────────────
create table if not exists notification_slots (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  role            text,
  -- E.164, normalised by the app before it lands here.
  phone           text not null check (phone ~ '^\+[1-9][0-9]{6,15}$'),
  -- The CallMeBot API key. NEVER granted to a client role — see the lockdown
  -- and the post-condition at the bottom. Same posture as
  -- qr_pickup_tokens.code (M28) and store bank details (M8).
  api_key         text,
  is_active       boolean not null default true,
  -- Empty array = every category. Explicit and readable, and it means a new
  -- category does not silently stop reaching the main admin.
  categories      notification_category[] not null default '{}',
  last_success_at timestamptz,
  last_error      text,
  last_error_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One slot per number: two rows for the same phone means duplicate messages
  -- for every event, which reads as spam and trains people to ignore alerts.
  constraint notification_slots_phone_key unique (phone)
);

create index if not exists notification_slots_active_idx on notification_slots (is_active) where is_active;

drop trigger if exists t_notification_slots_updated on notification_slots;
create trigger t_notification_slots_updated before update on notification_slots
  for each row execute function set_updated_at();

comment on table notification_slots is
  'Dynamic WhatsApp recipients. The owner adds, edits, tests, disables and deletes these from /admin/notifications with no deploy — that is the whole point of the table (M43).';
comment on column notification_slots.api_key is
  'CallMeBot credential. NEVER in a client grant: it leaves the database only through the service-role worker. A leaked key lets a stranger send WhatsApp messages as this number (M43).';
comment on column notification_slots.categories is
  'Which categories this slot receives. EMPTY MEANS ALL — so a newly added category still reaches the main admin instead of silently going nowhere.';

-- ── Jobs ────────────────────────────────────────────────────────────────────
create table if not exists notification_jobs (
  id                 uuid primary key default gen_random_uuid(),
  channel            text not null default 'whatsapp',
  -- Machine event name, e.g. 'delivery.offered', 'order.placed'.
  type               text not null check (btrim(type) <> ''),
  category           notification_category not null,
  slot_id            uuid references notification_slots(id) on delete cascade,
  message            text not null check (btrim(message) <> ''),
  payload            jsonb not null default '{}',
  status             notification_job_status not null default 'pending',
  attempts           integer not null default 0 check (attempts >= 0),
  max_attempts       integer not null default 5 check (max_attempts >= 1),
  scheduled_at       timestamptz not null default now(),
  sent_at            timestamptz,
  error              text,
  related_order_id   uuid,
  related_booking_id uuid,
  -- Idempotency. A retried cron, a double-submitted form or an at-least-once
  -- caller must not produce two WhatsApp messages for one real-world event.
  dedupe_key         text,
  created_at         timestamptz not null default now(),
  constraint notification_jobs_sent_shape check ((status = 'sent') = (sent_at is not null))
);

create unique index if not exists notification_jobs_dedupe_key
  on notification_jobs (dedupe_key) where dedupe_key is not null;
-- The worker's only query: oldest due job first.
create index if not exists notification_jobs_due_idx
  on notification_jobs (scheduled_at) where status = 'pending';
create index if not exists notification_jobs_slot_idx on notification_jobs (slot_id, created_at desc);
create index if not exists notification_jobs_order_idx on notification_jobs (related_order_id)
  where related_order_id is not null;

comment on table notification_jobs is
  'One row per message we intend to send. Business code enqueues and returns immediately; the cron worker drains. A messenger outage leaves rows pending rather than losing the notification (M43).';
comment on column notification_jobs.dedupe_key is
  'Unique when present. The idempotency guarantee: an at-least-once caller or a retried cron cannot produce two messages for one event.';

-- ── RLS: deny-all to client roles ───────────────────────────────────────────
-- Both tables are service-role only. RLS on with NO policy is deny-all for anon
-- and authenticated, which is the intent, not an omission (documented so nobody
-- "fixes" the linter warning by opening it up — same note as M22 made for
-- app_secrets and partners).
alter table notification_slots enable row level security;
alter table notification_jobs  enable row level security;

revoke all on notification_slots from anon, authenticated;
revoke all on notification_jobs  from anon, authenticated;

comment on table notification_jobs is
  'Service-role only. RLS enabled with no policy — deny-all for anon and authenticated by design (M43).';

-- ── Enqueue: fan-out to every subscribed slot ───────────────────────────────
-- Returns how many jobs it created, so a caller can log "notified 3 recipients"
-- instead of assuming.
create or replace function public.enqueue_notification(
  p_type        text,
  p_category    notification_category,
  p_message     text,
  p_payload     jsonb default '{}',
  p_dedupe_key  text default null,
  p_order_id    uuid default null,
  p_booking_id  uuid default null
)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count integer := 0;
  v_slot  record;
begin
  if btrim(coalesce(p_message, '')) = '' then
    raise exception using errcode = 'RR070', message = 'A notification needs a message.';
  end if;

  for v_slot in
    select id from notification_slots
     where is_active
       -- Empty categories = subscribed to everything.
       and (cardinality(categories) = 0 or p_category = any (categories))
  loop
    begin
      insert into notification_jobs (type, category, slot_id, message, payload,
                                     dedupe_key, related_order_id, related_booking_id)
      values (p_type, p_category, v_slot.id, p_message, coalesce(p_payload, '{}'::jsonb),
              -- The dedupe key is per SLOT: one real event legitimately produces
              -- one message per recipient, and they must not collide with each
              -- other while still being individually idempotent.
              case when p_dedupe_key is null then null else p_dedupe_key || ':' || v_slot.id::text end,
              p_order_id, p_booking_id);
      v_count := v_count + 1;
    exception when unique_violation then
      -- Already enqueued for this slot. Idempotent by design, not an error.
      null;
    end;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.enqueue_notification(text, notification_category, text, jsonb, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_notification(text, notification_category, text, jsonb, text, uuid, uuid)
  to service_role;

-- ── Claim: the concurrency guarantee ────────────────────────────────────────
-- `for update skip locked` is what makes two workers safe. Without it, two
-- overlapping cron runs both read the same pending rows and the recipient gets
-- every message twice. With it, the second worker steps over rows the first has
-- locked and takes different ones.
create or replace function public.claim_notification_jobs(p_limit integer default 20)
returns table (
  job_id   uuid,
  slot_id  uuid,
  phone    text,
  api_key  text,
  message  text,
  attempts integer,
  max_attempts integer
)
language plpgsql
volatile
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
  select c.id, c.slot_id, s.phone, s.api_key, c.message, c.attempts, c.max_attempts
    from claimed c
    join notification_slots s on s.id = c.slot_id
   where s.is_active;
end;
$function$;

revoke all on function public.claim_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;

comment on function public.claim_notification_jobs(integer) is
  'Atomically claims a batch for one worker using FOR UPDATE SKIP LOCKED. This is what stops two overlapping cron runs from sending every message twice (M43).';

-- ── Complete: record the outcome ────────────────────────────────────────────
create or replace function public.complete_notification_job(
  p_job_id uuid,
  p_ok     boolean,
  p_error  text default null
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_job notification_jobs%rowtype;
begin
  select * into v_job from notification_jobs where id = p_job_id for update;
  if not found then return; end if;

  if p_ok then
    update notification_jobs
       set status = 'sent', sent_at = now(), error = null
     where id = p_job_id;
    update notification_slots
       set last_success_at = now(), last_error = null, last_error_at = null
     where id = v_job.slot_id;
  elsif v_job.attempts >= v_job.max_attempts then
    -- Out of retries. Left as `failed` with the reason attached rather than
    -- deleted: an alert that never arrived is exactly the thing an operator
    -- needs to be able to find afterwards.
    update notification_jobs set status = 'failed', error = p_error where id = p_job_id;
    update notification_slots set last_error = p_error, last_error_at = now()
     where id = v_job.slot_id;
  else
    -- Exponential backoff, capped. 2^n minutes: 2, 4, 8, 16, 32.
    update notification_jobs
       set status = 'pending',
           error = p_error,
           scheduled_at = now() + make_interval(mins => least(power(2, v_job.attempts)::int, 60))
     where id = p_job_id;
    update notification_slots set last_error = p_error, last_error_at = now()
     where id = v_job.slot_id;
  end if;
end;
$function$;

revoke all on function public.complete_notification_job(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_notification_job(uuid, boolean, text) to service_role;

-- A job stuck in `sending` means the worker died mid-flight (a deploy, a
-- timeout). Without this it would sit there forever and the message would never
-- arrive. Reclaimed after 10 minutes, which is far longer than any real send.
create or replace function public.requeue_stuck_notifications()
returns integer
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_count integer;
begin
  with fixed as (
    update notification_jobs
       set status = 'pending', error = 'worker did not finish; requeued'
     where status = 'sending'
       and created_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*) into v_count from fixed;
  return coalesce(v_count, 0);
end;
$function$;

revoke all on function public.requeue_stuck_notifications() from public, anon, authenticated;
grant execute on function public.requeue_stuck_notifications() to service_role;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v_slot uuid;
  v_n    integer;
begin
  -- The credential must be unreachable by every client role. This is the whole
  -- security posture of the feature in one assertion.
  if has_table_privilege('anon', 'public.notification_slots', 'SELECT')
     or has_table_privilege('authenticated', 'public.notification_slots', 'SELECT') then
    raise exception 'M43: a client role can read notification_slots (and therefore api_key).';
  end if;
  if has_table_privilege('anon', 'public.notification_jobs', 'SELECT')
     or has_table_privilege('authenticated', 'public.notification_jobs', 'SELECT') then
    raise exception 'M43: a client role can read notification_jobs.';
  end if;
  if has_function_privilege('authenticated', 'public.claim_notification_jobs(integer)', 'EXECUTE') then
    raise exception 'M43: authenticated can claim notification jobs.';
  end if;

  -- Prove fan-out and idempotency on real rows, then undo.
  insert into notification_slots (name, role, phone, api_key, categories)
  values ('M43 probe', 'probe', '+23000000001', 'probe-key', '{}')
  returning id into v_slot;

  v_n := enqueue_notification('probe.test', 'system', 'probe message', '{}'::jsonb, 'm43-probe');
  if v_n <> 1 then
    raise exception 'M43: fan-out created % jobs, expected 1.', v_n;
  end if;
  -- Same dedupe key again must create nothing.
  v_n := enqueue_notification('probe.test', 'system', 'probe message', '{}'::jsonb, 'm43-probe');
  if v_n <> 0 then
    raise exception 'M43: dedupe failed — a repeat enqueue created % jobs.', v_n;
  end if;

  -- A slot subscribed only to deliveries must not receive a system message.
  update notification_slots set categories = '{deliveries}' where id = v_slot;
  v_n := enqueue_notification('probe.test', 'system', 'probe message 2', '{}'::jsonb, 'm43-probe-2');
  if v_n <> 0 then
    raise exception 'M43: category filtering failed — an unsubscribed slot got % jobs.', v_n;
  end if;

  delete from notification_slots where id = v_slot;  -- jobs cascade
end;
$$;
