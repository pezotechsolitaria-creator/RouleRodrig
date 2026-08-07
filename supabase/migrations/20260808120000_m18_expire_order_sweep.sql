-- M18 — expire_order(): make the reservation deadline real.
--
-- THE PROBLEM
-- Both parties are shown a hard deadline. The customer reads "your items are
-- reserved until <date>" and the merchant "confirm within X or this reservation
-- is released and the stock returns to your shelf" (lib/orders/hold.ts).
-- Nothing enforced it.
--
-- The only sweep lived INSIDE create_order(), scoped to `oi.variant_id =
-- any(v_variant_ids)` — i.e. it released a lapsed order only when some OTHER
-- customer happened to be buying one of the same variants at that moment. M13's
-- own header admits the limitation. So:
--
--   * a lapsed reservation on an item nobody else buys held its stock forever;
--   * the merchant's shelf silently shrank with no way to see why;
--   * the deadline shown to both parties was a promise the system could not keep;
--   * and expiry was the one lifecycle event that reached the customer through
--     no channel at all — the in-app notification row it writes has no
--     customer-side reader.
--
-- THE FIX
-- Extract the same restock-and-cancel block into a callable function so the
-- daily cron can sweep every due order, not just the coincidentally-touched
-- ones. create_order() is deliberately NOT modified: its opportunistic sweep
-- stays as a fast path, and this is the guaranteed one. The two are idempotent
-- with respect to each other because both require status='pending_payment',
-- which the first to run clears.
--
-- WHY accepted_at IS RESPECTED
-- M14 made acceptance clear the fuse (auto_release_at = null), so an accepted
-- order is already immune. The extra `accepted_at is null` predicate is belt
-- and braces: a merchant who committed must never have their order swept out
-- from under them by a clock.

create or replace function public.expire_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired boolean := false;
begin
  -- Re-verify the order is genuinely due INSIDE the transaction rather than
  -- trusting the caller's list, which was read moments earlier. A merchant may
  -- have accepted, or the customer may have submitted a receipt, in between.
  perform 1
  from orders o
  where o.id = p_order_id
    and o.status = 'pending_payment'
    and o.accepted_at is null
    and o.auto_release_at is not null
    and o.auto_release_at < now()
  for update;

  if not found then
    return false;
  end if;

  -- Return the reserved units to the shelf. Same ledger reason and shape as the
  -- in-line sweep, so inventory history reads identically whichever path ran.
  insert into inventory_movements (variant_id, delta, reason, order_id, note)
  select oi.variant_id, oi.quantity, 'restock', p_order_id, 'auto-released: reservation expired'
  from order_items oi
  where oi.order_id = p_order_id;

  update orders set status = 'cancelled' where id = p_order_id;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'customer', o.customer_id, o.id, 'order_status_changed',
         'Order '||o.order_number||' expired',
         'The reservation window passed before the shop confirmed it, so the items were released. You have not been charged.',
         jsonb_build_object('new_status','cancelled')
  from orders o
  where o.id = p_order_id and o.customer_id is not null;

  -- The merchant is told too: a shelf that silently refills is its own mystery.
  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, o.id, 'order_status_changed',
         'Order '||o.order_number||' expired',
         'It was not confirmed in time, so the stock has been returned to your shelf.',
         jsonb_build_object('new_status','cancelled')
  from orders o
  join stores s on s.id = o.store_id
  join merchant_staff ms on ms.merchant_id = s.merchant_id
  where o.id = p_order_id;

  return true;
end;
$$;

-- Service role only: this is a scheduled maintenance action, never something a
-- customer or merchant session may invoke on an arbitrary order id.
revoke all on function public.expire_order(uuid) from public, anon, authenticated;
grant execute on function public.expire_order(uuid) to service_role;

comment on function public.expire_order(uuid) is
  'Cancels ONE lapsed pending_payment order and restocks its items, notifying both parties. Re-verifies the due condition under a row lock, so it is safe to call on a stale list and idempotent against create_order''s opportunistic sweep (M18).';

-- The sweep reads exactly this predicate once a day; without an index it is a
-- full scan of orders that grows forever. Partial, so it stays tiny.
create index if not exists orders_pending_release_idx
  on orders (auto_release_at)
  where status = 'pending_payment' and accepted_at is null and auto_release_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_order'
  ) then
    raise exception 'M18: expire_order was not created';
  end if;
  -- M14's acceptance predicate must still be in create_order — this migration
  -- must not have disturbed it.
  if position('o.accepted_at is null' in
       (select pg_get_functiondef(p.oid) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'create_order')) = 0 then
    raise exception 'M18: M14 sweep predicate missing from create_order';
  end if;
end;
$$;
