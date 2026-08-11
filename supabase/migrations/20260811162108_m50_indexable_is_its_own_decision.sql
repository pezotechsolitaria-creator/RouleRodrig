-- ── M50 — "may Google see it" is its own decision ──────────────────────────
--
-- M48/M49 established that a fixture shop can need to be VISIBLE (the owner is
-- testing an unlaunched marketplace on the live site) while never being
-- INDEXABLE. M49 expressed the second half as `slug not like 'zz-test-%'`,
-- which is the same hand-written pattern M33 rejected — and it was already
-- proved wrong twice in one day:
--
--   * "M4 Test Shop" (m4-test-shop-…) — an M4 leftover the pattern misses.
--   * "Ti Kitchen (DEMO)" (ti-kitchen-demo) — a food-platform demo from a
--     parallel session, which reached the LIVE sitemap and would have been
--     submitted to Google as a real Rodrigues restaurant.
--
-- Guessing the next fixture's name is not a control. This gives the decision a
-- column of its own, so a shop is excluded because somebody marked it, not
-- because it happened to match a string.
--
-- Deliberately SEPARATE from is_test, which a parallel session defined as
-- "never visible, whatever the status". Collapsing the two is what broke the
-- seed shops earlier in the day:
--
--   is_test    → not a real business AND must not render        (hidden)
--   no_index   → may render, must never reach a search engine   (visible)

alter table stores add column if not exists no_index boolean not null default false;

comment on column stores.no_index is
  'Keeps a shop out of sitemap.xml while leaving it fully visible on the site. For fixtures and demos that must behave like real shops during pre-launch testing but must never be submitted to a search engine — a crawled URL outlives the row that produced it. Distinct from is_test, which hides a shop outright (M50).';

create index if not exists stores_no_index_idx on stores (no_index) where no_index;

-- Mark today's known fixtures explicitly, replacing the slug guesswork.
update stores set no_index = true
where no_index = false
  and (slug like 'zz-test-%' or slug like 'm4-test-shop-%' or slug = 'ti-kitchen-demo');

create or replace function sitemap_stores()
returns table (slug text, updated_at timestamptz)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select s.slug, s.updated_at
  from stores s
  where not s.is_test          -- hidden entirely; never listable
    and not s.no_index         -- visible, but deliberately unindexed
    -- M42: an event store is not a shop. The directory already hides these;
    -- the sitemap must agree, or it advertises a page /shop will not list.
    and not exists (select 1 from events ev where ev.store_id = s.id)
  order by s.updated_at desc nulls last
  limit 5000;
$$;

comment on function sitemap_stores is
  'Shops that belong in sitemap.xml: RLS-visible (active + approved merchant), not a test fixture (is_test), not deliberately unindexed (no_index), and not an event store. Kept in SQL so the sitemap cannot drift from the rules the directory enforces (M48/M49/M50).';

grant execute on function sitemap_stores() to anon, authenticated;

-- ── Post-conditions ────────────────────────────────────────────────────────
do $$
declare v_visible int; v_leak int;
begin
  -- The seed shops must still be VISIBLE — that regression must not return.
  select count(*) into v_visible
  from stores s where s.slug like 'zz-test-%' and store_is_visible(s.id);
  if v_visible <> 3 then
    raise exception 'M50: expected 3 visible seed shops, found %', v_visible; end if;

  -- Nothing marked no_index may be indexable...
  select count(*) into v_leak
  from sitemap_stores() ss join stores s on s.slug = ss.slug where s.no_index;
  if v_leak > 0 then raise exception 'M50: % no_index shop(s) leaked into the sitemap', v_leak; end if;

  -- ...and specifically none of the three fixtures known today.
  select count(*) into v_leak from sitemap_stores()
  where slug like 'zz-test-%' or slug like 'm4-test-shop-%' or slug = 'ti-kitchen-demo';
  if v_leak > 0 then raise exception 'M50: % known fixture(s) leaked into the sitemap', v_leak; end if;

  -- A real shop must still be listable, or this has quietly emptied the sitemap.
  if (select count(*) from stores s
      where not s.is_test and not s.no_index and store_is_visible(s.id)) > 0
     and (select count(*) from sitemap_stores()) = 0 then
    raise exception 'M50: listable shops exist but sitemap_stores returned none';
  end if;
end $$;
