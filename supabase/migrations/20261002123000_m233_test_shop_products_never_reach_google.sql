-- ── M233 · A "(TEST)" SHOP'S PRODUCTS NEVER REACH GOOGLE EITHER ─────────────
--
-- M186 put a second gate on sitemap_stores(): a shop whose name carries a
-- parenthesised "(test)" is a fixture by construction, because the no_index
-- checkbox was missed twice and six TEST URLs reached Google. It gated the
-- STORES. sitemap_products() — the other half of the same sitemap — kept only
-- the no_index flag, so a test shop with the flag forgotten would still publish
-- every one of its product pages. Found by the 1 Oct 2026 architecture audit.
--
-- Same narrow pattern as M186, so "Protest Prints" is untouched. The live
-- sitemap carries no shop URLs today (every visible shop is a fixture and
-- /shop is noindex while empty): this closes the door before a real shop and a
-- test shop are live side by side. Body otherwise unchanged from the live
-- definition (pg_get_functiondef, 2 Oct 2026); signature and grants unchanged.

create or replace function public.sitemap_products()
returns table(store_slug text, product_slug text, updated_at timestamp with time zone)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.slug::text, p.slug::text, greatest(p.updated_at, p.created_at)
  from public.marketplace_stores s
  join public.products p on p.store_id = s.id and p.status = 'active'
  where not coalesce(s.no_index, false)
    -- The second gate, as in sitemap_stores() (M186).
    and coalesce(s.name, '') !~* '\(\s*test\s*\)'
    and exists (select 1 from public.product_variants pv
                 where pv.product_id = p.id and pv.is_active)
  order by 1, 2;
$function$;

do $$
declare
  v_leaked integer;
begin
  select count(*) into v_leaked
  from public.sitemap_products() f
  join public.stores s on s.slug::text = f.store_slug
  where coalesce(s.name, '') ~* '\(\s*test\s*\)';
  if v_leaked > 0 then
    raise exception 'M233: % product(s) of test-named shops still reach the sitemap', v_leaked;
  end if;
end $$;
