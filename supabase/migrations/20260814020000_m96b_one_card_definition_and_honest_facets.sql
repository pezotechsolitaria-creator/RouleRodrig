-- ── M96b · One definition of a card, and facets that never dead-end ────────
--
-- Three corrections to M96, all found by opening the pages rather than by
-- reading the code. Written as one follow-up because that is the order they
-- happened in and each supersedes part of the file before it.
--
-- 1. THE CARD SHAPE LIVED IN TWO PLACES. browse_products() built it inline;
--    then saved items, buy-again and the bestsellers rail needed "these
--    specific products", and a second inline copy of the same twelve joins is
--    precisely how two surfaces end up disagreeing about whether something is
--    in stock. Both now read marketplace_product_cards + marketplace_card_json.
--
-- 2. THE FACETS OFFERED DEAD ENDS. /shop/c/honey listed "Atelier Vannerie (2)"
--    in its seller filter, and Atelier Vannerie has no honey — tapping it would
--    have given zero results, which is the exact failure a COUNTED filter
--    exists to prevent. Multi-select faceting requires each facet to be counted
--    over the result set with every filter applied EXCEPT its own.
--
-- 3. NOTHING SAID THE SHOP WAS SHUT. Every card correctly read "Not selling
--    online" — six times, with no explanation anywhere — because all three
--    shops are on cancelled subscriptions. marketplace_home() now returns
--    sellingStoreCount so the page can say it once, at the top, and let people
--    browse and save in the meantime.

-- ── The one definition of a marketplace product card ───────────────────────
-- security_invoker so a direct read still applies the underlying RLS; the WHERE
-- inside marketplace_stores is what makes it safe to read from the SECURITY
-- DEFINER functions, which bypass RLS by construction.
create or replace view public.marketplace_product_cards
with (security_invoker = on) as
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
    coalesce(m.image_count, 0)                    as image_count,
    r.rating_avg,
    r.rating_count
  from public.marketplace_stores s
  join public.products p on p.store_id = s.id and p.status = 'active'
  left join public.categories c on c.id = p.category_id and c.is_active
  left join public.store_payment_settings ps on ps.store_id = s.id
  left join lateral public.store_schedule_at(s.id, now() at time zone 'Indian/Mauritius') sch on true
  -- Prices, stock and the quick-add decision from ONE pass over the variants.
  -- products.min_price is a trigger-maintained cache and is deliberately not
  -- trusted here: a card shows an actionable price beside an actionable stock
  -- figure, and those two have to come from the same read.
  join lateral (
    select
      count(*)                                                              as variant_count,
      count(*) filter (where pv.stock_quantity > 0)                         as in_stock_count,
      min(pv.price)                                                         as min_price,
      max(pv.price)                                                         as max_price,
      max(pv.compare_at) filter (where pv.compare_at > pv.price)            as compare_at,
      sum(pv.stock_quantity)                                                as stock_total,
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
  left join lateral (
    select round(avg(rv.rating)::numeric, 2) as rating_avg, count(*) as rating_count
    from public.reviews rv
    where rv.product_id = p.id and rv.status = 'published'
  ) r on true;

comment on view public.marketplace_product_cards is
  'Every fact a marketplace product card renders, in one place. browse_products(), '
  'marketplace_products_by_ids() and anything else showing a card read THIS, so they '
  'cannot disagree about price, stock or who is selling.';

grant select on public.marketplace_product_cards to anon, authenticated;

-- The card JSON, built once, so a new field appears on every surface at the
-- same time. search_path pinned like every other function in this schema.
create or replace function public.marketplace_card_json(c public.marketplace_product_cards)
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'id',               c.id,
    'slug',             c.slug,
    'name',             c.name,
    'brand',            c.brand,
    'storeId',          c.store_id,
    'storeSlug',        c.store_slug,
    'storeName',        c.store_name,
    'storeLogo',        c.store_logo,
    'storeAddress',     c.store_address,
    'storeRatingAvg',   c.store_rating_avg,
    'storeRatingCount', c.store_rating_count,
    'categorySlug',     c.category_slug,
    'categoryName',     c.category_name,
    'minPrice',         c.min_price,
    'maxPrice',         c.max_price,
    'compareAt',        c.compare_at,
    'unit',             c.unit,
    'imageUrl',         c.image_url,
    'imageCount',       c.image_count,
    'inStock',          c.in_stock_count > 0,
    'stockTotal',       c.stock_total,
    'variantCount',     c.variant_count,
    -- Quick add serves only a product whose choice is already made: exactly one
    -- purchasable variant, with stock. Anything else routes to the product page.
    'quickAdd', case
      when c.variant_count = 1 and c.only_variant_stock > 0
      then jsonb_build_object('id', c.only_variant_id, 'price', c.only_variant_price,
                              'stockQuantity', c.only_variant_stock)
      else null end,
    'ratingAvg',         c.rating_avg,
    'ratingCount',       c.rating_count,
    'offersPickup',      c.offers_pickup,
    'offersRrDelivery',  c.offers_rr_delivery,
    'offersOwnDelivery', c.offers_customer_delivery,
    'acceptingOrders',   c.accepting_orders,
    'isOpen',            coalesce(c.is_open, false),
    'hasSchedule',       coalesce(c.has_schedule, false),
    'createdAt',         c.created_at
  );
