-- ── "NOT YOURS" IS NOT THE SAME AS "NO" ────────────────────────────────────
--
-- Accepting a quote goes through one of two wrappers, and both raise P0001 for
-- an ownership miss with the deliberately vague 'That quote no longer exists.'
-- — vague on purpose, so the endpoint is not an id oracle.
--
-- accept_delivery_quote() ALSO raises P0001, for about ten real business
-- refusals: the request expired, the quote expired, the price moved, the
-- driver went off duty, the amount is over the cash cap, the driver's hands
-- are full.
--
-- The API route could not tell those apart:
--
--     } else if (error.code === SAFE_RPC_ERROR && v.email) {
--
-- so ANY refusal for a signed-in customer with an email in hand was retried
-- through guest_accept_delivery_quote — whose own ownership check then failed,
-- because a request posted while signed in has a null guest_email. The true
-- reason was replaced by 'That quote no longer exists.'
--
-- A customer whose driver went off duty was told their quote had vanished.
-- Somebody over the cash cap was told the same. Both false, and both landing
-- at the exact moment they chose how to pay — which is why this reads as the
-- payment step being broken.
--
-- The two failures differ in kind. One means "prove who you are another way",
-- the other means "this cannot be done". So they get different SQLSTATEs. The
-- MESSAGE is unchanged, so nothing new is disclosed; only the route can now
-- tell a retry-worthy miss from a final answer.
--
-- Verified against production, rolled back:
--   wrong email     -> P0002  That quote no longer exists.
--   off-duty driver -> P0001  That driver is not available any more.
--   over cash cap   -> P0001  That is too much to settle in cash...
create or replace function public.customer_accept_delivery_quote(
  p_quote_id uuid,
  p_expected_fee integer default null::integer,
  p_payment_method text default 'cash'::text
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to accept a price.' using errcode = 'P0001';
  end if;
  select r.customer_id into v_owner
    from delivery_quotes q join delivery_requests r on r.id = q.request_id
   where q.id = p_quote_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    -- P0002: NOT YOURS BY SESSION. Same words, different code — the route
    -- retries on this and on nothing else.
    raise exception 'That quote no longer exists.' using errcode = 'P0002';
  end if;
  return accept_delivery_quote(p_quote_id, p_expected_fee, p_payment_method);
end;
$function$;

create or replace function public.guest_accept_delivery_quote(
  p_quote_id uuid,
  p_email text,
  p_expected_fee integer default null::integer,
  p_payment_method text default 'cash'::text
) returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_stored text;
  v_email  text := nullif(btrim(lower(coalesce(p_email, ''))), '');
begin
  select r.guest_email into v_stored
    from delivery_quotes q join delivery_requests r on r.id = q.request_id
   where q.id = p_quote_id;
  if v_email is null or v_stored is null or v_stored is distinct from v_email then
    raise exception 'That quote no longer exists.' using errcode = 'P0002';
  end if;
  return accept_delivery_quote(p_quote_id, p_expected_fee, p_payment_method);
end;
$function$;
