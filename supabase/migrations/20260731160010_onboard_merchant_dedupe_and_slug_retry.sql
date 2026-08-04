-- ============================================================================
-- 0006 — onboard_merchant(): duplicate-merchant guard + slug retry-on-conflict
-- ----------------------------------------------------------------------------
-- Two independent M2-review fixes, bundled because both touch the same
-- function body and a second CREATE OR REPLACE of the same function in a
-- separate migration would just be churn:
--
--  1. Duplicate merchant race (Critical). A fast precheck gives a clear error
--     in the common case; the real correctness guarantee is the EXCEPTION
--     WHEN unique_violation handler around the insert, which is what actually
--     closes the race against the partial unique index added in the previous
--     migration (a SELECT-then-INSERT check alone is TOCTOU-unsafe).
--     Raised with a custom SQLSTATE ('RR001') so the API layer can map it to
--     a clean, merchant-facing message without ever relaying raw Postgres
--     text.
--
--  2. Slug collision (Medium). The previous version used a deterministic
--     6-hex-char suffix (24 bits) — two merchants picking an identical shop
--     name had a non-trivial birthday-paradox chance of colliding, and a
--     deterministic suffix can't be retried (it would just collide again).
--     Now generates a fresh random suffix per attempt and retries on
--     unique_violation, up to 5 attempts, each retry safe inside plpgsql's
--     implicit per-exception-block savepoint (does not abort the outer
--     transaction).
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
  v_owner        uuid := auth.uid();
  v_merchant_id  uuid;
  v_store_id     uuid;
  v_slug_base    text;
  v_slug         text;
  v_slug_attempt int := 0;
  v_product_id   uuid;
  v_product_slug text;
  v_variant_id   uuid;
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

  -- Fast path: clear error in the common (non-racing) case. Does not by
  -- itself close the race — see the exception handler below for that.
  if exists (
    select 1 from merchants where owner_id = v_owner and status in ('pending', 'approved')
  ) then
    raise exception using errcode = 'RR001', message = 'You already have a shop with us.';
  end if;

  begin
    insert into merchants (owner_id, legal_name, display_name, contact_phone, status)
    values (v_owner, p_shop_name, p_shop_name, nullif(trim(p_contact_phone), ''), 'pending')
    returning id into v_merchant_id;
    -- t_merchant_provision_owner trigger makes v_owner the merchant's 'owner' staff.
  exception when unique_violation then
    -- The actual race: two concurrent calls both passed the precheck above;
    -- only one wins the partial unique index (merchants_one_active_per_owner).
    raise exception using errcode = 'RR001', message = 'You already have a shop with us.';
  end;

  v_slug_base := regexp_replace(lower(p_shop_name), '[^a-z0-9]+', '-', 'g');
  loop
    v_slug := v_slug_base || '-' || substr(gen_random_uuid()::text, 1, 8);
    begin
      insert into stores (merchant_id, name, slug, description, category_hint, phone, address, status)
      values (v_merchant_id, p_shop_name, v_slug, nullif(trim(p_shop_description), ''),
              nullif(trim(p_business_category), ''), nullif(trim(p_contact_phone), ''),
              nullif(trim(p_address), ''), 'active')
      returning id into v_store_id;
      exit;
    exception when unique_violation then
      v_slug_attempt := v_slug_attempt + 1;
      if v_slug_attempt >= 5 then
        raise exception 'Could not generate a unique shop link — try a slightly different shop name.';
      end if;
    end;
  end loop;

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

revoke execute on function onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid) from public;
revoke execute on function onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid) from anon;
grant execute on function onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid) to authenticated;
