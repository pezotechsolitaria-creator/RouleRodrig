-- M5.1 follow-up hardening, from the independent adversarial pass on the
-- merchants/stores lockdown. Same thesis as that migration: RLS decides WHICH
-- ROW, column grants decide WHICH COLUMNS. These are the tables where only one
-- of the two belts was fastened.

-- ── reviews: a customer could self-publish, skipping moderation ──────────────
-- reviews.status defaults to 'pending' and a separate reviews_moderate policy
-- (store staff / platform admin) exists, so moderation is clearly the intended
-- flow — but reviews_author_write is INSERT-only with WITH CHECK
-- (customer_id = auth.uid()) and no status predicate, while `authenticated`
-- held INSERT on every column including status. A signed-in user could
-- therefore POST a review with status='published' straight to PostgREST.
--
-- This was pre-existing, but the M5.1 lockdown is what made its IMPACT real:
-- sync_store_rating() had to become SECURITY DEFINER (so the reviews trigger
-- could still write stores.rating_* after the stores UPDATE revoke), and that
-- change is what lets a self-published review actually move a shop's public
-- rating. Before, the trigger ran as the reviewer and was silently filtered to
-- zero rows by stores RLS. Closing the hole I widened.
--
-- Fix: take away the ability to CHOOSE a status on insert, so the 'pending'
-- default always applies. Moderation (reviews_moderate) is untouched.
revoke insert on reviews from authenticated, anon;
grant insert (store_id, product_id, order_id, customer_id, rating, title, body)
  on reviews to authenticated;

-- ── merchants: DELETE was never revoked ──────────────────────────────────────
-- Not exploitable today (merchants has no DELETE policy, so RLS refuses every
-- row), but it is the one verb the lockdown migration missed, and it guards the
-- row that carries approval status and the future subscription state.
revoke delete on merchants from authenticated, anon;

-- ── identity tables: staff membership and platform admin ─────────────────────
-- merchant_staff grants access to a merchant's whole store; platform_admins
-- grants is_platform_admin(), which every policy in the schema treats as a
-- master key. Both still carried blanket INSERT/UPDATE/DELETE for authenticated
-- AND anon, held back only by the absence of a permissive RLS write policy —
-- one accidental future policy away from full account takeover.
--
-- Nothing in the app writes either table with a user session: merchant_staff
-- rows are created by onboard_merchant() and the provision_merchant_owner
-- trigger (both SECURITY DEFINER), and the only other writer is the E2E fixture,
-- which uses the service-role client and bypasses grants entirely.
revoke insert, update, delete on merchant_staff from authenticated, anon;
revoke insert, update, delete on platform_admins from authenticated, anon;
