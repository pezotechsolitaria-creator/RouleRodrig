create or replace function create_product(
  p_store_id     uuid,
  p_name         text,
  p_description  text,
  p_price        integer,
  p_quantity     integer,
  p_sku          text,
  p_category_id  uuid,
  p_status       text
) returns table (product_id uuid, variant_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_owner        uuid := auth.uid();
  v_product_id   uuid;
  v_variant_id   uuid;
  v_slug         text;
  v_slug_attempt int := 0;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if not is_store_staff(p_store_id) then
    raise exception using errcode = 'RR002', message = 'You do not have access to this shop.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'product name is required';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'price must be zero or greater';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'quantity must be zero or greater';
  end if;
  if p_status not in ('draft', 'active') then
    raise exception 'invalid status';
  end if;

  loop
    v_slug := regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 8);
    begin
      insert into products (store_id, category_id, name, slug, description, status, has_variants)
      values (p_store_id, p_category_id, p_name, v_slug, nullif(trim(p_description), ''), p_status::product_status, false)
      returning id into v_product_id;
      exit;
    exception when unique_violation then
      v_slug_attempt := v_slug_attempt + 1;
      if v_slug_attempt >= 5 then
        raise exception 'Could not generate a unique product link — try a slightly different name.';
      end if;
    end;
  end loop;

  insert into product_variants (product_id, sku, price, stock_quantity)
  values (v_product_id, nullif(trim(p_sku), ''), p_price, 0)
  returning id into v_variant_id;

  if p_quantity > 0 then
    insert into inventory_movements (variant_id, delta, reason, created_by, note)
    values (v_variant_id, p_quantity, 'restock', v_owner, 'Initial stock from product creation');
  end if;

  return query select v_product_id, v_variant_id;
end;
$$;

revoke execute on function create_product(uuid, text, text, integer, integer, text, uuid, text) from public;
revoke execute on function create_product(uuid, text, text, integer, integer, text, uuid, text) from anon;
grant execute on function create_product(uuid, text, text, integer, integer, text, uuid, text) to authenticated;