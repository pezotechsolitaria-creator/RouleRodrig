-- ── M192: FOUR SERVICES ON THE NEW SHELVES SAID "SOLD OUT" ──────────────────
--
-- Found by opening /shop after M183/M184 built the five shelves. The rail was
-- right -- All, Local products, Professional Services, Vehicle Care &
-- Detailing, Celebrations -- and four of the seven SERVICES on it were struck
-- through:
--
--     Party setup - 3 hours      Sold out
--     Call-out - first hour      Sold out
--     Full valet                 Sold out
--     Quick wash                 Sold out
--
-- The cause is that a service has no stock, and product_variants.stock_quantity
-- is `not null default 0`. There is no "not tracked" state to put a plumber's
-- hour in, so the seeds that did not think to pass a number got 0, and 0 is the
-- same value the shop uses to mean sold out (MarketProductCard: `!p.inStock`).
-- Half the seeds passed 9999 and half did not, which is why the car wash was
-- buyable and the valet next to it was not.
--
-- ── WHY A BIG NUMBER IS THE HONEST FIX HERE, AND NOT A LIE ──────────────────
-- Nothing decrements this column on a sale. apply_inventory_movement() is the
-- only writer in the whole database, and no function calls it -- it is reached
-- from the merchant's own stock screen. So stock_quantity is not a ledger; it
-- is an availability switch a merchant sets by hand. Setting a service to a
-- number it will never reach is exactly what that switch means for something
-- sold by the hour.
--
-- This corrects the DATA seeded by M183/M184. It does NOT fix the trap that
-- produced it: /merchant still asks "Stock quantity *" with no answer for a
-- service, so the next plumber to list a call-out will land here again. That
-- needs a form change and is deliberately not smuggled into a data migration.

update product_variants v
   set stock_quantity = 9999,
       updated_at = now()
  from products p
 where v.product_id = p.id
   and v.stock_quantity = 0
   and v.is_active
   and p.slug in (
     'party-setup-3-hours',
     'call-out-first-hour',
     'full-valet',
     'quick-wash'
   );

-- ── The shelves are only fixed if a SHOPPER can see it ──────────────────────
-- M183 asserted over rows in the table and passed while "Local products" was
-- empty on screen, because its only product lived in a draft store. The same
-- mistake here would pass on a service no shopper can reach, so the check runs
-- through store_is_visible() -- the canonical rule -- exactly as M185 does.
do $$
declare
  v_stuck int;
begin
  select count(*) into v_stuck
    from product_variants v
    join products p on p.id = v.product_id
    join stores  s on s.id = p.store_id
   where p.slug in ('party-setup-3-hours', 'call-out-first-hour',
                    'full-valet', 'quick-wash')
     and p.status = 'active'
     and store_is_visible(s.id)
     and v.is_active
     and v.stock_quantity <= 0;

  if v_stuck > 0 then
    raise exception
      'M192: % service variant(s) still read "Sold out" on a visible shelf',
      v_stuck;
  end if;
end $$;
