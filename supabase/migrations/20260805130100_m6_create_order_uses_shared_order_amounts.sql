-- Point create_order() at the shared pricing policy so the amount a customer is
-- QUOTED and the amount they are CHARGED are produced by the same code.
--
-- Rewrites only the totals tail of the existing definition rather than
-- restating the whole function, which keeps this migration reviewable. The
-- guard makes a silent no-op impossible: if the expected snippet is absent
-- (because a later migration changed the function), this raises rather than
-- leaving the quote and charge paths quietly diverged.
do $do$
declare
  src      text;
  newsrc   text;
  old_tail text := '  if not v_store.tax_inclusive then v_tax := round(v_subtotal*coalesce(v_store.default_tax_rate,0))::integer; end if;
  v_total := v_subtotal + v_tax + v_delivery_fee;
  update orders set subtotal=v_subtotal, tax=v_tax, total=v_total, commission_amount=0 where id=v_order_id;';
  new_tail text := '  select a.tax, a.delivery_fee, a.total into v_tax, v_delivery_fee, v_total
  from order_amounts(p_store_id, v_subtotal, p_fulfillment) a;
  update orders set subtotal=v_subtotal, tax=v_tax, delivery_fee=v_delivery_fee, total=v_total, commission_amount=0 where id=v_order_id;';
begin
  select pg_get_functiondef(oid) into src from pg_proc where proname = 'create_order';

  if src is null then
    raise exception 'create_order() not found';
  end if;

  if position(old_tail in src) = 0 then
    -- Already migrated is fine; anything else means the assumption is stale.
    if position('order_amounts(p_store_id, v_subtotal, p_fulfillment)' in src) > 0 then
      raise notice 'create_order already uses order_amounts(); nothing to do';
      return;
    end if;
    raise exception 'create_order() tail did not match the expected snippet - refusing to patch blindly';
  end if;

  newsrc := replace(src, old_tail, new_tail);
  execute newsrc;
end
$do$;
