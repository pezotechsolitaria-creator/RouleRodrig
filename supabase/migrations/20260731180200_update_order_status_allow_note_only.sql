-- ============================================================================
-- 0011 — update_order_status(): allow a note-only call (no status change)
-- ----------------------------------------------------------------------------
-- Found on review before ever calling it live: the API route lets a merchant
-- add an internal note without changing status by passing the order's
-- CURRENT status as the "target" — but the legality check only allowed the
-- explicit forward transitions (paid->preparing, etc.), so a same-status
-- call would have been rejected as illegal. A same-status call is now always
-- legal — it changes nothing about the order's lifecycle, only (optionally)
-- appends a note.
-- ============================================================================

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
  from orders where orders.id = p_order_id;

  if v_store_id is null or not is_store_staff(v_store_id) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  v_legal := (
    p_new_status = v_current_status::text or  -- note-only: no status change
    (v_current_status = 'paid' and p_new_status in ('preparing', 'cancelled')) or
    (v_current_status = 'preparing' and p_new_status in ('ready_for_pickup', 'cancelled')) or
    (v_current_status = 'ready_for_pickup' and p_new_status in ('collected', 'cancelled'))
  );
  if not v_legal then
    raise exception using errcode = 'RR004',
      message = format('Cannot move an order from "%s" to "%s".', v_current_status, p_new_status);
  end if;

  update orders
     set status = p_new_status::order_status,
         internal_notes = case
           when p_internal_note is not null and trim(p_internal_note) <> ''
             then coalesce(internal_notes || E'\n\n', '') || '[' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || trim(p_internal_note)
           else internal_notes
         end
   where id = p_order_id;

  -- Only notify the customer when the status actually changed — a note-only
  -- edit is an internal, merchant-side detail with nothing for them to see.
  if v_customer_id is not null and p_new_status <> v_current_status::text then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values (
      'customer', v_customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order_number, '') || ' updated',
      'Your order is now: ' || p_new_status,
      jsonb_build_object('previous_status', v_current_status, 'new_status', p_new_status)
    );
  end if;

  return query select p_order_id, p_new_status;
end;
$$;

revoke execute on function update_order_status(uuid, text, text) from public;
revoke execute on function update_order_status(uuid, text, text) from anon;
grant execute on function update_order_status(uuid, text, text) to authenticated;
