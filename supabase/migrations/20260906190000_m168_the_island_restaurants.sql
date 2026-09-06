-- ── M168 · THE ISLAND HAS RESTAURANTS, AND /food NOW SAYS SO ────────────────
--
-- /food carried an explicit product rule since it was built:
--
--   "The customer opens it and thinks 'what do I want to eat', never 'which
--    business is selling something'. So there is no kitchen list, no kitchen
--    filter, no kitchen page and no kitchen name on any grid card."
--
-- That rule is reversed here on the owner's instruction. He wants /food to have
-- its restaurants the way /shop has its "Island shops" rail, and on an island
-- where the customer very often DOES know which kitchen they want — because
-- they know the cook — the original rule was arguing with the market.
--
-- The dish-first shelf is untouched. This adds a seller layer BELOW it, in the
-- same position and for the same reason /shop states in its own comment: the
-- shopper asks "who am I buying from" AFTER seeing something they want, not
-- before.
--
-- Everything below reads food_catalog, which already carries kitchen_id,
-- kitchen_name, kitchen_slug, kitchen_open and pickup_hint, and which already
-- applies every visibility rule a dish must satisfy. No new visibility logic is
-- invented here — a kitchen appears exactly when at least one of its dishes is
-- already showing on /food, so this rail can never advertise a kitchen the
-- catalogue is hiding.

-- ── 1. food_home() gains `kitchens` ─────────────────────────────────────────
create or replace function public.food_home()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  ),
  -- The seller layer. Ordered open-first, because a shut kitchen at the top of
  -- the rail is a dead end the customer has to read past; then by how much they
  -- actually have on the menu; then by name so the order is stable between
  -- requests rather than shuffling on every render.
  kitchens as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'slug',        k.kitchen_slug,
             'name',        k.kitchen_name,
             'logoUrl',     s.logo_url,
             'address',     s.address,
             'lat',         s.lat,
             'lng',         s.lng,
             'isOpen',      k.is_open,
             'dishCount',   k.n,
             'pickupHint',  fk.pickup_hint,
             'halal',       coalesce(fk.halal_certified, false),
             'ratingAvg',   s.rating_avg,
             'ratingCount', s.rating_count
           ) order by k.is_open desc, k.n desc, k.kitchen_name), '[]'::jsonb) as list
      from (
        select c.kitchen_id,
               min(c.kitchen_name)       as kitchen_name,
               min(c.kitchen_slug::text) as kitchen_slug,
               bool_or(c.kitchen_open)   as is_open,
               count(*)::integer         as n
          from food_catalog c
         where c.kitchen_id is not null
         group by c.kitchen_id
      ) k
      join public.stores s         on s.id = k.kitchen_id
      join public.food_kitchens fk on fk.store_id = k.kitchen_id
  )
  select jsonb_build_object(
    'meal',            (select meal from clock),
    'rails',           (
      select coalesce(jsonb_agg(r.rail order by r.ord), '[]'::jsonb) from (
        select 1 as ord, rail from rail_now
        union all select 2, rail from rail_meal
        union all select 3, rail from rail_signature
        union all select 4, rail from rail_new
      ) r
    ),
    'categories',      (select list from cats),
    'kitchens',        (select list from kitchens),
    'kitchensOpen',    (select count(distinct kitchen_id)::integer from food_catalog where kitchen_open),
    'dishCount',       (select count(*)::integer from food_catalog),
    'deliveryEnabled', coalesce((select delivery_enabled from marketplace_settings where id = 'main'), false),
    'deliveryFeeFrom', (select min(fee) from delivery_zones where is_active)
  )
$function$;

comment on function public.food_home() is
  'The /food landing payload. `kitchens` (M168) is the seller layer that mirrors '
  'marketplace_home().sellers - derived from food_catalog, so a kitchen can only '
  'appear here when one of its dishes is already visible on /food.';

-- ── 2. One kitchen and its menu ─────────────────────────────────────────────
-- Mirrors food_item_detail: one round trip, cards built by the catalogue, so a
-- kitchen page and the /food grid can never render the same dish differently.
create or replace function public.food_kitchen(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with k as (
    select c.kitchen_id,
           min(c.kitchen_name)       as kitchen_name,
           min(c.kitchen_slug::text) as kitchen_slug,
           bool_or(c.kitchen_open)   as is_open,
           count(*)::integer         as n
      from food_catalog c
     where lower(c.kitchen_slug::text) = lower(btrim(coalesce(p_slug, '')))
       and c.kitchen_id is not null
     group by c.kitchen_id
  )
  select jsonb_build_object(
    'slug',           k.kitchen_slug,
    'name',           k.kitchen_name,
    'logoUrl',        s.logo_url,
    'coverUrl',       s.cover_url,
    'description',    s.description,
    'address',        s.address,
    'lat',            s.lat,
    'lng',            s.lng,
    'phone',          s.phone,
    'whatsapp',       s.whatsapp,
    'isOpen',         k.is_open,
    'dishCount',      k.n,
    'pickupHint',     fk.pickup_hint,
    'prepMin',        fk.prep_minutes_min,
    'prepMax',        fk.prep_minutes_max,
    'halal',          coalesce(fk.halal_certified, false),
    'halalCertifier', fk.halal_certifier,
    'ratingAvg',      s.rating_avg,
    'ratingCount',    s.rating_count,
    'items', coalesce((
      select jsonb_agg(c.card order by c.orderable desc, c.is_signature desc,
                                       c.sort_position, c.name)
        from food_catalog c where c.kitchen_id = k.kitchen_id
    ), '[]'::jsonb)
  )
  from k
  join public.stores s         on s.id = k.kitchen_id
  join public.food_kitchens fk on fk.store_id = k.kitchen_id;
$function$;

comment on function public.food_kitchen(text) is
  'One kitchen and its whole menu for /food/k/[slug] (M168). Reads food_catalog, '
  'so an invisible dish stays invisible and an unknown slug returns no row.';

-- REVOKE FROM PUBLIC is the real boundary on this codebase, not any gate inside
-- the function body. Both are read-only and expose nothing a /food visitor
-- cannot already see, so anon and authenticated get them back explicitly.
revoke all on function public.food_home() from public;
revoke all on function public.food_kitchen(text) from public;
grant execute on function public.food_home() to anon, authenticated;
grant execute on function public.food_kitchen(text) to anon, authenticated;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v jsonb;
  v_slug text;
  v_listed integer;
  v_actual integer;
begin
  select food_home() into v;
  if not (v ? 'kitchens') then
    raise exception 'M168: food_home() has no kitchens key';
  end if;
  if jsonb_typeof(v -> 'kitchens') <> 'array' then
    raise exception 'M168: food_home().kitchens is not an array';
  end if;

  -- The rail must never claim more kitchens than the catalogue actually shows.
  v_listed := jsonb_array_length(v -> 'kitchens');
  select count(distinct kitchen_id) into v_actual
    from food_catalog where kitchen_id is not null;
  if v_listed <> v_actual then
    raise exception 'M168: kitchens rail lists % but food_catalog has %', v_listed, v_actual;
  end if;

  -- And every listed kitchen must resolve through the detail RPC, or the rail
  -- links somewhere that 404s.
  for v_slug in
    select jsonb_array_elements(v -> 'kitchens') ->> 'slug'
  loop
    if food_kitchen(v_slug) is null then
      raise exception 'M168: kitchen % is listed but food_kitchen() returns null', v_slug;
    end if;
  end loop;

  if food_kitchen('no-such-kitchen-xyz') is not null then
    raise exception 'M168: food_kitchen() invented a kitchen';
  end if;
end $$;
