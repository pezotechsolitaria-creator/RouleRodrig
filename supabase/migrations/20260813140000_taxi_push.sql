-- ══════════════════════════════════════════════════════════════════════════
-- WEB PUSH FOR DRIVERS WHO HAVE NO ACCOUNT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied as m88_taxi_push_no_accounts and m89_taxi_push_targets_carry_token.
--
-- The owner: "For delivery and taxi make both whatsapp and web push." Delivery
-- already had both. Taxi could not, and the reason was structural rather than
-- missing work: push_subscriptions.user_id is NOT NULL, and a taxi driver has no
-- Supabase user by the owner's own decision.
--
-- But a push subscription is not really a property of a USER — it is a property
-- of a BROWSER. The endpoint the phone hands back IS the address; an account is
-- just how the existing table happens to find it again. So taxi drivers get their
-- own table keyed by driver, and the permanent link proves who is subscribing.
--
-- A separate table rather than a nullable taxi_driver_id on the existing one: a
-- column meaning "user OR driver, never both" is a table with two meanings, and
-- every query against it would have to remember which.
--
-- WHY THIS MATTERS MORE THAN IT SOUNDS: WhatsApp costs a per-driver CallMeBot
-- opt-in the platform cannot perform for them, and until they do it they are
-- unreachable. Push needs one tap on a page they are already looking at.

create table if not exists public.taxi_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.taxi_drivers(id) on delete cascade,
  -- Unique: re-subscribing on the same phone must UPDATE, not accumulate
  -- duplicates that would each receive their own copy of every offer.
  endpoint text not null unique,
  p256dh text not null,
  auth   text not null,
  user_agent text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- A dead endpoint (phone wiped, browser data cleared) starts failing. Counted
  -- so the sender retires it rather than trying forever.
  fail_count integer not null default 0
);
create index if not exists taxi_push_driver_idx on public.taxi_push_subscriptions (driver_id);

alter table public.taxi_push_subscriptions enable row level security;
-- RLS on, no policy, no grant: written through the token functions, read only by
-- the server. A readable table hands out every driver's push endpoint.
revoke all on table public.taxi_push_subscriptions from anon, authenticated;

create or replace function public.register_taxi_push(
  p_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_t taxi_drivers%rowtype;
begin
  if p_token is null or length(p_token) < 32 then return jsonb_build_object('ok', false); end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;
  if coalesce(btrim(p_endpoint),'') = '' or coalesce(btrim(p_p256dh),'') = ''
     or coalesce(btrim(p_auth),'') = '' then return jsonb_build_object('ok', false); end if;

  insert into taxi_push_subscriptions (driver_id, endpoint, p256dh, auth, user_agent)
  values (v_t.id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    -- The endpoint is the identity, so a phone that changed hands moves rows.
    set driver_id = excluded.driver_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now(), fail_count = 0;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.register_taxi_push(text, text, text, text, text) from public;
grant execute on function public.register_taxi_push(text, text, text, text, text) to anon, authenticated, service_role;

create or replace function public.unregister_taxi_push(p_endpoint text)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  -- No token: knowing the endpoint IS knowing the device, and the only thing this
  -- can do is stop that device being messaged. Refusing somebody the ability to
  -- turn notifications off would be the worse failure.
  delete from taxi_push_subscriptions where endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.unregister_taxi_push(text) from public;
grant execute on function public.unregister_taxi_push(text) to anon, authenticated, service_role;

-- Each target carries ITS OWN offer token so the sender pushes per driver and the
-- notification opens that driver's offer with the accept button already on
-- screen. A push landing on the homepage is one they still have to find the job
-- from, and the offer expires in ten minutes.
drop function if exists public.taxi_push_targets(uuid);
create function public.taxi_push_targets(p_request_id uuid)
returns table (endpoint text, p256dh text, auth text, driver_name text, token text)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select s.endpoint, s.p256dh, s.auth, t.name, o.token
    from ride_offers o
    join taxi_drivers t on t.id = o.driver_id
    join taxi_push_subscriptions s on s.driver_id = t.id
   where o.request_id = p_request_id
     and o.status = 'offered' and o.expires_at > now() and t.active
     -- Quiet hours apply to push exactly as to WhatsApp: a notification that
     -- lights a phone at 03:00 is the same intrusion whichever pipe it came down.
     and extract(hour from (now() at time zone 'Indian/Mauritius'))::int
           between t.notify_from_hour and t.notify_to_hour
     and s.fail_count < 5;
$$;
revoke all on function public.taxi_push_targets(uuid) from public;
revoke all on function public.taxi_push_targets(uuid) from anon, authenticated;
grant execute on function public.taxi_push_targets(uuid) to service_role;

-- Subscribed or not, as a boolean. Never returns the endpoint itself.
create or replace function public.taxi_push_readiness()
returns table (driver_id uuid, push_ready boolean)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select t.id, exists (select 1 from taxi_push_subscriptions s
                        where s.driver_id = t.id and s.fail_count < 5)
  from taxi_drivers t;
$$;
revoke all on function public.taxi_push_readiness() from public;
revoke all on function public.taxi_push_readiness() from anon, authenticated;
grant execute on function public.taxi_push_readiness() to service_role;
