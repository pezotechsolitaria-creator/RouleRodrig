-- Owner decision: the platform owns the delivery FEE and ETA (they belong to the
-- Roule Rodrigues delivery network and are set once in marketplace_settings),
-- but each shop decides whether it takes part at all.
--
-- Lives on store_payment_settings rather than stores.fulfillment because
-- merchants already have RLS write access there, so this needs no change to the
-- deliberately narrow column grants on stores.
alter table store_payment_settings
  add column if not exists offers_rr_delivery boolean not null default true;

-- Teach create_order to respect the toggle. Rewrites only the rr_delivery
-- branch; the guard makes a silent no-op impossible.
do $do$
declare
  src text; newsrc text;
  old_branch text := '    if p_fulfillment=''rr_delivery'' then
      select * into v_settings from marketplace_settings where id=''main'';
      if not coalesce(v_settings.delivery_enabled,false) then
        raise exception using errcode=''RR005'', message=''Roule Rodrigues delivery is not available at the moment.''; end if;
      v_delivery_fee := coalesce(v_settings.delivery_base_fee,0);
    end if;';
  new_branch text := '    if p_fulfillment=''rr_delivery'' then
      if not coalesce(v_pay.offers_rr_delivery, true) then
        raise exception using errcode=''RR005'', message=''This shop does not offer Roule Rodrigues delivery.''; end if;
      select * into v_settings from marketplace_settings where id=''main'';
      if not coalesce(v_settings.delivery_enabled,false) then
        raise exception using errcode=''RR005'', message=''Roule Rodrigues delivery is not available at the moment.''; end if;
      v_delivery_fee := coalesce(v_settings.delivery_base_fee,0);
    end if;';
begin
  select pg_get_functiondef(oid) into src from pg_proc where proname = 'create_order';
  if src is null then raise exception 'create_order() not found'; end if;

  if position(old_branch in src) = 0 then
    if position('offers_rr_delivery' in src) > 0 then
      raise notice 'create_order already checks offers_rr_delivery; nothing to do';
      return;
    end if;
    raise exception 'create_order() rr_delivery branch did not match - refusing to patch blindly';
  end if;

  newsrc := replace(src, old_branch, new_branch);
  execute newsrc;
end
$do$;
