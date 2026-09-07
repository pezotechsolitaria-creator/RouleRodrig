-- ── TWO SHELVES THAT ACTUALLY HAVE SOMETHING ON THEM ────────────────────────
--
-- The owner: "Professional Services (create a test fully functionally)" and
-- "note that each categories can also sell products ... but services are
-- priorities it is the same for all".
--
-- M183 created the shelves. A shelf with nothing on it is invisible — the rail
-- only renders categories that have products, deliberately, so a tap can never
-- land on an empty page. So Professional Services and Celebrations existed and
-- could not be seen.
--
-- This puts a working business on each. Not a stub: both are onboarded exactly
-- the way Roulé Test Services was, because that one demonstrably works — a
-- trade_providers row makes the store's kind `service`, service_durations makes
-- a variant into booked time, and book_service_slot_public will then take a
-- real appointment with its visibility check, lead time, capacity lock and
-- three-per-phone cap. Nothing here is a new mechanism.
--
-- ── EACH SELLS BOTH, WITH THE SERVICE FIRST ────────────────────────────────
-- Every provider gets one bookable service AND one ordinary product, because
-- that is the owner's rule for these shelves and because it is the case most
-- likely to break: a service variant carries stock_quantity 0 and must be
-- BOOKED, while the product beside it carries real stock and must be BOUGHT.
-- create_order already refuses to sell the first ("booked, not bought"), and
-- having both in one store is what proves the two paths stay apart.
--
-- ── THEY ARE MARKED (TEST) ─────────────────────────────────────────────────
-- In the name, visible to anybody who finds them, following roule-test-shop and
-- Roulé Test Services. This site already carries one demo business whose seven
-- dishes are orderable by real customers without saying so anywhere a customer
-- looks; that is a trap worth not repeating. Both are attached to the owner's
-- existing merchant so they appear in the dashboard he already opens.

do $$
declare
  v_merchant uuid := '3fe62c72-e359-4854-96e8-5f2ac14df049';
  v_store    uuid;
  v_product  uuid;
  v_variant  uuid;
  v_cat_pro  uuid := (select id from categories where slug = 'professional-services');
  v_cat_cel  uuid := (select id from categories where slug = 'celebrations');
  v_n        integer;
