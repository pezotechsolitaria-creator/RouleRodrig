-- M23 — Monetization foundation: free → commission → subscription → hybrid,
--       without a database rewrite, and without ever rewriting history.
--
-- ── WHAT WAS ALREADY HERE (inspected, not assumed) ──────────────────────────
--   merchants.commission_rate      numeric NOT NULL default 0.10  — DEAD. Nothing
--                                  reads it; create_order writes commission_amount = 0.
--   orders.commission_amount       integer NOT NULL default 0     — DEAD, always 0.
--   merchant_subscriptions         plan (enum starter|standard|premium), status
--                                  (trialing|active|past_due|suspended|cancelled),
--                                  current_period_end, grace_days. REAL and used —
--                                  merchant_subscription_active() gates create_order.
--   marketplace_settings.plan_prices  jsonb {starter,standard,premium} — all 0.
--   subscription_invoices          real, but raised BY HAND in /admin/subscriptions.
--
-- So: subscriptions are real-but-manual, and commission is vestigial plumbing.
-- Neither can answer "what does this merchant actually owe, and why".
--
-- ── THE THREE DECISIONS THAT SHAPE THIS MIGRATION ───────────────────────────
--
-- 1. WHAT IS COMMISSIONABLE.  Merchandise only: (subtotal − discount).
--    NOT tax — that is the state's money, never the merchant's revenue.
--    NOT the delivery fee — on rr_delivery that fee is already Roulé Rodrigues'
--    own income, so taking a percentage of it would be charging ourselves
--    commission and double-counting platform revenue. Recorded separately, so
--    platform revenue = commission + rr delivery fees, each explainable.
--
-- 2. WHEN COMMISSION IS EARNED.  The rate is FROZEN at purchase (so an admin
--    raising 10% → 15% tomorrow cannot reprice yesterday), but it is only
--    EARNED when the order first reaches `paid`, and REVERSED if it reaches
--    `refunded`. An order that expires or is cancelled never earned anything.
--    Freezing and earning are different moments and conflating them is how
--    ledgers end up unexplainable.
--
-- 3. WHERE EARNING IS RECORDED.  A TRIGGER on orders.status, not an edit to
--    update_order_status(). That RPC is one of several paths that move an order
--    (admin, merchant, the cron sweep, a direct fix by hand), and a financial
--    invariant that only holds on the paths someone remembered to patch is not
--    an invariant. Database-enforced beats application-assumed.
--
-- ── BEHAVIOUR ON APPLY ──────────────────────────────────────────────────────
-- monetization_model defaults to 'subscription' and default_commission_rate to
-- 0, which is exactly the owner's canonical rule of 2026-08-05. So this
-- migration changes NO money today. It makes the switch possible, audited, and
-- server-authoritative — flipping it is a deliberate admin action.

-- ── 1. Platform configuration ───────────────────────────────────────────────
alter table marketplace_settings
  add column if not exists monetization_model text not null default 'subscription',
  add column if not exists default_commission_rate numeric(6,5) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='marketplace_settings_monetization_model_check') then
    alter table marketplace_settings add constraint marketplace_settings_monetization_model_check
      check (monetization_model in ('free','commission','subscription','hybrid'));
  end if;
  -- An explicit state, never NULL. "No platform fee" is a decision the owner
  -- made, not an absence of data — and a NULL here would silently become
  -- "whatever the resolver's fallback happens to be".
  if not exists (select 1 from pg_constraint where conname='marketplace_settings_commission_rate_check') then
    alter table marketplace_settings add constraint marketplace_settings_commission_rate_check
      -- 0.5 is a guard rail, not a business rule: no legitimate marketplace
      -- takes half, and a fat-fingered 50 instead of 0.50 must not be storable.
      check (default_commission_rate >= 0 and default_commission_rate <= 0.5);
  end if;
end;
$$;

comment on column marketplace_settings.monetization_model is
  'How Roule Rodrigues earns from the marketplace: free | commission | subscription | hybrid. Read ONLY through resolve_commission_rate(); never trusted from a client. Changed via admin_set_monetization(), which audits it (M23).';

