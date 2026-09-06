-- ── M178 · A KITCHEN COULD NOT SIGN UP ──────────────────────────────────────
--
-- Applied to production 2026-09-07.
--
-- onboard_merchant() raised 'product name is required' and 'price must be zero
-- or greater' unconditionally, and inserted a product, a variant and an
-- inventory movement every time. So the only business that could create an
-- account on this platform was one that sells a thing with a price and a stock
-- count.
--
-- A restaurant sells dishes it cooks to order. A car wash sells thirty minutes
-- of somebody's Saturday. Neither could get through the front door, and both
-- had a fully built console waiting on the other side of it.
--
-- ── TWO CHANGES, AND THE SECOND IS THE ONE THAT MATTERS ────────────────────
--
-- 1. THE FIRST ITEM IS OPTIONAL. A business can exist before it has anything
--    listed. Requiring one did not produce a stocked shop, it produced an
--    abandoned form and a made-up product called "test".
--
-- 2. ONBOARDING LEARNS WHAT KIND OF BUSINESS THIS IS, and creates the extension
--    row that makes it one. Without this a car wash signs up, gets no
--    trade_providers row, and is therefore a SHOP as far as every screen in the
--    console is concerned — a stock report instead of a diary, "Products"
--    instead of "Services". The kind-blindness fixed everywhere else this week
--    would have walked straight back in through the front door.
--
-- 'events' is deliberately not offered: a box office is created by an admin
-- through admin_invite_organizer, not by self-signup, and pretending otherwise
-- would create an organiser with no event and no way to make one.
--
-- ── WHY DROP AND RECREATE RATHER THAN ADD A DEFAULTED PARAMETER ────────────
-- Adding p_kind with a default would create a SECOND function of the same name,
-- and PostgREST refuses an overloaded endpoint with PGRST203 — every signup on
-- the platform would start failing. This project has hit that exact trap
-- before. One signature, replaced.

drop function if exists public.onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid);

create function public.onboard_merchant(
  p_shop_name text,
  p_shop_description text,
  p_business_category text,
  p_contact_phone text,
  p_address text,
  p_product_name text,
  p_product_description text,
  p_price integer,
  p_quantity integer,
  p_sku text,
  p_category_id uuid,
  p_kind text
)
returns table(merchant_id uuid, store_id uuid, product_id uuid, variant_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_kind         text := lower(coalesce(nullif(btrim(p_kind), ''), 'shop'));
  v_has_item     boolean := coalesce(btrim(p_product_name), '') <> '';
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_shop_name), '') = '' then
    raise exception 'shop name is required';
  end if;
  if v_kind not in ('shop', 'kitchen', 'service') then
    raise exception using errcode = 'RR005',
      message = 'Choose whether you are a shop, a kitchen or a service.';
  end if;

  -- A trade has to say WHAT it is: the customer is choosing "car wash" or
  -- "plumber", not a business name they have never heard of.
  if v_kind = 'service' and coalesce(btrim(p_business_category), '') = '' then
    raise exception using errcode = 'RR005', message = 'Tell us what kind of work you do.';
  end if;

  -- The item is optional now, but a HALF-FILLED item is still a mistake worth
  -- catching: somebody who typed a name and left the price blank meant to sell
  -- something and would otherwise get a free product.
  if v_has_item and (p_price is null or p_price < 0) then
    raise exception 'price must be zero or greater';
  end if;
  if v_has_item and (p_quantity is null or p_quantity < 0) then
    raise exception 'quantity must be zero or greater';
  end if;

  if exists (
    select 1 from merchants where owner_id = v_owner and status in ('pending', 'approved')
  ) then
    raise exception using errcode = 'RR001', message = 'You already have a shop with us.';
  end if;

  begin
    insert into merchants (owner_id, legal_name, display_name, contact_phone, status)
    values (v_owner, p_shop_name, p_shop_name, nullif(trim(p_contact_phone), ''), 'pending')
    returning id into v_merchant_id;
  exception when unique_violation then
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

  -- ── THE ROW THAT DECIDES WHAT CONSOLE THEY GET ──────────────────────────
  -- Every default on these tables is deliberate and lives on the table, so
  -- nothing is restated here: a kitchen gets 15-30 minutes prep, a trade gets
  -- 30-minute slots, one job at a time, 2 hours' notice, 14 days ahead. All of
  -- it is theirs to change afterwards, and none of it has to be asked at
  -- signup, which is the whole point.
  if v_kind = 'kitchen' then
    insert into food_kitchens (store_id) values (v_store_id);
  elsif v_kind = 'service' then
    insert into trade_providers (store_id, trade) values (v_store_id, btrim(p_business_category));
  end if;

  if v_has_item then
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
  end if;

  return query select v_merchant_id, v_store_id, v_product_id, v_variant_id;
end;
$function$;

comment on function public.onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid, text) is
  'Self-signup for a shop, a kitchen or a service provider (M178). The first item is optional, and p_kind creates the extension row - food_kitchens or trade_providers - that decides which console they get. Events are not offered: a box office is created by an admin.';

revoke all on function public.onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid, text) from public;
revoke all on function public.onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid, text) from anon;
grant execute on function public.onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid, text) to authenticated;

do $$
declare v_count integer;
begin
  -- The overload trap, asserted rather than assumed: two functions of this name
  -- would make PostgREST refuse the endpoint with PGRST203 and break every
  -- signup on the platform.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'onboard_merchant';
  if v_count <> 1 then
    raise exception 'M178: onboard_merchant is overloaded (% versions) - PostgREST will refuse it', v_count;
  end if;

  if has_function_privilege('anon', 'public.onboard_merchant(text,text,text,text,text,text,text,integer,integer,text,uuid,text)', 'EXECUTE') then
    raise exception 'M178: anon can create a merchant';
  end if;
end $$;
