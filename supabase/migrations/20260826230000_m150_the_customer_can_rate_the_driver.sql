-- ── M150 — the customer can rate the driver ────────────────────────────────
--
-- driver_metrics.rating_sum and rating_count have existed since the table was
-- created and NOTHING HAS EVER WRITTEN TO THEM. delivery_request_view has been
-- returning a driver's rating on every quote card, computed from those columns,
-- so it could only ever be null. The same shape as photo_url: a column waiting
-- for a writer that was never built.
--
-- That matters more here than it looks. This is a reverse auction — the whole
-- customer decision is "which of these prices do I trust" — and until now the
-- only signals were the price itself and a count of completed jobs. A rating is
-- the one thing that distinguishes a cheap driver who is good from a cheap
-- driver who is cheap for a reason.
--
-- ── Three rules worth stating ──────────────────────────────────────────────
-- ONE review per delivery. The delivery is the thing being reviewed and it is
-- also the proof the reviewer was there.
--
-- ONLY AFTER IT ARRIVED. A rating before delivery is a rating of an
-- expectation, and it would let somebody punish a driver who is still on their
-- way.
--
-- RECOMPUTED, never incremented. An edited review would double-count under +=,
-- and a deleted one would never come back out. recompute_driver_rating reads
-- the table, so it is idempotent and cannot drift.

create table if not exists public.driver_reviews (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references deliveries(id) on delete cascade,
  driver_id uuid not null references delivery_drivers(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  guest_email text,
  rating integer not null check (rating between 1 and 5),
  body text check (body is null or btrim(body) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_reviews_driver_idx on public.driver_reviews (driver_id, created_at desc);

alter table public.driver_reviews enable row level security;

-- RLS on with ZERO policies, on purpose: anon and authenticated reach Postgres
-- through PostgREST where RLS applies, so the table is unreadable and
-- unwritable except through the SECURITY DEFINER functions below, each of which
-- checks who is asking.

create or replace function public.recompute_driver_rating(p_driver_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  update driver_metrics m
     set rating_sum = coalesce(r.total, 0),
         rating_count = coalesce(r.n, 0),
         updated_at = now()
    from (select sum(rating) as total, count(*) as n
            from driver_reviews where driver_id = p_driver_id) r
   where m.driver_id = p_driver_id;
$fn$;

create or replace function public.rate_delivery_driver(
  p_request_id uuid,
  p_rating integer,
  p_body text default null,
  p_email text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_r     delivery_requests%rowtype;
  v_d     deliveries%rowtype;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose between 1 and 5 stars.' using errcode = 'P0001';
  end if;

  select * into v_r from delivery_requests where id = p_request_id;
  if not found then return false; end if;

  -- The same ownership rule as delivery_request_view, and the same silence:
  -- false for both "no such request" and "not yours".
  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return false; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return false; end if;
  end if;

  select * into v_d from deliveries where request_id = v_r.id;
  if not found or v_d.driver_id is null then
    raise exception 'There is no driver to rate on this one yet.' using errcode = 'P0001';
  end if;
  if v_d.status <> 'delivered' then
    raise exception 'You can rate your driver once the delivery is done.' using errcode = 'P0001';
  end if;

  insert into driver_reviews (delivery_id, driver_id, customer_id, guest_email, rating, body)
  values (v_d.id, v_d.driver_id, v_r.customer_id, v_r.guest_email,
          p_rating, nullif(btrim(coalesce(p_body, '')), ''))
  on conflict (delivery_id) do update
    set rating = excluded.rating,
        body = excluded.body,
        updated_at = now();

  perform recompute_driver_rating(v_d.driver_id);
  return true;
end;
$fn$;

create or replace function public.delivery_rating_state(p_request_id uuid, p_email text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_r     delivery_requests%rowtype;
  v_d     deliveries%rowtype;
  v_rev   driver_reviews%rowtype;
begin
  select * into v_r from delivery_requests where id = p_request_id;
  if not found then return null; end if;

  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return null; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return null; end if;
  end if;

  select * into v_d from deliveries where request_id = v_r.id;
  if not found then return jsonb_build_object('canRate', false, 'rating', null); end if;
  select * into v_rev from driver_reviews where delivery_id = v_d.id;

  return jsonb_build_object(
    'canRate', v_d.status = 'delivered' and v_d.driver_id is not null,
    'rating', v_rev.rating,
    'body', v_rev.body);
end;
$fn$;

revoke all on function public.recompute_driver_rating(uuid) from public, anon, authenticated;
revoke all on function public.rate_delivery_driver(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.delivery_rating_state(uuid, text) from public, anon, authenticated;
grant execute on function public.rate_delivery_driver(uuid, integer, text, text) to authenticated;
grant execute on function public.delivery_rating_state(uuid, text) to authenticated;

do $assert$
begin
  if has_function_privilege('anon','public.rate_delivery_driver(uuid, integer, text, text)','execute') then
    raise exception 'M150: rating is reachable by anon';
  end if;
  if has_function_privilege('anon','public.recompute_driver_rating(uuid)','execute')
     or has_function_privilege('authenticated','public.recompute_driver_rating(uuid)','execute') then
    raise exception 'M150: the recompute is reachable by a client role';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='driver_reviews') <> 0 then
    raise exception 'M150: driver_reviews has an RLS policy; it should be reachable only through the RPCs';
  end if;
  if rate_delivery_driver(gen_random_uuid(), 5, null, 'nobody@example.com') then
    raise exception 'M150: rated a delivery that does not exist';
  end if;
  if delivery_rating_state(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M150: invented a rating state';
  end if;
end;
$assert$;
