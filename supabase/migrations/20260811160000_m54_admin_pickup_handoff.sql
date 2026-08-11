-- M54 — The pickup handoff, for a counter with no merchant login.
--
-- ── THE GAP ────────────────────────────────────────────────────────────────
-- M28/M30 built the pickup handoff for a MERCHANT: preview_pickup_code() and
-- redeem_pickup_code() both open with `if auth.uid() is null then raise RR020`
-- and then gate on is_store_staff(). That is exactly right for a shop.
--
-- It is unusable for food. A cooker has no login by design (M50), so the person
-- handing over a food order is the Roulé Rodrigues operator, who authenticates
-- with the /admin password cookie and has no Supabase user at all. Without this
-- migration, every food order could be placed, paid and prepared — and then
-- never collected, because nothing could redeem the code. The QR would be
-- decoration, which is precisely what a pickup code must never be.
--
-- ── THE FIX, AND ITS DELIBERATE LIMIT ──────────────────────────────────────
-- Two admin-scoped doors with the same guarantees, gated the way every other
-- admin_* RPC here is gated. But they are NOT general-purpose: both refuse any
-- order whose store is not a kitchen.
--
-- That restriction is the point. Without it, the food operator's screen would
-- be able to mark a real merchant's shop order collected — closing somebody
-- else's sale, burning their single-use token, and doing it with a credential
-- that merchant never granted. "The platform admin can do anything" is a
-- reasonable belief about a platform and a terrible property for a handoff.
--
-- ── WHAT IS PRESERVED, NOT REWRITTEN ───────────────────────────────────────
-- Single use under a row lock · the ten-attempt burn · expiry · the
-- ready_for_pickup precondition · the hash-only lookup (the raw code is never
-- stored) · the same refusal codes RR020–RR024 the existing route already maps
-- to statuses. A screenshot shared with a friend still dies on first
-- redemption, because the guarantee lives in the conditional UPDATE, not in who
-- is calling.
--
-- One honest difference: qr_pickup_tokens.redeemed_by stays NULL, because there
-- is no auth.users row to point at. The fact is recorded where it can actually
-- be read back — an internal note on the order naming the platform counter.

-- ── Read-only: who is this, what is in it, may I hand it over? ─────────────
create or replace function public.admin_preview_pickup_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_norm  text;
  v_tok   qr_pickup_tokens%rowtype;
  v_order orders%rowtype;
  v_items jsonb;
  -- Identical for "no such code" and "not a food order", so this endpoint
  -- cannot be used to enumerate which codes exist elsewhere in the platform.
  v_deny  constant text := 'No food order matches that code.';
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR020', message = 'Not authorized.';
  end if;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_norm) <> 8 then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select * into v_tok from qr_pickup_tokens
   where token_hash = encode(sha256(convert_to(v_norm, 'UTF8')), 'hex');
  if not found then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select * into v_order from orders where id = v_tok.order_id;
  if not found
     or not exists (select 1 from food_kitchens fk where fk.store_id = v_order.store_id) then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', oi.product_name, 'variant', oi.variant_name, 'qty', oi.quantity)
         order by oi.product_name), '[]'::jsonb)
    into v_items
    from order_items oi where oi.order_id = v_order.id;

  return jsonb_build_object(
    'orderId',        v_order.id,
    'orderNumber',    v_order.order_number,
    'customerName',   v_order.customer_name,
    'customerPhone',  v_order.customer_phone,
    'total',          v_order.total,
    'status',         v_order.status,
    'items',          v_items,
    'alreadyRedeemed', v_tok.redeemed_at is not null,
    'redeemedAt',     v_tok.redeemed_at,
    'expiresAt',      v_tok.expires_at,
    'redeemable',     v_tok.redeemed_at is null
                      and v_tok.expires_at > now()
                      and v_tok.attempts < 10
                      and v_order.status = 'ready_for_pickup',
    'reason', case
      when v_tok.redeemed_at is not null then 'This order was already collected.'
      when v_tok.attempts >= 10 then 'This code has been tried too many times. Close the order from the order queue instead.'
      when v_tok.expires_at <= now() then 'This code has expired. Close the order from the order queue instead.'
      when v_order.status <> 'ready_for_pickup'
        then format('This order is "%s", not ready for pickup yet.', v_order.status)
      else null end);
