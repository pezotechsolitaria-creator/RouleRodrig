-- ── M48b — one honest source for which shops belong in sitemap.xml ─────────
--
-- Numbered m48 alongside 20260811151838_m48_test_stores_never_public.sql: a
-- parallel session built the is_test column minutes earlier for the same class
-- of problem, so `add column if not exists` here is a genuine no-op and the two
-- migrations are complementary rather than competing. That one owns visibility;
-- this one owns indexing.
--
-- The problem this fixes: app/sitemap.ts filtered shops with
-- `slug not like 'zz-test-%'`. That is exactly the control M33 rejected for
-- orders — "a hand-written pattern that might match a real customer" — and it
-- had already failed, because "M4 Test Shop" (slug m4-test-shop-ffa411a9) is a
-- leftover fixture the pattern does not match.
--
-- Separately, the sitemap queried `stores` directly, so it did not inherit
-- M42's rule that an event store is not a shop. An activated event would have
-- been advertised in sitemap.xml while deliberately hidden from /shop — the
-- sitemap promising a page the directory refuses to list.

alter table stores add column if not exists is_test boolean not null default false;

comment on column stores.is_test is
  'Marks a shop created for testing. NEVER set by merchant onboarding — a real shop is the default and a fixture must be marked on purpose. Exists so cleanup and the sitemap can target test data by predicate instead of by a slug pattern that will eventually be wrong (M48, same control as orders.is_test in M33).';

create index if not exists stores_is_test_idx on stores (is_test) where is_test;

update stores set is_test = true
where is_test = false
  and (slug like 'zz-test-%' or slug like 'm4-test-shop-%');

-- SECURITY INVOKER on purpose (the default): it runs as the caller, so RLS
-- decides visibility exactly as it does for the store page itself. A draft,
-- paused or unapproved shop is invisible here for the same reason it 404s. The
-- function then removes what a crawler specifically must not see.
create or replace function sitemap_stores()
returns table (slug text, updated_at timestamptz)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select s.slug, s.updated_at
  from stores s
  where not s.is_test
    and not exists (select 1 from events ev where ev.store_id = s.id)
  order by s.updated_at desc nulls last
  limit 5000;
$$;

comment on function sitemap_stores is
  'Shops that belong in sitemap.xml: RLS-visible (active + approved merchant), not a test fixture, and not an event store. Kept in SQL so the sitemap cannot drift from the rules the directory enforces (M48).';

grant execute on function sitemap_stores() to anon, authenticated;

-- ── Post-conditions ────────────────────────────────────────────────────────
do $$
declare
  v_marked int;
  v_leak int;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='stores' and column_name='is_test') then
    raise exception 'M48: stores.is_test missing'; end if;

  select count(*) into v_marked from stores where is_test;
  if v_marked < 4 then
    raise exception 'M48: expected the 4 known fixtures marked, found %', v_marked; end if;

  select count(*) into v_leak
  from sitemap_stores() ss join stores s on s.slug = ss.slug
  where s.is_test;
  if v_leak > 0 then raise exception 'M48: % test shop(s) leaked into sitemap_stores', v_leak; end if;

  select count(*) into v_leak
  from sitemap_stores() ss join stores s on s.slug = ss.slug
  where exists (select 1 from events ev where ev.store_id = s.id);
  if v_leak > 0 then raise exception 'M48: % event store(s) leaked into sitemap_stores', v_leak; end if;

  if (select column_default from information_schema.columns
      where table_schema='public' and table_name='stores' and column_name='is_test') not like 'false%' then
    raise exception 'M48: stores.is_test must default to false'; end if;
end $$;
