-- ── M95 — a way to reach the kitchen, on the dish ─────────────────────────
--
-- The owner: "add a WhatsApp link of the resto owner because tourists may not
-- be able to proceed as they do not have local bank accounts, and it will be
-- good for clients if there is a problem they can call the owner."
--
-- The first half is the serious one, and it is a direct consequence of M89.
-- Cash is gone platform-wide and every order is a bank transfer — which a
-- visitor holding a foreign card cannot make. For that customer the site has
-- no path at all today: they read the menu, reach checkout, and stop. A
-- WhatsApp link is not a nicety there, it is the only route from "I want this"
-- to "I ate it", and it costs the kitchen nothing.
--
-- The second half matters too: an order that goes wrong at 20:00 needs a
-- human, not a support form nobody reads until Monday.
--
-- NO NEW COLUMN. `stores.whatsapp` already existed and was simply never
-- surfaced — the admin kitchen editor writes `phone` and not this. So this
-- exposes what is already there, read straight from `stores` rather than
-- widening the food_catalog view that every food surface depends on. One extra
-- single-row lookup on a page that already does four.
--
-- Note the fallback to `phone`: on this island it is usually the same number,
-- and a kitchen that filled in only one field should still be reachable.
--
-- Verified by calling it: the new keys come back, `related` still returns 6,
-- and a number set in a rolled-back transaction appears as kitchenWhatsapp.
create or replace function public.food_item_detail(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  r        food_catalog%rowtype;
  v_images jsonb;
  v_vars   jsonb;
  v_rel    jsonb;
  v_wa     text;
  v_phone  text;
begin
  select * into r from food_catalog c where lower(c.slug::text) = lower(btrim(p_slug));
  if not found then return null; end if;

  select coalesce(jsonb_agg(pm.url order by pm.position), '[]'::jsonb)
    into v_images
    from product_media pm
   where pm.product_id = r.product_id and pm.kind = 'image';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',      pv.id,
           'name',    pv.name,
           'price',   pv.price,
           'compareAt', pv.compare_at,
           'stock',   pv.stock_quantity,
           'options', pv.options
         ) order by pv.position, pv.price), '[]'::jsonb)
    into v_vars
    from product_variants pv
   where pv.product_id = r.product_id and pv.is_active;

  select coalesce(jsonb_agg(q.card), '[]'::jsonb) into v_rel
    from (
      select o.card
        from food_catalog o
       where o.product_id <> r.product_id
         and (o.kitchen_id = r.kitchen_id or o.category_slugs && r.category_slugs)
       order by (o.kitchen_id = r.kitchen_id) desc,
                o.orderable desc,
                o.is_signature desc,
                o.sort_position
       limit 8
    ) q;

  select nullif(btrim(coalesce(s.whatsapp, '')), ''),
         nullif(btrim(coalesce(s.phone, '')), '')
    into v_wa, v_phone
    from stores s where s.id = r.kitchen_id;

  return r.card || jsonb_build_object(
    'description', r.description,
    'allergens',   r.allergens,
    'images',      v_images,
    'variants',    v_vars,
    'related',     v_rel,
    'pickupHint',  r.pickup_hint,
    'kitchenSlug', r.kitchen_slug,
    'kitchenWhatsapp', coalesce(v_wa, v_phone),
    'kitchenPhone',    v_phone
  );
end $function$;
