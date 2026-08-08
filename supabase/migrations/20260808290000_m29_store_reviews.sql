-- M29 — Let customers rate shops.
--
-- WHAT WAS WRONG
-- /shop offers a "Top rated" sort. browse_stores() implements it. StoreCard and
-- the storefront both render ★ rating_avg (rating_count). stores.rating_avg is
-- maintained by a trigger on `reviews`. Every part of that chain exists EXCEPT
-- the one that puts a row in `reviews` — there is no way, anywhere in the
-- product, for a customer to rate anything. So "Top rated" sorts a column that
-- is 0 for every shop, which is worse than not offering it: it looks like a
-- ranking and is actually a no-op.
--
-- THE MODEL: VERIFIED PURCHASE, AUTO-PUBLISHED
-- reviews.status defaults to 'pending' and there is no moderation queue in the
-- product. Requiring the owner to approve each review by hand means, in
-- practice, that no review is ever published and "Top rated" stays empty — the
-- exact failure this migration exists to fix. So a review that is attached to a
-- REAL, COLLECTED order from that shop is published immediately, and the
-- credential to write one is the credential to see the order:
--
--   signed in  → the order is yours (customer_id = auth.uid())
--   guest      → order number + the address that placed it, the same pair
--                lookup_order() has used since M20
--
-- You cannot review a shop you did not buy from, cannot review before the order
-- is collected, and cannot review the same order twice. That is a stronger bar
-- than most review systems, and it is enforced in the database rather than in
-- the route. Moderation is still available — reviews_moderate lets a platform
-- admin flip a row to 'rejected', and the trigger recomputes the average — so
-- abuse is removable; it just is not a precondition for the feature working.
--
-- WHY THE STATUS IS SET INSIDE THE FUNCTION
-- 20260805093000 revoked INSERT on reviews and re-granted it column by column
-- WITHOUT `status`, precisely so a client could not self-publish. Nothing here
-- weakens that: the client still cannot insert a review at all. These
-- SECURITY DEFINER functions are the only writers, and they are the ones that
-- prove the purchase before choosing 'published'.

-- ── 1. One store review per order ───────────────────────────────────────────
-- reviews_one_per_customer_product covers PRODUCT reviews by an account. A
-- store review has product_id null (so that index does not apply) and may have
-- customer_id null (guest), so without this a guest could post unlimited
-- reviews for one order and move a shop's average alone.
create unique index if not exists reviews_one_per_order
  on reviews (order_id) where order_id is not null and product_id is null;

-- store_reviews() reads published store reviews newest-first, per shop.
create index if not exists reviews_store_published_idx
  on reviews (store_id, created_at desc) where status = 'published' and product_id is null;

