-- M5.1 P0 SECURITY FIX — privilege escalation on merchants and stores.
--
-- Found during the architecture-update audit and PROVEN by impersonation:
--   set local role authenticated;  -- as a real merchant owner
--   update merchants set commission_rate = 0, status = 'approved' where owner_id = <self>;
--   -- => succeeded, returned {status: "approved", commission_rate: 0.0000}
--
-- Cause: RLS on these tables is row-level only (merchants_update USING
-- owner_id = auth.uid(), stores_staff_write USING is_store_staff(id)), but both
-- `authenticated` AND `anon` still held blanket table-wide INSERT/UPDATE on every
-- column. The M4/M5 column-grant lockdown (20260804185000 / 20260804185100) was
-- applied to `orders` only and never mirrored here.
--
-- Impact under the new business rules: a merchant could self-approve (bypassing
-- admin review), zero their own commission, forge kyc_status, or re-parent their
-- store to an approved merchant to restore visibility. That makes the incoming
-- subscription model's automatic-suspension enforcement (business rule 1)
-- worthless, since a suspended merchant could simply un-suspend themselves.
--
-- Fix: same belt-and-braces shape as the orders lockdown — revoke the blanket
-- grant, then re-grant ONLY the columns a merchant legitimately edits. RLS still
-- decides WHICH ROW; these grants now decide WHICH COLUMNS.

-- ── merchants ────────────────────────────────────────────────────────────────
-- Creation stays exclusively with onboard_merchant() (SECURITY DEFINER, verified),
-- which is what hardcodes status='pending' — so a client INSERT is never needed
-- and was itself an escalation path (POST owner_id=self, status='approved').
revoke insert, update on merchants from authenticated, anon;

-- Platform-controlled, deliberately NOT granted: id, owner_id, status,
-- kyc_status, commission_rate, created_at, updated_at.
grant update (
  legal_name, display_name, contact_email, contact_phone,
  kyc_documents, payout_details, metadata
) on merchants to authenticated;

-- ── stores ───────────────────────────────────────────────────────────────────
-- DELETE is revoked outright: stores are referenced by orders/products, so
-- removal would orphan real history. Closing a shop = status 'closed'.
revoke insert, update, delete on stores from authenticated, anon;

-- Deliberately NOT granted: id, merchant_id (re-parenting a store onto an
-- approved merchant restored store_is_visible()), rating_avg, rating_count
-- (trigger-computed, see below), created_at, updated_at.
-- logo_url IS granted — app/api/merchant/media/route.ts:72 legitimately writes it
-- with the caller's own session client.
-- status IS granted (pause/holiday/closed is the merchant's own call); it cannot
-- resurrect a suspended merchant because store_is_visible() also requires
-- merchant_is_approved(merchant_id).
grant update (
  name, slug, tagline, description, logo_url, cover_url, status, category_hint,
  phone, whatsapp, address, lat, lng, currency, tax_inclusive, default_tax_rate,
  pickup_config, fulfillment
) on stores to authenticated;

-- ── keep the rating trigger working after the lockdown ───────────────────────
-- t_review_store_rating on `reviews` calls sync_store_rating(), which UPDATEs
-- stores.rating_count/rating_avg. It was NOT security definer, so it ran with the
-- reviewer's privileges — and would now fail with "permission denied for table
-- stores" the moment a customer posted a review. Making it SECURITY DEFINER is
-- also the correct security posture: it writes only computed aggregates over
-- published reviews, never caller-supplied values, so no user input can reach
-- the elevated write. search_path stays pinned to public.
create or replace function sync_store_rating()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare _sid uuid := coalesce(new.store_id, old.store_id);
begin
  update stores s set
    rating_count = (select count(*) from reviews r where r.store_id = _sid and r.status = 'published'),
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r
                             where r.store_id = _sid and r.status = 'published'), 0)
  where s.id = _sid;
  return null;
end $$;
