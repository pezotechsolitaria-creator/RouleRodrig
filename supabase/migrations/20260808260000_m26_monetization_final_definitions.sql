-- M24 → M26, collapsed into the FINAL definitions.
--
-- Four migrations were applied in sequence while building the monetization
-- engine, two of them correcting the previous one:
--
--   M24   create_order writes the order_financials snapshot
--   M24b  fix: `on conflict (order_id)` was ambiguous against the OUT parameter
--         of `returns table(order_id uuid, …)` — 42702 at RUNTIME, which would
--         have 500'd every checkout
--   M25   fix: the admin_* RPCs were gated on is_platform_admin() alone, which
--         is unreachable from /admin (cookie session → service_role → auth.uid()
--         is NULL). The feature was unusable from its only UI
--   M26   fix: cancelled/expired orders never left the "pending commission"
--         bucket, and subscription STATE was indistinguishable from subscription
--         COLLECTION
--
-- Replaying that history on a fresh database buys nothing and reproduces two
-- known-broken intermediate states. This file is the end state, which is also
-- what NEXT_STEPS.md has been asking for: one authoritative definition rather
-- than a chain of string surgery you must replay to read.
--
-- Depends on M23 (tables + columns) and M21 (the create_order body being
-- patched). Both are in this folder and sort earlier.

-- ── 1. create_order writes the financial snapshot ───────────────────────────
-- Guarded surgery on two anchors rather than a fourth full retype of a 200-line
-- function: every anchor is asserted first, so a shape change fails loudly
-- instead of silently dropping an M6..M21 guard.
do $$
declare
  v_src text;
  v_new text;
  v_decl_old constant text := '  v_constraint text;';
  v_decl_new constant text :=
    '  v_constraint text;' || E'\n' ||
    '  v_rate numeric; v_commissionable integer; v_commission integer;' || E'\n' ||
    '  v_merchant_net integer; v_model text; v_plan text; v_discount integer := 0;';
  v_fin_old constant text :=
    '  update orders set subtotal=v_subtotal, tax=v_tax, delivery_fee=v_delivery_fee, total=v_total, commission_amount=0 where id=v_order_id;';
  v_fin_new constant text :=
    '  v_rate := resolve_commission_rate(v_store.merchant_id);' || E'\n' ||
    '  select monetization_model into v_model from marketplace_settings where id = ''main'';' || E'\n' ||
    '  v_model := coalesce(v_model, ''subscription'');' || E'\n' ||
    '  select ms.plan::text into v_plan from merchant_subscriptions ms' || E'\n' ||
    '   where ms.merchant_id = v_store.merchant_id order by ms.created_at desc limit 1;' || E'\n' ||
    -- Merchandise only: tax is the state's, and the rr_delivery fee is already
    -- platform income, so commissioning it would double-count.
    '  v_commissionable := greatest(0, v_subtotal - v_discount);' || E'\n' ||
    '  v_commission := least(round(v_commissionable::numeric * v_rate)::integer, v_commissionable);' || E'\n' ||
    '  v_merchant_net := v_commissionable - v_commission;' || E'\n' ||
    '  update orders set subtotal=v_subtotal, tax=v_tax, delivery_fee=v_delivery_fee, total=v_total, commission_amount=v_commission where id=v_order_id;' || E'\n' ||
    '  insert into order_financials (order_id, currency, gross_subtotal, discount, tax, delivery_fee,' || E'\n' ||
    '    customer_total, commissionable_amount, commission_rate, commission_amount, merchant_net,' || E'\n' ||
    '    monetization_model, plan_slug)' || E'\n' ||
    '  values (v_order_id, v_store.currency, v_subtotal, v_discount, v_tax, v_delivery_fee,' || E'\n' ||
    '    v_total, v_commissionable, v_rate, v_commission, v_merchant_net, v_model, v_plan)' || E'\n' ||
    -- Names the CONSTRAINT, never the column: `order_id` is an OUT parameter of
    -- this function and therefore an in-scope PL/pgSQL variable (M24b).
    '  on conflict on constraint order_financials_pkey do nothing;';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='create_order';

  if v_src is null then raise exception 'M26: create_order not found'; end if;
  if position('order_financials' in v_src) > 0 then
    raise notice 'M26: create_order already writes order_financials — skipping surgery';
  else
    if position(v_decl_old in v_src) = 0 then
      raise exception 'M26: the M21 declaration anchor is missing from create_order';
    end if;
    if position(v_fin_old in v_src) = 0 then
      raise exception 'M26: the totals-update anchor is missing from create_order';
    end if;
    v_new := replace(v_src, v_decl_old, v_decl_new);
    v_new := replace(v_new, v_fin_old, v_fin_new);
    execute v_new;
  end if;
