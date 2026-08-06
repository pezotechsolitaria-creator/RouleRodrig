-- Subscription plans get a price, so renewals stop recording Rs 0.00.
--
-- Traced: app/api/admin/subscriptions/route.ts accepts an optional `amount` and
-- falls back to 0 when writing subscription_invoices; the admin UI never sends
-- one. There was also no plan price ANYWHERE in the schema — nothing to fall
-- back to — so every renewal invoice recorded zero and the merchant's billing
-- history read "Rs 0.00" for a subscription they had actually paid for.
--
-- Prices live on marketplace_settings, which already holds the platform-wide
-- knobs (delivery_enabled, delivery_max_minutes). One row, one place the owner
-- edits, no new table for three numbers. Minor units, like every other amount
-- in this system.
--
-- Seeded at 0 deliberately: a made-up price would be worse than an obvious
-- blank. The admin UI flags any plan still at zero, and the renewal control
-- pre-fills from here while still allowing a one-off override for the case
-- where a merchant paid something different.
alter table marketplace_settings
  add column if not exists plan_prices jsonb not null default
    '{"starter": 0, "standard": 0, "premium": 0}'::jsonb;

comment on column marketplace_settings.plan_prices is
  'Monthly subscription price per plan, in minor units (MUR cents). 0 means unset — the owner must configure before invoicing.';

-- Whatever shape the UI sends, the three known plans must always be present and
-- non-negative, so the renewal path can index into it without a null guard.
alter table marketplace_settings drop constraint if exists marketplace_settings_plan_prices_shape;

alter table marketplace_settings add constraint marketplace_settings_plan_prices_shape
  check (
    plan_prices ? 'starter' and plan_prices ? 'standard' and plan_prices ? 'premium'
    and (plan_prices ->> 'starter')::integer  >= 0
    and (plan_prices ->> 'standard')::integer >= 0
    and (plan_prices ->> 'premium')::integer  >= 0
  );
