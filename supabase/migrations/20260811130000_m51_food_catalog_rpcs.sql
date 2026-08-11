-- M51 — The food catalog read layer: one row shape, three entry points.
--
-- ── WHY ONE ROW SHAPE ───────────────────────────────────────────────────────
-- The home rails, the search results, the item page and the "you might also
-- like" strip all render the SAME card, so they must all be built by the same
-- query. Three hand-written joins would drift — one would forget the kitchen's
-- open state, another would forget that a per-dish prep time overrides the
-- kitchen's — and the customer would see a dish described differently depending
-- on which screen they found it on.
--
-- So the card is assembled ONCE, inside the view, as a `card` jsonb column.
-- Every consumer selects that column. It is impossible for two surfaces to
-- disagree about what a dish is, because there is only one place that says.
--
-- ── WHY A VIEW AND NOT A SET-RETURNING FUNCTION ─────────────────────────────
-- A function returning TABLE(...) has no composite TYPE, so nothing downstream
-- can declare a variable of its row shape or pass a row of it to another
-- function. A view does. `food_catalog%rowtype` in food_item_detail below is
-- only possible because of this.
--
-- The view is NOT security_invoker: it runs as its owner and does its own
-- visibility filtering (`p.status = 'active' and store_is_visible(s.id)`),
-- which is the same posture as the SECURITY DEFINER browse_* functions beside
-- it. It is not granted to anon — the public reaches it only through the three
-- RPCs at the bottom, which is the whole API surface of the food catalog.
--
-- ── WHY THE CARD CARRIES A VARIANT ID ───────────────────────────────────────
-- The single most important interaction on this surface is one tap to add. The
-- cart is {variantId, quantity} — so a card that only knows its product id
-- forces a round trip before anything can be added, and one-tap becomes
-- tap-wait-tap. When a dish has exactly ONE sellable variant (the common case:
-- a dish is a dish), the card carries that variant id and the add is instant.
-- When it has several (Small / Large), variantId is null and the UI is OBLIGED
-- to open the chooser — which is correct behaviour, not a fallback.
--
-- ── ON N+1 ──────────────────────────────────────────────────────────────────
-- store_schedule_status() is evaluated once per KITCHEN, not once per dish: the
-- lateral join hangs off stores, and Rodrigues will have kitchens in the
-- dozens. Caching the open/closed verdict instead would be wrong at exactly
-- 08:00 and 18:00 — the minutes it matters — which is the same reasoning that
-- made /shop force-dynamic.

drop view if exists public.food_catalog;
create view public.food_catalog as
select
  p.id                                                    as product_id,
  fi.slug,
  p.name,
  fi.descriptor,
  fi.descriptor_fr,
  fi.descriptor_cr,
  p.description,
  fi.allergens,
  p.min_price                                             as price,
  p.currency,
  med.url                                                 as image_url,
  -- The dish overrides the kitchen, and null means "I do not disagree" — so
  -- editing a kitchen's prep range moves every dish that never had an opinion,
  -- which is exactly what an operator expects when they edit the kitchen.
  coalesce(fi.prep_minutes_min, fk.prep_minutes_min)      as prep_min,
  coalesce(fi.prep_minutes_max, fk.prep_minutes_max)      as prep_max,
  fi.spice_level,
  fi.dietary,
  fi.meal_times,
  fi.is_signature,
  fi.serves,
  fi.position                                             as sort_position,
  avail.av                            as availability,
  coalesce(v.total_stock, 0)                              as stock,
  v.single_variant_id                                     as variant_id,
  coalesce(v.variant_count, 0)::integer                   as variant_count,
  s.id                                                    as kitchen_id,
  s.name                                                  as kitchen_name,
  s.slug                                                  as kitchen_slug,
  coalesce(sch.is_open, true)                             as kitchen_open,
  fk.pickup_hint,
  coalesce(cat.slugs, '{}'::text[])                       as category_slugs,
  p.created_at,
  p.search_vector,
  -- ORDERABLE is the composite of four independent facts that must ALL hold:
  -- the dish is on the menu, it is inside its serving window, today's batch has
  -- not run out, and the kitchen is open. Computed here so no screen can get it
  -- three-quarters right.
  (avail.av = 'available'
   and coalesce(sch.is_open, true)
   and coalesce(v.total_stock, 0) > 0)                    as orderable,
  jsonb_build_object(
    'id',            p.id,
    'slug',          fi.slug,
    'name',          p.name,
    'descriptor',    fi.descriptor,
    'descriptorFr',  fi.descriptor_fr,
    'descriptorCr',  fi.descriptor_cr,
    'price',         p.min_price,
    'currency',      p.currency,
    'imageUrl',      med.url,
    'prepMin',       coalesce(fi.prep_minutes_min, fk.prep_minutes_min),
    'prepMax',       coalesce(fi.prep_minutes_max, fk.prep_minutes_max),
    'spiceLevel',    fi.spice_level,
    'dietary',       to_jsonb(fi.dietary),
    'mealTimes',     to_jsonb(fi.meal_times),
    'isSignature',   fi.is_signature,
    'serves',        fi.serves,
    'stock',         coalesce(v.total_stock, 0),
    'variantId',     v.single_variant_id,
    'variantCount',  coalesce(v.variant_count, 0)::integer,
    'kitchenId',     s.id,
    'kitchenName',   s.name,
    'kitchenOpen',   coalesce(sch.is_open, true),
    'categories',    to_jsonb(coalesce(cat.slugs, '{}'::text[])),
    'orderable',     (avail.av = 'available'
                      and coalesce(sch.is_open, true)
                      and coalesce(v.total_stock, 0) > 0),
    -- The REASON, not just the verdict. "From 11:00" and "sold out" are
    -- completely different things to tell a customer, and carrying the
    -- difference costs nothing here while a grey rectangle with no explanation
    -- costs an order.
    'reason',        case
                       when avail.av <> 'available'
                         then avail.av
                       when not coalesce(sch.is_open, true) then 'kitchen_closed'
                       when coalesce(v.total_stock, 0) <= 0 then 'sold_out'
                       else null
                     end
  )                                                       as card
