-- ── M49 — visible for testing, never indexed ───────────────────────────────
--
-- Fixes a regression introduced minutes earlier in this same session.
--
-- M48 (parallel session) gave is_test the meaning "never visible, whatever the
-- status", and marked only the events fixture. M48b (this session) then marked
-- the three zz-test- seed shops as is_test for an unrelated reason — keeping
-- them out of sitemap.xml. The two meanings collided and all three seed shops
-- disappeared from /shop, which is the exact surface the owner is using to test
-- an unlaunched marketplace.
--
-- The root cause is one flag carrying two unrelated decisions:
--
--   "is not a real business"  → must never reach Google
--   "must not be visible"     → must not render on the site
--
-- Those coincide on a launched site and come apart during a pre-launch testing
-- window, where the owner explicitly needs fake shops that behave exactly like
-- real ones on the live site and will delete them before launch. So visibility
-- goes back to the seed shops, and the indexing rule stops depending on
-- is_test alone.

update stores set is_test = false where slug like 'zz-test-%';

-- The sitemap now refuses a shop on EITHER signal, so a seed shop being visible
-- can never make it indexable. Belt and braces deliberately: this is the one
-- direction where a mistake is expensive and slow to undo, because a URL Google
-- has already crawled outlives the row that produced it.
create or replace function sitemap_stores()
returns table (slug text, updated_at timestamptz)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select s.slug, s.updated_at
  from stores s
  where not s.is_test
    -- The seed fixtures are deliberately VISIBLE right now (see above), so
    -- is_test alone no longer keeps them out. Name them explicitly.
    and s.slug not like 'zz-test-%'
    -- M42: an event store is not a shop. The directory already hides these;
    -- the sitemap must agree, or it advertises a page /shop will not list.
    and not exists (select 1 from events ev where ev.store_id = s.id)
  order by s.updated_at desc nulls last
  limit 5000;
$$;

comment on function sitemap_stores is
  'Shops that belong in sitemap.xml: RLS-visible (active + approved merchant), not a test fixture by flag OR by seed-slug, and not an event store. Kept in SQL so the sitemap cannot drift from the rules the directory enforces (M48/M49).';

grant execute on function sitemap_stores() to anon, authenticated;

-- ── Post-conditions ────────────────────────────────────────────────────────
do $$
declare v_visible int; v_leak int;
begin
  -- The regression must actually be gone: every seeded shop visible again.
  select count(*) into v_visible
  from stores s where s.slug like 'zz-test-%' and store_is_visible(s.id);
  if v_visible <> 3 then
    raise exception 'M49: expected 3 visible seed shops, found %', v_visible; end if;

  -- ...and none of them indexable.
  select count(*) into v_leak from sitemap_stores() where slug like 'zz-test-%';
  if v_leak > 0 then raise exception 'M49: % seed shop(s) leaked into the sitemap', v_leak; end if;

  select count(*) into v_leak
  from sitemap_stores() ss join stores s on s.slug = ss.slug
  where s.is_test or exists (select 1 from events ev where ev.store_id = s.id);
  if v_leak > 0 then raise exception 'M49: % test/event store(s) leaked into the sitemap', v_leak; end if;
end $$;
