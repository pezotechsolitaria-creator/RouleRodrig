-- M30 — Look before you redeem.
--
-- M28 shipped the handoff as a code the merchant TYPES. Typing eight characters
-- is deliberate enough that redeeming straight away is fine. Scanning is not:
-- a QR is one flick of a camera, and `collected` has no way back through
-- update_order_status(), so an accidental scan would close an order with no
-- undo and no record of the mistake.
--
-- So the scanned path is preview → confirm, and this is the preview. It is
-- STABLE — it cannot change anything — and it answers the only question the
-- merchant has while the customer is standing there: whose order is this, what
-- is in it, and can I hand it over?
--
-- It is NOT an oracle for discovering codes. is_store_staff() scopes it to the
-- caller's own stores, and a merchant already has full control of those orders
-- through /merchant/orders — so a merchant brute-forcing this endpoint learns
-- nothing they could not read from their own dashboard. Anything outside their
-- stores gets the same refusal as a code that does not exist, which is the same
-- string redeem_pickup_code() uses.
create or replace function public.preview_pickup_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_staff uuid := auth.uid();
  v_norm  text;
  v_tok   qr_pickup_tokens%rowtype;
  v_order orders%rowtype;
  v_items jsonb;
  v_deny  constant text := 'No order of yours matches that code.';
begin
  if v_staff is null then
    raise exception using errcode = 'RR020', message = 'Not signed in.';
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
  if not found or not is_store_staff(v_order.store_id) then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', oi.product_name, 'variant', oi.variant_name, 'qty', oi.quantity)
         order by oi.product_name), '[]'::jsonb)
    into v_items
    from order_items oi where oi.order_id = v_order.id;

  -- `redeemable` and `reason` are computed here rather than in the UI so the
  -- confirm button is never offered for a handover the RPC would refuse — the
  -- merchant finds out before the customer is watching, not after.
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
      when v_tok.attempts >= 10 then 'This code has been tried too many times. Close the order from the order page instead.'
      when v_tok.expires_at <= now() then 'This code has expired. Close the order from the order page instead.'
      when v_order.status <> 'ready_for_pickup'
        then format('This order is "%s", not ready for pickup yet.', v_order.status)
      else null end);
end;
$function$;

revoke all on function public.preview_pickup_code(text) from public, anon, authenticated;
grant execute on function public.preview_pickup_code(text) to authenticated;

comment on function public.preview_pickup_code(text) is
  'Read-only look at the order behind a pickup code, for the confirm step of the scanned handoff. Store-staff-only and STABLE; unknown codes and other shops'' codes share redeem_pickup_code()''s single refusal message (M30).';

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'preview_pickup_code'
       and p.provolatile = 's'
  ) then
    raise exception 'M30: preview_pickup_code() is not STABLE — the preview must not be able to write.';
  end if;
  if has_function_privilege('anon', 'public.preview_pickup_code(text)', 'EXECUTE') then
    raise exception 'M30: anon can execute preview_pickup_code().';
  end if;
end;
$$;