end;
$$;

-- ── 2. Earning / reversal, enforced by the database ─────────────────────────
-- A TRIGGER on orders.status, not an edit to update_order_status(): several
-- paths move an order (admin, merchant, the cron sweep, a manual fix), and an
-- invariant that only holds on the paths someone remembered to patch is not an
-- invariant.
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

  if new.status = 'paid' then
    -- coalesce, not an unconditional set: paid → preparing → paid must not
    -- restate the earning date.
    update order_financials
       set earned_at = coalesce(earned_at, now())
     where order_id = new.id and reversed_at is null;

  elsif new.status = 'refunded' then
    update order_financials
       set reversed_at = coalesce(reversed_at, now()),
           reversal_reason = coalesce(reversal_reason,
             case when earned_at is not null then 'refunded after payment'
                  else 'refunded before payment was earned' end)
     where order_id = new.id;

  elsif new.status = 'cancelled' then
    -- ALWAYS close out, not only when it had earned. An unpaid order that is
    -- cancelled or swept by expire_order() is finished; leaving it open is what
    -- produced a "pending commission" figure that grew forever (M26).
    update order_financials
       set reversed_at = coalesce(reversed_at, now()),
           reversal_reason = coalesce(reversal_reason,
             case when earned_at is not null then 'cancelled after payment'
                  else 'cancelled before payment' end)
     where order_id = new.id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_order_financials_lifecycle() from public, anon, authenticated;

drop trigger if exists orders_sync_financials on orders;
create trigger orders_sync_financials
  after update of status on orders
  for each row execute function sync_order_financials_lifecycle();

-- Anything stranded by an earlier version of the trigger.
update order_financials f
   set reversed_at = coalesce(f.reversed_at, now()),
       reversal_reason = coalesce(f.reversal_reason,
         case when f.earned_at is not null then 'cancelled after payment'
              else 'cancelled before payment' end)
  from orders o
 where o.id = f.order_id
   and o.status in ('cancelled','refunded')
   and f.reversed_at is null;

-- ── 3. Admin configuration RPCs ─────────────────────────────────────────────
-- THE GATE. This project has TWO admin identities: platform_admins (a Supabase
-- auth user, what RLS tests) and the ADMIN_PASSWORD cookie session, which is
-- what /admin actually uses — reaching Postgres as service_role, where
-- auth.uid() is NULL. Gating on is_platform_admin() alone made these unreachable
-- from the only UI that has them.
--
-- `auth.uid() is not null and not is_platform_admin()` is the rule M20 already
-- established for claim_order_notification: a caller WITH a session must be an
-- admin; a caller without one can only be service_role (anon is revoked, and an
-- `authenticated` request always carries a uid).
create or replace function public.admin_set_monetization(
  p_model text, p_default_rate numeric, p_actor_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if auth.uid() is not null and not is_platform_admin() then
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
  values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''), 'platform_admin'),
          'monetization.updated', 'marketplace_settings', 'main',
          jsonb_build_object('before', v_before, 'after', v_after));

  return v_after;
end;
$function$;

drop function if exists public.admin_set_monetization(text, numeric);
revoke all on function public.admin_set_monetization(text, numeric, text) from public, anon;
grant execute on function public.admin_set_monetization(text, numeric, text) to authenticated, service_role;

create or replace function public.admin_set_subscription_plan(
  p_slug text, p_name text, p_description text, p_price_cents integer,
  p_commission_rate numeric, p_max_products integer, p_max_staff integer,
  p_allows_selling boolean, p_is_active boolean, p_actor_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if auth.uid() is not null and not is_platform_admin() then
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
  values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''), 'platform_admin'),
          'subscription_plan.updated', 'subscription_plans', p_slug,
          jsonb_build_object('before', v_before, 'after', v_after));

  return v_after;
end;
$function$;

drop function if exists public.admin_set_subscription_plan(text, text, text, integer, numeric, integer, integer, boolean, boolean);
revoke all on function public.admin_set_subscription_plan(text, text, text, integer, numeric, integer, integer, boolean, boolean, text) from public, anon;
grant execute on function public.admin_set_subscription_plan(text, text, text, integer, numeric, integer, integer, boolean, boolean, text) to authenticated, service_role;

