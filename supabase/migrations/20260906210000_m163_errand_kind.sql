-- ── "Do It For Me": a third kind of request ────────────────────────────────
--
-- The board already carries two shapes: collect something that exists
-- (`package`), and buy something then bring it (`shop_and_deliver`). The third
-- is the one people on this island actually ask each other for: GO AND DO
-- THIS. Pay the CEB bill. Queue at the bank. Fill the gas bottle. Collect the
-- prescription. The thing that comes back may be a receipt, or a document, or
-- nothing but the news that it is done.
--
-- ── THE CONSTRAINT THAT HAD TO BE REWRITTEN, NOT EXTENDED ─────────────────
-- `delivery_requests_budget_shape` was an EQUIVALENCE:
--
--     CHECK ((kind = 'shop_and_deliver') = (max_budget IS NOT NULL))
--
-- Read it with a third kind in hand: for an errand the left side is false, so
-- the right side must be false too — max_budget IS NULL, always, with no way
-- to say otherwise. Adding 'errand' to the kind list alone would have shipped
-- a "Do It For Me" that structurally could not carry money, and the failure
-- would have surfaced as a bare 23514 constraint violation on the first
-- person who tried to have a bill paid.
--
-- An errand is the one kind where the budget is genuinely OPTIONAL: paying a
-- bill needs a ceiling, queuing at the bank does not. So the rule becomes
-- three explicit statements rather than one clever one.
alter table delivery_requests
  drop constraint delivery_requests_kind_check,
  drop constraint delivery_requests_budget_shape;

alter table delivery_requests
  add constraint delivery_requests_kind_check
    check (kind in ('package', 'shop_and_deliver', 'errand')),
  add constraint delivery_requests_budget_shape
    check (
      -- Nothing is bought, so there is nothing to cap.
      (kind = 'package' and max_budget is null)
      -- Something IS bought; a driver spending their own money needs a ceiling.
      or (kind = 'shop_and_deliver' and max_budget is not null)
      -- May or may not involve money. Both are ordinary.
      or (kind = 'errand')
    );

comment on column delivery_requests.max_budget is
  'Minor units. Required for shop_and_deliver, forbidden for package, optional for errand — see delivery_requests_budget_shape.';
