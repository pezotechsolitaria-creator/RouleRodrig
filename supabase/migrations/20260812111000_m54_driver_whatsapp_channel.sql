-- M54 — WhatsApp for drivers, alongside web push.
--
-- Web push dies with the browser: cleared data, an iPhone never added to the
-- Home Screen, a driver who declines the permission prompt once and can never
-- be asked again. WhatsApp has none of those failure modes on a phone that is
-- already open all day. Two independent channels means one of them failing is
-- an inconvenience rather than a missed job.
--
-- Each driver brings their own CallMeBot key, activated from their own handset.
-- That is the one-time cost of the free tier, and it is also what makes it
-- safe: nobody can be messaged who has not personally opted in.
--
-- STORAGE. The key is a send-anything credential for that person's WhatsApp,
-- so it lives in its own table with RLS and NO select policy at all — not on
-- delivery_drivers, which drivers legitimately read. Column-level REVOKEs would
-- have been useless here: they are no-ops under an existing table grant, and
-- RLS filters rows, never columns.
create table if not exists public.driver_contact_channels (
  driver_id        uuid primary key references delivery_drivers(id) on delete cascade,
  whatsapp_phone   text,
  whatsapp_api_key text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.driver_contact_channels enable row level security;
-- Deliberately zero policies. RLS with no permissive policy returns no rows to
-- any client role; only the service role (which bypasses RLS) reads this.
revoke all on public.driver_contact_channels from anon, authenticated;

-- A driver sets their own key. Write-only by design: there is no RPC anywhere
-- that hands it back, so a stolen session cannot exfiltrate it.
create or replace function public.set_driver_whatsapp(p_api_key text, p_phone text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_driver uuid;
begin
  select id into v_driver from delivery_drivers where user_id = auth.uid();
  if v_driver is null then
    raise exception using errcode = 'RR081', message = 'You are not registered as a driver.';
  end if;

  -- Empty key means "turn this off", which must actually clear it rather than
  -- storing a blank that later looks configured.
  if coalesce(btrim(p_api_key), '') = '' then
    delete from driver_contact_channels where driver_id = v_driver;
    return;
  end if;

  insert into driver_contact_channels (driver_id, whatsapp_api_key, whatsapp_phone)
  values (v_driver, btrim(p_api_key),
          coalesce(nullif(btrim(coalesce(p_phone, '')), ''),
                   (select phone from delivery_drivers where id = v_driver)))
  on conflict (driver_id) do update
    set whatsapp_api_key = excluded.whatsapp_api_key,
        whatsapp_phone   = excluded.whatsapp_phone,
        updated_at       = now();
end;
$function$;

revoke execute on function public.set_driver_whatsapp(text, text) from public, anon;
grant execute on function public.set_driver_whatsapp(text, text) to authenticated;

-- Whether it is configured — a boolean, never the value.
create or replace function public.driver_whatsapp_configured()
returns boolean
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from driver_contact_channels c
      join delivery_drivers d on d.id = c.driver_id
     where d.user_id = auth.uid()
       and coalesce(c.whatsapp_api_key, '') <> '');
$function$;

revoke execute on function public.driver_whatsapp_configured() from public, anon;
grant execute on function public.driver_whatsapp_configured() to authenticated;

-- Who to message about this delivery. Service-role only, exactly like
-- driver_push_targets: this returns live credentials.
create or replace function public.driver_whatsapp_targets(p_delivery_id uuid)
returns table (phone text, api_key text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_offers o
    join delivery_drivers d on d.id = o.driver_id
    join driver_contact_channels c on c.driver_id = d.id
   where o.delivery_id = p_delivery_id
     and o.status = 'offered'
     and o.expires_at > now()
     and d.status = 'approved'
     and d.availability = 'available'
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> '';
$function$;

revoke execute on function public.driver_whatsapp_targets(uuid) from public, anon, authenticated;

-- One driver, by delivery — used when a job is taken away from whoever holds it.
create or replace function public.driver_whatsapp_target_assigned(p_delivery_id uuid)
returns table (phone text, api_key text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from deliveries dl
    join delivery_drivers d on d.id = dl.driver_id
    join driver_contact_channels c on c.driver_id = d.id
   where dl.id = p_delivery_id
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> '';
$function$;

revoke execute on function public.driver_whatsapp_target_assigned(uuid) from public, anon, authenticated;

-- Same, for push, so a released driver can be told on either channel.
create or replace function public.driver_push_targets_assigned(p_delivery_id uuid)
returns table (endpoint text, p256dh text, auth text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from deliveries dl
    join delivery_drivers d on d.id = dl.driver_id
    join push_subscriptions s on s.user_id = d.user_id
   where dl.id = p_delivery_id;
$function$;

revoke execute on function public.driver_push_targets_assigned(uuid) from public, anon, authenticated;

do $$
declare v_leaked int;
begin
  if has_table_privilege('authenticated', 'public.driver_contact_channels', 'select') then
    raise exception 'M54: authenticated can SELECT driver_contact_channels — WhatsApp keys are exposed.';
  end if;
  if has_function_privilege('authenticated', 'public.driver_whatsapp_targets(uuid)', 'execute') then
    raise exception 'M54: authenticated can read WhatsApp credentials via driver_whatsapp_targets.';
  end if;
  -- No policy on the table is the intended state; a stray permissive policy
  -- would quietly re-expose every key.
  select count(*) into v_leaked from pg_policies where tablename = 'driver_contact_channels';
  if v_leaked <> 0 then
    raise exception 'M54: driver_contact_channels gained % RLS policies — it must have none.', v_leaked;
  end if;
end;
$$;
