-- ── M181b · expire_order() LEARNS THE SECOND DEADLINE ─────────────────────
--
-- Applied to production 2026-09-07 (recorded there as m180_b).
--
-- DROP and CREATE rather than adding a defaulted parameter: a second signature
-- of the same name makes PostgREST refuse the endpoint with PGRST203, and this
-- project has hit that trap before. One signature, replaced.
--
-- WHAT IS UNCHANGED, and must stay unchanged:
--   * status = 'pending_payment' — a PAID order is never auto-cancelled. Money
--     has moved to the merchant's own account; cancelling it silently would
--     leave them holding cash against nothing. Those need a person.
--   * accepted_at is null — an order the kitchen accepted is being COOKED.
--     Cancelling it at 15:30 bins real food.
--   * the restock, and both notifications.

drop function if exists public.expire_order(uuid);

create function public.expire_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_grace   interval;
  v_reason  text;
begin
  select make_interval(mins => coalesce(pickup_grace_minutes, 30))
    into v_grace from marketplace_settings limit 1;
  v_grace := coalesce(v_grace, interval '30 minutes');

  -- WHICH deadline fired is decided here, once, and reused for the wording.
  -- A customer told "the shop did not confirm in time" about a lunch they
  -- waited for at 15:00 learns nothing; naming the collection time does.
  select case
           when o.pickup_slot is not null
            and not upper_inf(o.pickup_slot)
            and upper(o.pickup_slot) + v_grace < now()
             then 'pickup'
           else 'hold'
         end
    into v_reason
  from orders o
  where o.id = p_order_id
    and o.status = 'pending_payment'
    and o.accepted_at is null
    and (
      -- 1. The payment hold lapsed. Unchanged, including the guard that stops
      --    tonight's sweep cancelling tomorrow's lunch.
      (o.auto_release_at is not null
         and o.auto_release_at < now()
         and (o.pickup_slot is null or lower(o.pickup_slot) < now()))
      or
      -- 2. NEW: the collection window ended and nobody ever accepted it.
      (o.pickup_slot is not null
         and not upper_inf(o.pickup_slot)
         and upper(o.pickup_slot) + v_grace < now())
    )
  for update;

  if not found then return false; end if;

  insert into inventory_movements (variant_id, delta, reason, order_id, note)
  select oi.variant_id, oi.quantity, 'restock', p_order_id,
         case when v_reason = 'pickup'
              then 'auto-cancelled: collection time passed unaccepted'
              else 'auto-released: reservation expired' end
  from order_items oi where oi.order_id = p_order_id;

  update orders set status = 'cancelled' where id = p_order_id;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'customer', o.customer_id, o.id, 'order_status_changed',
         'Order '||o.order_number||
           case when v_reason = 'pickup' then ' was not confirmed' else ' expired' end,
         case when v_reason = 'pickup'
              then 'Your collection time passed and the kitchen had not confirmed it, so the order was cancelled and nothing was charged. Order again when they are back on.'
              else 'The reservation window passed before the shop confirmed it, so the items were released. You have not been charged.' end,
         jsonb_build_object('new_status','cancelled','expiry_reason',v_reason)
  from orders o where o.id = p_order_id and o.customer_id is not null;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, o.id, 'order_status_changed',
         'Order '||o.order_number||
           case when v_reason = 'pickup' then ' passed its collection time' else ' expired' end,
         case when v_reason = 'pickup'
              then 'Nobody accepted it before the collection time, so it was cancelled and the portions went back on your menu.'
              else 'It was not confirmed in time, so the stock has been returned to your shelf.' end,
         jsonb_build_object('new_status','cancelled','expiry_reason',v_reason)
  from orders o
  join stores s on s.id = o.store_id
  join merchant_staff ms on ms.merchant_id = s.merchant_id
  where o.id = p_order_id;

  return true;
end $function$;

comment on function public.expire_order(uuid) is
  'Cancels and restocks an order that was never accepted, on the EARLIER of two deadlines: the payment hold (auto_release_at) or the end of its pickup slot plus marketplace_settings.pickup_grace_minutes (M181). Never touches a paid or accepted order.';

revoke all on function public.expire_order(uuid) from public;
revoke all on function public.expire_order(uuid) from anon;
revoke all on function public.expire_order(uuid) from authenticated;
grant execute on function public.expire_order(uuid) to service_role;

do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='expire_order';
  if v_count <> 1 then
    raise exception 'M181b: expire_order is overloaded (% versions) - PostgREST will refuse it', v_count;
  end if;
  if has_function_privilege('anon','public.expire_order(uuid)','EXECUTE') then
    raise exception 'M181b: anon can expire an order';
  end if;
end $$;
