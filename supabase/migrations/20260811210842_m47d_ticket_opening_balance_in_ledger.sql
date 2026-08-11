-- M47d — a new ticket package never wrote its opening balance to the ledger.
--
-- Found by a platform-wide integrity sweep, not by a failing feature: summing
-- inventory_movements reconciles exactly with stock_quantity for all 14
-- marketplace variants across every real shop, and disagreed for exactly one —
-- the events ticket package (stock 495, ledger −5, a 500 gap).
--
-- The cause is M47's own creation branch, which logs the event but not the
-- quantity:
--
--     insert into product_variants (..., stock_quantity, ...) values (..., p_capacity, ...)
--     insert into inventory_movements (variant_id, delta, ...) values (v_variant, 0, ...)
--
-- Stock was set DIRECTLY on the variant and the ledger got a zero. Every later
-- capacity change is logged correctly, so the ledger tracks deltas but can never
-- reconstruct the balance — the one thing a ledger exists to do. Marketplace
-- products do this properly, which is why only tickets drifted.
--
-- Nothing was mis-sold: capacity enforcement (M47, M58) derives allocation from
-- ORDERS, not from movements. This is an audit-trail defect, and a ledger that
-- is complete for shops and incomplete for tickets is worse than one that is
-- uniformly either.
--
-- ── WHY THERE IS NO BACKFILL ────────────────────────────────────────────────
-- The obvious repair — insert the missing +500 opening movement — is wrong, and
-- the first attempt at this migration proved it by failing its own assertion.
-- t_inventory_apply ADDS every delta to stock_quantity, so a +500 "correction"
-- would raise real stock to 995 and leave the gap exactly where it was. Making
-- it reconcile would mean writing stock directly afterwards, which is precisely
-- the discipline this ledger exists to enforce.
--
-- So: fixed forward only. The one drifted row is TEST data (the Summer Fest
-- fixture) and is left honestly as-is rather than papered over with a movement
-- that never happened. Every package created from now on reconciles from birth,
-- which the probe at the bottom demonstrates rather than asserts.

do $$
declare
  v_def text;
  -- Stock must arrive THROUGH the ledger, so the trigger is what sets it —
  -- exactly how a marketplace product is created.
  v_old_stock constant text := '    values (v_product, btrim(p_name), p_price, p_capacity, coalesce(p_is_active, true))';
  v_new_stock constant text := '    values (v_product, btrim(p_name), p_price, 0, coalesce(p_is_active, true))';
  v_old_move  constant text := '    values (v_variant, 0, ''adjustment'', ''package created with capacity ''||p_capacity, auth.uid());';
  v_new_move  constant text := '    values (v_variant, p_capacity, ''restock'', ''package created with capacity ''||p_capacity, auth.uid());';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='upsert_ticket_package';
  if v_def is null then raise exception 'M47d: upsert_ticket_package not found.'; end if;

  if position(v_old_move in v_def) = 0 then
    raise notice 'M47d: already fixed — nothing to do.';
    return;
  end if;
  if position(v_old_stock in v_def) = 0 then
    raise exception 'M47d: variant-creation anchor not found; refusing to patch blindly.';
  end if;

  v_def := replace(v_def, v_old_stock, v_new_stock);
  v_def := replace(v_def, v_old_move,  v_new_move);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='upsert_ticket_package';
  if position('p_capacity, ''restock''' in v_def) = 0 then
    raise exception 'M47d: the opening balance is still not recorded.'; end if;
  -- M47's real guarantees must survive the patch.
  if position('already sold or reserved' in v_def) = 0 then
    raise exception 'M47d: lost the undersell guard.'; end if;
  if position('for update' in v_def) = 0 then
    raise exception 'M47d: lost the row lock.'; end if;
end;
$$;

-- Demonstrate the fix on a real package created through the real function, then
-- remove it. This is the assertion that matters: not "the SQL contains restock"
-- but "a package created today reconciles".
do $$
declare
  v_store uuid; v_uid uuid; v_j jsonb; v_variant uuid; v_stock int; v_ledger int;
begin
  select a.store_id, o.user_id into v_store, v_uid
    from event_organizer_assignments a join event_organizers o on o.id = a.organizer_id
   where a.role='organizer' and o.status='active' and o.user_id is not null limit 1;
  if v_store is null then raise notice 'M47d: no organiser to probe with.'; return; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := upsert_ticket_package(v_store, null, 'M47d ledger probe', null, null, null, null,
                               1000, 250, null, null, 1, null, 99, false);
  execute 'reset role';
  perform set_config('request.jwt.claims','', true);

  v_variant := (v_j->>'variantId')::uuid;
  if v_variant is null then raise exception 'M47d: probe package was not created.'; end if;

  select stock_quantity into v_stock from product_variants where id = v_variant;
  select coalesce(sum(delta),0)::int into v_ledger from inventory_movements where variant_id = v_variant;

  if v_stock <> 250 then
    raise exception 'M47d: opening stock is %, expected 250 — the trigger did not apply the restock.', v_stock; end if;
  if v_ledger <> v_stock then
    raise exception 'M47d: a NEW package still does not reconcile (stock %, ledger %).', v_stock, v_ledger; end if;

  delete from inventory_movements where variant_id = v_variant;
  delete from ticket_types where variant_id = v_variant;
  delete from product_variants where id = v_variant;
  raise notice 'M47d ok: a new package now reconciles (stock = ledger = %).', v_stock;
end;
$$;
