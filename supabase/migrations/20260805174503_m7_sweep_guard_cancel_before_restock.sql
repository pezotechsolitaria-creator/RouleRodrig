-- The abandoned-checkout sweep inside create_order() restocked a stale order's
-- goods and THEN cancelled it with `update orders set status='cancelled'
-- where id=v_stale.id` — no status predicate and no row lock. Two real defects
-- follow from that single line:
--
--   1. Lost payment. Under READ COMMITTED, a concurrent confirm_order_payment()
--      can take the row lock first and set status='paid'. Our UPDATE blocks,
--      then EvalPlanQual re-evaluates only `id=v_stale.id`, which still matches,
--      so 'paid' is overwritten with 'cancelled' — while the goods the customer
--      just paid for have already been credited back to stock.
--
--   2. Double restock. Nothing locks the stale order, and inventory_movements
--      has no uniqueness on (order_id, reason), so two concurrent checkouts can
--      both sweep the same order and both insert restock rows. Stock inflates
--      above what the shop physically holds, which then oversells.
--
-- The fix is ordering plus a predicate: flip the status first, guarded on the
-- status we believed it had, and only restock when that transition actually
-- happened. EvalPlanQual now re-checks `status='pending_payment'` too, so a
-- concurrently-paid order no longer matches and the sweep becomes a no-op —
-- which also makes the second concurrent sweep of the same order a no-op.
do $do$
declare
  src text; newsrc text;
  old_frag text := $frag$    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select oi.variant_id, oi.quantity, 'restock', v_stale.id, 'auto-released: abandoned checkout'
    from order_items oi where oi.order_id=v_stale.id;
    update orders set status='cancelled' where id=v_stale.id;$frag$;
  new_frag text := $frag$    -- Cancel FIRST, guarded on the status we believed this order had, so a
    -- concurrent payment confirmation cannot be overwritten and a second
    -- concurrent sweep of the same order cannot restock it twice.
    update orders set status='cancelled'
      where id=v_stale.id and status='pending_payment';
    if not found then continue; end if;
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select oi.variant_id, oi.quantity, 'restock', v_stale.id, 'auto-released: abandoned checkout'
    from order_items oi where oi.order_id=v_stale.id;$frag$;
begin
  select pg_get_functiondef(oid) into src from pg_proc
  where proname = 'create_order' and pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'create_order() not found'; end if;

  if position('if not found then continue; end if;' in src) > 0 then
    raise notice 'sweep already guarded; nothing to do';
    return;
  end if;
  if position(old_frag in src) = 0 then
    raise exception 'create_order() sweep fragment not found — refusing to patch blindly';
  end if;

  newsrc := replace(src, old_frag, new_frag);
  execute newsrc;
end
$do$;
