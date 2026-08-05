-- Server-side enforcement of opening hours at checkout.
--
-- The rule set:
--   shop closed          -> no order at all, whatever the fulfillment method
--   delivery window shut -> rr_delivery refused; pickup and the customer's own
--                           driver still allowed, because those do not depend
--                           on the RR delivery network being on the road
--
-- Both gates live in the RPCs, not the route handlers, so a crafted POST that
-- skips the UI hits exactly the same wall. The badge in the browser is a
-- courtesy; this is the control.
--
-- RR010 = shop closed, RR011 = delivery window closed. New codes rather than
-- reusing RR005/RR006 so the API can map them to distinct, actionable messages.
do $do$
declare
  src text; newsrc text;

  -- create_order: insert the gate straight after the subscription check, before
  -- any stock is touched, so a closed shop never reserves inventory.
  co_old text := $frag$  select * into v_pay from store_payment_settings where store_id = p_store_id;$frag$;
  co_new text := $frag$  -- Opening hours. Evaluated in Rodrigues local time by the shared engine.
  select * into v_sched from store_schedule_status(p_store_id);
  if not v_sched.is_open then
    raise exception using errcode='RR010', message='This shop is closed right now.'; end if;
  if p_fulfillment = 'rr_delivery' and not v_sched.delivery_available then
    raise exception using errcode='RR011',
      message='Delivery is not running right now. You can still choose pickup or your own driver.'; end if;

  select * into v_pay from store_payment_settings where store_id = p_store_id;$frag$;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='create_order' and pronamespace='public'::regnamespace;
  if src is null then raise exception 'create_order() not found'; end if;

  if position('RR010' in src) > 0 then
    raise notice 'create_order already schedule-gated';
  else
    if position(co_old in src) = 0 then
      raise exception 'create_order(): payment-settings anchor not found — refusing to patch blindly';
    end if;
    -- Declare the record variable alongside the existing ones.
    if position('v_sched record;' in src) = 0 then
      newsrc := replace(src, '  v_pay record;', '  v_pay record;'||chr(10)||'  v_sched record;');
      if newsrc = src then
        newsrc := replace(src, 'declare', 'declare'||chr(10)||'  v_sched record;');
      end if;
    else
      newsrc := src;
    end if;
    newsrc := replace(newsrc, co_old, co_new);
    execute newsrc;
  end if;
end
$do$;

-- quote_order mirrors the same rules so the customer is told before they fill
-- the form, not after. Same engine, same answer.
do $do$
declare
  src text; newsrc text;
  qo_old text := $frag$  select * into v_amounts from order_amounts(p_store_id, v_subtotal, p_fulfillment, p_zone_id);$frag$;
  qo_new text := $frag$  select * into v_sched from store_schedule_status(p_store_id);
  if not v_sched.is_open then
    raise exception using errcode='RR010', message='This shop is closed right now.'; end if;
  if p_fulfillment = 'rr_delivery' and not v_sched.delivery_available then
    raise exception using errcode='RR011',
      message='Delivery is not running right now. You can still choose pickup or your own driver.'; end if;

  select * into v_amounts from order_amounts(p_store_id, v_subtotal, p_fulfillment, p_zone_id);$frag$;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='quote_order' and pronamespace='public'::regnamespace;
  if src is null then raise exception 'quote_order() not found'; end if;

  if position('RR010' in src) > 0 then
    raise notice 'quote_order already schedule-gated';
  else
    if position(qo_old in src) = 0 then
      raise exception 'quote_order(): order_amounts anchor not found — refusing to patch blindly';
    end if;
    newsrc := replace(src, '  v_amounts  record;', '  v_amounts  record;'||chr(10)||'  v_sched    record;');
    newsrc := replace(newsrc, qo_old, qo_new);
    execute newsrc;
  end if;
end
$do$;
