-- ── M96 · The marketplace learns to show PRODUCTS ───────────────────────────
--
-- ⚠ PARTLY SUPERSEDED by 20260814020000_m96b, which runs after this and wins.
-- Still current here: the marketplace_stores view, the search_synonyms table
-- and its seed, marketplace_search_terms() and sitemap_products().
-- Replaced there: browse_products() (it built the card shape inline, and
-- computed every facet from one shared set — which made /shop/c/honey offer a
-- seller filter with no honey behind it) and marketplace_home() (it could not
-- say that a shop was not selling). Read m96b for the versions that run.
--
-- Until now /shop could only answer "which shops exist". browse_stores() is a
-- good function and it stays, but it answers the wrong question: nobody wakes
-- up wanting to browse businesses. They want honey. To buy honey on this
-- platform you first had to guess which shop sells it, which is the single
-- reason the marketplace reads as a directory rather than as a place to buy.
--
-- Food already solved this for itself (browse_food, M50): dish-first, kitchen
-- as metadata. The marketplace is NOT food and does not get the same answer —
-- here the seller is part of the purchase decision, so every row this returns
-- carries its shop's identity, rating and fulfilment alongside the product.
--
-- ── THE ONE RULE THIS FILE MUST NOT BREAK ──────────────────────────────────
-- These are SECURITY DEFINER functions, so they bypass RLS. A browse function
-- that is more permissive than RLS is a data leak with a friendly interface.
-- Every product returned here therefore passes store_is_visible() — the SAME
-- predicate products_public_read uses — plus the two exclusions the directory
-- already makes: a kitchen is not a shop (M50) and an event is not a shop
-- (M42). That predicate lives in ONE place, the marketplace_stores view, so
-- the directory, the product browser and the sitemap cannot drift apart.

-- ── 1. What counts as a marketplace shop ────────────────────────────────────
-- security_invoker so that reading the view directly (from anon, from a page
-- query) still applies stores' own RLS. Inside a SECURITY DEFINER function the
-- caller is the function owner and RLS is bypassed — which is exactly why the
-- WHERE clause below repeats the visibility rule rather than relying on it.
create or replace view public.marketplace_stores
with (security_invoker = on) as
  select s.*
  from public.stores s
  where public.store_is_visible(s.id)
    and not exists (select 1 from public.food_kitchens fk where fk.store_id = s.id)
    and not exists (select 1 from public.events ev where ev.store_id = s.id);

comment on view public.marketplace_stores is
  'The single definition of "a shop the marketplace may show". Active, approved, '
  'not a test fixture, not a kitchen, not an event box office. Every marketplace '
  'browse/sitemap path reads this so they cannot disagree.';

grant select on public.marketplace_stores to anon, authenticated;

