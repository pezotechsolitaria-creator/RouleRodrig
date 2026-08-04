-- ============================================================================
-- 0005 — Close the duplicate-merchant race (M2 review, Critical finding #1)
-- ----------------------------------------------------------------------------
-- Two tabs both loading /merchant/onboarding before either submits could each
-- independently pass the "no shop yet" page-load check, then both call
-- onboard_merchant(), producing two merchants for one owner. A page-load
-- check can never close a submit-time race — only a DB constraint can.
--
-- A rejected merchant may re-apply (a fresh 'pending' row), so the partial
-- index only covers the states that represent an ACTIVE application/shop.
-- ============================================================================
create unique index if not exists merchants_one_active_per_owner
  on merchants (owner_id)
  where status in ('pending', 'approved');
