-- Adversarial review finding (M4, "order tampering" check): orders_staff_update
-- RLS lets a store-staff member UPDATE their own store's order rows, but RLS
-- is row-level, not column-level — the authenticated role had a blanket
-- table-wide UPDATE grant, so any store staff member could call the
-- Supabase REST API directly (bypassing the Next.js route, its Zod
-- validation, and update_order_status()'s controlled state machine) to
-- rewrite total, subtotal, commission_amount, customer_id, or even store_id
-- on their own orders. update_order_status() is SECURITY DEFINER, so it
-- keeps working fine after the direct grant is narrowed — it writes as the
-- function owner, not the caller.
revoke update on orders from authenticated, anon;
grant update (status, internal_notes) on orders to authenticated;