-- ── 2. Subscription plans as data, not as an enum ───────────────────────────
-- The plan IDENTIFIER stays the existing `subscription_plan` enum, because
-- merchant_subscriptions.plan and subscription_invoices.plan both use it and
-- swapping a type under two live tables is a rewrite this does not need. What
-- becomes editable is everything the owner actually wants to change without a
-- deploy: price, commission, limits, whether the plan can sell at all.
--
-- KNOWN LIMIT, stated rather than hidden: adding a FOURTH tier still needs
-- `alter type subscription_plan add value '...'` in its own migration (Postgres
-- forbids using a new enum value in the transaction that adds it). Three tiers
-- plus monetization_model='free' covers the stated business need today.
create table if not exists subscription_plans (
  slug              text primary key,
  name              text not null,
  description       text,
  -- Minor units, always. Never a float: 0.1 + 0.2 <> 0.3 is not a rounding
  -- nuisance in a billing system, it is a wrong invoice.
  price_cents       integer not null default 0 check (price_cents >= 0),
  currency          char(3) not null default 'MUR',
  billing_interval  text not null default 'month' check (billing_interval in ('month','year')),
  -- NULL = this plan does not set a rate; fall through to the platform default.
  commission_rate   numeric(6,5) check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 0.5)),
  max_products      integer check (max_products is null or max_products > 0),
  max_staff         integer check (max_staff is null or max_staff > 0),
  allows_selling    boolean not null default true,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table subscription_plans is
  'Admin-editable commercial terms per plan tier. The tier IDENTIFIER is still the subscription_plan enum (merchant_subscriptions.plan::text = slug); this table holds everything that should change without a deploy (M23).';

-- Seed from what the system already believes, so nothing changes on apply.
-- prices come from marketplace_settings.plan_prices, which is where the owner
-- has been setting them.
insert into subscription_plans (slug, name, description, price_cents, sort_order)
select v.slug, v.name, v.description,
       coalesce((select (s.plan_prices ->> v.slug)::int from marketplace_settings s where s.id='main'), 0),
       v.ord
from (values
  ('starter',  'Starter',  'For a new shop finding its first customers.', 1),
  ('standard', 'Standard', 'For an established shop selling regularly.',  2),
  ('premium',  'Premium',  'For a busy shop that wants everything.',      3)
) as v(slug, name, description, ord)
on conflict (slug) do nothing;

drop trigger if exists subscription_plans_set_updated_at on subscription_plans;
create trigger subscription_plans_set_updated_at
  before update on subscription_plans
  for each row execute function set_updated_at();

alter table subscription_plans enable row level security;

-- A merchant must be able to read what their plan costs and what commission it
-- carries — that is the transparency requirement, and it is not secret. Only
-- ACTIVE plans, so a retired tier stops being advertised.
drop policy if exists subscription_plans_read on subscription_plans;
create policy subscription_plans_read on subscription_plans
  for select to authenticated using (is_active or is_platform_admin());

revoke all on subscription_plans from anon, authenticated;
grant select on subscription_plans to authenticated;
-- Writes go exclusively through admin_set_subscription_plan(), which audits.
-- No client role gets INSERT/UPDATE/DELETE at all.

-- ── 3. Per-merchant override ────────────────────────────────────────────────
-- merchants.commission_rate is NOT NULL default 0.10 and therefore cannot
-- express "no override" — 0.10 is indistinguishable from a deliberate 10%.
-- A nullable sibling says exactly what it means. The old column is left in
-- place, unread, rather than dropped under a live table.
alter table merchants
  add column if not exists commission_rate_override numeric(6,5)
    check (commission_rate_override is null or (commission_rate_override >= 0 and commission_rate_override <= 0.5));

comment on column merchants.commission_rate is
  'DEAD since the subscription model (2026-08-05). Superseded by commission_rate_override, which is nullable and therefore able to express "inherit". Kept only so nothing that still selects it breaks (M23).';
