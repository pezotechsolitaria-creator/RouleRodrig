-- M66 — Know when the worker dies.
--
-- The 60-second notification worker runs on cron-job.org, outside Vercel,
-- because the plan caps this project at two once-daily crons. That external
-- account is the single point of failure in the whole notification system: if
-- it lapses, is paused, or its secret rotates, WhatsApp stops and delivery
-- escalation stops — silently. The owner would find out from an angry customer.
--
-- THE TRAP THIS AVOIDS: the staleness alert must NOT be queued. The queue is
-- drained by the very worker being reported dead, so a queued alert about a
-- dead worker is never delivered. lib/notifications/heartbeat.ts sends inline
-- from the daily Vercel cron — the one message that deliberately bypasses the
-- queue.
create table if not exists public.system_heartbeats (
  name       text primary key,
  last_ok_at timestamptz not null default now(),
  -- Last-alerted, so a worker down for a week produces one message a day
  -- rather than one per check forever.
  alerted_at timestamptz,
  meta       jsonb not null default '{}'::jsonb
);

alter table public.system_heartbeats enable row level security;
-- No policies: service role only. Nothing here is user data.
revoke all on public.system_heartbeats from anon, authenticated;

create or replace function public.record_heartbeat(p_name text, p_meta jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  insert into system_heartbeats (name, last_ok_at, meta)
  values (p_name, now(), coalesce(p_meta, '{}'::jsonb))
  on conflict (name) do update
    set last_ok_at = now(),
        meta = coalesce(excluded.meta, '{}'::jsonb),
        -- A successful beat clears the latch, so recovery re-arms the alarm.
        alerted_at = null;
$function$;

revoke execute on function public.record_heartbeat(text, jsonb) from public, anon, authenticated;

-- Stale AND not already alerted recently. Claims in the same statement, so two
-- concurrent checkers cannot both alert.
create or replace function public.claim_stale_heartbeats(p_stale_minutes int default 15)
returns table (name text, last_ok_at timestamptz, minutes_stale int)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  update system_heartbeats h
     set alerted_at = now()
   where h.last_ok_at < now() - make_interval(mins => p_stale_minutes)
     and (h.alerted_at is null or h.alerted_at < now() - interval '20 hours')
  returning h.name, h.last_ok_at,
            (extract(epoch from (now() - h.last_ok_at)) / 60)::int;
end;
$function$;

revoke execute on function public.claim_stale_heartbeats(int) from public, anon, authenticated;

-- Seed now, so a worker that never starts is detected rather than a missing
-- row silently meaning "nothing to check".
insert into system_heartbeats (name, last_ok_at)
values ('notification_worker', now())
on conflict (name) do nothing;

-- Verified in a rolled-back transaction: fresh = 0 alerts; stale 40 min = 1;
-- same-day recheck = 0 (latched); recovery then stale again = 1 (re-armed).
