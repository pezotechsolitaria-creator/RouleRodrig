-- ── M146 — a driver who quotes and hears nothing stops quoting ─────────────
--
-- accept_delivery_quote() sets every other quote on the request to 'declined',
-- and cancel_delivery_request() does the same when the customer pulls the job.
-- Neither told those drivers anything. Their price simply stopped existing.
--
-- That is how a reverse auction loses its supply side: not through complaints,
-- but through drivers quietly deciding the board is not worth opening. On an
-- island with a handful of delivery drivers, losing two of them to indifference
-- is losing the marketplace.
--
-- Three server-only lookups, mirroring the shape of M137's.
--
-- ── What these deliberately do NOT return ──────────────────────────────────
-- losing_quote_facts() carries `winningFee`, and the message built from it
-- IGNORES that field on purpose (see lib/delivery/request-copy.ts, with a test
-- asserting no price appears). Telling a driver they lost by Rs 30 invites a
-- race to the bottom, and a price war on this island costs every driver on it.
-- The number is exposed only so the owner's own tooling can see it later; the
-- driver is told THAT they lost, never by how much.

create or replace function public.losing_quote_push_targets(p_request_id uuid)
returns table(endpoint text, p256dh text, auth text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_quotes q
    join delivery_drivers d on d.id = q.driver_id
    join push_subscriptions s on s.user_id = d.user_id
   where q.request_id = p_request_id
     and q.status = 'declined';
$fn$;

-- The channel that survives a cleared browser and a declined permission.
create or replace function public.losing_quote_whatsapp_targets(p_request_id uuid)
returns table(phone text, api_key text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_quotes q
    join delivery_drivers d on d.id = q.driver_id
    join driver_contact_channels c on c.driver_id = d.id
   where q.request_id = p_request_id
     and q.status = 'declined'
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> '';
$fn$;

create or replace function public.losing_quote_facts(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select jsonb_build_object(
           'requestId', r.id,
           'what', r.what,
           'pickupText', r.pickup_text,
           'dropoffText', r.dropoff_text,
           'losers', (select count(*) from delivery_quotes q
                       where q.request_id = r.id and q.status = 'declined'),
           -- Present for the owner's tooling. The DRIVER's message never uses
           -- it -- see the header, and the test that enforces it.
           'winningFee', (select q.fee from delivery_quotes q
                           where q.request_id = r.id and q.status = 'accepted'),
           -- The two outcomes need different words: losing to another driver is
           -- ordinary, and a withdrawn request is nobody's fault.
           'outcome', case when r.status = 'cancelled' then 'cancelled' else 'taken' end)
    from delivery_requests r
   where r.id = p_request_id;
$fn$;

revoke all on function public.losing_quote_push_targets(uuid) from public, anon, authenticated;
revoke all on function public.losing_quote_whatsapp_targets(uuid) from public, anon, authenticated;
revoke all on function public.losing_quote_facts(uuid) from public, anon, authenticated;

do $assert$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('losing_quote_push_targets','losing_quote_whatsapp_targets','losing_quote_facts')
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'M146: reachable by a client role: %', v_bad;
  end if;

  -- Each body resolves, and each answers nothing for an id that does not exist
  -- rather than erroring: these sit on paths that have already committed.
  if (select count(*) from losing_quote_push_targets(gen_random_uuid())) <> 0 then
    raise exception 'M146: found push targets for a request that does not exist';
  end if;
  if (select count(*) from losing_quote_whatsapp_targets(gen_random_uuid())) <> 0 then
    raise exception 'M146: found whatsapp targets for a request that does not exist';
  end if;
  if losing_quote_facts(gen_random_uuid()) is not null then
    raise exception 'M146: invented a request';
  end if;
end;
$assert$;
