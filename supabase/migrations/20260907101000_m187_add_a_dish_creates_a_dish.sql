-- ── "ADD A DISH" HAS TO CREATE A DISH ──────────────────────────────────────
--
-- /kitchen's "Add a dish" links to /merchant/products/new, which calls
-- create_product(). That writes products + product_variants and nothing else.
--
-- But a DISH is a product that ALSO has a food_items row: kitchen_menu() --
-- the RPC behind "Today's menu" on /kitchen -- inner joins food_items, and so
-- does the public food catalogue. A product created that way is invisible on
-- the menu the owner just pressed the button on, and invisible on /food, while
-- showing up in /merchant/products and on the shop storefront. The click
-- succeeds and nothing appears, which is worse than a button that refuses.
--
-- All 9 dishes that existed when this was written were created through
-- /admin/food, which writes with the service-role key and bypasses RLS. That is
-- why nobody had hit it: the only working dish editor was behind the admin
-- password.
--
-- food_items cannot simply be granted to `authenticated`: its only write policy
-- requires is_platform_admin(), and platform_admins is EMPTY, so that policy
-- can never pass for anyone. Rather than open a table, this wraps both writes
-- in one SECURITY DEFINER function behind an explicit staff check -- the shape
-- create_product() already uses.
--
-- NOTE: superseded within minutes by m187b. This version casts to `citext`,
-- which does not resolve under the pinned search_path. Kept so the history
-- replays as it happened; m187b immediately replaces the body.

create or replace function public.create_dish(
  p_store_id    uuid,
  p_name        text,
  p_description text default null,
  p_price       integer default 0,
  p_quantity    integer default 0,
  p_descriptor  text default null
) returns table (product_id uuid, variant_id uuid, slug text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_product uuid;
  v_variant uuid;
  v_base    text;
  v_slug    text;
  v_n       integer := 1;
begin
  if not exists (select 1 from food_kitchens fk where fk.store_id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'That shop is not a kitchen.';
  end if;

  if not is_store_staff(p_store_id) then
    raise exception using errcode = 'RR002', message = 'You do not have access to that kitchen.';
  end if;

  select cp.product_id, cp.variant_id
    into v_product, v_variant
    from create_product(p_store_id, p_name, p_description, p_price, p_quantity, null, null, 'active') cp;

  v_base := trim(both '-' from regexp_replace(lower(coalesce(nullif(btrim(p_name), ''), 'dish')), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'dish'; end if;
  v_base := left(v_base, 60);
  v_slug := v_base;
  while exists (select 1 from food_items fi where fi.slug::citext = v_slug::citext) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  insert into food_items (product_id, slug, descriptor)
  values (v_product, v_slug::citext, nullif(btrim(coalesce(p_descriptor, '')), ''));

  return query select v_product, v_variant, v_slug;
end;
$function$;

revoke all on function public.create_dish(uuid, text, text, integer, integer, text) from public;
revoke all on function public.create_dish(uuid, text, text, integer, integer, text) from anon;
grant execute on function public.create_dish(uuid, text, text, integer, integer, text) to authenticated;
grant execute on function public.create_dish(uuid, text, text, integer, integer, text) to service_role;