$$;

revoke all on function public.marketplace_card_json(public.marketplace_product_cards) from public;
grant execute on function public.marketplace_card_json(public.marketplace_product_cards)
  to anon, authenticated, service_role;

-- Specific products, for saved items, buy-again and the bestsellers rail.
-- Through the same view rather than a table read, so an archived product, a
-- paused shop or a lapsed subscription simply drops out — a saved-items page
-- can never render a card that 404s on tap.
create or replace function public.marketplace_products_by_ids(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(public.marketplace_card_json(c)
                            order by array_position(p_ids, c.id)), '[]'::jsonb)
  from public.marketplace_product_cards c
  where c.id = any(coalesce(p_ids, '{}'::uuid[]))
    -- Bounded: the ids come from a browser's localStorage, and an unbounded
    -- array is a free table scan for anyone who asks for one.
    and array_length(p_ids, 1) <= 100;
$$;

revoke all on function public.marketplace_products_by_ids(uuid[]) from public;
grant execute on function public.marketplace_products_by_ids(uuid[]) to anon, authenticated, service_role;

-- ── browse_products(), reading the one card definition, faceting properly ──
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
  v_cat    text;
  v_seller text;
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

  v_cat    := lower(nullif(btrim(coalesce(p_category, '')), ''));
  v_seller := lower(nullif(btrim(coalesce(p_seller, '')), ''));

  v_terms := public.marketplace_search_terms(p_q);
  if array_length(v_terms, 1) is null then v_terms := null; end if;

  with base as (
    select c.*, public.marketplace_card_json(c) as card
    from public.marketplace_product_cards c
  ),
  -- The narrowing that applies to EVERY facet: the free-text query, and the
  -- controls that are not themselves facets on this page.
  scoped as (
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
      and (v_ful is null
           or (v_ful = 'rr_delivery'  and b.offers_rr_delivery)
           or (v_ful = 'own_delivery' and b.offers_customer_delivery)
           or (v_ful = 'pickup'       and b.offers_pickup))
      and (not coalesce(p_in_stock, false) or b.in_stock_count > 0)
      and (not coalesce(p_open_now, false) or coalesce(b.is_open, false))
  ),
  -- Everything except CATEGORY — what the category counts are taken over, so a
  -- count does not collapse the moment you pick that category.
  for_categories as (
    select s.* from scoped s
    where (v_seller is null or s.store_slug = v_seller)
      and (p_min_price is null or s.max_price >= p_min_price)
      and (p_max_price is null or s.min_price <= p_max_price)
  ),
  -- Everything except SELLER — so a seller count always reflects what that
  -- seller has ON THIS PAGE, and never offers a filter with nothing behind it.
  for_sellers as (
    select s.* from scoped s
    where (v_cat is null or s.category_slug = v_cat)
      and (p_min_price is null or s.max_price >= p_min_price)
      and (p_max_price is null or s.min_price <= p_max_price)
  ),
  -- Everything except PRICE — the range the price bands are derived from.
  for_price as (
    select s.* from scoped s
    where (v_cat is null or s.category_slug = v_cat)
      and (v_seller is null or s.store_slug = v_seller)
  ),
  final as (
    select fp.* from for_price fp
    where (p_min_price is null or fp.max_price >= p_min_price)
      and (p_max_price is null or fp.min_price <= p_max_price)
  ),
  ranked as (
    select
      f.card,
      count(*) over () as total_count,
      row_number() over (
        order by
          -- Nothing a customer cannot buy is ranked above something they can.
          -- The only hard rule in the ordering; the rest is taste.
          (f.accepting_orders and f.in_stock_count > 0) desc,
          case when v_sort = 'newest'     then f.created_at end desc nulls last,
          case when v_sort = 'price_asc'  then f.min_price end asc  nulls last,
          case when v_sort = 'price_desc' then f.min_price end desc nulls last,
          case when v_sort = 'rating'     then coalesce(f.rating_avg, f.store_rating_avg) end desc nulls last,
          case when v_sort = 'name'       then lower(f.name) end asc nulls last,
          -- "Recommended" is a sum of facts, not a guess: can it be bought, is
          -- the shop open, does it have a photograph, is it rated, is it new.
          -- No engagement data exists on this platform, so a popularity score
          -- would mean inventing the number itself.
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
    'priceMin', (select min(min_price) from for_price),
    'priceMax', (select max(max_price) from for_price),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', x.category_slug, 'name', x.category_name,
               'icon', x.category_icon, 'count', x.n) order by x.n desc, x.category_name)
      from (select category_slug, category_name, category_icon, count(*) as n
              from for_categories where category_slug is not null
             group by 1, 2, 3) x
    ), '[]'::jsonb),
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', x.store_slug, 'name', x.store_name, 'count', x.n)
             order by x.n desc, x.store_name)
      from (select store_slug, store_name, count(*) as n from for_sellers group by 1, 2) x
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(r.card order by r.rn)
      from ranked r
      where r.rn > v_offset and r.rn <= v_offset + v_limit
    ), '[]'::jsonb)
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.browse_products(text, text, text, text, integer, integer, boolean, boolean, text, integer, integer) from public;
grant execute on function public.browse_products(text, text, text, text, integer, integer, boolean, boolean, text, integer, integer)
  to anon, authenticated, service_role;

