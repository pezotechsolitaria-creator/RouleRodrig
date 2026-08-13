-- ── M97 · Reviews about the PRODUCT, not only the shop ─────────────────────
--
-- The reviews table has carried a product_id column and a
-- reviews_one_per_customer_product index since the beginning, and nothing ever
-- wrote to either. Every review on this platform answers "how was this shop",
-- which is the seller-service question; a marketplace also needs "was the honey
-- any good", and a shopper choosing between two producers is asking the second.
--
-- ── THE BUG THIS FIXES ON THE WAY IN ───────────────────────────────────────
-- sync_store_rating() counted EVERY published review for a store. Start writing
-- product reviews and a shop's service rating silently absorbs them, so one bad
-- jar drags down the rating for how well the shop packs and hands over. The
-- read path already knew better — reviews_store_published_idx and
-- store_reviews() both filter `product_id is null` — so the trigger was already
-- disagreeing with the query it feeds. Aligned here, BEFORE anything can write
-- a row that would prove it wrong.
create or replace function public.sync_store_rating()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare _sid uuid := coalesce(new.store_id, old.store_id);
begin
  update stores s set
    rating_count = (select count(*) from reviews r
                     where r.store_id = _sid and r.status = 'published'
                       and r.product_id is null),
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r
                              where r.store_id = _sid and r.status = 'published'
                                and r.product_id is null), 0)
  where s.id = _sid;
  return null;
end $$;

-- One review per product per ORDER. The pre-existing unique index is keyed on
-- customer_id, which is NULL for every guest — so without this a guest could
-- review the same product from the same order any number of times, and guests
-- are the majority of this platform's buyers (M20).
create unique index if not exists reviews_one_per_order_product
  on public.reviews (order_id, product_id)
  where (order_id is not null and product_id is not null);

-- The verified-purchase check, shared by the signed-in and guest paths exactly
-- as insert_verified_store_review is.
create or replace function public.insert_verified_product_review(
  p_order_id uuid, p_product_id uuid, p_customer_id uuid, p_rating integer, p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order orders%rowtype;
  v_body  text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using errcode = 'RR030', message = 'Choose between 1 and 5 stars.';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;

  if v_order.status <> 'collected' then
    raise exception using errcode = 'RR032',
      message = 'You can review a product once your order is completed.';
  end if;

  -- VERIFIED PURCHASE, and the whole point of the feature. The order must
  -- actually CONTAIN this product — not the shop's catalogue, not something the
  -- buyer merely looked at. Without this line the endpoint is a public review
  -- form with an order number for a password.
  if not exists (
    select 1
    from order_items oi
    join product_variants pv on pv.id = oi.variant_id
    where oi.order_id = v_order.id and pv.product_id = p_product_id
  ) then
    raise exception using errcode = 'RR035',
      message = 'That product was not part of this order.';
  end if;

  v_body := nullif(btrim(coalesce(p_body, '')), '');
  if length(v_body) > 1000 then
    v_body := left(v_body, 1000);
  end if;

  begin
    insert into reviews (store_id, product_id, order_id, customer_id, rating, body, status)
    values (v_order.store_id, p_product_id, v_order.id, p_customer_id, p_rating, v_body, 'published');
  exception when unique_violation then
    raise exception using errcode = 'RR033', message = 'You have already reviewed this product.';
  end;

  return (
    select jsonb_build_object(
             'ok', true,
             'productId', p_product_id,
             'ratingAvg', round(avg(r.rating)::numeric, 2),
             'ratingCount', count(*))
      from reviews r
     where r.product_id = p_product_id and r.status = 'published'
  );
end;
$$;

create or replace function public.rate_product(
  p_order_id uuid, p_product_id uuid, p_rating integer, p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = 'RR034', message = 'Sign in to leave a review.';
  end if;
  -- Ownership proved against the SESSION, before anything else runs.
  if not exists (select 1 from orders o where o.id = p_order_id and o.customer_id = v_uid) then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;
  return public.insert_verified_product_review(p_order_id, p_product_id, v_uid, p_rating, p_body);
end;
$$;

create or replace function public.guest_rate_product(
  p_order_number text, p_email text, p_product_id uuid, p_rating integer, p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_num   text;
  v_email text;
  v_id    uuid;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_num) < 6 or v_email = '' then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;

  select o.id into v_id
    from orders o
   where o.order_number = v_num
     and lower(o.customer_email) = v_email
   limit 1;
  if v_id is null then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;

  -- customer_id stays NULL: the reviewer proved the EMAIL, not a session.
  -- reviews_one_per_order_product is what stops them writing twice.
  return public.insert_verified_product_review(v_id, p_product_id, null, p_rating, p_body);
end;
$$;

-- What an order can still be reviewed for: the shop, and each product in it.
-- One call, so the order page does not work it out from three queries.
create or replace function public.order_reviewable(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'canReviewOrder', o.status = 'collected',
    'storeReviewed',  exists (select 1 from reviews r
                               where r.order_id = o.id and r.product_id is null),
    'storeRating',    (select r.rating from reviews r
                        where r.order_id = o.id and r.product_id is null limit 1),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'productId',  x.product_id,
               'name',       x.name,
               'slug',       x.slug,
               'storeSlug',  x.store_slug,
               'imageUrl',   x.image_url,
               'myRating',   x.my_rating,
               'reviewed',   x.my_rating is not null)
             order by x.name)
      from (
        select distinct on (pv.product_id)
               pv.product_id,
               p.name,
               p.slug::text        as slug,
               s.slug::text        as store_slug,
               (select pm.url from product_media pm
                 where pm.product_id = p.id and pm.kind = 'image'
                 order by pm.position, pm.created_at limit 1) as image_url,
               (select r.rating from reviews r
                 where r.order_id = o.id and r.product_id = pv.product_id limit 1) as my_rating
          from order_items oi
          join product_variants pv on pv.id = oi.variant_id
          join products p on p.id = pv.product_id
          join stores s on s.id = p.store_id
         where oi.order_id = o.id
      ) x
    ), '[]'::jsonb))
  from orders o
  where o.id = p_order_id
    and (
      -- Signed in and it is theirs, or staff, or platform admin. A GUEST order
      -- is reached through guest_order_reviewable() instead, which is where
      -- guest identity is proved on this platform.
      (o.customer_id is not null and o.customer_id = auth.uid())
      or public.is_store_staff(o.store_id)
      or public.is_platform_admin()
    );