-- ── 2. Search that survives a bilingual island ──────────────────────────────
-- The catalogue is named in French and Creole ("Miel de Rodrigues", "Piment
-- confit", "Vannerie") and searched in English by tourists. products.search_vector
-- is generated from name + brand + description in the 'simple' config, so it
-- does no stemming and knows no translations: "honey" matches nothing at all.
--
-- Data, not code: the owner meets a word the site does not know far more often
-- than a developer does, so this is a table an admin can extend, seeded with
-- the terms the island actually uses. Pairs are stored in BOTH directions —
-- expansion is a lookup, not a graph walk.
create table if not exists public.search_synonyms (
  term       text not null,
  alias      text not null,
  created_at timestamptz not null default now(),
  primary key (term, alias)
);

alter table public.search_synonyms enable row level security;

drop policy if exists search_synonyms_public_read on public.search_synonyms;
create policy search_synonyms_public_read on public.search_synonyms
  for select using (true);

drop policy if exists search_synonyms_admin_write on public.search_synonyms;
create policy search_synonyms_admin_write on public.search_synonyms
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.search_synonyms to anon, authenticated;

insert into public.search_synonyms (term, alias)
select lower(a), lower(b)
from (values
  ('honey','miel'), ('honey','dimiel'), ('honey','miel de rodrigues'),
  ('chilli','piment'), ('chili','piment'), ('pepper','piment'), ('hot sauce','piment'),
  ('basket','vannerie'), ('basket','panier'), ('weaving','vannerie'), ('wicker','vannerie'),
  ('craft','artisanat'), ('handmade','artisanat'), ('crafts','artisanat'),
  ('octopus','ourite'), ('squid','ourite'),
  ('lemon','citron'), ('lime','citron'),
  ('jam','confiture'), ('preserve','confiture'),
  ('coconut','coco'), ('coconut','koko'),
  ('soap','savon'),
  ('spice','epice'), ('spice','épice'), ('spices','epice'),
  ('salt','sel'), ('sea salt','sel'),
  ('vanilla','vanille'),
  ('fish','poisson'), ('seafood','poisson'),
  ('gift','cadeau'), ('souvenir','cadeau'), ('souvenir','souvenirs'),
  ('bag','sac'), ('hat','chapeau'),
  ('vegetable','legume'), ('vegetables','legume'), ('veg','legume'),
  ('fruit','fruits'),
  ('embroidery','broderie'),
  ('rum','rhum'),
  ('coffee','cafe'), ('coffee','café'),
  ('tea','the'), ('tea','thé')
) as pairs(a, b)
on conflict do nothing;

-- The mirror image, so "miel" also finds "honey".
insert into public.search_synonyms (term, alias)
select s.alias, s.term from public.search_synonyms s
on conflict do nothing;

-- ── 3. One query in, every word worth matching out ──────────────────────────
create or replace function public.marketplace_search_terms(p_q text)
returns text[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with words as (
    -- Punctuation out, so "piment," and "piment" are one word. Words shorter
    -- than two characters are noise that would match half the catalogue.
    select distinct w
    from unnest(regexp_split_to_array(lower(coalesce(p_q, '')), '[^[:alnum:]éèêàçôûîï]+')) w
    where length(w) >= 2
  ),
  expanded as (
    select w as term from words
    union
    select s.alias from words join public.search_synonyms s on s.term = words.w
  )
  select coalesce(array_agg(distinct term), '{}'::text[]) from expanded;
$$;

comment on function public.marketplace_search_terms(text) is
  'Query words plus their island synonyms. "honey" also searches "miel"/"dimiel".';

revoke all on function public.marketplace_search_terms(text) from public;
grant execute on function public.marketplace_search_terms(text) to anon, authenticated, service_role;

-- ── 4. browse_products() ────────────────────────────────────────────────────
-- The product browser. Shape mirrors browse_stores() deliberately: one jsonb
-- payload, total for pagination, and the facet counts the filter UI needs — so
-- a page render is ONE round trip, not a query per filter chip.
create or replace function public.browse_products(
  p_q           text    default null,
  p_category    text    default null,
  p_fulfillment text    default null,
  p_seller      text    default null,
  p_min_price   integer default null,
  p_max_price   integer default null,
  p_in_stock    boolean default false,
  p_open_now    boolean default false,
  p_sort        text    default 'recommended',
  p_limit       integer default 24,
  p_offset      integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_limit  int;
  v_offset int;
  v_sort   text;
  v_ful    text;
  v_terms  text[];
  v_out    jsonb;
begin
  v_limit  := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_sort   := lower(coalesce(nullif(btrim(p_sort), ''), 'recommended'));
  if v_sort not in ('recommended', 'newest', 'price_asc', 'price_desc', 'rating', 'name') then
    v_sort := 'recommended';
  end if;

  v_ful := lower(nullif(btrim(coalesce(p_fulfillment, '')), ''));
  if v_ful is not null and v_ful not in ('rr_delivery', 'own_delivery', 'pickup') then
    v_ful := null;
  end if;

  v_terms := public.marketplace_search_terms(p_q);
  if array_length(v_terms, 1) is null then v_terms := null; end if;

  with base as (
    select
      p.id,
      p.slug::text                                  as slug,
      p.name,
      p.brand,
      p.description,
      p.created_at,
      s.id                                          as store_id,
      s.slug::text                                  as store_slug,
      s.name                                        as store_name,
      s.logo_url                                    as store_logo,
      s.address                                     as store_address,
      s.rating_avg                                  as store_rating_avg,
      s.rating_count                                as store_rating_count,
      (s.featured and (s.featured_until is null or s.featured_until > now())) as store_featured,
      c.slug::text                                  as category_slug,
      c.name                                        as category_name,
      c.icon                                        as category_icon,
      coalesce(ps.offers_rr_delivery, true)         as offers_rr_delivery,
      coalesce(ps.offers_pickup, true)              as offers_pickup,
      coalesce(ps.offers_customer_delivery, true)   as offers_customer_delivery,
      public.store_subscription_active(s.id)        as accepting_orders,
      sch.is_open,
      sch.has_schedule,
      v.variant_count,
      v.in_stock_count,
      v.min_price,
      v.max_price,
      v.compare_at,
      v.stock_total,
      v.only_variant_id,
      v.only_variant_price,
      v.only_variant_stock,
      v.unit,
      m.image_url,
      m.image_count,
      r.rating_avg,
      r.rating_count
    from public.marketplace_stores s
    join public.products p on p.store_id = s.id and p.status = 'active'
    left join public.categories c on c.id = p.category_id and c.is_active
    left join public.store_payment_settings ps on ps.store_id = s.id
    left join lateral public.store_schedule_at(s.id, now() at time zone 'Indian/Mauritius') sch on true
    -- Prices, stock and the quick-add decision, all from the SAME pass over the
    -- variants. products.min_price is a cached column maintained by trigger and
    -- is deliberately not trusted here: the card shows an actionable price next
    -- to an actionable stock figure, and those two must come from one read.
    join lateral (
      select
        count(*)                                            as variant_count,
        count(*) filter (where pv.stock_quantity > 0)        as in_stock_count,
        min(pv.price)                                        as min_price,
        max(pv.price)                                        as max_price,
        max(pv.compare_at) filter (where pv.compare_at > pv.price) as compare_at,
        sum(pv.stock_quantity)                               as stock_total,
        (array_agg(pv.id order by pv.position, pv.created_at))[1]             as only_variant_id,
        (array_agg(pv.price order by pv.position, pv.created_at))[1]          as only_variant_price,
        (array_agg(pv.stock_quantity order by pv.position, pv.created_at))[1] as only_variant_stock,
        (array_agg(pv.unit order by pv.position, pv.created_at))[1]           as unit
      from public.product_variants pv
      where pv.product_id = p.id and pv.is_active
    ) v on v.variant_count > 0
    left join lateral (
      select pm.url as image_url, count(*) over () as image_count
      from public.product_media pm
      where pm.product_id = p.id and pm.kind = 'image'
      order by pm.position, pm.created_at
      limit 1
    ) m on true
    -- Product-level ratings. Empty until M97 starts collecting them; written
    -- now so nothing downstream has to change when they arrive.
    left join lateral (
      select round(avg(rv.rating)::numeric, 2) as rating_avg, count(*) as rating_count
      from public.reviews rv
      where rv.product_id = p.id and rv.status = 'published'
    ) r on true
  ),
  -- Everything EXCEPT category and price. Facet counts are computed against
  -- this, which is what makes "Honey (3)" still say 3 after you have clicked
  -- Honey — a count that collapses to the current selection is useless.
  matched as (
    select b.*
    from base b
    where (v_terms is null
           or exists (
             select 1 from unnest(v_terms) t
             where b.name        ilike '%' || t || '%'
                or coalesce(b.brand, '')         ilike '%' || t || '%'
                or coalesce(b.description, '')   ilike '%' || t || '%'
                or coalesce(b.category_name, '') ilike '%' || t || '%'
                or b.store_name                  ilike '%' || t || '%'
           ))
      and (p_seller is null or b.store_slug = lower(btrim(p_seller)))
      and (v_ful is null
           or (v_ful = 'rr_delivery'  and b.offers_rr_delivery)
           or (v_ful = 'own_delivery' and b.offers_customer_delivery)
           or (v_ful = 'pickup'       and b.offers_pickup))
      and (not coalesce(p_in_stock, false) or b.in_stock_count > 0)
      and (not coalesce(p_open_now, false) or coalesce(b.is_open, false))
  ),
  in_category as (
    select m.* from matched m
    where p_category is null or m.category_slug = lower(btrim(p_category))
  ),
  final as (
    select ic.* from in_category ic
    where (p_min_price is null or ic.max_price >= p_min_price)
      and (p_max_price is null or ic.min_price <= p_max_price)
  ),
  ranked as (
    select
      f.*,
      count(*) over () as total_count,
      row_number() over (
        order by
          -- Nothing a customer cannot buy is ever ranked above something they
          -- can. This is the only hard rule in the ordering; the rest is taste.
          (f.accepting_orders and f.in_stock_count > 0) desc,
          case when v_sort = 'newest'     then f.created_at end desc nulls last,
          case when v_sort = 'price_asc'  then f.min_price end asc  nulls last,
          case when v_sort = 'price_desc' then f.min_price end desc nulls last,
          case when v_sort = 'rating'     then coalesce(f.rating_avg, f.store_rating_avg) end desc nulls last,
          case when v_sort = 'name'       then lower(f.name) end asc nulls last,
          -- "Recommended" is a sum of facts, not a guess: can it be bought, is
          -- the shop open, does it have a photograph, is it rated, is it new.
          -- No engagement data exists on this platform, so inventing a
          -- popularity score would be inventing the number itself.
          case when v_sort = 'recommended' then
              (case when f.in_stock_count > 0 then 3.0 else 0 end)
            + (case when coalesce(f.is_open, false) then 1.5 else 0 end)
            + (case when f.image_url is not null then 1.5 else 0 end)
            + (case when f.store_featured then 1.0 else 0 end)
            + (coalesce(f.rating_avg, f.store_rating_avg, 0) / 5.0)
            + (case when f.created_at > now() - interval '30 days' then 0.5 else 0 end)
          end desc nulls last,
          f.created_at desc,
          f.id
      ) as rn
    from final f
  )
  select jsonb_build_object(
    'total',  coalesce((select max(total_count) from ranked), 0),
    'limit',  v_limit,
    'offset', v_offset,
    'deliveryFeeFrom', (select min(z.fee) from public.delivery_zones z where z.is_active),
    'priceMin', (select min(min_price) from in_category),
    'priceMax', (select max(max_price) from in_category),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', x.category_slug, 'name', x.category_name,
               'icon', x.category_icon, 'count', x.n) order by x.n desc, x.category_name)
      from (select category_slug, category_name, category_icon, count(*) as n
              from matched where category_slug is not null
             group by 1, 2, 3) x
    ), '[]'::jsonb),
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', x.store_slug, 'name', x.store_name, 'count', x.n)
             order by x.n desc, x.store_name)
      from (select store_slug, store_name, count(*) as n from matched group by 1, 2) x
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',              r.id,
               'slug',            r.slug,
               'name',            r.name,
               'brand',           r.brand,
               'storeId',         r.store_id,
               'storeSlug',       r.store_slug,
               'storeName',       r.store_name,
               'storeLogo',       r.store_logo,
               'storeAddress',    r.store_address,
               'storeRatingAvg',  r.store_rating_avg,
               'storeRatingCount',r.store_rating_count,
               'categorySlug',    r.category_slug,
               'categoryName',    r.category_name,
               'minPrice',        r.min_price,
               'maxPrice',        r.max_price,
               'compareAt',       r.compare_at,
               'unit',            r.unit,
               'imageUrl',        r.image_url,
               'imageCount',      coalesce(r.image_count, 0),
               'inStock',         r.in_stock_count > 0,
               'stockTotal',      r.stock_total,
               'variantCount',    r.variant_count,
               -- Quick add can only serve a product whose choice is already
               -- made: exactly one purchasable variant, with stock. Anything
               -- else routes to the product page where the picker lives.
               'quickAdd', case
                 when r.variant_count = 1 and r.only_variant_stock > 0
                 then jsonb_build_object('id', r.only_variant_id,
                                         'price', r.only_variant_price,
                                         'stockQuantity', r.only_variant_stock)
                 else null end,
               'ratingAvg',       r.rating_avg,
               'ratingCount',     r.rating_count,
               'offersPickup',      r.offers_pickup,
               'offersRrDelivery',  r.offers_rr_delivery,
               'offersOwnDelivery', r.offers_customer_delivery,
               'acceptingOrders',   r.accepting_orders,
               'isOpen',            coalesce(r.is_open, false),
               'hasSchedule',       coalesce(r.has_schedule, false),
               'createdAt',         r.created_at
             ) order by r.rn)
      from ranked r
      where r.rn > v_offset and r.rn <= v_offset + v_limit
    ), '[]'::jsonb)
  )
  into v_out;

  return v_out;
