-- M42 — An event store is not a shop, and must not appear in /shop.
--
-- "An event IS a store" (M33) is the right internal model, but it has a
-- customer-facing consequence nobody would want: the moment an event is
-- published, a concert appears in the marketplace directory between the honey
-- and the baskets, with an "Open now" badge and a product called "Entry".
-- Verified live before writing this — the seeded Summer Fest store showed up
-- in /shop exactly like that.
--
-- browse_stores() is the single source of the directory, so one predicate there
-- fixes every surface that reads it.
--
-- ON THE PATCHING METHOD
-- This repo's convention is to reproduce a shipped RPC whole rather than
-- string-patch it, so an amendment cannot silently drop an earlier fix. That
-- convention exists to protect against a HUMAN retyping the function from
-- memory — and browse_stores() is 6,435 characters carrying amendments from
-- M12 through M27. Retyping it by hand is the LARGER risk here, not the
-- smaller one. So the patch is applied programmatically against the live
-- definition and then asserted three ways:
--   1. the anchor must exist, or the migration aborts having changed nothing;
--   2. the result must still contain markers of the earlier amendments
--      (store_schedule_at, deliveryFeeFrom, ratingAvg);
--   3. a FUNCTIONAL test proves an event store is absent from the directory
--      while ordinary shops are still returned.
-- Re-running is safe: it detects its own predicate and no-ops.
do $$
declare
  v_def    text;
  v_anchor constant text := 'where s.status = ''active''
      and m.status = ''approved''';
  v_new    text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'browse_stores';

  if v_def is null then
    raise exception 'M42: browse_stores() not found.';
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'M42: the store filter in browse_stores() has changed shape. Re-read it before patching — nothing was modified.';
  end if;
  if position('not exists (select 1 from events' in v_def) > 0 then
    raise notice 'M42: already applied, nothing to do.';
    return;
  end if;

  v_new := replace(v_def, v_anchor, v_anchor || '
      -- M42: an event store is not a shop. Events have their own surface at
      -- /events; showing a concert in the marketplace directory would be a
      -- category error for the visitor and would pollute every filter here.
      and not exists (select 1 from events ev where ev.store_id = s.id)');

  execute v_new;
end;
$$;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v_src     text;
  v_before  int;
  v_after   int;
  v_sid     uuid;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='browse_stores';

  if position('not exists (select 1 from events' in v_src) = 0 then
    raise exception 'M42: the exclusion did not land.';
  end if;
  if position('store_schedule_at' in v_src) = 0
     or position('deliveryFeeFrom' in v_src) = 0
     or position('ratingAvg' in v_src) = 0 then
    raise exception 'M42: browse_stores() lost an earlier feature.';
  end if;

  select (browse_stores(null,null,null,false,'featured',50,0) -> 'total')::int into v_after;
  select count(*) into v_before from stores s join merchants m on m.id = s.merchant_id
   where s.status='active' and m.status='approved';
  select store_id into v_sid from events limit 1;

  if v_sid is not null and exists (
       select 1 from jsonb_array_elements(browse_stores(null,null,null,false,'featured',50,0) -> 'stores') x
        where (x ->> 'id')::uuid = v_sid) then
    raise exception 'M42: an event store is still listed in the shop directory.';
  end if;

  raise notice 'M42 ok — directory shows % of % active stores (events excluded).', v_after, v_before;
end;
$$;
