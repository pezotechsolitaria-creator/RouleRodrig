-- ── The sitemap was advertising a page that 404s ───────────────────────────
--
-- Found by reading the live sitemap after adding the product URLs to it:
-- /shop/chez-banane was listed, and Chez Banane is a KITCHEN. /shop/[slug]
-- refuses kitchens (M50, "a kitchen is not a shop"), so the sitemap has been
-- handing Google a dead URL — the precise thing this function's own comment
-- says must never happen. It was written when the same bug was fixed for EVENT
-- stores in M42, and the kitchen case was missed.
--
-- The fix is not another hand-rolled predicate. It reads marketplace_stores,
-- the one definition of "a shop the marketplace may show" (M96), so the
-- directory, the product browser and the sitemap cannot disagree again. That
-- view already covers is_test, merchant approval, active status, kitchens and
-- event stores; only no_index is layered on here, because that flag means
-- "visible on the site, deliberately kept out of Google" — a sitemap question
-- rather than a visibility one.
--
-- Stays SECURITY INVOKER, so stores' own RLS still decides what a caller sees.
create or replace function public.sitemap_stores()
returns table(slug text, updated_at timestamptz)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select s.slug::text, s.updated_at
  from public.marketplace_stores s
  where not coalesce(s.no_index, false)
  order by s.updated_at desc nulls last
  limit 5000;
$$;

-- Post-condition: no kitchen and no event box office may appear in the shop
-- sitemap. Cheaper to assert here than to notice in Search Console months on.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from public.sitemap_stores() sm
  join public.stores s on s.slug::text = sm.slug
  where exists (select 1 from public.food_kitchens fk where fk.store_id = s.id)
     or exists (select 1 from public.events ev where ev.store_id = s.id);
  if v_bad > 0 then
    raise exception 'sitemap_stores still lists % kitchen/event store(s)', v_bad;
  end if;
end $$;
