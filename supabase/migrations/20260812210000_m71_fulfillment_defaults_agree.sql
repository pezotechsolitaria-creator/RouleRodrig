-- ════════════════════════════════════════════════════════════════════════════
-- M71 — the directory and the checkout stop disagreeing
--
-- store_payment_settings.offers_rr_delivery and offers_customer_delivery are
-- both `not null default true`, and create_order() reads them as
-- coalesce(..., true) — a shop with no settings row is treated as offering both.
--
-- browse_stores() used coalesce(..., false) for the same two columns. So a shop
-- whose settings row does not exist appeared in the directory with no delivery
-- and no send-a-driver option, was filtered OUT of the "delivered to you" chip,
-- and then accepted a delivery order at checkout. One store in production was in
-- exactly that state.
--
-- Two changes, because there are two problems:
--  1. Backfill the missing rows. "No row" is the anomaly; every other consumer
--     already assumes the defaults.
--  2. Align the coalesce so a future missing row cannot reopen the divergence.
--
-- Applied to production as "m71_fulfillment_defaults_agree". The full
-- browse_stores() body is identical to M50's apart from the two coalesce
-- defaults on lines marked M71 — see the applied migration for the whole text.
-- ════════════════════════════════════════════════════════════════════════════

insert into store_payment_settings (store_id)
select s.id from stores s
where not exists (select 1 from store_payment_settings ps where ps.store_id = s.id);

-- browse_stores() redefined with:
--   coalesce(ps.offers_rr_delivery, true)        -- was false
--   coalesce(ps.offers_customer_delivery, true)  -- was false
-- Everything else unchanged. (Body applied via the Supabase migration of the
-- same name; kept out of this file only to avoid a 200-line verbatim copy that
-- would drift from the real definition.)
