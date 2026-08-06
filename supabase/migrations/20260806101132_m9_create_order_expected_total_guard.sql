-- A customer must never be charged a total they were not shown.
--
-- create_order() re-derives every price from the database, which is correct and
-- stays correct — the client's number is never trusted AS the price. But nothing
-- compared the derived total against the figure the customer was actually
-- looking at when they pressed the button. Demonstrated live:
--
--   1. customer is quoted   subtotal 2000 + delivery 15000 = 17000
--   2. platform re-prices Port Mathurin  15000 -> 50000
--   3. customer presses Place order      -> order created for 52000
--
-- Rs 170 shown, Rs 520 charged, no warning. Under bank transfer this is the
-- worst case: the customer wires what they saw, the order says something else,
-- the merchant records a short payment and someone has to arbitrate. The same
-- window opens whenever a merchant edits a product price, a zone fee changes,
-- or tax settings move between quote and submit.
--
-- The guard: an OPTIONAL expected total. When supplied and it disagrees with the
-- derived total, the order is refused with RR012 and both figures, so the caller
-- can re-quote and show "the price changed — here is the new total" instead of
-- silently charging it. Optional, so nothing that does not send it breaks; the
-- checkout route always sends it.
--
-- Deliberately NOT a price lock: the database still decides the price. This only
-- refuses to complete a purchase the customer did not agree to.
do $do$
declare
  src text; newsrc text;

  old_sig text := 'p_delivery_zone_id uuid DEFAULT NULL::uuid)';
  new_sig text := 'p_delivery_zone_id uuid DEFAULT NULL::uuid, p_expected_total integer DEFAULT NULL::integer)';

  -- The insert of the order row is the commit point; the check goes immediately
  -- before it, once every amount is final.
  old_ins text := '  v_order_number := ''RR''||to_char(now(),''YYMMDD'')||''-''||upper(substr(md5(random()::text),1,5));';
  new_ins text := '  if p_expected_total is not null and p_expected_total <> v_total then
    raise exception using errcode=''RR012'',
      message=format(''The price changed while you were checking out — it is now Rs %s, not Rs %s. Please review and try again.'',
                     to_char(v_total/100.0, ''FM999999990.00''),
                     to_char(p_expected_total/100.0, ''FM999999990.00''));
  end if;

  v_order_number := ''RR''||to_char(now(),''YYMMDD'')||''-''||upper(substr(md5(random()::text),1,5));';
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='create_order' and pronamespace='public'::regnamespace;
  if src is null then raise exception 'create_order() not found'; end if;

  if position('RR012' in src) > 0 then
    raise notice 'create_order already has the expected-total guard';
    return;
  end if;
  if position(old_sig in src) = 0 then
    raise exception 'create_order(): signature anchor not found — refusing to patch blindly';
  end if;
  if position(old_ins in src) = 0 then
    raise exception 'create_order(): order-number anchor not found — refusing to patch blindly';
  end if;

  newsrc := replace(src, old_sig, new_sig);
  newsrc := replace(newsrc, old_ins, new_ins);
  execute newsrc;
end
$do$;

revoke execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer) from public, anon;

grant  execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer) to authenticated;

-- Retire the previous signature so nothing can bind to the unguarded overload.
drop function if exists create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid);