end;
$$;

comment on function public.browse_products(text, text, text, text, integer, integer, boolean, boolean, text, integer, integer) is
  'Product-first marketplace browse: search, category/price/fulfilment/stock filters, '
  'facet counts and the seller identity every card carries. Never more permissive than RLS.';

revoke all on function public.browse_products(text, text, text, text, integer, integer, boolean, boolean, text, integer, integer) from public;
grant execute on function public.browse_products(text, text, text, text, integer, integer, boolean, boolean, text, integer, integer)
  to anon, authenticated, service_role;

-- ── 5. marketplace_home() ───────────────────────────────────────────────────
-- The landing page in one round trip. Every rail is derived from something that
-- actually happened — a listing date, a real discount, a paid order — and any
-- rail with nothing in it comes back EMPTY so the page can drop it. A section
-- header with three placeholder tiles under it is how a marketplace announces
-- that it has no stock.
create or replace function public.marketplace_home()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_out jsonb;
begin
  with visible as (
    select p.id, p.created_at, p.category_id, s.id as store_id
    from public.marketplace_stores s
    join public.products p on p.store_id = s.id and p.status = 'active'
    where exists (select 1 from public.product_variants pv
                   where pv.product_id = p.id and pv.is_active)
  )
  select jsonb_build_object(
    'productCount',    (select count(*) from visible),
    'storeCount',      (select count(distinct store_id) from visible),
    'deliveryFeeFrom', (select min(z.fee) from public.delivery_zones z where z.is_active),
    'openStoreCount',  (
      select count(*) from public.marketplace_stores s
      where (select is_open from public.store_schedule_at(s.id, now() at time zone 'Indian/Mauritius'))
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', c.slug::text, 'name', c.name, 'icon', c.icon,
               'count', x.n) order by c.position, c.name)
      from (select category_id, count(*) as n from visible
             where category_id is not null group by 1) x
      join public.categories c on c.id = x.category_id and c.is_active
    ), '[]'::jsonb),
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', s.slug::text, 'name', s.name, 'logoUrl', s.logo_url,
               'coverUrl', s.cover_url, 'address', s.address,
               'ratingAvg', s.rating_avg, 'ratingCount', s.rating_count,
               'productCount', x.n)
             order by s.rating_count desc, x.n desc, s.name)
      from (select store_id, count(*) as n from visible group by 1) x
      join public.marketplace_stores s on s.id = x.store_id
    ), '[]'::jsonb),
    -- Real purchases, last 180 days, paid or beyond. Not "trending" — bought.
    'bestsellerIds', coalesce((
      select jsonb_agg(t.product_id order by t.orders desc, t.units desc)
      from (
        select pv.product_id, count(distinct o.id) as orders, sum(oi.quantity) as units
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.product_variants pv on pv.id = oi.variant_id
        where o.status in ('paid', 'preparing', 'ready_for_pickup', 'collected')
          and o.placed_at > now() - interval '180 days'
          and coalesce(o.is_test, false) = false
          and exists (select 1 from visible v where v.id = pv.product_id)
        group by 1
        order by 2 desc, 3 desc
        limit 12
      ) t
    ), '[]'::jsonb)
  )
  into v_out;

  return v_out;
end;
$$;

comment on function public.marketplace_home() is
  'Marketplace landing payload: catalogue size, category counts, seller strip and '
  'genuinely-bought product ids. Rails with no data return empty so the page drops them.';

revoke all on function public.marketplace_home() from public;
grant execute on function public.marketplace_home() to anon, authenticated, service_role;

-- ── 6. Sitemap: products, not just shops ────────────────────────────────────
-- /shop/<shop>/<product> pages carry the unique local content that can actually
-- rank ("Rodrigues honey", "vannerie Rodrigues"). They had URLs and no way in
-- from search. Same predicate as everything above, so a URL listed here can
-- never 404.
create or replace function public.sitemap_products()
returns table (store_slug text, product_slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select s.slug::text, p.slug::text, greatest(p.updated_at, p.created_at)
  from public.marketplace_stores s
  join public.products p on p.store_id = s.id and p.status = 'active'
  where not coalesce(s.no_index, false)
    and exists (select 1 from public.product_variants pv
                 where pv.product_id = p.id and pv.is_active)
  order by 1, 2;
$$;

revoke all on function public.sitemap_products() from public;
grant execute on function public.sitemap_products() to anon, authenticated, service_role;
