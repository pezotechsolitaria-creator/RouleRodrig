-- ============================================================================
-- 0004 — onboard_merchant() RPC (Milestone 2: merchant onboarding)
-- ----------------------------------------------------------------------------
-- Fully ADDITIVE. Adds a single SECURITY DEFINER function that creates a
-- merchant + its first store + its first product + variant + opening stock
-- movement in ONE transaction, so a half-finished onboarding (e.g. a network
-- drop between "create store" and "create product") can never leave an
-- orphaned merchant with no store, or a store with no product.
--
-- Deliberately does NOT touch storage: media (logo, product photo) is
-- uploaded after this call succeeds (the store/product id is needed for the
-- storage path), and is best-effort — a shop created without a photo yet is
-- normal, recoverable state, not corrupted data.
-- ============================================================================

create or replace function onboard_merchant(
  p_shop_name          text,
  p_shop_description   text,
  p_business_category  text,
  p_contact_phone      text,
  p_address            text,
  p_product_name       text,
  p_product_description text,
  p_price              integer,   -- minor units
  p_quantity           integer,
  p_sku                text,
  p_category_id        uuid
) returns table (merchant_id uuid, store_id uuid, product_id uuid, variant_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_owner       uuid := auth.uid();
  v_merchant_id uuid;
  v_store_id    uuid;
  v_slug        text;
  v_product_id  uuid;
  v_product_slug text;
  v_variant_id  uuid;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_shop_name), '') = '' then
    raise exception 'shop name is required';
  end if;
  if coalesce(trim(p_product_name), '') = '' then
    raise exception 'product name is required';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'price must be zero or greater';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'quantity must be zero or greater';
  end if;

  insert into merchants (owner_id, legal_name, display_name, contact_phone, status)
  values (v_owner, p_shop_name, p_shop_name, nullif(trim(p_contact_phone), ''), 'pending')
  returning id into v_merchant_id;
  -- t_merchant_provision_owner trigger makes v_owner the merchant's 'owner' staff.

  v_slug := regexp_replace(lower(p_shop_name), '[^a-z0-9]+', '-', 'g') || '-' || substr(v_merchant_id::text, 1, 6);

  insert into stores (merchant_id, name, slug, description, category_hint, phone, address, status)
  values (v_merchant_id, p_shop_name, v_slug, nullif(trim(p_shop_description), ''),
          nullif(trim(p_business_category), ''), nullif(trim(p_contact_phone), ''),
          nullif(trim(p_address), ''), 'active')
  returning id into v_store_id;

  v_product_slug := regexp_replace(lower(p_product_name), '[^a-z0-9]+', '-', 'g');

  insert into products (store_id, category_id, name, slug, description, status, has_variants)
  values (v_store_id, p_category_id, p_product_name, v_product_slug,
          nullif(trim(p_product_description), ''), 'active', false)
  returning id into v_product_id;

  insert into product_variants (product_id, sku, price, stock_quantity)
  values (v_product_id, nullif(trim(p_sku), ''), p_price, 0)
  returning id into v_variant_id;

  if p_quantity > 0 then
    insert into inventory_movements (variant_id, delta, reason, created_by, note)
    values (v_variant_id, p_quantity, 'restock', v_owner, 'Opening stock from onboarding');
  end if;

  return query select v_merchant_id, v_store_id, v_product_id, v_variant_id;
end;
$$;

grant execute on function onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid) to authenticated;
