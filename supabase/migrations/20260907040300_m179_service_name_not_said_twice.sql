-- ── "Quick wash — Quick wash" ──────────────────────────────────────────────
--
-- Seen on the storefront the moment it rendered. The rule only collapsed an
-- EMPTY variant name, and the common case is not empty: creating a product
-- gives its first variant the product's own name. So every single-service trade
-- would have read its own name twice, on the one control the page exists for.
create or replace function public.store_bookable_services(p_store_id uuid)
returns table (
  variant_id uuid,
  product_id uuid,
  product_slug text,
  name text,
  price_cents integer,
  minutes integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select pv.id,
         p.id,
         p.slug::text,
         -- Empty, or the same words again: both mean the product name already
         -- says everything, and only a genuinely different variant ("Full
         -- valet — Large car") earns the second half.
         case when coalesce(btrim(pv.name), '') = ''
                or lower(btrim(pv.name)) = lower(btrim(p.name))
              then p.name
              else p.name || ' — ' || pv.name end,
         pv.price,
         sd.minutes
    from service_durations sd
    join product_variants pv on pv.id = sd.variant_id
    join products p on p.id = pv.product_id
   where p.store_id = p_store_id
     and pv.is_active
     and p.status = 'active'
     -- Staff may look at a draft shop's own list; the public may not.
     and (store_is_visible(p_store_id) or is_store_staff(p_store_id) or is_platform_admin())
   order by sd.minutes, p.name;
$function$;

revoke all on function public.store_bookable_services(uuid) from public;
grant execute on function public.store_bookable_services(uuid) to anon, authenticated;

-- The same doubling was in the merchant diary's own service list, built by
-- hand in the API route. Fixed there too — see app/api/merchant/diary/route.ts.
