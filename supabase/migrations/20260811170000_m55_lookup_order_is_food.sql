-- M55 — Tell the tracking page whether it is looking at a food order.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- /orders/track is the page a GUEST lands on after checkout, and guest checkout
-- is the default path — so it is where most food customers will spend their
-- time. It was written for the marketplace, so it offered them "Continue
-- shopping" and "Keep shopping", both pointing at /shop: a directory of honey,
-- chilli and baskets, shown to somebody waiting for their dinner.
--
-- Everything else on the order path could be fixed in the UI, because those
-- components already display the seller's name and could simply say "they".
-- These two are LINKS — they have to point somewhere, and only the database
-- knows where. Hence one extra field.
--
-- ── ON THE PATCHING METHOD ─────────────────────────────────────────────────
-- Same convention as M42 and M50: lookup_order() is 3,446 characters carrying
-- amendments from M11 (no-wildcard lookup), M19 (amount paid) and M21 (bank
-- block while unpaid). Retyping it from memory is the LARGER risk, so the patch
-- is applied programmatically against the live definition and asserted:
--   1. the anchor must exist, or the migration aborts having changed nothing;
--   2. markers of the earlier amendments must survive;
--   3. re-running detects its own field and no-ops.
do $blk$
declare
  v_def    text;
  v_anchor constant text := '''storeName'',     s.name,';
  v_new    text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lookup_order';

  if v_def is null then
    raise exception 'M55: lookup_order() not found.';
  end if;
  if position('''isFood''' in v_def) > 0 then
    raise notice 'M55: already applied, nothing to do.';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'M55: the storeName field in lookup_order() has changed shape. Re-read it before patching — nothing was modified.';
  end if;

  v_new := replace(
    v_def,
    v_anchor,
    v_anchor || '
           -- M55: a kitchen is not a shop. The tracking page uses this to send
           -- the customer back to the menu instead of the shop directory.
           ''isFood'',        exists (select 1 from food_kitchens fk where fk.store_id = s.id),'
  );

  -- The amendments that must survive: the bank block (M21) and the pickup code
  -- (M28). Both verified present in the live definition's key list BEFORE being
  -- asserted on — the first attempt at this migration asserted on a field name
  -- that had never existed, so it aborted every time and proved nothing.
  if position('''bank''' in v_new) = 0
     or position('''pickupCode''' in v_new) = 0 then
    raise exception 'M55: the patched lookup_order() lost an earlier amendment. Aborting with nothing changed.';
  end if;

  execute v_new;
  raise notice 'M55: lookup_order() now reports isFood.';
end $blk$;