$$;

-- The same question for a GUEST's order.
--
-- A sibling of order_reviewable() rather than a field bolted onto
-- lookup_order(): that function is long, delicate and load-bearing for the
-- whole guest tracking page, and adding a join to it to serve a rating widget
-- is how a payment-tracking page breaks. Guests are the default buyer here
-- (M20), so a review feature that only served account holders would serve
-- almost nobody — precisely the M21 lesson.
create or replace function public.guest_order_reviewable(p_order_number text, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_num   text;
  v_email text;
  v_id    uuid;
  v_status order_status;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_num) < 6 or v_email = '' then return null; end if;

  select o.id, o.status into v_id, v_status
    from orders o
   where o.order_number = v_num and lower(o.customer_email) = v_email
   limit 1;
  if v_id is null then return null; end if;

  return jsonb_build_object(
    'canReviewOrder', v_status = 'collected',
    'storeReviewed',  exists (select 1 from reviews r
                               where r.order_id = v_id and r.product_id is null),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'productId', x.product_id,
               'name',      x.name,
               'slug',      x.slug,
               'storeSlug', x.store_slug,
               'imageUrl',  x.image_url,
               'myRating',  x.my_rating,
               'reviewed',  x.my_rating is not null)
             order by x.name)
      from (
        select distinct on (pv.product_id)
               pv.product_id,
               p.name,
               p.slug::text as slug,
               s.slug::text as store_slug,
               (select pm.url from product_media pm
                 where pm.product_id = p.id and pm.kind = 'image'
                 order by pm.position, pm.created_at limit 1) as image_url,
               (select r.rating from reviews r
                 where r.order_id = v_id and r.product_id = pv.product_id limit 1) as my_rating
          from order_items oi
          join product_variants pv on pv.id = oi.variant_id
          join products p on p.id = pv.product_id
          join stores s on s.id = p.store_id
         where oi.order_id = v_id
      ) x
    ), '[]'::jsonb));
end;
$$;

-- ── GRANTS, and why `revoke … from public` is not enough ───────────────────
--
-- This migration first shipped with `revoke all on function … from public` and
-- believed that was the boundary. It is not. Supabase carries DEFAULT
-- PRIVILEGES that grant EXECUTE on every new function in `public` DIRECTLY to
-- `anon` and `authenticated`, and revoking from PUBLIC does not touch a direct
-- role grant. Five functions therefore shipped reachable from the public REST
-- surface, the worst being insert_verified_product_review — which takes a raw
-- order_id and performs NO credential check of its own, because both of its
-- callers do that for it.
--
-- The already-correct siblings from M29 prove the intended shape:
-- guest_rate_store and insert_verified_store_review are postgres+service_role
-- only; rate_store is authenticated only.
revoke all on function public.insert_verified_product_review(uuid, uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.insert_verified_product_review(uuid, uuid, uuid, integer, text)
  to postgres, service_role;

revoke all on function public.guest_rate_product(text, text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.guest_rate_product(text, text, uuid, integer, text)
  to postgres, service_role;

revoke all on function public.guest_order_reviewable(text, text)
  from public, anon, authenticated;
grant execute on function public.guest_order_reviewable(text, text)
  to postgres, service_role;

revoke all on function public.rate_product(uuid, uuid, integer, text) from public, anon;
grant execute on function public.rate_product(uuid, uuid, integer, text) to authenticated, service_role;

revoke all on function public.order_reviewable(uuid) from public, anon;
grant execute on function public.order_reviewable(uuid) to authenticated, service_role;

-- ── Post-conditions ────────────────────────────────────────────────────────
-- The point of this block: a grant that is wrong AGAIN fails the migration
-- instead of shipping quietly, which is exactly what happened the first time.
do $$
declare
  v_fn   text;
  v_bad  text[] := '{}';
  v_locked text[] := array[
    'insert_verified_product_review', 'guest_rate_product', 'guest_order_reviewable',
    'rate_product', 'order_reviewable'
  ];
begin
  foreach v_fn in array v_locked loop
    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join aclexplode(p.proacl) ax on ax.privilege_type = 'EXECUTE'
      join pg_roles r on r.oid = ax.grantee
      where n.nspname = 'public' and p.proname = v_fn and r.rolname = 'anon'
    ) then
      v_bad := v_bad || v_fn;
    end if;
  end loop;

  if array_length(v_bad, 1) > 0 then
    raise exception 'anon can still execute: %', array_to_string(v_bad, ', ');
  end if;

  -- And the public reads must still work, or this migration has shut the shop.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join aclexplode(p.proacl) ax on ax.privilege_type = 'EXECUTE'
    join pg_roles r on r.oid = ax.grantee
    where n.nspname = 'public' and p.proname = 'browse_products' and r.rolname = 'anon'
  ) then
    raise exception 'browse_products is no longer readable by anon — the marketplace would be empty';
  end if;
end $$;
