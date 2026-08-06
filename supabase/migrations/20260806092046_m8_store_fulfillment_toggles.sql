-- Per-shop pickup and customer-driver participation.
--
-- M7 rewired the fulfillment gate onto store_payment_settings.offers_rr_delivery
-- and retired stores.fulfillment (which nothing ever wrote). That left pickup
-- and customer-arranged delivery permanently on, with no way for a shop or the
-- platform to switch them off — there was no column for it anywhere.
--
-- These live beside offers_rr_delivery so all three fulfillment participation
-- flags are one row, read once, and gated in one place in create_order().
--
-- Both DEFAULT TRUE, deliberately. The M7 lesson stands: stores.fulfillment
-- defaulted to delivery:false, nothing wrote it, and the whole delivery feature
-- was unreachable for every real merchant. A new flag must never silently
-- switch off something that works today.
alter table store_payment_settings
  add column if not exists offers_pickup            boolean not null default true,
  add column if not exists offers_customer_delivery boolean not null default true;

comment on column store_payment_settings.offers_pickup is
  'Shop accepts collection in person. Default true — a new flag must not disable a working path.';

comment on column store_payment_settings.offers_customer_delivery is
  'Shop lets the customer send their own driver. Default true.';

-- Extend the create_order fulfillment gate to all three methods. The rr_delivery
-- branch is left exactly as M7 wrote it; pickup and customer_delivery gain the
-- same shape so the three rules read identically and cannot drift apart.
do $do$
declare
  src text; newsrc text;
  old_frag text := $frag$  if p_fulfillment = 'rr_delivery' and not coalesce(v_pay.offers_rr_delivery, true) then
    raise exception using errcode='RR005', message='This shop does not offer Roulé Rodrigues delivery.'; end if;$frag$;
  new_frag text := $frag$  if p_fulfillment = 'rr_delivery' and not coalesce(v_pay.offers_rr_delivery, true) then
    raise exception using errcode='RR005', message='This shop does not offer Roulé Rodrigues delivery.'; end if;
  if p_fulfillment = 'pickup' and not coalesce(v_pay.offers_pickup, true) then
    raise exception using errcode='RR005', message='This shop does not offer pickup.'; end if;
  if p_fulfillment = 'customer_delivery' and not coalesce(v_pay.offers_customer_delivery, true) then
    raise exception using errcode='RR005', message='This shop does not accept your own driver.'; end if;$frag$;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='create_order' and pronamespace='public'::regnamespace;
  if src is null then raise exception 'create_order() not found'; end if;

  if position('does not offer pickup' in src) > 0 then
    raise notice 'create_order already gates pickup; nothing to do';
    return;
  end if;
  if position(old_frag in src) = 0 then
    raise exception 'create_order(): rr_delivery gate not found — refusing to patch blindly';
  end if;

  newsrc := replace(src, old_frag, new_frag);
  execute newsrc;
end
$do$;
