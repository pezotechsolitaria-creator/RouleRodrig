-- M58 — the room has a size, and it is not the sum of the tiers.
--
-- Until now the only ceiling was per-package: General Admission 400, VIP 200.
-- Nothing stopped those summing to 600 in a hall that holds 450. Per-package
-- limits answer "how many of THIS tier", and no combination of them answers
-- "how many people fit", because the organiser sets them independently — that
-- is the whole point of having tiers.
--
-- This is an organiser-mistake guard rather than a fraud guard, which is why it
-- refuses cleanly at checkout instead of hiding tickets: the honest failure is
-- "the event is full", and the person who needs to know is the buyer trying to
-- pay right now.
--
-- ── WHERE THE CHECK LIVES, AND WHY NOT IN create_order() ────────────────────
-- create_order() is the marketplace's, shared with every shop, and it has been
-- surgically patched enough times (M6 → M24, plus M49c) that another splice is
-- the more expensive option. A trigger on order_items reaches every path that
-- can allocate a ticket — including a future box-office or comp flow that does
-- not go through create_order at all — which is the property that actually
-- matters for a capacity rule.
--
-- ── RACE SAFETY ─────────────────────────────────────────────────────────────
-- Counting without a lock is the classic oversell: two transactions each see
-- 449 of 450 and each admit one. pg_advisory_xact_lock serialises per EVENT, so
-- the second waits for the first to commit and then — READ COMMITTED taking a
-- fresh snapshot per statement — counts it. The lock is event-scoped, so two
-- different events never block each other and marketplace orders never take it.

alter table events add column if not exists capacity int;

alter table events drop constraint if exists events_capacity_positive;
alter table events add constraint events_capacity_positive
  check (capacity is null or capacity > 0);

comment on column events.capacity is
  'Total people the venue holds, across every ticket type. NULL = no overall limit (per-package stock is then the only ceiling). Enforced by enforce_event_capacity() on order_items.';

create or replace function public.enforce_event_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_store    uuid;
  v_capacity int;
  v_taken    int;
begin
  select o.store_id into v_store from orders o where o.id = new.order_id;
  if v_store is null then return new; end if;

  -- Fast exit for every non-event order, which is almost all of them.
  select e.capacity into v_capacity from events e where e.store_id = v_store;
  if v_capacity is null then return new; end if;

  -- Serialise per event. Must be taken BEFORE the count, or two checkouts each
  -- read a stale total and both fit.
  perform pg_advisory_xact_lock(hashtext('event_capacity:' || v_store::text));

  select coalesce(sum(oi.quantity), 0)::int into v_taken
    from order_items oi
    join orders o on o.id = oi.order_id
   where o.store_id = v_store
     and o.status not in ('cancelled', 'refunded');

  if v_taken > v_capacity then
    raise exception using errcode = 'RR017',
      message = format('This event is full — only %s of %s places are left.',
                       greatest(0, v_capacity - (v_taken - new.quantity)), v_capacity);
  end if;

  return new;
end;
$function$;

-- AFTER INSERT, so `v_taken` already includes this row: the question is whether
-- the event is over capacity WITH this order, not whether it was before.
drop trigger if exists order_items_event_capacity on order_items;
create trigger order_items_event_capacity
  after insert on order_items
  for each row execute function enforce_event_capacity();

revoke all on function public.enforce_event_capacity() from public, anon, authenticated;

do $$
declare
  v_store uuid; v_variant uuid; v_oid uuid; v_err text;
  v_prev_test boolean; v_prev_status store_status; v_prev_cap int; v_already int;
begin
  select s.id, s.is_test, s.status into v_store, v_prev_test, v_prev_status
    from stores s where s.slug = 'summer-fest-rodrigues';
  if v_store is null then
    raise notice 'M58: no fixture event, skipping the functional probe.'; return; end if;
  select capacity into v_prev_cap from events where store_id = v_store;

  select v.id into v_variant from product_variants v
    join products p on p.id = v.product_id where p.store_id = v_store limit 1;

  -- The fixture already carries allocation from earlier milestones, so the
  -- probe is written RELATIVE to it rather than assuming an empty event —
  -- assuming a clean slate is what made the first attempt at this fail.
  select coalesce(sum(oi.quantity), 0)::int into v_already
    from order_items oi join orders o on o.id = oi.order_id
   where o.store_id = v_store and o.status not in ('cancelled','refunded');

  update stores set is_test = false, status = 'active' where id = v_store;
  update events set capacity = v_already + 2 where store_id = v_store;

  insert into orders (store_id, order_number, status, customer_name, customer_phone,
                      customer_email, subtotal, tax, delivery_fee, total, currency,
                      fulfillment_method, placed_at, is_test)
  values (v_store, 'RRCAP-TEST01', 'pending_payment', 'Cap Probe', '+23057000000',
          'cap@example.test', 0, 0, 0, 0, 'MUR', 'pickup', now(), true)
  returning id into v_oid;

  -- Exactly filling the room must succeed.
  insert into order_items (order_id, variant_id, product_name, variant_name,
                           unit_price, quantity, line_total)
  values (v_oid, v_variant, 'Summer Fest', 'GA', 0, 2, 0);

  -- One more must be refused.
  begin
    insert into order_items (order_id, variant_id, product_name, variant_name,
                             unit_price, quantity, line_total)
    values (v_oid, v_variant, 'Summer Fest', 'GA', 0, 1, 0);
    v_err := 'ACCEPTED (WRONG)';
  exception when others then
    v_err := SQLERRM;
  end;

  delete from order_items where order_id = v_oid;
  delete from orders where id = v_oid;
  update events set capacity = v_prev_cap where store_id = v_store;
  update stores set is_test = v_prev_test, status = v_prev_status where id = v_store;

  if v_err = 'ACCEPTED (WRONG)' then
    raise exception 'M58: capacity was not enforced — the room was oversold.';
  end if;
  raise notice 'M58 ok: filling the room succeeded, one more refused with: %', v_err;

  if exists (select 1 from stores where id = v_store and not is_test) then
    raise exception 'M58: fixture left visible.'; end if;
end;
$$;
