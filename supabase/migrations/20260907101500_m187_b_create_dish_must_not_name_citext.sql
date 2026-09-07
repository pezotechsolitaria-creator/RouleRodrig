-- ── A SECURITY DEFINER FUNCTION CANNOT ASSUME `citext` IS ON THE PATH ──────
--
-- food_items.slug is citext, and m187 wrote `v_slug::citext`. The function
-- pins `SET search_path TO 'public', 'pg_temp'` -- correctly, because a
-- SECURITY DEFINER function with a caller-controlled search_path is a
-- privilege escalation -- and Supabase installs extensions into their own
-- `extensions` schema. So the type name did not resolve and every call died:
--
--     42704: type "citext" does not exist
--
-- Caught by calling the function for real inside a transaction with
-- request.jwt.claims set to the owner's id, rather than by reading it.
--
-- Widening the search_path to reach the type would trade a real security
-- property for a cast. Neither cast is needed:
--
--   comparison  fi.slug::text names only `text`. Casting FROM citext does not
--               require citext to be on the path.
--   insert      the INSERT target's column type is known to the server, so a
--               text value is assignment-cast to citext without being named.
--
-- Case-insensitivity is unaffected: the column is still citext, and every slug
-- this function generates is lowercase by construction.

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

  -- Slug from the name, the way the existing dishes read ("grilled-fish",
  -- "farata-rougaille"). Suffixed rather than rejected on a clash: a kitchen
  -- with two "Salade" is a real thing, and refusing the second would send the
  -- owner off to invent names for a URL he never sees.
  v_base := trim(both '-' from regexp_replace(lower(coalesce(nullif(btrim(p_name), ''), 'dish')), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'dish'; end if;
  v_base := left(v_base, 60);
  v_slug := v_base;
  while exists (select 1 from food_items fi where fi.slug::text = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  insert into food_items (product_id, slug, descriptor)
  values (v_product, v_slug, nullif(btrim(coalesce(p_descriptor, '')), ''));

  return query select v_product, v_variant, v_slug;
end;
$function$;

-- Reachable by a signed-in kitchen owner; is_store_staff() inside is the
-- boundary, not the grant. anon has no business here -- it creates rows.
revoke all on function public.create_dish(uuid, text, text, integer, integer, text) from public;
revoke all on function public.create_dish(uuid, text, text, integer, integer, text) from anon;
grant execute on function public.create_dish(uuid, text, text, integer, integer, text) to authenticated;
grant execute on function public.create_dish(uuid, text, text, integer, integer, text) to service_role;
