-- M83 / M83b — customers could not read which payment methods a shop accepts.
--
-- Reported as "bank number does not display" on events, and proven from outside
-- on the live site: Tomorrow Land has accepts_cash = FALSE and
-- accepts_bank_transfer = TRUE with bank details filled in, and its checkout
-- offered CASH and never showed the transfer details.
--
-- TWO independent faults. Either alone caused it, so both had to be fixed.
--
-- M83 — NO ROLE HELD `select` ON store_payment_settings. Only service_role
--   could read it. Postgres checks the table privilege BEFORE row security, so
--   the customer_read policy had never executed once since it was written. An
--   RLS policy without a grant is the mirror image of the column-grant trap
--   already recorded on this project: there a REVOKE looked protective and did
--   nothing, here a policy looked permissive and did nothing.
--
-- M83b — that policy was `TO authenticated`. A guest matches NO permissive
--   SELECT policy, and no policy means denied. Fixing only the grant would have
--   quietly repaired signed-in customers and left every GUEST broken — and
--   guests are the default path, since checkout says "no account needed".
--
-- The damage was not an error message. /api/cart/resolve swallows the failure
-- into `pay = null` and falls back to its documented defaults — acceptsCash
-- true, acceptsBankTransfer false — so every customer on the platform, across
-- events, food and marketplace, was shown "Cash" whatever the shop actually
-- takes, and was never offered a transfer even where it is the only method.
-- create_order() then refuses an unaccepted method with RR009, so a customer
-- who followed the instruction on screen was refused at the button.
--
-- Nothing in the type system, the build or the unit suite could see this: the
-- page rendered a confident, wrong answer. It was found by querying as the role
-- a visitor actually has.
--
-- The predicate needs no change. A guest satisfies store_is_visible() and
-- nothing else, which is exactly the intended access: the payment details of a
-- LIVE shop — what a customer needs in order to pay, and what a shop already
-- prints on an invoice — and nothing about a draft or test one.
--
-- Verified with SET ROLE anon: live event settings readable (1 row), hidden
-- test store still refused (0 rows). Then re-walked the real guest checkout,
-- which now reads "Bank transfer — you'll get the organiser's account details
-- on the next screen" with cash correctly absent.

grant select on public.store_payment_settings to anon, authenticated;

drop policy if exists store_payment_settings_customer_read on public.store_payment_settings;

create policy store_payment_settings_customer_read
  on public.store_payment_settings
  for select
  to anon, authenticated
  using (
    store_is_visible(store_id)
    or is_store_staff(store_id)
    or is_platform_admin()
  );