-- ── 2. Shared core ──────────────────────────────────────────────────────────
-- Both entry points below resolve to the same six rules. Written once so the
-- guest path cannot drift from the account path — the defect M21 had to go back
-- and repair across the whole checkout.
create or replace function public.insert_verified_store_review(
  p_order_id    uuid,
  p_customer_id uuid,
  p_rating      integer,
  p_body        text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order orders%rowtype;
  v_body  text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using errcode = 'RR030', message = 'Choose between 1 and 5 stars.';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;

  -- Collected, not merely paid: the review is about how the order actually
  -- turned out, and a shop should never be rated on an order it has not
  -- finished. Cancelled and refunded orders are covered by the same test.
  if v_order.status <> 'collected' then
    raise exception using errcode = 'RR032',
      message = 'You can leave a review once your order is completed.';
  end if;

  -- Empty and whitespace-only bodies are stored as NULL, so the UI can tell
  -- "rated, said nothing" from "wrote a blank line" without trimming again.
  v_body := nullif(btrim(coalesce(p_body, '')), '');
  if length(v_body) > 1000 then
    v_body := left(v_body, 1000);
  end if;

  begin
    insert into reviews (store_id, order_id, customer_id, rating, body, status)
    values (v_order.store_id, v_order.id, p_customer_id, p_rating, v_body, 'published');
  exception when unique_violation then
    raise exception using errcode = 'RR033', message = 'You have already reviewed this order.';
  end;

  -- The average is recomputed by t_review_store_rating, so read it back rather
  -- than predicting it — the number the customer sees is the stored one.
  return (
    select jsonb_build_object(
             'ok', true,
             'storeId', s.id,
             'ratingAvg', s.rating_avg,
             'ratingCount', s.rating_count)
      from stores s where s.id = v_order.store_id
  );
end;
$function$;

revoke all on function public.insert_verified_store_review(uuid, uuid, integer, text) from public, anon, authenticated;

-- ── 3. Signed-in customer ───────────────────────────────────────────────────
create or replace function public.rate_store(
  p_order_id uuid,
  p_rating   integer,
  p_body     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = 'RR034', message = 'Sign in to leave a review.';
  end if;
  -- The whole authorisation check, and it is the same one the order page uses.
  -- A mismatched id is reported as "not found", never as "not yours", so this
  -- cannot be used to confirm that somebody else's order exists.
  if not exists (select 1 from orders o where o.id = p_order_id and o.customer_id = v_uid) then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;
  return insert_verified_store_review(p_order_id, v_uid, p_rating, p_body);
end;
$function$;

revoke all on function public.rate_store(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.rate_store(uuid, integer, text) to authenticated;

comment on function public.rate_store(uuid, integer, text) is
  'Rate the shop behind one of your own collected orders. Verified purchase by construction — the order must be yours and completed — so the review is published immediately (M29).';

-- ── 4. Guest customer ───────────────────────────────────────────────────────
-- Same credential as lookup_order() and guest_report_payment(): order number
-- AND the address that placed it, compared in full, service_role only, behind
-- the rate-limited route. Guest checkout is the DEFAULT path — a review system
-- that quietly required an account would collect almost nothing.
create or replace function public.guest_rate_store(
  p_order_number text,
  p_email        text,
  p_rating       integer,
  p_body         text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_num   text;
  v_email text;
  v_id    uuid;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_num) < 6 or v_email = '' then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;

  select o.id into v_id
    from orders o
   where o.order_number = v_num
     and lower(o.customer_email) = v_email
   limit 1;
  if v_id is null then
    raise exception using errcode = 'RR031', message = 'We could not find that order.';
  end if;

  -- customer_id stays NULL even when the order was later claimed by an account:
  -- the reviewer here proved the EMAIL, not the session, and attributing the
  -- review to a user id nobody authenticated would be a small lie in a table
  -- whose whole value is that it does not contain any.
  return insert_verified_store_review(v_id, null, p_rating, p_body);
end;
$function$;

revoke all on function public.guest_rate_store(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.guest_rate_store(text, text, integer, text) to service_role;

comment on function public.guest_rate_store(text, text, integer, text) is
  'Account-free store review on the M20 guest credential (order number + the email that placed it). SECURITY DEFINER, service_role only, so the rate-limited route is the sole way in (M29).';

-- ── 5. "Can I review this?" ─────────────────────────────────────────────────
create or replace function public.order_review_state(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
           'reviewed',   exists (select 1 from reviews r
                                  where r.order_id = o.id and r.product_id is null),
           'canReview',  o.status = 'collected'
                         and not exists (select 1 from reviews r
                                          where r.order_id = o.id and r.product_id is null),
           'myRating',   (select r.rating from reviews r
                           where r.order_id = o.id and r.product_id is null limit 1))
    from orders o
   where o.id = p_order_id
     and o.customer_id is not null
     and o.customer_id = auth.uid();
$function$;

revoke all on function public.order_review_state(uuid) from public, anon, authenticated;
grant execute on function public.order_review_state(uuid) to authenticated;

-- ── 6. Public review list for a storefront ──────────────────────────────────
-- Through a function rather than a table read so the reviewer's display name
-- can be derived from the order without granting anyone SELECT on
-- orders.customer_name. A full name is never published: "Marie L." is enough
-- to make a review feel written by a person, on an island where a full name
-- identifies someone exactly.
create or replace function public.store_reviews(p_store_id uuid, p_limit integer default 10)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id',        r.id,
               'rating',    r.rating,
               'body',      r.body,
               'createdAt', r.created_at,
               'author',    case
                 when coalesce(btrim(o.customer_name), '') = '' then null
                 else split_part(btrim(o.customer_name), ' ', 1) ||
                      case when position(' ' in btrim(o.customer_name)) > 0
                           then ' ' || upper(left(split_part(btrim(o.customer_name), ' ', 2), 1)) || '.'
                           else '' end
               end) as j,
             r.created_at
        from reviews r
        left join orders o on o.id = r.order_id
       where r.store_id = p_store_id
         and r.status = 'published'
         and r.product_id is null
       order by r.created_at desc
       limit greatest(1, least(coalesce(p_limit, 10), 50))
    ) t;
$function$;

revoke all on function public.store_reviews(uuid, integer) from public;
grant execute on function public.store_reviews(uuid, integer) to anon, authenticated, service_role;

comment on function public.store_reviews(uuid, integer) is
  'Published store reviews for one shop, newest first, with the reviewer shortened to "First L." — derived inside the function so no client role needs SELECT on orders.customer_name (M29).';

-- ── 7. The guest half of the order page ─────────────────────────────────────
-- Reproduced whole from the M28 definition (repo convention — never
-- string-patch a shipped RPC) with the review state added, so a guest is
-- offered the review on the same screen and at the same moment as an account
-- customer.
create or replace function public.lookup_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_num   text;
  v_email text;
  v_out   jsonb;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_num) < 6 or v_email = '' then
    return null;
  end if;

  select jsonb_build_object(
           'id',            o.id,
           'orderNumber',   o.order_number,
           'status',        o.status,
           'total',         o.total,
           'currency',      o.currency,
           'placedAt',      o.placed_at,
           'fulfillment',   o.fulfillment_method,
           'autoReleaseAt', o.auto_release_at,
           'acceptedAt',    o.accepted_at,
           'isGuest',       o.customer_id is null,
           'storeName',     s.name,
           'storeSlug',     s.slug,
           'storePhone',    s.phone,
           -- Which method is owed. Read from payments, the same row the
           -- signed-in order page reads, never inferred from the status.
           'provider',      (select pm.provider from payments pm
                              where pm.order_id = o.id order by pm.created_at limit 1),
           'receiptSubmittedAt', o.receipt_submitted_at,
           -- The pickup code (M28), only while it can still be used.
           'pickupCode',    (select t.code from qr_pickup_tokens t
                              where t.order_id = o.id
                                and t.redeemed_at is null
                                and t.expires_at > now()
                                and t.code is not null
                              order by t.issued_at desc limit 1),
           'pickupRedeemedAt', (select t.redeemed_at from qr_pickup_tokens t
                                 where t.order_id = o.id and t.redeemed_at is not null
                                 order by t.redeemed_at desc limit 1),
           -- Review state (M29), on exactly the same credential as the rest.
           'reviewed',      exists (select 1 from reviews r
                                     where r.order_id = o.id and r.product_id is null),
           'canReview',     o.status = 'collected'
                            and not exists (select 1 from reviews r
                                             where r.order_id = o.id and r.product_id is null),
           -- Released only while the money is still owed, and only for the
           -- method that needs them.
           'bank', case
             when o.status in ('pending_payment','awaiting_payment_confirmation')
              and exists (select 1 from payments pm
                           where pm.order_id = o.id and pm.provider = 'bank_transfer')
             then (select jsonb_build_object(
                            'bankName',      sp.bank_name,
                            'accountHolder', sp.account_holder,
                            'accountNumber', sp.account_number,
                            'instructions',  sp.payment_instructions,
                            'requireReceipt', coalesce(sp.require_receipt, false))
                     from store_payment_settings sp where sp.store_id = o.store_id)
             else null end,
           'items',         coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', oi.product_name, 'variant', oi.variant_name,
                      'qty', oi.quantity, 'lineTotal', oi.line_total)
                    order by oi.product_name)
             from order_items oi where oi.order_id = o.id), '[]'::jsonb))
    into v_out
  from orders o
  join stores s on s.id = o.store_id
  where o.order_number = v_num
    and lower(o.customer_email) = v_email
  limit 1;

  return v_out;
