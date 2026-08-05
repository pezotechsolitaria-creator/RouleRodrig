-- Adds the delivery zone to create_order and records it on the order.
-- Patches only the affected fragments of the live definition. Note that
-- pg_get_functiondef() normalises the parameter list onto a single line, so the
-- signature fragment below is matched in that normalised form, not as written
-- in the original migration.
do $do$
declare
  src text; newsrc text; frag text;

  old_sig text := 'p_delivery_instructions text DEFAULT NULL::text)';
  new_sig text := 'p_delivery_instructions text DEFAULT NULL::text, p_delivery_zone_id uuid DEFAULT NULL::uuid)';

  -- The early rr_delivery branch previously read the flat island-wide fee.
  -- Zone pricing is now resolved once, at the end, by order_amounts().
  old_fee text := '      v_delivery_fee := coalesce(v_settings.delivery_base_fee,0);';
  new_fee text := '      if p_delivery_zone_id is null then
        raise exception using errcode=''RR005'', message=''Choose the area we are delivering to.''; end if;
      if not exists (select 1 from delivery_zones z where z.id = p_delivery_zone_id and z.is_active) then
        raise exception using errcode=''RR005'', message=''We do not deliver to that area right now.''; end if;';

  old_cols text := 'fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, auto_release_at)';
  new_cols text := 'fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, auto_release_at, delivery_zone_id)';

  old_ins text := 'nullif(trim(p_delivery_instructions),''''), now()+interval ''48 hours'')';
  new_ins text := 'nullif(trim(p_delivery_instructions),''''), now()+interval ''48 hours'', p_delivery_zone_id)';

  old_amt text := 'from order_amounts(p_store_id, v_subtotal, p_fulfillment) a;';
  new_amt text := 'from order_amounts(p_store_id, v_subtotal, p_fulfillment, p_delivery_zone_id) a;';
begin
  select pg_get_functiondef(oid) into src from pg_proc where proname = 'create_order';
  if src is null then raise exception 'create_order() not found'; end if;

  if position('p_delivery_zone_id' in src) > 0 then
    raise notice 'create_order already zone-aware; nothing to do';
    return;
  end if;

  foreach frag in array array[old_sig, old_fee, old_cols, old_ins, old_amt] loop
    if position(frag in src) = 0 then
      raise exception 'create_order() fragment not found — refusing to patch blindly: %', left(frag, 60);
    end if;
  end loop;

  newsrc := replace(src,    old_sig,  new_sig);
  newsrc := replace(newsrc, old_fee,  new_fee);
  newsrc := replace(newsrc, old_cols, new_cols);
  newsrc := replace(newsrc, old_ins,  new_ins);
  newsrc := replace(newsrc, old_amt,  new_amt);
  execute newsrc;
end
$do$;

revoke execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid) from public, anon;
grant execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid) to authenticated;
-- Remove the superseded signature so nothing can bind to zone-unaware pricing.
drop function if exists create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text);
