-- M12 — Public marketplace directory: browse_stores()
--
-- WHY THIS EXISTS
-- There was no public store-listing surface at all: no /shop index, and the only
-- set-returning store function was admin_store_schedules(), which exposes
-- has_bank_details, merchant identity and full subscription internals. Reusing
-- that for a public page would have leaked billing state to anonymous callers.
-- This is its public analogue: the same one-query shape, curated columns.
--
-- N+1 AVOIDANCE
-- Open/closed is per-store and time-dependent. Calling store_schedule_status()
-- once per row from the app would be a round trip per store. Here it is a
-- LATERAL join, so the whole directory — schedule verdict included — is a single
-- query regardless of how many stores match.
--
-- VISIBILITY
-- Deliberately identical to the storefront's RLS (stores_public_read):
-- store.status='active' AND merchant.status='approved', i.e. exactly what
-- store_is_visible() encodes. A store that 404s at /shop/<slug> must not appear
-- in the directory, and vice versa.
--
-- Subscription state is reduced to a single `accepting_orders` boolean. The
-- customer needs to know they cannot order; they do not need to know the
-- merchant's plan or that a payment lapsed, so no plan/status/period leaves this
-- function. Checkout independently refuses with RR008 — this is display only.
--
-- SEARCH INPUT
-- p_q is a filter, not an authenticator (contrast M11's booking lookup), so a
-- wildcard here widens a search rather than bypassing a check. It is still
-- escaped: leaving '%' live would let a caller express matches the UI never
-- offers, and ILIKE metacharacters in user text are a correctness bug even when
-- they are not a security one. Full-text uses plainto_tsquery on the RAW text,
-- which is injection-safe by construction and ignores LIKE metacharacters.

create or replace function public.browse_stores(
  p_q           text    default null,
  p_category    text    default null,
  p_fulfillment text    default null,   -- 'rr_delivery' | 'own_delivery' | 'pickup'
  p_open_now    boolean default false,
  p_sort        text    default 'featured',
  p_limit       int     default 12,
  p_offset      int     default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q      text;
  v_raw    text;
  v_limit  int;
  v_offset int;
  v_sort   text;
  v_ful    text;
  v_out    jsonb;
begin
  -- Clamp paging: a public endpoint must not let a caller request the whole
  -- table in one go, whatever the UI sends.
  v_limit  := least(greatest(coalesce(p_limit, 12), 1), 48);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_sort   := lower(coalesce(nullif(btrim(p_sort), ''), 'featured'));
  if v_sort not in ('featured', 'newest', 'name', 'rating') then
    v_sort := 'featured';
  end if;

  v_ful := lower(nullif(btrim(coalesce(p_fulfillment, '')), ''));
  if v_ful is not null and v_ful not in ('rr_delivery', 'own_delivery', 'pickup') then
    v_ful := null;   -- unknown filter value must not silently match nothing
  end if;

  v_raw := nullif(btrim(coalesce(p_q, '')), '');
  v_q   := v_raw;
  if v_q is not null then
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
    v_q := '%' || v_q || '%';
  end if;

  with base as (
    select
      s.id,
      s.name,
      s.slug::text                                as slug,
      s.tagline,
      s.logo_url,
      s.cover_url,
      s.address,
      s.rating_avg,
      s.rating_count,
      s.created_at,
      coalesce(ps.offers_rr_delivery, false)      as offers_rr_delivery,
      coalesce(ps.offers_pickup, true)            as offers_pickup,
      coalesce(ps.offers_customer_delivery, false) as offers_customer_delivery,
      coalesce(ps.accepts_cash, true)             as accepts_cash,
      coalesce(ps.accepts_bank_transfer, false)   as accepts_bank_transfer,
      store_subscription_active(s.id)             as accepting_orders,
      sch.has_schedule,
      sch.is_open,
      sch.delivery_available,
      sch.opens_at,
      sch.closes_at,
      sch.is_closed,
      sch.next_open_at,
      (select count(*)
         from products p
        where p.store_id = s.id and p.status = 'active')             as product_count,
      (select array_agg(distinct c.name order by c.name)
         from products p
         join categories c on c.id = p.category_id
        where p.store_id = s.id and p.status = 'active')             as categories
    from stores s
    join merchants m on m.id = s.merchant_id
    left join store_payment_settings ps on ps.store_id = s.id
    -- One lateral call per row inside a single query, not a round trip per row.
    -- LEFT ... ON true, not CROSS: if store_schedule_at ever returns no row for
    -- a store with no hours, a CROSS JOIN would silently drop that store from
    -- the directory — a shop disappearing because it never set opening hours.
    left join lateral store_schedule_at(s.id, now() at time zone 'Indian/Mauritius') sch on true
    where s.status = 'active'
      and m.status = 'approved'
  ),
  filtered as (
    select b.*
    from base b
    where (v_q is null
           or b.name ilike v_q escape '\'
           or coalesce(b.tagline, '') ilike v_q escape '\'
           or exists (select 1 from unnest(coalesce(b.categories, '{}')) cn
                       where cn ilike v_q escape '\')
           or exists (select 1
                        from products p
                       where p.store_id = b.id
                         and p.status = 'active'
                         and (p.name ilike v_q escape '\'
                              or coalesce(p.brand, '') ilike v_q escape '\'
                              or p.search_vector @@ plainto_tsquery('simple', v_raw))))
      and (p_category is null
           or exists (select 1
                        from products p
                        join categories c on c.id = p.category_id
                       where p.store_id = b.id
                         and p.status = 'active'
                         and c.slug = p_category))
      and (v_ful is null
           or (v_ful = 'rr_delivery'  and b.offers_rr_delivery)
           or (v_ful = 'own_delivery' and b.offers_customer_delivery)
           or (v_ful = 'pickup'       and b.offers_pickup))
      and (not coalesce(p_open_now, false) or b.is_open)
  ),
  ranked as (
    select
      f.*,
      count(*) over () as total_count,   -- full filtered count, computed pre-LIMIT
      row_number() over (
        order by
          -- A store that cannot take orders always sorts last, whatever the
          -- chosen sort: showing it above a working shop wastes the customer.
          f.accepting_orders desc,
          case when v_sort = 'newest' then f.created_at end desc nulls last,
          case when v_sort = 'name'   then lower(f.name) end asc  nulls last,
          case when v_sort = 'rating' then f.rating_avg end desc nulls last,
          case when v_sort = 'featured' then
            (f.is_open::int * 4)
            + (least(coalesce(f.rating_avg, 0), 5) / 5.0)
            + least(f.product_count, 20) / 20.0
          end desc nulls last,
          f.created_at desc
      ) as rn
    from filtered f
  )
  select jsonb_build_object(
    'total', coalesce((select max(total_count) from ranked), 0),
    'limit', v_limit,
    'offset', v_offset,
    -- Zones are platform-wide (RR Delivery), not per store, so they ride at the
    -- top level instead of being repeated on every card.
    'zones', coalesce((select jsonb_agg(jsonb_build_object('name', z.name, 'fee', z.fee, 'covers', z.covers)
                                        order by z.position, z.name)
                         from delivery_zones z where z.is_active), '[]'::jsonb),
    'deliveryFeeFrom', (select min(z.fee) from delivery_zones z where z.is_active),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                r.id,
               'name',              r.name,
               'slug',              r.slug,
               'tagline',           r.tagline,
               'logoUrl',           r.logo_url,
               'coverUrl',          r.cover_url,
               'address',           r.address,
               'ratingAvg',         r.rating_avg,
               'ratingCount',       r.rating_count,
               'productCount',      r.product_count,
               'categories',        coalesce(to_jsonb(r.categories), '[]'::jsonb),
               'acceptingOrders',   r.accepting_orders,
               'offersRrDelivery',  r.offers_rr_delivery,
               'offersOwnDelivery', r.offers_customer_delivery,
               'offersPickup',      r.offers_pickup,
               'acceptsCash',       r.accepts_cash,
               'acceptsBankTransfer', r.accepts_bank_transfer,
               'hasSchedule',       r.has_schedule,
               'isOpen',            r.is_open,
               'deliveryAvailable', r.delivery_available,
               'opensAt',           r.opens_at,
               'closesAt',          r.closes_at,
               'isClosedToday',     r.is_closed,
               'nextOpenAt',        r.next_open_at,
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

revoke all on function public.browse_stores(text, text, text, boolean, text, int, int) from public;
grant execute on function public.browse_stores(text, text, text, boolean, text, int, int)
  to anon, authenticated, service_role;

comment on function public.browse_stores is
  'Public marketplace directory. Visibility matches stores_public_read (active store + approved merchant). Subscription reduced to an accepting_orders boolean — no plan or billing state is exposed. Single query; schedule resolved via LATERAL, not per-store round trips.';

-- Categories for the filter bar: only those that actually have a purchasable
-- product behind them, so the UI cannot offer a filter that returns nothing.
create or replace function public.browse_store_categories()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', x.slug, 'name', x.name, 'icon', x.icon, 'storeCount', x.store_count)
           order by x.position, x.name), '[]'::jsonb)
  from (
    select c.slug, c.name, c.icon, c.position,
           count(distinct p.store_id) as store_count
    from categories c
    join products p on p.category_id = c.id and p.status = 'active'
    join stores  s on s.id = p.store_id and s.status = 'active'
    join merchants m on m.id = s.merchant_id and m.status = 'approved'
    where c.is_active
    group by c.slug, c.name, c.icon, c.position
  ) x;
$$;

revoke all on function public.browse_store_categories() from public;
grant execute on function public.browse_store_categories() to anon, authenticated, service_role;
