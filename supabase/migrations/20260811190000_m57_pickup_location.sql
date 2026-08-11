-- M57 — Tell the customer WHERE to collect.
--
-- ── THE PROBLEM, IN THE OWNER'S WORDS ──────────────────────────────────────
-- "For pickup, people do not know where to pick it up."
--
-- He is right, and it is worse than an omission. The whole pickup flow was
-- built and then never said the one thing it exists to communicate: the
-- customer chose "Pick up", paid, got a code — and at no point was shown an
-- address. The order confirmation named the SELLER but not the PLACE. On an
-- island where half the collection points have no street number, "Ti Kitchen"
-- is not a location.
--
-- ── WHY THIS IS A DATABASE CHANGE AND NOT A UI ONE ─────────────────────────
-- The pickup point lives on stores (address, lat, lng) and, for food, on
-- food_kitchens.pickup_hint — the landmark that is often the ONLY usable
-- direction here ("green gate beside the church"). lookup_order() is what the
-- guest tracking page reads, and guest checkout is the default path, so the
-- address has to travel with the order or the page cannot show it at all.
--
-- The GPS pair matters more than the address text: a tap that opens Google Maps
-- and walks you there beats any sentence, and orders.delivery_lat/lng already
-- established the convention that a pin is the reliable locator on this island.
--
-- ── IT IS NOT FOOD-ONLY ────────────────────────────────────────────────────
-- A marketplace pickup order had exactly the same hole. This fixes all three
-- domains at once, which is why it reads from `stores` first and only reaches
-- into food_kitchens for the landmark.
--
-- Same asserted programmatic patch as M42/M50/M55/M56, anchored on M56's field.
do $blk$
declare
  v_def    text;
  v_anchor constant text := '''storeSlug'',     s.slug,';
  v_new    text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lookup_order';

  if v_def is null then
    raise exception 'M57: lookup_order() not found.';
  end if;
  if position('''pickupAddress''' in v_def) > 0 then
    raise notice 'M57: already applied, nothing to do.';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'M57: the storeSlug field in lookup_order() is not where it was. Re-read it before patching — nothing was modified.';
  end if;

  v_new := replace(
    v_def,
    v_anchor,
    v_anchor || '
           -- M57: WHERE to collect. Without these the pickup flow named the
           -- seller and never the place. The landmark is often the only usable
           -- direction on this island; the pin is the only reliable one.
           ''pickupAddress'',  s.address,
           ''pickupHint'',     (select fk.pickup_hint from food_kitchens fk where fk.store_id = s.id),
           ''pickupLat'',      s.lat,
           ''pickupLng'',      s.lng,'
  );

  -- The amendments that must survive, all verified present in the live
  -- definition before being asserted on.
  if position('''bank''' in v_new) = 0
     or position('''pickupCode''' in v_new) = 0
     or position('''isFood''' in v_new) = 0
     or position('''isEvent''' in v_new) = 0 then
    raise exception 'M57: the patched lookup_order() lost an earlier amendment. Aborting with nothing changed.';
  end if;

  execute v_new;
  raise notice 'M57: lookup_order() now reports the pickup location.';
end $blk$;