begin
  if v_cat_pro is null or v_cat_cel is null then
    raise exception 'M183 must run first: the two categories do not exist';
  end if;
  if not exists (select 1 from merchants where id = v_merchant) then
    raise exception 'the owner merchant % is gone', v_merchant;
  end if;

  -- ── 1. PROFESSIONAL SERVICES ─────────────────────────────────────────────
  insert into stores (merchant_id, name, slug, tagline, status, currency, fulfillment)
  values (v_merchant, 'Rodrigues Repairs (TEST)', 'rodrigues-repairs-test',
          'Plumbing and electrical call-outs, island-wide.',
          'active', 'MUR', '{"pickup": true, "delivery": false}'::jsonb)
  on conflict (slug) do update set status = 'active'
  returning id into v_store;
  if v_store is null then
    select id into v_store from stores where slug = 'rodrigues-repairs-test';
  end if;

  insert into trade_providers (store_id, trade, mobile, slot_minutes,
                               concurrent_jobs, lead_hours, booking_days,
                               takes_online_bookings)
  values (v_store, 'Plumbing and electrical repairs', true, 30, 1, 2, 14, true)
  on conflict (store_id) do update set takes_online_bookings = true;

  insert into store_hours (store_id, weekday, opens_at, closes_at, is_closed)
  select v_store, d, '08:00', '17:00', false from generate_series(1, 6) d
  on conflict do nothing;

  -- The SERVICE. stock_quantity 0 is not an oversight — time cannot run low,
  -- and it is what makes create_order refuse to sell this.
  insert into products (store_id, category_id, name, slug, description, status,
                        min_price, currency)
  values (v_store, v_cat_pro, 'Call-out — first hour', 'call-out-first-hour',
          'A qualified plumber or electrician comes to you. Covers the first hour on site.',
          'active', 80000, 'MUR')
  on conflict (store_id, slug) do update set category_id = excluded.category_id
  returning id into v_product;
  if v_product is null then
    select id into v_product from products where store_id = v_store and slug = 'call-out-first-hour';
  end if;

  insert into product_variants (product_id, name, price, stock_quantity, is_active)
  values (v_product, 'Call-out — first hour', 80000, 0, true)
  returning id into v_variant;
  insert into service_durations (variant_id, minutes) values (v_variant, 60)
  on conflict (variant_id) do update set minutes = 60;

  -- The PRODUCT on the same shelf, with real stock.
  insert into products (store_id, category_id, name, slug, description, status,
                        min_price, currency)
  values (v_store, v_cat_pro, 'Tap washer kit', 'tap-washer-kit',
          'Assorted washers and O-rings for the commonest island taps.',
          'active', 15000, 'MUR')
  on conflict (store_id, slug) do update set category_id = excluded.category_id
  returning id into v_product;
  if v_product is null then
    select id into v_product from products where store_id = v_store and slug = 'tap-washer-kit';
  end if;
  insert into product_variants (product_id, name, price, stock_quantity, is_active)
  values (v_product, 'Tap washer kit', 15000, 12, true);

  -- ── 2. CELEBRATIONS ──────────────────────────────────────────────────────
  insert into stores (merchant_id, name, slug, tagline, status, currency, fulfillment)
  values (v_merchant, 'Fête Rodrigues (TEST)', 'fete-rodrigues-test',
          'Party setup, decoration and hire for birthdays and weddings.',
          'active', 'MUR', '{"pickup": true, "delivery": false}'::jsonb)
  on conflict (slug) do update set status = 'active'
  returning id into v_store;
  if v_store is null then
    select id into v_store from stores where slug = 'fete-rodrigues-test';
  end if;

  insert into trade_providers (store_id, trade, mobile, slot_minutes,
                               concurrent_jobs, lead_hours, booking_days,
                               takes_online_bookings)
  values (v_store, 'Party setup and decoration', true, 60, 1, 24, 60, true)
  on conflict (store_id) do update set takes_online_bookings = true;

  insert into store_hours (store_id, weekday, opens_at, closes_at, is_closed)
  select v_store, d, '08:00', '18:00', false from generate_series(1, 6) d
  on conflict do nothing;

  insert into products (store_id, category_id, name, slug, description, status,
                        min_price, currency)
  values (v_store, v_cat_cel, 'Party setup — 3 hours', 'party-setup-3-hours',
          'We arrive, decorate and set the tables. Three hours on site.',
          'active', 250000, 'MUR')
  on conflict (store_id, slug) do update set category_id = excluded.category_id
  returning id into v_product;
  if v_product is null then
    select id into v_product from products where store_id = v_store and slug = 'party-setup-3-hours';
  end if;
  insert into product_variants (product_id, name, price, stock_quantity, is_active)
  values (v_product, 'Party setup — 3 hours', 250000, 0, true)
  returning id into v_variant;
  insert into service_durations (variant_id, minutes) values (v_variant, 180)
  on conflict (variant_id) do update set minutes = 180;

  insert into products (store_id, category_id, name, slug, description, status,
                        min_price, currency)
  values (v_store, v_cat_cel, 'Balloon & banner pack', 'balloon-banner-pack',
          'Everything for a table of eight: balloons, banner, ribbon and tape.',
          'active', 45000, 'MUR')
  on conflict (store_id, slug) do update set category_id = excluded.category_id
  returning id into v_product;
  if v_product is null then
    select id into v_product from products where store_id = v_store and slug = 'balloon-banner-pack';
  end if;
  insert into product_variants (product_id, name, price, stock_quantity, is_active)
  values (v_product, 'Balloon & banner pack', 45000, 20, true);

  -- ── Assertions ───────────────────────────────────────────────────────────
  -- The shelves must be reachable, and the service/product split must hold.
  select count(*) into v_n from products p join categories c on c.id = p.category_id
   where c.slug = 'professional-services';
  if v_n < 2 then raise exception 'professional-services has % items', v_n; end if;

  select count(*) into v_n from products p join categories c on c.id = p.category_id
   where c.slug = 'celebrations';
  if v_n < 2 then raise exception 'celebrations has % items', v_n; end if;

  -- One bookable and one buyable on each shelf, which is the owner's rule.
  select count(*) into v_n from products p
    join categories c on c.id = p.category_id
    join product_variants v on v.product_id = p.id
    join service_durations d on d.variant_id = v.id
   where c.slug in ('professional-services', 'celebrations');
  if v_n <> 2 then raise exception 'expected 2 bookable services, found %', v_n; end if;

  select count(*) into v_n from products p
    join categories c on c.id = p.category_id
    join product_variants v on v.product_id = p.id
   where c.slug in ('professional-services', 'celebrations')
     and v.stock_quantity > 0
     and not exists (select 1 from service_durations d where d.variant_id = v.id);
  if v_n <> 2 then raise exception 'expected 2 stocked products, found %', v_n; end if;

  -- Both must be bookable through the real path, not just look bookable.
  select count(*) into v_n from trade_providers tp join stores s on s.id = tp.store_id
   where s.slug in ('rodrigues-repairs-test', 'fete-rodrigues-test')
     and tp.takes_online_bookings and store_is_visible(s.id);
  if v_n <> 2 then raise exception 'the two test providers are not bookable, found %', v_n; end if;
end $$;
