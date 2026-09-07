-- ── FIVE SHELVES, AND EACH SELLS BOTH ───────────────────────────────────────
--
-- The owner, pointing at the category rail: the order should be All, Local
-- products, Professional Services, Vehicle Care & Detailing, Celebrations —
-- "note that each categories can also sell products for example in vehicle care
-- i can find vehicle products but services are priorities it is the same for
-- all".
--
-- That last sentence is the design. A category here is a SUBJECT, not a
-- fulfilment type: "Vehicle care" holds the wash you book AND the shampoo you
-- buy, because that is how somebody shops for a clean car. Splitting the rail
-- into "things" and "services" would ask a customer to know our data model
-- before they can find a bottle of car shampoo.
--
-- ── WHAT WAS ACTUALLY WRONG ────────────────────────────────────────────────
-- Three things, and the third is the one that mattered:
--
--   1. There was a category called "Services" holding five car-wash items, so
--      the rail offered "Services" and "Local products" as if those were
--      alternatives — one a fulfilment type, one a subject.
--   2. "Local products" held Car Shampoo and a microfibre cloth. Neither is a
--      local product; both are vehicle care.
--   3. THE BOOKABLE ONES HAD NO CATEGORY AT ALL. "Full valet" and "Quick wash"
--      — the only two items on the whole site a customer can actually book a
--      time for — carried category_id NULL, so the one rail built to find
--      things could not show them. The genuinely working feature was the
--      invisible one.
--
-- ── WHY POSITIONS ARE SPACED BY TEN ────────────────────────────────────────
-- So the next category can be slotted between two others without renumbering
-- the rail. The owner's order is 10/20/30/40; the food and craft shelves keep
-- their old numbers, which now sort after.

-- ── The three new shelves ──────────────────────────────────────────────────
-- slug is citext, so these are ordinary rows and an admin can add more without
-- a migration. The icons are keys into CategoryStrip's ICONS map; a key that
-- map does not know falls back to a package, which is why `wrench` and
-- `sparkles` are added there in the same change.
insert into categories (slug, name, icon, position, is_active) values
  ('professional-services', 'Professional Services', 'wrench',   20, true),
  ('vehicle-care',          'Vehicle Care & Detailing', 'car',   30, true),
  ('celebrations',          'Celebrations',          'sparkles', 40, true)
on conflict (slug) do update
  set name = excluded.name,
      icon = excluded.icon,
      position = excluded.position,
      is_active = excluded.is_active;

-- Local products leads the rail, per the owner's order.
update categories set position = 10 where slug = 'local-products';

-- ── Re-file what was in the wrong place ────────────────────────────────────
-- Everything a customer would look for under "clean my car" goes to one shelf,
-- whether they buy it or book it. Matched by name against ONE test store rather
-- than by a LIKE over the whole catalogue: a pattern such as '%wash%' would
-- happily move a real merchant's washing powder.
update products p
   set category_id = (select id from categories where slug = 'vehicle-care')
  from stores s
 where s.id = p.store_id
   and s.slug in ('roule-test-shop', 'roule-test-services')
   and p.name in (
     'Car Shampoo 1L',
     'Microfibre Cloth (pack of 3)',
     'Car Wash — Basic',
     'Car Wash — Interior & Exterior',
     'Full Detailing',
     'Full valet',
     'Quick wash'
   );

-- "Services" is now empty, and the rail only renders categories that have
-- something in them, so it disappears on its own. Deactivated rather than
-- deleted: products may still reference it from an order's history, and a
-- deleted row would take that with it.
update categories set is_active = false where slug = 'services';

-- ── Local products would otherwise have emptied ────────────────────────────
-- Its only two items were the car shampoo and the microfibre cloth, which have
-- just moved to vehicle care where they belong. The rail hides an empty shelf,
-- so the owner's FIRST category would have disappeared in the same change that
-- promoted it — the sort of thing that looks like the deploy broke.
--
-- Tipois is a genuinely local product and was filed under Fruit & Vegetables, a
-- shelf that holds nothing else. Moving it keeps the rail honest with the tiny
-- catalogue there is today: every visible shelf has something on it.
update products p
   set category_id = (select id from categories where slug = 'local-products')
 where p.name = 'Tipois'
   and p.category_id = (select id from categories where slug = 'fruit-veg');

-- ── The rail must not show an empty shelf ──────────────────────────────────
-- The strip's own comment: "The RPC only returns categories that have products,
-- so a tap can never land on an empty shelf." Professional Services and
-- Celebrations are therefore invisible until somebody lists in them, which is
-- the honest behaviour — a shelf with nothing on it advertises a shop that
-- cannot serve you.

do $$
declare v_n integer;
begin
  select count(*) into v_n from categories
   where slug in ('professional-services','vehicle-care','celebrations')
     and is_active;
  if v_n <> 3 then raise exception 'expected 3 new categories, found %', v_n; end if;

  select count(*) into v_n from products p
    join categories c on c.id = p.category_id
   where c.slug = 'vehicle-care';
  if v_n <> 7 then raise exception 'expected 7 vehicle-care items, found %', v_n; end if;

  -- The two bookable ones are the whole point of the re-file.
  select count(*) into v_n from products p
    join categories c on c.id = p.category_id
   where c.slug = 'vehicle-care' and p.name in ('Full valet','Quick wash');
  if v_n <> 2 then raise exception 'the bookable services were not filed, found %', v_n; end if;

  select count(*) into v_n from categories where slug = 'local-products' and position = 10;
  if v_n <> 1 then raise exception 'local-products is not leading the rail'; end if;

  -- The owner's first shelf must not be empty, or it vanishes from the rail in
  -- the very change that promoted it.
  select count(*) into v_n from products p
    join categories c on c.id = p.category_id
   where c.slug = 'local-products';
  if v_n < 1 then raise exception 'local-products is empty and would leave the rail'; end if;
end $$;