from food_items fi
join products p       on p.id = fi.product_id and p.status = 'active'
join stores s         on s.id = p.store_id
join food_kitchens fk on fk.store_id = s.id
-- Visibility is the marketplace's own predicate, never a second definition of
-- "published": a paused kitchen disappears from /food for the same reason a
-- paused shop disappears from /shop.
and store_is_visible(s.id)
left join lateral (
  select pm.url
    from product_media pm
   where pm.product_id = p.id and pm.kind = 'image'
   order by pm.position
   limit 1
) med on true
left join lateral (
  select
    sum(pv.stock_quantity)::integer as total_stock,
    count(*)                        as variant_count,
    -- Exactly one sellable variant → the card can be added in one tap. Two or
    -- more → null, so a dish with a real choice can never be added without the
    -- customer making it.
    -- (array_agg)[1] rather than min(): Postgres has no min(uuid), and this
    -- branch only ever runs when there is exactly one row anyway.
    case when count(*) = 1 then (array_agg(pv.id))[1] end as single_variant_id
    from product_variants pv
   where pv.product_id = p.id and pv.is_active
) v on true
left join lateral (
  select array_agg(fc.slug::text order by fc.position, fc.name) as slugs
    from food_item_categories fic
    join food_categories fc on fc.id = fic.category_id and fc.is_active
   where fic.product_id = p.id
) cat on true
-- Once per kitchen, not once per dish.
left join lateral store_schedule_status(s.id) sch on true
-- Evaluated ONCE per dish. Without this the reason code is needed in five
-- places (the availability column, orderable, and three times inside the card)
-- and the planner has no obligation to notice they are the same call.
left join lateral (select food_item_availability(p.id) as av) avail on true;

comment on view public.food_catalog is
  'The single row shape behind every food card on the site — home rails, search, item page and related strip alike — with the customer-facing JSON assembled once in the `card` column so the surfaces cannot drift. Not granted to anon: the public reaches it only through browse_food / food_home / food_item_detail (M51).';

