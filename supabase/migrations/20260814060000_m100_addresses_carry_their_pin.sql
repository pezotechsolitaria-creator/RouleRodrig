-- ── M100 · An address you can tap ──────────────────────────────────────────
--
-- The owner, about "Baie aux Huîtres": tapping a shop's address has to show
-- where the shop actually IS. Every address on the site was plain grey text, so
-- a customer deciding whether to go and collect had to copy it out and search
-- for it themselves.
--
-- Two functions gain the coordinates the UI needs. Nothing is invented: lat and
-- lng come back null for the five of six live shops that have not set a pin,
-- and components/AddressLink.tsx says "this is the area, not the exact spot"
-- rather than dropping someone on the wrong end of a bay.
--
-- product_detail() and marketplace_home() are re-created in full below.
-- food_item_detail() is patched by rewriting its own definition — it is long
-- and load-bearing, and retyping it to add three fields invites changing a
-- fourth by accident. Every anchor is asserted first, so a source that has
-- moved on RAISES instead of silently shipping without the fields. (That guard
-- already caught one attempt with the wrong anchor whitespace.)

-- ── product_detail: the shop's pin ─────────────────────────────────────────
-- Applied as m100_product_detail_carries_the_pin. It is the same body as
-- 20260814020000_m96b with three fields added to the `store` object:
--   'lat', v_store.lat · 'lng', v_store.lng · 'phone', v_store.phone
-- and marketplace_home()'s seller strip gains 'lat'/'lng' likewise. Both are
-- reproduced in that migration; re-running it after this file is a no-op.

-- ── food_item_detail: the kitchen's pin ────────────────────────────────────
do $$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'food_item_detail';
  if v_src is null then raise exception 'food_item_detail not found'; end if;

  -- Already patched (this migration re-run, or a later one) — nothing to do.
  if position('kitchenAddress' in v_src) > 0 then return; end if;
  v_new := v_src;

  if position('  v_phone  text;' in v_new) = 0 then
    raise exception 'anchor 1 (declare block) no longer matches';
  end if;
  v_new := replace(v_new, '  v_phone  text;',
    '  v_phone  text;' || chr(10) ||
    '  v_addr   text;' || chr(10) ||
    '  v_lat    double precision;' || chr(10) ||
    '  v_lng    double precision;');

  if position('    into v_wa, v_phone' in v_new) = 0 then
    raise exception 'anchor 2 (contact select) no longer matches';
  end if;
  v_new := replace(v_new, '    into v_wa, v_phone',
    '         nullif(btrim(coalesce(s.address, '''')), ''''), s.lat, s.lng' || chr(10) ||
    '    into v_wa, v_phone, v_addr, v_lat, v_lng');
  if position('nullif(btrim(coalesce(s.phone, '''')), '''')' || chr(10) in v_new) = 0 then
    raise exception 'anchor 2b (phone select line) no longer matches';
  end if;
  v_new := replace(v_new,
    'nullif(btrim(coalesce(s.phone, '''')), '''')' || chr(10),
    'nullif(btrim(coalesce(s.phone, '''')), ''''),' || chr(10));

  if position('''kitchenPhone'',    v_phone' in v_new) = 0 then
    raise exception 'anchor 3 (return object) no longer matches';
  end if;
  v_new := replace(v_new, '''kitchenPhone'',    v_phone',
    '''kitchenPhone'',    v_phone,' || chr(10) ||
    '    ''kitchenAddress'', v_addr,' || chr(10) ||
    '    ''kitchenLat'',     v_lat,' || chr(10) ||
    '    ''kitchenLng'',     v_lng');

  execute v_new;
end $$;

-- Post-condition: the fields must actually come back, or this migration lied.
do $$
declare v_keys text;
begin
  select string_agg(k, ',') into v_keys
    from jsonb_object_keys(public.food_item_detail('chicken-curry')) k;
  if v_keys is null then
    raise notice 'no sample dish to verify against — skipping';
  elsif v_keys not like '%kitchenAddress%' or v_keys not like '%kitchenLat%' then
    raise exception 'food_item_detail still does not return the kitchen location';
  end if;
end $$;
