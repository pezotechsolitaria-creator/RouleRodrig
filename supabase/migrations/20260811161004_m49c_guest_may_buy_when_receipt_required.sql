-- M49c — lift the guest ban on receipt-required stores, now that its premise is gone.
--
-- create_order() has refused this since M21:
--
--   -- Guest + bank transfer at a shop that REQUIRES a receipt file (M21).
--   -- Uploading an image needs storage RLS, which needs a session.
--   'This shop needs a photo of your transfer receipt, which needs an account.
--    Please sign in, or pay cash instead.'
--
-- That was correct when written, and the guard's own comment states the reason
-- honestly: a guest could not upload, so letting them order would strand them in
-- a state they could never leave. M49b removed the premise — the server now
-- validates (order number, email) and uploads the proof itself under the service
-- role, so the buyer needs neither storage RLS nor a session.
--
-- Leaving the guard would make events impossible: a ticket buyer is a guest by
-- design, and an organiser asking for proof of transfer is the normal case. Found
-- by running a purchase end to end, not by reading — this refusal fires before
-- any of M49b's three fixes are reached.
--
-- METHOD. create_order() is long and carries amendments from M6 through M24, so
-- the guard is spliced out programmatically between two anchors and the result
-- asserted structurally and functionally. Re-running no-ops: the anchor is gone.

do $$
declare
  v_def text; v_start int; v_after int; v_new text;
  v_anchor constant text := '  -- Guest + bank transfer at a shop that REQUIRES a receipt file (M21).';
  v_resume constant text := '  if p_fulfillment in (''customer_delivery'',''rr_delivery'') then';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='create_order';
  if v_def is null then raise exception 'M49c: create_order() not found.'; end if;

  v_start := position(v_anchor in v_def);
  if v_start = 0 then
    raise notice 'M49c: guard already absent — nothing to do.';
    return;
  end if;

  v_after := position(v_resume in v_def);
  if v_after = 0 or v_after <= v_start then
    raise exception 'M49c: resume anchor not found after the guard. Refusing to cut blindly.';
  end if;

  v_new := left(v_def, v_start - 1)
    || '  -- (M49c) The guest + require_receipt refusal that stood here is gone.'   || chr(10)
    || '  -- Its premise was that uploading proof needs storage RLS and therefore' || chr(10)
    || '  -- a session. M49b made the SERVER upload it under the service role'     || chr(10)
    || '  -- after checking order number + email, so a guest can supply proof'     || chr(10)
    || '  -- without an account — the normal case for an event ticket.'            || chr(10)
    || chr(10)
    || substring(v_def from v_after);

  execute v_new;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='create_order';

  if position('which needs an account' in v_def) > 0 then
    raise exception 'M49c: the guard is still present after the splice.'; end if;
  if position('RR012' in v_def) = 0 then
    raise exception 'M49c: lost the expected-total guard (M9/RR012).'; end if;
  if position('RR013' in v_def) = 0 then
    raise exception 'M49c: lost the open-reservation cap (M21/RR013).'; end if;
  if position('p_idempotency_key' in v_def) = 0 then
    raise exception 'M49c: lost checkout idempotency (M10).'; end if;
  if position('store_is_visible' in v_def) = 0 then
    raise exception 'M49c: lost the store visibility gate.'; end if;
  if position('does not accept bank transfer' in v_def) = 0 then
    raise exception 'M49c: lost the accepted-payment-method gate.'; end if;
end;
$$;

-- Functional proof, inside the migration so it cannot be skipped: a guest must
-- now be able to place a bank-transfer order at a require_receipt store. The
-- fixture is made orderable only within this transaction and restored before the
-- end, so no committed state ever has a test event on sale.
do $$
declare
  v_store uuid; v_variant uuid; v_oid uuid;
  v_prev_test boolean; v_prev_status store_status;
begin
  select s.id, s.is_test, s.status into v_store, v_prev_test, v_prev_status
    from stores s where s.slug='summer-fest-rodrigues';
  if v_store is null then
    raise notice 'M49c: no fixture event, skipping the functional probe.'; return; end if;

  select v.id into v_variant from product_variants v
    join products p on p.id=v.product_id
   where p.store_id=v_store and v.is_active limit 1;
  if v_variant is null then
    raise notice 'M49c: fixture has no sellable ticket, skipping the probe.'; return; end if;

  update stores set is_test=false, status='active' where id=v_store;
  insert into store_payment_settings (store_id, accepts_cash, accepts_bank_transfer,
         require_receipt, bank_name, account_holder, account_number, offers_pickup)
  values (v_store, false, true, true, 'MCB', 'Summer Fest Ltd', '000123456789', true)
  on conflict (store_id) do update set
         accepts_cash=false, accepts_bank_transfer=true, require_receipt=true,
         bank_name='MCB', account_holder='Summer Fest Ltd',
         account_number='000123456789', offers_pickup=true;

  select c.order_id into v_oid from create_order(v_store,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 1)),
      'M49c Probe','+23057000000','pickup',null,'bank_transfer',
      null,null,null,null,null,gen_random_uuid(),'m49c.probe@example.test') c;

  if v_oid is null then raise exception 'M49c: guest order still refused.'; end if;

  delete from order_financials where order_id=v_oid;
  delete from payments      where order_id=v_oid;
  delete from order_items   where order_id=v_oid;
  delete from notifications where order_id=v_oid;
  delete from orders        where id=v_oid;

  update stores set is_test=v_prev_test, status=v_prev_status where id=v_store;
  if exists (select 1 from stores where id=v_store and not is_test) then
    raise exception 'M49c: fixture was left visible.'; end if;
end;
$$;
