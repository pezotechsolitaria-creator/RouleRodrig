-- ── What can actually be booked here ───────────────────────────────────────
--
-- One question the storefront asks twice — on the shop page and on a single
-- service's page — so it is one function rather than two PostgREST joins that
-- would have to agree with each other about what "bookable" means.
--
-- The definition is the same one create_order and service_slots now use: a
-- variant with a duration. Nothing else on the shelf appears here.
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
         -- A single-variant product is the ordinary case for a trade, and its
         -- variant is usually unnamed: "Full valet", not "Full valet — ".
         case when coalesce(btrim(pv.name), '') = '' then p.name
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