revoke all on public.food_catalog from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- browse_food — search, filter, sort, paginate
-- ════════════════════════════════════════════════════════════════════════════
-- SEARCH ARCHITECTURE. Matching is layered so it can grow without a rewrite:
--   1. the stored FTS vector on products (name + brand + description)
--   2. a literal fallback across the descriptor, the category slugs and the
--      dietary tags, none of which the vector covers
--   3. synonym expansion, which happens in the APPLICATION (lib/food/search.ts)
--      and arrives here already OR'd — "ourite" becomes "ourite OR octopus OR
--      pieuvre". Keeping the vocabulary in TypeScript makes it testable,
--      reviewable in a diff, and editable without a migration; the day it wants
--      to be semantic, only that one file changes.
create or replace function public.browse_food(
  p_q              text    default null,
  p_category       text    default null,
  p_meal           text    default null,
  p_dietary        text[]  default null,
  p_max_price      integer default null,
  p_orderable_only boolean default false,
  p_sort           text    default 'recommended',
  p_limit          integer default 24,
  p_offset         integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select c.*
      from food_catalog c
     where (p_category is null or p_category = any (c.category_slugs))
       and (p_meal     is null or p_meal     = any (c.meal_times))
       -- Every requested dietary tag must hold. "vegetarian AND gluten free"
       -- must never quietly widen into OR: a customer filtering for what they
       -- can safely eat is not browsing.
       and (p_dietary is null or cardinality(p_dietary) = 0 or c.dietary @> p_dietary)
       and (p_max_price is null or c.price <= p_max_price)
       and (not p_orderable_only or c.orderable)
       and (
         nullif(btrim(coalesce(p_q, '')), '') is null
         or c.search_vector @@ websearch_to_tsquery('simple', btrim(p_q))
         or c.name ilike '%' || btrim(p_q) || '%'
         or coalesce(c.descriptor, '') ilike '%' || btrim(p_q) || '%'
         or exists (select 1 from unnest(c.category_slugs) x where x ilike '%' || btrim(p_q) || '%')
         or exists (select 1 from unnest(c.dietary)        x where x ilike '%' || btrim(p_q) || '%')
       )
  ),
  page as (
    select b.card
      from base b
     order by
       -- Whatever the sort, a dish that cannot be ordered right now never
       -- outranks one that can. Sorting purely by price would put a sold-out
       -- Rs 120 plate above every dish the customer could actually eat tonight.
       b.orderable desc,
       case when p_sort = 'price_asc'  then b.price      end asc  nulls last,
       case when p_sort = 'price_desc' then b.price      end desc nulls last,
       case when p_sort = 'fastest'    then b.prep_max   end asc  nulls last,
       case when p_sort = 'newest'     then b.created_at end desc nulls last,
       -- 'recommended', and anything unrecognised, lands here.
       b.is_signature desc,
       b.sort_position,
       b.name
     limit  least(greatest(coalesce(p_limit, 24), 1), 60)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total',  (select count(*)::integer from base),
    'limit',  least(greatest(coalesce(p_limit, 24), 1), 60),
    'offset', greatest(coalesce(p_offset, 0), 0),
    'items',  coalesce((select jsonb_agg(page.card) from page), '[]'::jsonb)
  )
$$;

comment on function public.browse_food(text, text, text, text[], integer, boolean, text, integer, integer) is
  'Food-first catalog search across every kitchen on the island. Dietary filters are AND, never OR. Unorderable dishes always sort last regardless of the requested sort (M51).';

-- ════════════════════════════════════════════════════════════════════════════
-- food_home — everything the landing screen needs, in one round trip
-- ════════════════════════════════════════════════════════════════════════════
-- The rails are chosen by the CLOCK. The honest answer to "what do I want to
-- eat" at 07:30 is not the same as at 19:30, and the platform already knows
-- which it is. No personalization model and no invented AI — time of day is
-- real signal, it costs nothing, and it is right for a first-time visitor,
-- which every tourist is.
--
-- A rail or category that would be empty is OMITTED rather than rendered with a
-- heading and nothing under it: an empty rail reads as a broken page, where no
-- rail reads as a menu that simply does not have that today.
create or replace function public.food_home()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with clock as (
    select case
             when extract(hour from (now() at time zone 'Indian/Mauritius'))::int < 10 then 'breakfast'
             when extract(hour from (now() at time zone 'Indian/Mauritius'))::int < 15 then 'lunch'
             when extract(hour from (now() at time zone 'Indian/Mauritius'))::int < 22 then 'dinner'
             else 'snack'
           end as meal
  ),
  rail_now as (
    select jsonb_build_object('key', 'now', 'title', 'Ready to order now',
                              'items', jsonb_agg(t.card)) as rail
      from (select c.card from food_catalog c
             where c.orderable
             order by c.is_signature desc, c.sort_position, c.name
             limit 12) t
     having count(*) > 0
  ),
  rail_meal as (
    select jsonb_build_object(
             'key', (select meal from clock),
             'title', case (select meal from clock)
                        when 'breakfast' then 'Breakfast on the island'
                        when 'lunch'     then 'Good for lunch'
                        when 'dinner'    then 'Tonight''s picks'
                        else                  'Late-night bites'
                      end,
             'items', jsonb_agg(t.card)) as rail
      from (select c.card from food_catalog c
             where (select meal from clock) = any (c.meal_times)
             order by c.orderable desc, c.is_signature desc, c.sort_position, c.name
             limit 12) t
     having count(*) > 0
  ),
  rail_signature as (
    select jsonb_build_object('key', 'signature', 'title', 'Signature dishes',
                              'items', jsonb_agg(t.card)) as rail
      from (select c.card from food_catalog c
             where c.is_signature
             order by c.orderable desc, c.sort_position, c.name
             limit 12) t
     having count(*) > 0
  ),
  rail_new as (
    select jsonb_build_object('key', 'new', 'title', 'New on the menu',
                              'items', jsonb_agg(t.card)) as rail
      from (select c.card from food_catalog c
             order by c.created_at desc
             limit 10) t
     having count(*) > 0
  ),
  cats as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'slug',  fc.slug,  'name',    fc.name,
             'nameFr', fc.name_fr, 'nameCr', fc.name_cr,
             'emoji', fc.emoji, 'imageUrl', fc.image_url,
             'count', q.n
           ) order by fc.position, fc.name), '[]'::jsonb) as list
      from food_categories fc
      join lateral (
        select count(*)::integer as n
          from food_catalog c
         where fc.slug::text = any (c.category_slugs)
      ) q on q.n > 0
     where fc.is_active
  )
  select jsonb_build_object(
    'meal',            (select meal from clock),
    'rails',           (
      select coalesce(jsonb_agg(r.rail), '[]'::jsonb) from (
        -- Ordered by usefulness, not by alphabet: what you can eat RIGHT NOW is
        -- the most useful thing this screen can say, so it is first.
        select 1 as ord, rail from rail_now
        union all select 2, rail from rail_meal
        union all select 3, rail from rail_signature
        union all select 4, rail from rail_new
      ) r
    ),
    'categories',      (select list from cats),
    'kitchensOpen',    (select count(distinct kitchen_id)::integer from food_catalog where kitchen_open),
    'dishCount',       (select count(*)::integer from food_catalog),
    'deliveryEnabled', coalesce((select delivery_enabled from marketplace_settings where id = 'main'), false),
    'deliveryFeeFrom', (select min(fee) from delivery_zones where is_active)
  )