end;
$fn$;

comment on function public.admin_preview_pickup_code(text) is
  'Read-only half of the food pickup handoff for the platform counter, which has a cookie session and no auth.uid(). Refuses any order that is not a kitchen order, so the food operator can never inspect or close a merchant shop''s sale (M54).';

-- ── The handover itself ────────────────────────────────────────────────────
create or replace function public.admin_redeem_pickup_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_norm   text;
  v_tok    qr_pickup_tokens%rowtype;
  v_order  orders%rowtype;
  v_items  integer;
  v_deny   constant text := 'No food order matches that code.';
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR020', message = 'Not authorized.';
  end if;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_norm) <> 8 then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  -- `for update` on BOTH rows, before any decision is taken. This — not any
  -- check in application code — is what makes two simultaneous scans of one
  -- screenshot produce exactly one collection.
  select * into v_tok
    from qr_pickup_tokens
   where token_hash = encode(sha256(convert_to(v_norm, 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select * into v_order from orders where id = v_tok.order_id for update;
  if not found
     or not exists (select 1 from food_kitchens fk where fk.store_id = v_order.store_id) then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select count(*) into v_items from order_items where order_id = v_order.id;

  -- Already collected is a successful, idempotent answer, not an error: the
  -- operator scanned twice, and the right response is to show them the same
  -- handover rather than an alarming red screen.
  if v_tok.redeemed_at is not null then
    return jsonb_build_object(
      'orderId', v_order.id, 'orderNumber', v_order.order_number,
      'customerName', v_order.customer_name, 'total', v_order.total,
      'itemCount', v_items, 'status', v_order.status,
      'alreadyRedeemed', true, 'redeemedAt', v_tok.redeemed_at);
  end if;

  if v_tok.attempts >= 10 then
    raise exception using errcode = 'RR024',
      message = 'This code has been tried too many times. Mark the order collected from the order queue instead.';
  end if;

  if v_tok.expires_at <= now() then
    update qr_pickup_tokens set attempts = attempts + 1 where id = v_tok.id;
    raise exception using errcode = 'RR022',
      message = format('The code for order %s has expired. Open the order and mark it collected instead.', v_order.order_number);
  end if;

  if v_order.status <> 'ready_for_pickup' then
    update qr_pickup_tokens set attempts = attempts + 1 where id = v_tok.id;
    raise exception using errcode = 'RR023',
      message = format('Order %s is "%s", not ready for pickup yet.', v_order.order_number, v_order.status);
  end if;

  -- redeemed_by stays NULL: the platform counter has no auth.users row to
  -- point at. The fact is not lost — it is written to the order's internal
  -- notes below, where it can actually be read back during a dispute.
  update qr_pickup_tokens
     set redeemed_at = now(), attempts = attempts + 1
   where id = v_tok.id;

  perform * from admin_update_order_status(
    v_order.id, 'collected', 'Collected at the Roulé Rodrigues counter (pickup code scanned).');

  return jsonb_build_object(
    'orderId', v_order.id, 'orderNumber', v_order.order_number,
    'customerName', v_order.customer_name, 'total', v_order.total,
    'itemCount', v_items, 'status', 'collected',
    'alreadyRedeemed', false, 'redeemedAt', now());
end;
$fn$;

comment on function public.admin_redeem_pickup_code(text) is
  'The food pickup handover for the platform counter. Same single-use row lock, ten-attempt burn, expiry and ready_for_pickup precondition as redeem_pickup_code() — only the authorization differs, and it additionally refuses any order that is not a kitchen order (M54).';

-- Never reachable from the public API: the /admin cookie check in the route is
-- the security boundary, and the service role is how the call lands.
revoke execute on function public.admin_preview_pickup_code(text) from public, anon, authenticated;
revoke execute on function public.admin_redeem_pickup_code(text) from public, anon, authenticated;