end;
$function$;

revoke all on function public.lookup_order(text, text) from public, anon, authenticated;
grant execute on function public.lookup_order(text, text) to service_role;

comment on function public.lookup_order(text, text) is
  'Account-free order lookup for guest checkout: order number + the email that placed it. Returns the shop''s bank details while a bank transfer is owed, the live pickup code while the order waits to be collected, and whether the order can still be reviewed. SECURITY DEFINER, service_role only (M20, extended M21, M28, M29).';

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v_lo text;
begin
  if not exists (select 1 from pg_indexes where indexname = 'reviews_one_per_order') then
    raise exception 'M29: the one-review-per-order index is missing.';
  end if;

  -- The self-publish hole 20260805093000 closed must stay closed: these
  -- functions are the ONLY writers, so a client must still hold no INSERT.
  if has_column_privilege('authenticated', 'public.reviews', 'status', 'INSERT') then
    raise exception 'M29: authenticated can insert reviews.status again.';
  end if;
  if has_function_privilege('anon', 'public.rate_store(uuid,integer,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.guest_rate_store(text,text,integer,text)', 'EXECUTE') then
    raise exception 'M29: a review writer is executable by the wrong role.';
  end if;

  select prosrc into v_lo from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lookup_order';
  if position('canReview' in v_lo) = 0 or position('pickupCode' in v_lo) = 0
     or position('accountNumber' in v_lo) = 0 or position('autoReleaseAt' in v_lo) = 0 then
    raise exception 'M29: lookup_order() lost a field on the way through.';
  end if;
end;
$$;