comment on column merchants.commission_rate_override is
  'NULL = inherit the plan rate, then the platform default. Set ONLY by a platform admin through admin_set_merchant_commission(); a merchant can never write its own rate (M23).';

-- ── 4. The resolver — the single authority on "what rate applies" ───────────
-- Every caller (checkout, merchant dashboard, admin dashboard) reads the rate
-- from here and nowhere else, so the displayed number and the charged number
-- cannot drift. Mirrors order_hold_hours() and order_amounts(), the pattern
-- this codebase already uses for "one place decides".
create or replace function public.resolve_commission_rate(p_merchant_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_model text;
  v_default numeric;
  v_rate numeric;
begin
  select monetization_model, default_commission_rate into v_model, v_default
    from marketplace_settings where id = 'main';
  v_model := coalesce(v_model, 'subscription');

  -- Under 'free' and 'subscription' the platform takes nothing per sale, so no
  -- override and no plan rate can reintroduce a fee. The MODEL is the outer
  -- gate; per-merchant configuration only refines a model that charges.
  if v_model not in ('commission','hybrid') then
    return 0;
  end if;

  select coalesce(
           m.commission_rate_override,
           (select sp.commission_rate
              from merchant_subscriptions ms
              join subscription_plans sp on sp.slug = ms.plan::text
             where ms.merchant_id = m.id
             order by ms.created_at desc
             limit 1),
           v_default,
           0)
    into v_rate
  from merchants m where m.id = p_merchant_id;

  -- Clamp on READ as well as on write. A rate that arrived through some future
  -- path bypassing the CHECKs still cannot produce a 300% commission.
  return greatest(0, least(0.5, coalesce(v_rate, 0)));
end;
$function$;

revoke all on function public.resolve_commission_rate(uuid) from public, anon;
grant execute on function public.resolve_commission_rate(uuid) to authenticated, service_role;

comment on function public.resolve_commission_rate(uuid) is
  'THE authority on commission. Order of resolution: platform model gate → merchant override → plan rate → platform default, clamped 0..0.5. Never accepts a rate as input (M23).';

-- ── 5. The immutable financial record ───────────────────────────────────────
create table if not exists order_financials (
  order_id              uuid primary key references orders(id) on delete cascade,
  currency              char(3) not null,
  -- The customer's side of the transaction, snapshotted so a later price edit,
  -- zone re-pricing or tax change can never restate a completed sale.
  gross_subtotal        integer not null,
  discount              integer not null default 0,
  tax                   integer not null default 0,
  delivery_fee          integer not null default 0,
  customer_total        integer not null,
  -- The platform's side.
  commissionable_amount integer not null,
  commission_rate       numeric(6,5) not null,
  commission_amount     integer not null,
  merchant_net          integer not null,
  -- Why the numbers are what they are — the audit answer to "explain this".
  monetization_model    text not null,
  plan_slug             text,
  calc_version          integer not null default 1,
  -- Lifecycle. Frozen at purchase, earned at paid, reversed at refunded.
  earned_at             timestamptz,
  reversed_at           timestamptz,
  reversal_reason       text,
  created_at            timestamptz not null default now(),

  constraint order_financials_non_negative check (
    gross_subtotal >= 0 and discount >= 0 and tax >= 0 and delivery_fee >= 0
    and customer_total >= 0 and commissionable_amount >= 0
    and commission_amount >= 0 and merchant_net >= 0
  ),
  -- The invariant that makes the row explainable: the platform can never take
  -- more than the merchandise was worth, and the two halves must reconcile
  -- exactly. A row that cannot satisfy this must not be storable at all.
  constraint order_financials_reconciles check (
    commission_amount <= commissionable_amount
    and merchant_net = commissionable_amount - commission_amount
  ),
  constraint order_financials_rate_sane check (commission_rate >= 0 and commission_rate <= 0.5)
);

comment on table order_financials is
  'One immutable row per order explaining where every rupee went. Written inside create_order with the rate FROZEN at purchase time; earned_at/reversed_at are maintained by a trigger on orders.status. Changing platform pricing never rewrites these rows (M23).';
comment on column order_financials.commissionable_amount is
  'Merchandise only: gross_subtotal − discount. Excludes tax (not the merchant''s revenue) and the delivery fee (already platform income on rr_delivery — commissioning it would double-count).';

create index if not exists order_financials_earned_idx on order_financials (earned_at) where earned_at is not null;

alter table order_financials enable row level security;

-- A merchant sees its own orders' fees; a platform admin sees everything;
-- customers and anon see nothing — the split between platform and merchant is
-- not the buyer's business.
drop policy if exists order_financials_read on order_financials;
create policy order_financials_read on order_financials
  for select to authenticated
  using (
    is_platform_admin()
    or exists (
      select 1 from orders o join stores s on s.id = o.store_id
      where o.id = order_financials.order_id and is_store_staff(s.id)
    )
  );

revoke all on order_financials from anon, authenticated;
grant select on order_financials to authenticated;
-- No client INSERT/UPDATE/DELETE anywhere: rows are written by create_order
-- (SECURITY DEFINER) and mutated only by the lifecycle trigger.

-- ── 6. Earning and reversal, enforced by the database ───────────────────────
create or replace function public.sync_order_financials_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = old.status then
    return new;
  end if;

  -- EARNED once, on the first arrival at `paid`. `coalesce(earned_at, ...)`
  -- rather than an unconditional set, so a later paid → preparing → paid does
  -- not restate the earning date.
  if new.status = 'paid' then
    update order_financials
       set earned_at = coalesce(earned_at, now())
     where order_id = new.id and reversed_at is null;

  -- REVERSED on refund. The amounts are NOT zeroed — the sale genuinely
  -- happened and the ledger must still say so; reversed_at is what excludes it
  -- from revenue. Zeroing would destroy the audit trail this table exists for.
  elsif new.status = 'refunded' then
    update order_financials
       set reversed_at = coalesce(reversed_at, now()),
           reversal_reason = coalesce(reversal_reason, 'order refunded')
     where order_id = new.id;

  -- Never earned. Cancelled and expired orders reach here with earned_at still
  -- NULL, which is already correct — but an order cancelled AFTER payment must
  -- not silently keep counting as platform revenue.
  elsif new.status = 'cancelled' then
    update order_financials
       set reversed_at = coalesce(reversed_at, now()),
           reversal_reason = coalesce(reversal_reason, 'order cancelled')
     where order_id = new.id and earned_at is not null;
  end if;

  return new;
end;
$function$;

-- M22 discipline: a trigger function is never client-callable.
revoke all on function public.sync_order_financials_lifecycle() from public, anon, authenticated;

drop trigger if exists orders_sync_financials on orders;
create trigger orders_sync_financials
  after update of status on orders
  for each row execute function sync_order_financials_lifecycle();

-- ── 7. Admin-only configuration, audited ────────────────────────────────────
create or replace function public.admin_set_monetization(
  p_model text,
  p_default_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if p_model not in ('free','commission','subscription','hybrid') then
    raise exception using errcode='RR005', message='Unknown monetization model.';
  end if;
  if p_default_rate is null or p_default_rate < 0 or p_default_rate > 0.5 then
    raise exception using errcode='RR005', message='Commission must be between 0% and 50%.';
  end if;

  select jsonb_build_object('monetization_model', monetization_model,
                            'default_commission_rate', default_commission_rate)
    into v_before from marketplace_settings where id='main';

  update marketplace_settings
     set monetization_model = p_model, default_commission_rate = p_default_rate
   where id='main';

  v_after := jsonb_build_object('monetization_model', p_model, 'default_commission_rate', p_default_rate);

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'monetization.updated', 'marketplace_settings', 'main',
          jsonb_build_object('before', v_before, 'after', v_after));

  return v_after;
end;
$function$;

revoke all on function public.admin_set_monetization(text, numeric) from public, anon;
grant execute on function public.admin_set_monetization(text, numeric) to authenticated, service_role;

create or replace function public.admin_set_subscription_plan(
  p_slug text,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_commission_rate numeric,
  p_max_products integer,
  p_max_staff integer,
  p_allows_selling boolean,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if p_price_cents is null or p_price_cents < 0 then
    raise exception using errcode='RR005', message='Price cannot be negative.';
  end if;
  if p_commission_rate is not null and (p_commission_rate < 0 or p_commission_rate > 0.5) then
    raise exception using errcode='RR005', message='Commission must be between 0% and 50%.';
  end if;

  select to_jsonb(sp) into v_before from subscription_plans sp where sp.slug = p_slug;
  if v_before is null then
    raise exception using errcode='RR003', message='Plan not found.';
  end if;

  update subscription_plans
     set name = coalesce(nullif(btrim(p_name), ''), name),
         description = p_description,
         price_cents = p_price_cents,
         commission_rate = p_commission_rate,
         max_products = p_max_products,
         max_staff = p_max_staff,
         allows_selling = coalesce(p_allows_selling, allows_selling),
         is_active = coalesce(p_is_active, is_active)
   where slug = p_slug
   returning to_jsonb(subscription_plans) into v_after;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'subscription_plan.updated', 'subscription_plans', p_slug,
          jsonb_build_object('before', v_before, 'after', v_after));

  return v_after;
end;
$function$;

revoke all on function public.admin_set_subscription_plan(text, text, text, integer, numeric, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.admin_set_subscription_plan(text, text, text, integer, numeric, integer, integer, boolean, boolean) to authenticated, service_role;

create or replace function public.admin_set_merchant_commission(
  p_merchant_id uuid,
  p_rate numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_before numeric;
begin
  if not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 0.5) then
    raise exception using errcode='RR005', message='Commission must be between 0% and 50%.';
  end if;

  select commission_rate_override into v_before from merchants where id = p_merchant_id;
  if not found then
    raise exception using errcode='RR003', message='Merchant not found.';
  end if;

  update merchants set commission_rate_override = p_rate where id = p_merchant_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'merchant_commission.updated', 'merchants', p_merchant_id::text,
          jsonb_build_object('before', v_before, 'after', p_rate, 'reason', p_reason));

  return jsonb_build_object('merchantId', p_merchant_id, 'commissionRateOverride', p_rate);
end;
$function$;

revoke all on function public.admin_set_merchant_commission(uuid, numeric, text) from public, anon;
grant execute on function public.admin_set_merchant_commission(uuid, numeric, text) to authenticated, service_role;

-- ── 8. Post-conditions ──────────────────────────────────────────────────────
do $$
declare v_rate numeric;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='marketplace_settings'
                   and column_name='monetization_model') then
    raise exception 'M23: monetization_model missing'; end if;
  if (select count(*) from subscription_plans) < 3 then
    raise exception 'M23: subscription_plans was not seeded'; end if;
  if not exists (select 1 from pg_tables where tablename='order_financials') then
    raise exception 'M23: order_financials missing'; end if;
  if not exists (select 1 from pg_trigger where tgname='orders_sync_financials' and not tgisinternal) then
    raise exception 'M23: the financial lifecycle trigger is not attached'; end if;

  -- The default model must take nothing, so applying this changes no money.
  select resolve_commission_rate(m.id) into v_rate from merchants m limit 1;
  if coalesce(v_rate, 0) <> 0 then
    raise exception 'M23: resolver returns %, expected 0 under the default subscription model', v_rate;
  end if;

  -- No client role may write financial truth.
  if has_table_privilege('authenticated', 'order_financials', 'INSERT')
     or has_table_privilege('authenticated', 'order_financials', 'UPDATE')
     or has_table_privilege('authenticated', 'subscription_plans', 'UPDATE') then
    raise exception 'M23: a client role can write financial configuration';
  end if;
  if has_table_privilege('anon', 'order_financials', 'SELECT') then
    raise exception 'M23: anon can read order financials';
  end if;
end;
$$;
