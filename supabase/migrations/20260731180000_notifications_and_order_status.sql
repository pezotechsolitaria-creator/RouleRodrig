-- ============================================================================
-- 0009 — Milestone 4: notifications table + order status management
-- ----------------------------------------------------------------------------
-- Fully additive. No place_order()/checkout flow is added here — orders has
-- no INSERT policy anywhere in this schema (confirmed by auditing
-- pg_policies before writing this), and building one is a separate,
-- architecturally significant milestone (atomic stock reservation under
-- concurrency, payment capture). This migration only adds what's needed to
-- MANAGE orders that already exist: status transitions and notifications.
--
--  A. orders.internal_notes — merchant-only notes, deliberately a SEPARATE
--     column from the existing `notes` (customer-facing special instructions
--     at checkout, matching the pattern in bookings.message /
--     place_bookings.message). RLS is row-level, not column-level — a
--     customer who can SELECT their own order sees every column unless the
--     application layer explicitly excludes one. Every customer-facing API
--     route in this milestone must never select internal_notes.
--
--  B. notifications — in-app notification center (merchant bell, future
--     customer notifications). recipient_id is intentionally just
--     auth.users(id): this schema has no separate "customer" vs "merchant"
--     user type, so a notification's audience is determined by which id it's
--     addressed to, not a role check.
--
--  C. update_order_status() — the only way a merchant status-changes an
--     order. Validates the transition against an explicit state machine
--     (paid->preparing/cancelled, preparing->ready_for_pickup/cancelled,
--     ready_for_pickup->collected/cancelled) rather than allowing any status
--     to jump to any other. pending_payment and refunded are deliberately
--     NOT reachable from here — pending_payment is payment-flow-set (doesn't
--     exist yet), refunded belongs to a future payment-capture flow, not a
--     plain status button.
-- ============================================================================

alter table orders add column if not exists internal_notes text;

create type notification_recipient as enum ('merchant', 'customer');

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_type notification_recipient not null,
  recipient_id  uuid not null references auth.users(id) on delete cascade,
  order_id      uuid references orders(id) on delete cascade,
  type          text not null,          -- 'order_status_changed' | 'order_created' | ...
  title         text not null,
  body          text,
  data          jsonb not null default '{}',
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_recipient_recent_idx on notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on notifications (recipient_id) where read_at is null;

alter table notifications enable row level security;

-- A user reads/marks-read only their own notifications. No client INSERT
-- policy — notifications are written by SECURITY DEFINER RPCs (like
-- update_order_status below) or the service role, matching the same
-- server-controlled-write pattern already used for payments/inventory sales.
create policy notifications_read_own on notifications for select
  using (recipient_id = auth.uid());
create policy notifications_mark_read_own on notifications for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

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

  select store_id, status, customer_id, order_number
    into v_store_id, v_current_status, v_customer_id, v_order_number
  from orders where id = p_order_id;

  -- Not found and "found but not yours" get the identical error — never
  -- confirm to a caller that an order id exists in someone else's store.
  if v_store_id is null or not is_store_staff(v_store_id) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  v_legal := (
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

  if v_customer_id is not null then
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
