-- ── M169 · THE SAME SILENCE, ONE COLUMN OVER ────────────────────────────────
--
-- Applied to production 2026-09-06.
--
-- M83/M84 found that reading store_payment_settings from a customer session
-- returns NOTHING: the table is deliberately unreadable by anon and
-- authenticated because it holds bank_name, account_holder and account_number,
-- and a table grant would publish every live shop's bank account. The `??`
-- defaults in TypeScript then made that silence look like an answer.
--
-- M84 moved the PAYMENT columns behind store_payment_options(), a SECURITY
-- DEFINER function returning booleans and no bank details. It did not move the
-- FULFILMENT columns. app/api/cart/resolve/route.ts kept reading
-- offers_rr_delivery straight off the table and defaulting it to true, four
-- lines under a comment in that same file explaining this exact mistake and
-- ending "A missing answer is not a yes."
--
-- Verified live before this migration: "Roule Test Shop (TEST)" has
-- offers_rr_delivery = false, and it is the only store in the marketplace. The
-- checkout offered Roule Rodrigues delivery anyway, took the customer's GPS
-- permission, made them choose a paid delivery zone, quoted Rs 150, rendered
-- "Place order - Rs 500.00" - and create_order refused the whole thing with
-- RR005 "This shop does not offer Roule Rodrigues delivery" after every field
-- had been filled in. The longest and most expensive path in the funnel, dying
-- at the last tap, on the default guest path.
--
-- The three fulfilment booleans are not secret; the storefront already prints
-- "Collect in person" and "Send someone to collect". So they join the same RPC,
-- each coalesced to the SAME default create_order uses:
--   coalesce(v_pay.offers_pickup, true)
--   coalesce(v_pay.offers_customer_delivery, true)
--   coalesce(v_pay.offers_rr_delivery, true)
-- which is what makes it impossible for the form and the function to disagree.

drop function if exists public.store_payment_options(uuid);

create function public.store_payment_options(p_store_id uuid)
returns table (
  accepts_cash boolean,
  accepts_bank_transfer boolean,
  require_receipt boolean,
  offers_pickup boolean,
  offers_customer_delivery boolean,
  offers_rr_delivery boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    case when prepayment_only() then false else coalesce(sps.accepts_cash, false) end,
    coalesce(sps.accepts_bank_transfer, false),
    case when prepayment_only() then true else coalesce(sps.require_receipt, false) end,
    -- Mirrors create_order's own coalesce, NOT a customer-facing fail-closed
    -- default. A shop with no settings row behaves in the form exactly as it
    -- behaves in the RPC - the property M84 was protecting, restored for
    -- fulfilment. Failing closed is the CLIENT's job, for when the RPC returns
    -- nothing at all.
    coalesce(sps.offers_pickup, true),
    coalesce(sps.offers_customer_delivery, true),
    coalesce(sps.offers_rr_delivery, true)
  from stores s
  left join store_payment_settings sps on sps.store_id = s.id
  where s.id = p_store_id
    and (store_is_visible(s.id) or is_store_staff(s.id) or is_platform_admin());
$function$;

comment on function public.store_payment_options(uuid) is
  'The booleans a checkout needs and none of the bank details. Payment methods '
  '(M84) and, since M169, the three fulfilment options - because reading '
  'store_payment_settings as a customer returns nothing, and a TypeScript '
  'default turned that silence into a yes.';

-- REVOKE FROM PUBLIC is the real boundary on this codebase. Re-granted after the
-- drop, or every checkout stops resolving.
revoke all on function public.store_payment_options(uuid) from public;
grant execute on function public.store_payment_options(uuid) to anon, authenticated;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v record;
  v_store uuid;
begin
  select id into v_store from stores where slug = 'roule-test-shop';
  if v_store is not null then
    select * into v from store_payment_options(v_store);
    if v.offers_rr_delivery is distinct from false then
      raise exception 'M169: the store that cannot deliver still reports offers_rr_delivery=%',
        v.offers_rr_delivery;
    end if;
    if v.offers_pickup is distinct from true then
      raise exception 'M169: pickup lost on a shop that offers it';
    end if;
  end if;

  -- Every visible store must agree with its own settings row, or the form and
  -- create_order can still disagree - which is the entire bug.
  if exists (
    select 1
      from stores s
      join store_payment_settings sps on sps.store_id = s.id
      cross join lateral store_payment_options(s.id) o
     where store_is_visible(s.id)
       and (o.offers_rr_delivery is distinct from coalesce(sps.offers_rr_delivery, true)
            or o.offers_pickup is distinct from coalesce(sps.offers_pickup, true)
            or o.offers_customer_delivery is distinct from coalesce(sps.offers_customer_delivery, true))
  ) then
    raise exception 'M169: store_payment_options disagrees with store_payment_settings';
  end if;
end $$;
