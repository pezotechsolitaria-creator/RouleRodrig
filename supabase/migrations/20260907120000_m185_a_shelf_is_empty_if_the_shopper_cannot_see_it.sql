-- ── A SHELF IS EMPTY IF THE SHOPPER CANNOT SEE IT ───────────────────────────
--
-- M183 asserted that Local products had at least one product. It did — Tipois —
-- and the shelf still vanished from the rail, because that product lives in a
-- store with status 'draft'. store_is_visible() said false, the facet RPC
-- counted zero, and the owner's FIRST category disappeared in the very change
-- that promoted it to the front.
--
-- The assertion was the bug. It counted rows in the database rather than what a
-- shopper can see, and those are different numbers on every page of this site.
-- Every check below goes through store_is_visible(), which is the same rule the
-- storefront, marketplace_stores and book_service_slot_public already use.
--
-- The fix is STOCK, not a status change. Publishing somebody else's draft shop
-- to make a rail look right would put a half-finished storefront in front of
-- customers to solve a cosmetic problem. Two genuinely local products go on the
-- visible test shop instead.

do $$
declare
  v_store uuid;
  v_cat   uuid := (select id from categories where slug = 'local-products');
  v_p     uuid;
  v_n     integer;
begin
  select id into v_store from stores where slug = 'roule-test-shop';
  if v_store is null then raise exception 'roule-test-shop is gone'; end if;
  -- Choosing an invisible store here would repeat the exact bug being fixed.
  if not store_is_visible(v_store) then
    raise exception 'roule-test-shop is not visible; picking it would repeat the bug';
  end if;

  insert into products (store_id, category_id, name, slug, description, status, min_price, currency)
  values (v_store, v_cat, 'Rodrigues Honey 250g', 'rodrigues-honey-250g',
          'Raw honey from hives on the island, in a 250g jar.',
          'active', 35000, 'MUR')
  on conflict (store_id, slug) do update set category_id = excluded.category_id;
  select id into v_p from products where store_id = v_store and slug = 'rodrigues-honey-250g';
  -- product_variants carries no unique key, so ON CONFLICT cannot guard it.
  if not exists (select 1 from product_variants where product_id = v_p) then
    insert into product_variants (product_id, name, price, stock_quantity, is_active)
    values (v_p, 'Rodrigues Honey 250g', 35000, 24, true);
  end if;

  insert into products (store_id, category_id, name, slug, description, status, min_price, currency)
  values (v_store, v_cat, 'Piment Confit', 'piment-confit',
          'Island chilli preserved in oil. Hot, and used on everything here.',
          'active', 18000, 'MUR')
  on conflict (store_id, slug) do update set category_id = excluded.category_id;
  select id into v_p from products where store_id = v_store and slug = 'piment-confit';
  if not exists (select 1 from product_variants where product_id = v_p) then
    insert into product_variants (product_id, name, price, stock_quantity, is_active)
    values (v_p, 'Piment Confit', 18000, 30, true);
  end if;

  -- ── The assertion M183 should have made ──────────────────────────────────
  -- Every active category on the rail must hold something a SHOPPER can see,
  -- or it is not on the rail at all.
  for v_n in
    select 1 from categories c
     where c.is_active
       and c.slug in ('local-products','professional-services','vehicle-care','celebrations')
       and not exists (
         select 1 from products p join stores s on s.id = p.store_id
          where p.category_id = c.id and p.status = 'active' and store_is_visible(s.id))
  loop
    raise exception 'a category on the rail has nothing a shopper can see';
  end loop;

  select count(*) into v_n from products p
    join categories c on c.id = p.category_id
    join stores s on s.id = p.store_id
   where c.slug = 'local-products' and p.status = 'active' and store_is_visible(s.id);
  if v_n < 2 then raise exception 'local-products shows only % item(s)', v_n; end if;
end $$;
