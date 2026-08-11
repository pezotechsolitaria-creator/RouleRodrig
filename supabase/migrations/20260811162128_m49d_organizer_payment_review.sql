-- M49d — give the organiser the two things the payment loop needs.
--
-- 1. SOMEWHERE TO BE PAID. An event store starts with accepts_cash only and no
--    bank details, and the only writer for store_payment_settings is the
--    merchant dashboard — which an organiser deliberately cannot reach (M43).
--    So bank transfer, the payment method the whole M49 path is built around,
--    could never be switched on for an event. The CHECK constraint
--    bank_details_present_when_enabled still applies, so the details cannot be
--    half-filled.
--
-- 2. ENOUGH INFORMATION TO JUDGE A PAYMENT. organizer_event_detail() returned
--    an order's status but not how it was paid, whether proof was attached, or
--    where that proof lives — so "confirm this payment" was a decision with the
--    evidence missing.
--
-- Roulé Rodrigues never holds ticket money: the organiser is paid directly,
-- which is exactly why the confirmation has to be theirs to give.

create or replace function public.organizer_set_payment_settings(
  p_store_id      uuid,
  p_accepts_cash  boolean,
  p_accepts_bank  boolean,
  p_bank_name     text default null,
  p_account_holder text default null,
  p_account_number text default null,
  p_instructions  text default null,
  p_require_receipt boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_row store_payment_settings;
begin
  -- The same predicate the rest of the organiser surface uses. It reads status
  -- live, so a suspended organiser loses this immediately.
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  if not p_accepts_cash and not p_accepts_bank then
    raise exception using errcode='RR005',
      message='Choose at least one way to be paid, or nobody can buy a ticket.';
  end if;

  if p_accepts_bank and (nullif(btrim(coalesce(p_bank_name,'')),'') is null
      or nullif(btrim(coalesce(p_account_holder,'')),'') is null
      or nullif(btrim(coalesce(p_account_number,'')),'') is null) then
    raise exception using errcode='RR005',
      message='Bank transfer needs the bank name, the account holder and the account number.';
  end if;

  insert into store_payment_settings as sps (
    store_id, accepts_cash, accepts_bank_transfer, bank_name, account_holder,
    account_number, payment_instructions, require_receipt, offers_pickup)
  values (p_store_id, p_accepts_cash, p_accepts_bank,
    nullif(btrim(coalesce(p_bank_name,'')),''),
    nullif(btrim(coalesce(p_account_holder,'')),''),
    nullif(btrim(coalesce(p_account_number,'')),''),
    nullif(btrim(coalesce(p_instructions,'')),''),
    coalesce(p_require_receipt,false), true)
  on conflict (store_id) do update set
    accepts_cash          = excluded.accepts_cash,
    accepts_bank_transfer = excluded.accepts_bank_transfer,
    bank_name             = excluded.bank_name,
    account_holder        = excluded.account_holder,
    account_number        = excluded.account_number,
    payment_instructions  = excluded.payment_instructions,
    require_receipt       = excluded.require_receipt,
    offers_pickup         = true,
    updated_at            = now()
  returning * into v_row;

  return jsonb_build_object(
    'acceptsCash', v_row.accepts_cash,
    'acceptsBankTransfer', v_row.accepts_bank_transfer,
    'requireReceipt', v_row.require_receipt);
end;
$function$;

revoke all on function public.organizer_set_payment_settings(uuid, boolean, boolean, text, text, text, text, boolean) from public, anon;
grant execute on function public.organizer_set_payment_settings(uuid, boolean, boolean, text, text, text, text, boolean) to authenticated, service_role;

create or replace function public.organizer_event_detail(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare v_out jsonb;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select jsonb_build_object(
    'storeId', s.id, 'slug', s.slug, 'name', s.name,
    'phase', event_phase(s.id),
    'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'venueName', e.venue_name, 'venueAddress', e.venue_address,
    'timezone', e.timezone, 'cancelledAt', e.cancelled_at,
    'canVerifyPayments', can_verify_event_payments(s.id),
    -- M49d. The organiser's own bank details; they are the payee, not a third
    -- party, so there is nothing here they should not see.
    'payment', (
      select jsonb_build_object(
        'acceptsCash', coalesce(sp.accepts_cash, true),
        'acceptsBankTransfer', coalesce(sp.accepts_bank_transfer, false),
        'requireReceipt', coalesce(sp.require_receipt, false),
        'bankName', sp.bank_name,
        'accountHolder', sp.account_holder,
        'accountNumber', sp.account_number,
        'instructions', sp.payment_instructions)
      from store_payment_settings sp where sp.store_id = s.id),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', v.id, 'name', v.name, 'price', v.price,
        'remaining', v.stock_quantity, 'isActive', v.is_active,
        'salesOpen', ticket_sales_open(v.id),
        'salesStart', tt.sales_start, 'salesEnd', tt.sales_end,
        'minPerOrder', tt.min_per_order, 'maxPerOrder', tt.max_per_order,
        'subtitle', tt.subtitle,
        'description', tt.description,
        'inclusions', coalesce(to_jsonb(tt.inclusions), '[]'::jsonb),
        'imageUrl', tt.image_url,
        'displayOrder', tt.display_order,
        'sold', coalesce((select sum(oi.quantity)::int from orders o2
          join order_items oi on oi.order_id = o2.id
          where oi.variant_id = v.id
            and o2.status in ('paid','preparing','ready_for_pickup','collected')), 0),
        'awaiting', coalesce((select sum(oi.quantity)::int from orders o2
          join order_items oi on oi.order_id = o2.id
          where oi.variant_id = v.id
            and o2.status in ('pending_payment','awaiting_payment_confirmation')), 0))
        order by tt.display_order, v.name)
      from product_variants v
      join products p on p.id = v.product_id
      join ticket_types tt on tt.variant_id = v.id
      where p.store_id = s.id), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', o2.id,
        'orderNumber', o2.order_number, 'status', o2.status,
        'customerName', o2.customer_name, 'customerPhone', o2.customer_phone,
        'customerEmail', o2.customer_email,
        'total', o2.total, 'placedAt', o2.placed_at, 'autoReleaseAt', o2.auto_release_at,
        -- M49d: what the organiser needs to actually judge a payment.
        'provider', (select pm.provider from payments pm
                      where pm.order_id = o2.id order by pm.created_at limit 1),
        'receiptSubmittedAt', o2.receipt_submitted_at,
        'receiptPath', o2.payment_receipt_path,
        'units', (select sum(oi.quantity)::int from order_items oi where oi.order_id = o2.id))
        order by o2.placed_at desc)
      from (select o3.* from orders o3 where o3.store_id = s.id
            order by o3.placed_at desc nulls last limit 50) o2), '[]'::jsonb)
  ) into v_out
  from stores s join events e on e.store_id = s.id
  where s.id = p_store_id;

  return v_out;
end;
$function$;

revoke all on function public.organizer_event_detail(uuid) from public, anon;
grant execute on function public.organizer_event_detail(uuid) to authenticated, service_role;

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='organizer_event_detail';
  if position('receiptPath' in v_src) = 0 or position('acceptsBankTransfer' in v_src) = 0 then
    raise exception 'M49d: detail payload is missing the payment review fields'; end if;
  -- M47c must survive this rewrite.
  if position('tt.inclusions' in v_src) = 0 or position('tt.subtitle' in v_src) = 0 then
    raise exception 'M49d: the rewrite dropped M47c package content'; end if;
  if position('can_manage_event' in v_src) = 0 then
    raise exception 'M49d: the detail function lost its gate'; end if;
end;
$$;
