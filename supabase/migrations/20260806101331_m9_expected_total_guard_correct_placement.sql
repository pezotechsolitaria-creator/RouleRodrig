-- Corrects m9_create_order_expected_total_guard, which I placed wrongly.
--
-- I put the comparison just before the order-number is generated. At that point
-- v_total is still 0 — the amounts are only derived further down, by
-- order_amounts(), AFTER the order row is inserted. So the guard compared
-- against zero: it refused the stale total for the wrong reason ("it is now
-- Rs 0.00") and, worse, refused the CORRECT total too, which would have blocked
-- every checkout that sent one. Caught by testing the fix rather than trusting
-- it.
--
-- Correct placement is immediately after v_total is assigned and before the
-- payments row is written, so the comparison sees the final figure and nothing
-- financial has been committed yet. Raising here aborts the whole function, so
-- the already-inserted order row rolls back with it — the customer gets no
-- half-made order.
do $do$
declare
  src text; newsrc text;

  -- Remove the misplaced check.
  bad text := '  if p_expected_total is not null and p_expected_total <> v_total then
    raise exception using errcode=''RR012'',
      message=format(''The price changed while you were checking out — it is now Rs %s, not Rs %s. Please review and try again.'',
                     to_char(v_total/100.0, ''FM999999990.00''),
                     to_char(p_expected_total/100.0, ''FM999999990.00''));
  end if;

';

  old_anchor text := '  update orders set subtotal=v_subtotal, tax=v_tax, delivery_fee=v_delivery_fee, total=v_total, commission_amount=0 where id=v_order_id;';
  new_anchor text := '  -- The customer must never be charged a total they were not shown. Raising
  -- here rolls back the order row inserted moments ago, so a price that moved
  -- mid-checkout produces no order at all rather than a surprise one.
  if p_expected_total is not null and p_expected_total <> v_total then
    raise exception using errcode=''RR012'',
      message=format(''The price changed while you were checking out — it is now Rs %s, not Rs %s. Please review and try again.'',
                     to_char(v_total/100.0, ''FM999999990.00''),
                     to_char(p_expected_total/100.0, ''FM999999990.00''));
  end if;

  update orders set subtotal=v_subtotal, tax=v_tax, delivery_fee=v_delivery_fee, total=v_total, commission_amount=0 where id=v_order_id;';
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='create_order' and pronamespace='public'::regnamespace;
  if src is null then raise exception 'create_order() not found'; end if;

  if position(bad in src) = 0 then
    raise exception 'misplaced guard not found — refusing to patch blindly';
  end if;
  if position(old_anchor in src) = 0 then
    raise exception 'amounts-update anchor not found — refusing to patch blindly';
  end if;

  newsrc := replace(src, bad, '');
  newsrc := replace(newsrc, old_anchor, new_anchor);
  execute newsrc;
end
$do$;
