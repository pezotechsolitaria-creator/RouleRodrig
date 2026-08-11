-- M51 — Web push, so a driver learns about a job without staring at the page.
--
-- WHY NOT WHATSAPP. CallMeBot needs each recipient to activate a personal key
-- by messaging a number from their own handset, and it is a hobby service with
-- undocumented rate limits. Fine for one owner, wrong as the backbone a
-- driver's income depends on. WHY NOT SMS: real money per message, forever.
-- Web push is free, unlimited, and delivered by the browser vendor even when
-- the phone is locked and the app is closed.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- The endpoint IS the identity of a subscription: the browser hands back the
  -- same URL when the same install re-subscribes, so this is what makes
  -- re-enabling alerts idempotent instead of piling up duplicate rows.
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- A dead endpoint is deleted on 404/410 rather than counted, but transient
  -- failures shouldn't resurrect a subscription that never works.
  fail_count   int not null default 0
);

create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A subscription is a person's own device. They may register and remove their
-- own; nobody may read anyone else's (the endpoint is a send-anything capability).
drop policy if exists push_subs_own_select on public.push_subscriptions;
create policy push_subs_own_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_subs_own_insert on public.push_subscriptions;
create policy push_subs_own_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_subs_own_delete on public.push_subscriptions;
create policy push_subs_own_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Who should be woken for this delivery: every driver holding a live offer.
-- Service-role only. An endpoint is a bearer capability to push arbitrary
-- notifications to someone's phone, so `authenticated` must never call this.
create or replace function public.driver_push_targets(p_delivery_id uuid)
returns table (endpoint text, p256dh text, auth text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_offers o
    join delivery_drivers d on d.id = o.driver_id
    join push_subscriptions s on s.user_id = d.user_id
   where o.delivery_id = p_delivery_id
     and o.status = 'offered'
     and o.expires_at > now()
     and d.status = 'approved'
     and d.availability = 'available';
$function$;

revoke execute on function public.driver_push_targets(uuid) from public, anon, authenticated;

-- Same idea for a single driver, used once a delivery is assigned (reassigned
-- away, cancelled by admin, escalated) — those go to one person, not the pool.
create or replace function public.driver_push_targets_for_driver(p_driver_id uuid)
returns table (endpoint text, p256dh text, auth text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_drivers d
    join push_subscriptions s on s.user_id = d.user_id
   where d.id = p_driver_id;
$function$;

revoke execute on function public.driver_push_targets_for_driver(uuid) from public, anon, authenticated;

do $$
begin
  -- The whole point of the table is that one person cannot read another's
  -- endpoint. Assert the policies exist rather than trusting the DDL ran.
  if (select count(*) from pg_policies where tablename = 'push_subscriptions') < 3 then
    raise exception 'M51: push_subscriptions RLS policies missing — endpoints would be readable.';
  end if;
  if has_function_privilege('authenticated', 'public.driver_push_targets(uuid)', 'execute') then
    raise exception 'M51: authenticated can call driver_push_targets — that leaks push endpoints.';
  end if;
end;
$$;
