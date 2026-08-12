-- M65 — The schema the notification engine needs.
--
-- Built ON the existing `notifications` table rather than beside it: it already
-- carries recipient_type/recipient_id/type/title/body/data/read_at, already has
-- correct RLS (read own, mark own read), and update_order_status() already
-- writes to it inside the status transaction. Replacing it would have thrown
-- away the one part of this system that was already atomic.
--
-- What it lacked: urgency, a category to filter or mute by, a deep link, and
-- any idempotency key. Without the last one a cron that runs twice writes the
-- notification twice.
--
-- M65b and M65c are folded in below (see their notes) — both were runtime type
-- failures that a clean CREATE hid until the function was actually called.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_priority') then
    create type notification_priority as enum ('low', 'normal', 'high', 'critical');
  end if;
end;
$$;

-- M65b — drivers and admins could not receive an in-app notification AT ALL.
-- notification_recipient was (merchant, customer, organizer). The brief asks for
-- a driver feed and an admin operations centre; neither was expressible. Found
-- by writing the probe, not by reading the schema.
alter type notification_recipient add value if not exists 'driver';
alter type notification_recipient add value if not exists 'admin';

alter table public.notifications
  add column if not exists priority notification_priority not null default 'normal',
  -- Matches lib/notifications/categories.ts. Text rather than an enum so a new
  -- category ships in one deploy instead of a migration plus a deploy.
  add column if not exists category text not null default 'system',
  -- The deep link. A notification that does not land you on the thing it is
  -- about is an interruption, not a notification.
  add column if not exists link text,
  -- Idempotency: a webhook or cron firing twice must produce one row, not two.
  add column if not exists dedupe_key text;

-- Partial unique: rows without a key (legacy, and ad-hoc writes) are unaffected.
create unique index if not exists idx_notifications_dedupe
  on public.notifications(dedupe_key) where dedupe_key is not null;

-- The list query is always "mine, newest first"; the badge is "mine, unread".
create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications(recipient_id) where read_at is null;

-- ── Preferences ────────────────────────────────────────────────────────────
-- Deliberately an OPT-OUT list, not an opt-in map. A row here means "this
-- person muted this category". A category with no row is on.
--
-- That direction matters: with an opt-in map, any category added later would be
-- silently off for every existing user, and nobody would notice until a
-- customer missed an order update. Opt-out fails safe.
create table if not exists public.notification_preferences (
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   text not null,
  -- Per-channel muting: someone may want in-app order updates but no push.
  muted_push boolean not null default false,
  muted_all  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.notification_preferences enable row level security;

drop policy if exists notif_prefs_own on public.notification_preferences;
create policy notif_prefs_own on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── The write path ─────────────────────────────────────────────────────────
-- One function, service-role only. Every in-app notification goes through here
-- so idempotency and preference enforcement cannot be forgotten at a call site.
--
-- M65c — the first version passed p_recipient_type (text) straight into an enum
-- column and raised 42804 on every call, while creating cleanly. Same class of
-- bug as M47b: a type nobody checked until it ran.
create or replace function public.emit_notification(
  p_recipient_id   uuid,
  p_recipient_type text,
  p_type           text,
  p_title          text,
  p_body           text,
  p_category       text default 'system',
  p_priority       text default 'normal',
  p_link           text default null,
  p_dedupe_key     text default null,
  p_order_id       uuid default null,
  p_data           jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid;
begin
  if p_recipient_id is null then return null; end if;

  -- A muted category is skipped — EXCEPT at critical priority. Someone who
  -- muted "payments" still needs to hear that their payment failed; muting is
  -- about noise, not about opting out of consequences.
  if p_priority <> 'critical' and exists (
        select 1 from notification_preferences np
         where np.user_id = p_recipient_id
           and np.category = p_category
           and np.muted_all) then
    return null;
  end if;

  insert into notifications (recipient_id, recipient_type, type, title, body,
                             category, priority, link, dedupe_key, order_id, data)
  values (p_recipient_id, p_recipient_type::notification_recipient, p_type, p_title, p_body,
          p_category, p_priority::notification_priority, p_link, p_dedupe_key,
          p_order_id, coalesce(p_data, '{}'::jsonb))
  -- The idempotency guarantee. A second call with the same key is a no-op that
  -- returns null, so the caller can tell "already sent" from "just sent" and
  -- skip every other channel too.
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  return v_id;
end;
$function$;

revoke execute on function public.emit_notification(uuid, text, text, text, text, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated;

-- Mark everything read in one call. Row by row from the client is a round trip
-- per notification, which on a bad connection is where users give up.
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_n integer;
begin
  if auth.uid() is null then return 0; end if;
  update notifications set read_at = now()
   where recipient_id = auth.uid() and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.emit_notification(uuid, text, text, text, text, text, text, text, text, uuid, jsonb)', 'execute') then
    raise exception 'M65: authenticated can emit notifications — anyone could write to anyone else''s bell.';
  end if;
end;
$$;

-- Verified in a rolled-back transaction: a duplicate emit returns null and
-- leaves exactly one row; a muted category suppresses `normal` but NOT
-- `critical`; the new `driver` recipient type works; another signed-in user
-- sees zero of those rows under a real `authenticated` role.
