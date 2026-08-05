-- Every shop created through the product was pickup-only, permanently.
--
-- create_order gated both delivery modes on `stores.fulfillment ->> 'delivery'`.
-- That column defaults to {"pickup": true, "delivery": false} and NOTHING in
-- the application ever writes it — not onboard_merchant, not any settings route
-- (verified by grep across app/ and lib/; the only write anywhere is in the e2e
-- fixtures, which is why testing never caught it). So for a real self-onboarded
-- merchant, customer_delivery and rr_delivery both raised RR005 forever, and
-- the delivery zones, the GPS capture and the whole delivery UI were dead code.
--
-- Rewired to the flag the merchant actually controls:
--   pickup            — every shop can be collected from.
--   customer_delivery — the customer sends their own driver; from the shop's
--                       side that is a collection, so it needs no opt-in.
--   rr_delivery       — requires store_payment_settings.offers_rr_delivery,
--                       which is exactly what the "Offer Roulé Rodrigues
--                       delivery" checkbox in the merchant's payment settings
--                       already writes, and which defaults to true.
--
-- stores.fulfillment is left in place but is no longer consulted — deprecated,
-- logged as technical debt rather than removed mid-flight.
do $do$
declare
  src text; newsrc text;
  old_frag text := $frag$  if not coalesce((v_store.fulfillment ->> (case when p_fulfillment='pickup' then 'pickup' else 'delivery' end))::boolean,false) then
    raise exception using errcode='RR005', message=format('This shop does not offer %s.', replace(p_fulfillment,'_',' ')); end if;

  select * into v_pay from store_payment_settings where store_id = p_store_id;$frag$;
  new_frag text := $frag$  select * into v_pay from store_payment_settings where store_id = p_store_id;

  -- Only Roulé Rodrigues delivery is opt-in; pickup and a customer's own
  -- driver are both just collections from the shop's point of view.
  if p_fulfillment = 'rr_delivery' and not coalesce(v_pay.offers_rr_delivery, true) then
    raise exception using errcode='RR005', message='This shop does not offer Roulé Rodrigues delivery.'; end if;$frag$;
begin
  select pg_get_functiondef(oid) into src from pg_proc
  where proname = 'create_order' and pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'create_order() not found'; end if;

  if position('does not offer Roulé Rodrigues delivery' in src) > 0 then
    raise notice 'fulfillment gate already rewired; nothing to do';
    return;
  end if;
  if position(old_frag in src) = 0 then
    raise exception 'create_order() fulfillment gate not found — refusing to patch blindly';
  end if;

  newsrc := replace(src, old_frag, new_frag);
  execute newsrc;
end
$do$;
