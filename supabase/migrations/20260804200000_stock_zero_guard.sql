-- M5: apply_inventory_movement() has no floor guard (bare
-- stock_quantity = stock_quantity + delta) and there's no CHECK on
-- product_variants.stock_quantity either — a pre-existing gap, closed here
-- as part of M5's explicit "stock cannot go below zero" requirement.
-- Belt: this constraint. Suspenders: create_order() below row-locks and
-- validates stock before ever inserting a 'sale' movement, so this should
-- never actually fire in normal operation — it's the last-resort backstop.
alter table product_variants
  add constraint product_variants_stock_non_negative check (stock_quantity >= 0);