create or replace function public.admin_set_merchant_commission(
  p_merchant_id uuid, p_rate numeric, p_reason text default null, p_actor_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_before numeric;
begin
  if auth.uid() is not null and not is_platform_admin() then
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
  values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''), 'platform_admin'),
          'merchant_commission.updated', 'merchants', p_merchant_id::text,
          jsonb_build_object('before', v_before, 'after', p_rate, 'reason', p_reason));

  return jsonb_build_object('merchantId', p_merchant_id, 'commissionRateOverride', p_rate);
end;
$function$;

drop function if exists public.admin_set_merchant_commission(uuid, numeric, text);
revoke all on function public.admin_set_merchant_commission(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_set_merchant_commission(uuid, numeric, text, text) to authenticated, service_role;

-- ── 4. Read models ──────────────────────────────────────────────────────────
-- Transparency without exposing platform configuration: a merchant learns its
-- own rate and its own totals, never the model, never another shop.
create or replace function public.merchant_fee_summary(p_merchant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare v_out jsonb;
begin
  if not (is_platform_admin() or is_merchant_staff(p_merchant_id)) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select jsonb_build_object(
    'commissionRate', resolve_commission_rate(p_merchant_id),
    'plan', (select jsonb_build_object('slug', sp.slug, 'name', sp.name,
                                       'priceCents', sp.price_cents,
                                       'interval', sp.billing_interval, 'currency', sp.currency)
               from merchant_subscriptions ms join subscription_plans sp on sp.slug = ms.plan::text
              where ms.merchant_id = p_merchant_id order by ms.created_at desc limit 1),
    'subscription', (select jsonb_build_object('status', ms.status, 'periodEnd', ms.current_period_end,
                                               'graceDays', ms.grace_days, 'cancelledAt', ms.cancelled_at)
                       from merchant_subscriptions ms
                      where ms.merchant_id = p_merchant_id order by ms.created_at desc limit 1),
    -- Earned and not reversed only. One aggregate, never an N+1 walk of history.
    'lifetime', (select jsonb_build_object(
                          'orders', count(*),
                          'grossSales', coalesce(sum(f.commissionable_amount), 0),
                          'commission', coalesce(sum(f.commission_amount), 0),
                          'net', coalesce(sum(f.merchant_net), 0))
                   from order_financials f
                   join orders o on o.id = f.order_id
                   join stores s on s.id = o.store_id
                  where s.merchant_id = p_merchant_id
                    and f.earned_at is not null and f.reversed_at is null),
    'subscriptionPaid', (select coalesce(sum(si.amount), 0) from subscription_invoices si
                          where si.merchant_id = p_merchant_id and si.status = 'paid'),
    'subscriptionDue', (select coalesce(sum(si.amount), 0) from subscription_invoices si
                         where si.merchant_id = p_merchant_id and si.status <> 'paid')
  ) into v_out;
  return v_out;
end;
$function$;

revoke all on function public.merchant_fee_summary(uuid) from public, anon;
grant execute on function public.merchant_fee_summary(uuid) to authenticated, service_role;

create or replace function public.admin_financial_overview()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  return jsonb_build_object(
    'model', (select jsonb_build_object('monetizationModel', monetization_model,
                                        'defaultCommissionRate', default_commission_rate)
                from marketplace_settings where id='main'),
    'earned', (select jsonb_build_object('orders', count(*),
                        'gmv', coalesce(sum(f.customer_total), 0),
                        'merchandise', coalesce(sum(f.commissionable_amount), 0),
                        'commission', coalesce(sum(f.commission_amount), 0),
                        'merchantNet', coalesce(sum(f.merchant_net), 0),
                        'deliveryFees', coalesce(sum(f.delivery_fee), 0))
                 from order_financials f where f.earned_at is not null and f.reversed_at is null),
    'pending', (select jsonb_build_object('orders', count(*),
                         'commission', coalesce(sum(f.commission_amount), 0))
                  from order_financials f where f.earned_at is null and f.reversed_at is null),
    -- Earned then given back: the only bucket that is money LOST.
    'reversed', (select jsonb_build_object('orders', count(*),
                          'commission', coalesce(sum(f.commission_amount), 0))
                   from order_financials f where f.reversed_at is not null and f.earned_at is not null),
    -- Closed without ever becoming revenue. A funnel signal, deliberately not
    -- mixed into either bucket above.
    'closedUnpaid', (select jsonb_build_object('orders', count(*),
                              'wouldHaveBeen', coalesce(sum(f.commission_amount), 0))
                       from order_financials f where f.reversed_at is not null and f.earned_at is null),
    'subscriptions', (select jsonb_build_object(
                               'paid', coalesce(sum(case when status='paid' then amount end), 0),
                               'due',  coalesce(sum(case when status<>'paid' then amount end), 0),
                               'overdueCount', count(*) filter (where status<>'paid' and period_end < now()))
                        from subscription_invoices),
    'merchants', (select jsonb_build_object('total', count(*),
                           'approved', count(*) filter (where status='approved'),
                           'withOverride', count(*) filter (where commission_rate_override is not null))
                    from merchants)
  );
end;
$function$;

revoke all on function public.admin_financial_overview() from public, anon;
grant execute on function public.admin_financial_overview() to authenticated, service_role;

-- ── 5. Subscription STATE is not subscription COLLECTION ────────────────────
-- No recurring billing provider is integrated and nothing in this codebase
-- collects a subscription payment. Saying so in the schema so no future reader
-- mistakes an 'active' subscription for money received.
alter table merchant_subscriptions
  add column if not exists billing_provider text not null default 'manual';

alter table subscription_invoices
  add column if not exists collected_via text
    check (collected_via is null or collected_via in ('cash','bank_transfer','other'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname='merchant_subscriptions_billing_provider_check') then
    -- Deliberately restrictive: adding a provider must be a conscious migration
    -- landing WITH the code that can talk to it, not a string someone sets while
    -- nothing collects the money.
    alter table merchant_subscriptions add constraint merchant_subscriptions_billing_provider_check
      check (billing_provider in ('manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname='subscription_invoices_status_check') then
    alter table subscription_invoices add constraint subscription_invoices_status_check
      check (status in ('due','paid','void'));
  end if;
end;
$$;

comment on table merchant_subscriptions is
  'ENTITLEMENT, not money: which plan a merchant is on and whether they may sell. Collection lives in subscription_invoices and is entirely manual. An ''active'' subscription does NOT mean anyone has been charged (M26).';
comment on table subscription_invoices is
  'A DEBT the platform believes it is owed. Raised by hand in /admin/subscriptions; status becomes ''paid'' only when a human confirms money arrived out of band. Nothing automated ever marks these paid — there is no biller (M26).';
comment on column merchant_subscriptions.billing_provider is
  'ALWAYS ''manual'' today. Exists so a future provider is additive rather than a schema rewrite (M26).';
comment on column merchants.owner_id is
  'Creation-time record of who registered this merchant. NOT an authorization source and NOT kept in step with merchant_staff — verified 2026-08-08: the live merchant has a different owner_id than its merchant_staff ''owner'' row. Everything authorizes through is_merchant_staff()/is_store_staff(); gating on this column would silently disagree with every policy.';

-- ── 6. Post-conditions ──────────────────────────────────────────────────────
do $$
declare v_src text; v_stranded int;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='create_order';

  -- The whole M6..M21 guard chain must have survived the surgery.
  if position('for update of v' in v_src) = 0 then raise exception 'M26: stock row lock lost'; end if;
  if position('RR012' in v_src) = 0 then raise exception 'M26: expected-total guard lost'; end if;
  if position('RR013' in v_src) = 0 then raise exception 'M26: reservation cap lost'; end if;
  if position('order_hold_hours(p_provider)' in v_src) = 0 then raise exception 'M26: hold window lost'; end if;
  if position('order_amounts(' in v_src) = 0 then raise exception 'M26: pricing authority lost'; end if;
  if position('p_guest_email' in v_src) = 0 then raise exception 'M26: guest identity lost'; end if;
  if position('orders_order_number_key' in v_src) = 0 then raise exception 'M26: order-number retry lost'; end if;
  -- And the monetization behaviour is present and un-spoofable.
  if position('resolve_commission_rate(v_store.merchant_id)' in v_src) = 0 then
    raise exception 'M26: create_order does not resolve the commission rate'; end if;
  if position('on conflict (order_id)' in v_src) > 0 then
    raise exception 'M26: the ambiguous on-conflict clause survives'; end if;
  if position('p_commission' in v_src) > 0 then
    raise exception 'M26: create_order accepts a client-supplied commission'; end if;

  if position('closedUnpaid' in
      (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='admin_financial_overview')) = 0 then
    raise exception 'M26: the overview does not separate closed-unpaid orders'; end if;

  select count(*) into v_stranded from order_financials f join orders o on o.id = f.order_id
   where o.status in ('cancelled','refunded') and f.reversed_at is null;
  if v_stranded > 0 then
    raise exception 'M26: % terminal orders still counted as pending', v_stranded; end if;

  if has_table_privilege('authenticated', 'order_financials', 'UPDATE')
     or has_table_privilege('anon', 'order_financials', 'SELECT') then
    raise exception 'M26: a client role can write or read financial truth'; end if;
end;
$$;
