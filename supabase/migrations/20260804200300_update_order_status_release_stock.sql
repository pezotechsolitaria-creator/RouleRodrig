-- M5 extension of the M4 update_order_status() RPC: now that every order
-- reserves real stock at creation time (create_order() above), a merchant
-- cancelling an order must give that stock back — otherwise it's lost
-- forever, silently, exactly the kind of gap M5's "inventory reservations
-- are handled correctly" requirement is about. (Refunds aren't reachable
-- through this RPC — there's no transition into 'refunded' below — so
-- they're out of scope here; a refund flow would need its own release path
-- when it's built.) Also widens the legal transition table so a cash/manual
-- order (no online capture step) can be confirmed paid or rejected by the
-- merchant straight from "pending_payment" — previously only reachable
-- from "paid" onward.
create or replace function update_order_status(
  p_order_id      uuid,
  p_new_status    text,
  p_internal_note text default null
) returns table (order_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_owner          uuid := auth.uid();
  v_store_id       uuid;
  v_current_status order_status;
  v_customer_id    uuid;
  v_order_number   text;
  v_legal          boolean;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  select orders.store_id, orders.status, orders.customer_id, orders.order_number
    into v_store_id, v_current_status, v_customer_id, v_order_number
  from orders where orders.id = p_order_id
  for update;

  if v_store_id is null or not is_store_staff(v_store_id) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  v_legal := (
    p_new_status = v_current_status::text or
    (v_current_status = 'pending_payment' and p_new_status in ('paid', 'cancelled')) or
    (v_current_status = 'paid' and p_new_status in ('preparing', 'cancelled')) or
    (v_current_status = 'preparing' and p_new_status in ('ready_for_pickup', 'cancelled')) or
    (v_current_status = 'ready_for_pickup' and p_new_status in ('collected', 'cancelled'))
  );
  if not v_legal then
    raise exception using errcode = 'RR004',
      message = format('Cannot move an order from "%s" to "%s".', v_current_status, p_new_status);
  end if;

  update orders set status = p_new_status::order_status,
    internal_notes = case when p_internal_note is not null and trim(p_internal_note) <> ''
      then coalesce(internal_notes || E'\n\n', '') || '[' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || trim(p_internal_note)
      else internal_notes end
  where id = p_order_id;

  -- Release reserved stock exactly once, the moment an order first becomes
  -- terminal-and-unfulfilled. v_current_status was already confirmed NOT
  -- cancelled/refunded by the legality check above (neither has a legal
  -- outbound transition), so this can never double-release the same order.
  if p_new_status = 'cancelled' and v_current_status not in ('cancelled', 'refunded') then
    insert into inventory_movements (variant_id, delta, reason, order_id, note)
    select variant_id, quantity, 'restock', p_order_id, 'released: order cancelled by merchant'
    from order_items where order_id = p_order_id;
  end if;

  if v_customer_id is not null and p_new_status <> v_current_status::text then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values ('customer', v_customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order_number, '') || ' updated',
      'Your order is now: ' || p_new_status,
      jsonb_build_object('previous_status', v_current_status, 'new_status', p_new_status));
  end if;

  return query select p_order_id, p_new_status;
end;
$$;
