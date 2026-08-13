-- M84 — REVERTS THE GRANT M83 ADDED. That grant was my mistake.
--
-- M83 read the missing SELECT on store_payment_settings as an oversight that
-- had left an RLS policy dead. It was not an oversight: M8 removed it ON
-- PURPOSE. The comment in app/orders/[id]/page.tsx says exactly why —
--
--   "before M8 any signed-in user could read bank_name / account_holder /
--    account_number for every live shop without ordering anything —
--    marketplace-wide harvesting of exactly the fields an impersonation scam
--    needs. The columns are now withheld and the accessor releases them only to
--    store staff, a platform admin, or a customer who actually has an order."
--
-- Granting SELECT re-opened that, and WIDER than the original: M8's hole needed
-- a signed-in user, mine was open to `anon`. Confirmed with the public
-- publishable key — a live shop's real account number came back to an
-- unauthenticated caller. It stood for roughly twenty minutes.
--
-- Column-level grants cannot express this. A REVOKE on individual columns is a
-- no-op while a table-level grant exists — already recorded on this project —
-- so the only correct shapes are "no table access at all" plus a function that
-- returns exactly what the caller may see. That is the pattern M8 and M28
-- already use: store_bank_details(), customer_pickup_code().
--
-- The ORIGINAL bug remains real and remains fixed. A customer must know which
-- methods a shop takes before choosing one, and /api/cart/resolve was falling
-- back to "cash on, bank off" for everyone because its table read returned
-- nothing. That needs three booleans, not an account number.
--
-- Verified as anon after this migration:
--   bank columns          -> 401 permission denied
--   store_payment_options -> 200 {cash:false, bank:true, receipt:true} for the
--                            live event, [] for a hidden store.
--
-- LESSON, recorded because it nearly cost real money: a missing GRANT is not
-- automatically a bug. Check whether something deliberately removed it before
-- adding it back. The evidence was in a comment two files away.

revoke select on public.store_payment_settings from anon, authenticated;

drop policy if exists store_payment_settings_customer_read on public.store_payment_settings;

create policy store_payment_settings_customer_read
  on public.store_payment_settings
  for select
  to authenticated
  using (
    store_is_visible(store_id)
    or is_store_staff(store_id)
    or is_platform_admin()
  );

/**
 * WHICH payment methods a live shop accepts — and nothing else.
 *
 * Deliberately returns no bank_name, no account_holder and no account_number.
 * Choosing HOW to pay needs the options; the details belong to
 * store_bank_details(), which releases them only once the caller has an order
 * with that shop.
 *
 * Visible stores only, so a draft or test shop's configuration stays private,
 * and the same defaults as the column definitions so the UI and create_order()
 * cannot disagree about what is on offer.
 */
create or replace function public.store_payment_options(p_store_id uuid)
returns table (accepts_cash boolean, accepts_bank_transfer boolean, require_receipt boolean)
language sql stable security definer set search_path to 'public'
as $function$
  select
    coalesce(sps.accepts_cash, true),
    coalesce(sps.accepts_bank_transfer, false),
    coalesce(sps.require_receipt, false)
  from stores s
  left join store_payment_settings sps on sps.store_id = s.id
  where s.id = p_store_id
    and (store_is_visible(s.id) or is_store_staff(s.id) or is_platform_admin());
$function$;

revoke all on function public.store_payment_options(uuid) from public;
grant execute on function public.store_payment_options(uuid) to anon, authenticated;