-- ── marketplace_home(), now able to say the marketplace is shut ────────────
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
    -- Shops that can take an order today. Below storeCount means part of the
    -- catalogue is browsable but not buyable, and the page says so ONCE rather
    -- than repeating a badge on every card with no explanation.
    'sellingStoreCount', (
      select count(*) from (select distinct store_id from visible) v
      where public.store_subscription_active(v.store_id)
    ),
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

revoke all on function public.marketplace_home() from public;
grant execute on function public.marketplace_home() to anon, authenticated, service_role;

-- ── One product page in one round trip ─────────────────────────────────────
-- Assembled in SQL rather than in five client queries for the same reason
-- food_item_detail is: the page makes ONE decision about whether a thing is
-- buyable, and five queries can disagree with each other between round trips.
--
-- Slugs are compared as lowercased TEXT rather than cast to citext: citext
-- lives in the `extensions` schema, which these functions deliberately keep off
-- their search_path so a schema-shadowing attack cannot redirect a call.
create or replace function public.product_detail(p_store_slug text, p_product_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_store  public.stores%rowtype;
  v_prod   public.products%rowtype;
  v_out    jsonb;
begin
  select s.* into v_store
  from public.marketplace_stores s
  where lower(s.slug::text) = lower(btrim(coalesce(p_store_slug, '')));
  if not found then return null; end if;

  select p.* into v_prod
  from public.products p
  where p.store_id = v_store.id
    and lower(p.slug::text) = lower(btrim(coalesce(p_product_slug, '')))
    and p.status = 'active';
  if not found then return null; end if;

  select jsonb_build_object(
    'id',          v_prod.id,
    'slug',        v_prod.slug::text,
    'name',        v_prod.name,
    'brand',       v_prod.brand,
    'description', v_prod.description,
    'attributes',  coalesce(v_prod.attributes, '{}'::jsonb),
    'createdAt',   v_prod.created_at,
    'category', (
      select jsonb_build_object('slug', c.slug::text, 'name', c.name, 'icon', c.icon)
      from public.categories c where c.id = v_prod.category_id and c.is_active
    ),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'name', v.name, 'price', v.price,
               'compareAt', case when v.compare_at > v.price then v.compare_at else null end,
               'stockQuantity', v.stock_quantity, 'isActive', v.is_active,
               'unit', v.unit, 'sku', v.sku, 'options', coalesce(v.options, '{}'::jsonb))
             order by v.position, v.created_at)
      from public.product_variants v
      where v.product_id = v_prod.id and v.is_active
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object('url', m.url, 'alt', m.alt)
             order by m.position, m.created_at)
      from public.product_media m
      where m.product_id = v_prod.id and m.kind = 'image'
    ), '[]'::jsonb),
    'store', jsonb_build_object(
      'id',           v_store.id,
      'slug',         v_store.slug::text,
      'name',         v_store.name,
      'tagline',      v_store.tagline,
      'logoUrl',      v_store.logo_url,
      'address',      v_store.address,
      'ratingAvg',    v_store.rating_avg,
      'ratingCount',  v_store.rating_count,
      'createdAt',    v_store.created_at,
      'acceptingOrders', public.store_subscription_active(v_store.id),
      'productCount', (select count(*) from public.products p2
                        where p2.store_id = v_store.id and p2.status = 'active'),
      -- Completed orders: a trust signal that is a COUNT of real events rather
      -- than a badge somebody awarded themselves.
      'completedOrders', (select count(*) from public.orders o
                           where o.store_id = v_store.id
                             and o.status = 'collected'
                             and coalesce(o.is_test, false) = false),
      'offersPickup',       coalesce((select ps.offers_pickup from public.store_payment_settings ps where ps.store_id = v_store.id), true),
      'offersRrDelivery',   coalesce((select ps.offers_rr_delivery from public.store_payment_settings ps where ps.store_id = v_store.id), true),
      'offersOwnDelivery',  coalesce((select ps.offers_customer_delivery from public.store_payment_settings ps where ps.store_id = v_store.id), true)
    ),
    'schedule', (
      select to_jsonb(sch) from public.store_schedule_at(v_store.id, now() at time zone 'Indian/Mauritius') sch
    ),
    'deliveryFeeFrom', (select min(z.fee) from public.delivery_zones z where z.is_active),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'rating', r.rating, 'body', r.body,
               'createdAt', r.created_at,
               -- The buyer's FIRST NAME only, derived here so no caller ever
               -- needs SELECT on orders.customer_name (same rule as M29).
               'author', nullif(split_part(coalesce(o.customer_name, ''), ' ', 1), ''))
             order by r.created_at desc)
      from (select * from public.reviews rv
             where rv.product_id = v_prod.id and rv.status = 'published'
             order by rv.created_at desc limit 12) r
      left join public.orders o on o.id = r.order_id
    ), '[]'::jsonb),
    'ratingAvg',   (select round(avg(rv.rating)::numeric, 2) from public.reviews rv
                     where rv.product_id = v_prod.id and rv.status = 'published'),
    'ratingCount', (select count(*) from public.reviews rv
                     where rv.product_id = v_prod.id and rv.status = 'published')
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.product_detail(text, text) from public;
grant execute on function public.product_detail(text, text) to anon, authenticated, service_role;