$$;

comment on function public.food_home() is
  'One round trip for the food landing screen: clock-chosen rails, live category counts, delivery availability. Empty rails and empty categories are omitted rather than rendered blank (M51).';

-- ════════════════════════════════════════════════════════════════════════════
-- food_item_detail — the dish page
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.food_item_detail(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r        food_catalog%rowtype;
  v_images jsonb;
  v_vars   jsonb;
  v_rel    jsonb;
begin
  -- lower(...::text) rather than ::citext. citext is installed in the
  -- `extensions` schema, which is NOT on this function's pinned search_path, so
  -- the cast fails at runtime with "type citext does not exist" — caught by the
  -- first smoke test against the live database. Comparing lowered text gives
  -- the same case-insensitive match without depending on where the extension
  -- happens to live.
  select * into r from food_catalog c where lower(c.slug::text) = lower(btrim(p_slug));
  if not found then return null; end if;

  select coalesce(jsonb_agg(pm.url order by pm.position), '[]'::jsonb)
    into v_images
    from product_media pm
   where pm.product_id = r.product_id and pm.kind = 'image';

  -- Active variants only, each carrying its own stock so the chooser can grey
  -- out "Large" without HIDING that Large exists — a dish that silently loses a
  -- size reads as a bug, not as a sold-out size.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',      pv.id,
           'name',    pv.name,
           'price',   pv.price,
           'compareAt', pv.compare_at,
           'stock',   pv.stock_quantity,
           'options', pv.options
         ) order by pv.position, pv.price), '[]'::jsonb)
    into v_vars
    from product_variants pv
   where pv.product_id = r.product_id and pv.is_active;

  -- Related prefers the SAME KITCHEN, because those are the only suggestions
  -- that can also share ONE order — a recommendation the customer cannot act on
  -- without starting a second order is worse than no recommendation.
  select coalesce(jsonb_agg(q.card), '[]'::jsonb) into v_rel
    from (
      select o.card
        from food_catalog o
       where o.product_id <> r.product_id
         and (o.kitchen_id = r.kitchen_id or o.category_slugs && r.category_slugs)
       order by (o.kitchen_id = r.kitchen_id) desc,
                o.orderable desc,
                o.is_signature desc,
                o.sort_position
       limit 8
    ) q;

  return r.card || jsonb_build_object(
    'description', r.description,
    'allergens',   r.allergens,
    'images',      v_images,
    'variants',    v_vars,
    'related',     v_rel,
    'pickupHint',  r.pickup_hint,
    'kitchenSlug', r.kitchen_slug
  );
end $$;

comment on function public.food_item_detail(text) is
  'The dish page in one call. Related dishes prefer the SAME KITCHEN, because those are the only ones that can share a single order (M51).';

-- The menu is public: a signed-out visitor must be able to read all of it.
grant execute on function public.browse_food(text, text, text, text[], integer, boolean, text, integer, integer) to anon, authenticated;
grant execute on function public.food_home() to anon, authenticated;
grant execute on function public.food_item_detail(text) to anon, authenticated;
-- Read-only, one dish, returns a reason — used by the item page when a stale
-- tab wakes up and needs to know whether the button is still real.
grant execute on function public.food_item_availability(uuid, timestamptz) to anon, authenticated;
