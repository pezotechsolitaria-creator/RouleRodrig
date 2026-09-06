-- ── M171 · A SUBSCRIPTION CANNOT LOCK A SHOP THAT DOES NOT PAY ONE ──────────
--
-- Applied to production 2026-09-06.
--
-- The owner moved the platform to commission (monetization_model =
-- 'commission', 10% on merchandise) and then asked for subscriptions to be
-- switched off entirely.
--
-- Doing that naively would have shut the whole marketplace. create_order()
-- gates every order on merchant_subscription_active() and raises RR008 "This
-- shop is not accepting orders at the moment". Checked against production
-- BEFORE changing anything:
--
--   merchant 28003749  premium  cancelled -> M4 Test Shop             BLOCKED
--   merchant 3fe62c72  starter  cancelled -> Summer Fest, Tomorrow
--                                            Land, Meunier Rohan      BLOCKED
--   merchant 35648a75  premium  active    -> Chez Banane, Ti Kitchen,
--                                            Roule Test Shop          ok until
--                                            2026-09-11 + 7 grace days
--
-- Two of three merchants were ALREADY blocked, and the third would have lapsed
-- around 18 September, taking every remaining store on the island with it. It
-- would have been near-silent: the customer is told the shop is closed, and the
-- merchant is told nothing at all.
--
-- THE FIX IS NOT TO DELETE THE SUBSCRIPTION MACHINERY. The rows, the plans and
-- the console page stay - a platform that changes its mind should not have to
-- rebuild them, and dropping merchant_subscriptions would take
-- resolve_commission_rate's plan lookup with it. What changes is that the gate
-- asks a prior question: does this platform charge a subscription AT ALL?
--
-- Under 'commission' or 'free' the answer is no, so a lapsed subscription is
-- not a fact about whether a merchant may trade. Under 'subscription' or
-- 'hybrid' the original rule returns unchanged, so this is reversible by
-- flipping one setting back.

create or replace function public.merchant_subscription_active(_merchant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    -- The platform bills per sale, not per month: a subscription is not what
    -- entitles this merchant to trade, so it cannot be what stops them.
    when coalesce(
           (select s.monetization_model from marketplace_settings s where s.id = 'main'),
           'subscription'
         ) in ('commission', 'free')
    then true
    else coalesce(
      (
        select s.status in ('trialing', 'active', 'past_due')
               and now() <= s.current_period_end + make_interval(days => s.grace_days)
        from merchant_subscriptions s
        where s.merchant_id = _merchant
      ),
      true
    )
  end;
$function$;

comment on function public.merchant_subscription_active(uuid) is
  'Whether a lapsed subscription should stop this merchant trading. Since M171 '
  'it asks first whether the platform charges a subscription at all - under '
  'commission or free billing it always returns true, because a plan the '
  'merchant does not pay for cannot be a reason to refuse their orders. '
  'Reversible: flip marketplace_settings.monetization_model back.';

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v_model text;
  v_blocked integer;
begin
  select monetization_model into v_model from marketplace_settings where id = 'main';

  if v_model in ('commission', 'free') then
    select count(*) into v_blocked
      from merchants m
     where not merchant_subscription_active(m.id);
    if v_blocked > 0 then
      raise exception 'M171: % merchant(s) still blocked by a subscription under % billing',
        v_blocked, v_model;
    end if;

    if exists (
      select 1 from stores s
       where store_is_visible(s.id)
         and not merchant_subscription_active(s.merchant_id)
    ) then
      raise exception 'M171: a visible store is still subscription-blocked';
    end if;
  end if;
end $$;
