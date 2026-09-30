-- ═══════════════════════════════════════════════════════════════════════════
-- M224 · THE eSIM STORE GOES BEYOND MAURITIUS — MAURITIUS STAYS FIRST
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Owner, 30 Sep 2026: "mainly for Mauritius and Rodrigues but allows other
-- countries". M223 had one shelf (region = 'mauritius'). A plan is not tied to
-- one country — a global plan is a good buy for France AND South Africa AND
-- Mauritius — so shelves become LISTINGS: (destination, plan) pairs, each with
-- its own badge and order.
--
--   esim_listings            which plans a destination's page offers
--   public_esim_listing()    that shelf, public columns only
--   public_esim_destinations() the destinations that have a shelf at all
--
-- THE RODRIGUES RULE MOVES WITH IT: a listing for MU is only ever shown if the
-- plan covers Rodrigues (my.t or Emtel). It lives in the read function, so no
-- page can forget it. Other destinations are bound by margin, not network.
--
-- public_esim_plans(region) from M223 is left in place (the previous
-- deployment reads it until this one is live); nothing new calls it.

alter table public.esim_plans
  add column if not exists networks_by_country jsonb not null default '{}'::jsonb;

create table if not exists public.esim_listings (
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  plan_id       uuid not null references public.esim_plans(id) on delete cascade,
  badge         text check (badge is null or badge in ('popular','best_value','short_trip','long_stay')),
  sort_order    integer not null default 100,
  -- Chosen by lib/esim/curate.ts rather than by the owner. A re-curation only
  -- ever replaces AUTO listings; a listing the owner made is his.
  auto          boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (country_code, plan_id)
);

create index if not exists esim_listings_plan_idx on public.esim_listings (plan_id);

alter table public.esim_listings enable row level security;
revoke all on public.esim_listings from anon, authenticated;
grant select, insert, update, delete on public.esim_listings to service_role;

alter table public.esim_orders add column if not exists destination text
  check (destination is null or destination ~ '^[A-Z]{2}$');

-- ── The Mauritius shelf becomes listings ─────────────────────────────────────
insert into public.esim_listings (country_code, plan_id, badge, sort_order, auto)
select 'MU', p.id, p.badge, p.sort_order, false
  from public.esim_plans p
 where p.region = 'mauritius' and p.active
on conflict do nothing;

update public.esim_orders set destination = 'MU' where destination is null;

-- ── One destination's shelf ──────────────────────────────────────────────────
create or replace function public.public_esim_listing(p_country text)
returns table (
  id uuid, name text, country_codes text[], data_mb integer, per_day boolean,
  validity_days integer, networks jsonb, hotspot boolean, topup_supported boolean,
  fup_policy text, ip_export text, retail_eur_cents integer, badge text, sort_order integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.name, p.country_codes, p.data_mb, p.per_day, p.validity_days,
         -- The networks IN THIS COUNTRY: that is what the page names.
         coalesce(
           nullif(p.networks_by_country -> upper(p_country), '[]'::jsonb),
           case when upper(p_country) = 'MU' then p.networks end,
           '[]'::jsonb
         ),
         p.hotspot, p.topup_supported, p.fup_policy, p.ip_export,
         p.retail_eur_cents, l.badge, l.sort_order
    from public.esim_listings l
    join public.esim_plans p on p.id = l.plan_id
   where l.country_code = upper(p_country)
     and p.active and p.available
     and upper(p_country) = any (p.country_codes)
     and (upper(p_country) <> 'MU' or p.covers_rodrigues)
   order by l.sort_order, p.retail_eur_cents;
$$;

-- ── Which destinations have a shelf ──────────────────────────────────────────
create or replace function public.public_esim_destinations()
returns table (country_code text, plans integer, from_eur_cents integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.country_code, count(*)::integer, min(p.retail_eur_cents)::integer
    from public.esim_listings l
    join public.esim_plans p on p.id = l.plan_id
   where p.active and p.available
     and l.country_code = any (p.country_codes)
     and (l.country_code <> 'MU' or p.covers_rodrigues)
   group by l.country_code;
$$;

revoke all on function public.public_esim_listing(text) from public;
revoke all on function public.public_esim_destinations() from public;
grant execute on function public.public_esim_listing(text) to anon, authenticated, service_role;
grant execute on function public.public_esim_destinations() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.esim_listings'::regclass),
    'esim_listings must have RLS enabled';
  assert not has_table_privilege('anon', 'public.esim_listings', 'SELECT'),
    'anon must not read esim_listings directly';
  assert (select count(*) from public.esim_listings where country_code = 'MU') >= 1,
    'the Mauritius shelf must carry over';
end $$;
