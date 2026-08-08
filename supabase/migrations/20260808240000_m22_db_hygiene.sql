-- M22 — Close the database advisories that are real, document the ones that aren't.
--
-- Supabase's linter reports 16 anon-executable and 31 authenticated-executable
-- SECURITY DEFINER functions. Most of those are correct and deliberate —
-- store_is_visible, quote_order, create_order and friends EXIST to be called
-- from a session. Auditing all 47 by hand found exactly one class that is not:
-- TRIGGER FUNCTIONS.
--
-- WHY TRIGGER FUNCTIONS ARE DIFFERENT
-- Every function in this schema returning `trigger` was granted to PUBLIC by
-- default and never revoked. A trigger function is never meant to be invoked by
-- a client — it is meant to fire from a table event, where the trigger's own
-- privileges apply. So the grant buys nothing and costs a direct call path into
-- code that assumes it is running inside a trigger context:
--
--   provision_merchant_owner()  — the function that makes somebody a merchant
--   handle_new_user()           — runs on auth.users insert
--   enforce_active_subscription()
--   sync_store_rating(), sync_product_min_price(), apply_inventory_movement(),
--   set_updated_at()
--
-- Called bare, most of these fail on a NULL `NEW` record rather than doing
-- damage — but "it happens to crash" is not an access-control boundary, and
-- apply_inventory_movement() in particular touches stock.
--
-- VERIFIED BEFORE APPLYING, not assumed: Postgres checks EXECUTE on a trigger
-- function at CREATE TRIGGER time, not at fire time. Confirmed empirically
-- against this database inside a rolled-back transaction — after the revokes,
-- `update stores set name = name` still moved updated_at, and the inventory
-- trigger remained attached. Revoking cannot stop a trigger from firing.

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.apply_inventory_movement() from public, anon, authenticated;
revoke execute on function public.sync_product_min_price() from public, anon, authenticated;
revoke execute on function public.sync_store_rating() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.provision_merchant_owner() from public, anon, authenticated;
revoke execute on function public.enforce_active_subscription() from public, anon, authenticated;

-- ── Covering indexes for the four unindexed foreign keys ────────────────────
-- Each of these is a JOIN or a cascade path that currently degrades to a scan.
-- notifications(order_id) is the one that matters soonest: the merchant bell
-- and every order-detail view read it, and it grows with order volume forever.
create index if not exists notifications_order_id_idx on notifications (order_id);
create index if not exists audit_logs_actor_id_idx on audit_logs (actor_id);
create index if not exists orders_delivery_zone_id_idx on orders (delivery_zone_id);
create index if not exists qr_pickup_tokens_redeemed_by_idx on qr_pickup_tokens (redeemed_by);

-- ── Document the three "RLS enabled, no policy" tables ──────────────────────
-- The linter flags these as INFO. They are not a defect: RLS on with zero
-- policies is DENY-ALL for anon and authenticated, which is exactly the
-- intended posture for tables only the service role may touch. Recording the
-- intent here so a future maintainer "fixes" the warning by reading this rather
-- than by adding a policy that opens them up.
comment on table app_secrets is
  'Service-role only by design. RLS is enabled with NO policies, which denies anon and authenticated outright — that is the intent, not a missing policy (M22).';
comment on table partners is
  'Service-role only by design. Read through admin routes using getPrivileged(); RLS enabled with no policies denies all client roles (M22).';
comment on table site_content_history is
  'Service-role only by design. Written by the daily cron snapshot, read for content recovery. RLS enabled with no policies denies all client roles (M22).';

do $$
begin
  if has_function_privilege('authenticated', 'public.provision_merchant_owner()', 'EXECUTE') then
    raise exception 'M22: provision_merchant_owner is still directly callable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.apply_inventory_movement()', 'EXECUTE') then
    raise exception 'M22: apply_inventory_movement is still directly callable by anon';
  end if;
  -- The triggers themselves must still be attached.
  if (select count(*) from pg_trigger where not tgisinternal
        and tgfoid = 'public.apply_inventory_movement()'::regprocedure) = 0 then
    raise exception 'M22: the inventory trigger is no longer attached';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'notifications_order_id_idx') then
    raise exception 'M22: notifications_order_id_idx missing';
  end if;
end;
$$;
