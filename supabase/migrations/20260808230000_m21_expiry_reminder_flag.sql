-- M21b — one pre-expiry payment reminder per order.
--
-- Every lifecycle message this product sends is an ANNOUNCEMENT of something
-- that already happened: accepted, payment confirmed, expired. The one message
-- that could change the outcome — "your reservation ends tomorrow and the money
-- hasn't arrived" — did not exist, so the first the customer heard of the
-- deadline was the cancellation.
--
-- This is also the answer to "should guest orders expire faster?". They should
-- not. An unpaid order is far more often a forgotten one than an abusive one,
-- and a reminder recovers the sale where a shorter clock only loses it faster.
-- The abuse case is handled where it belongs — marketplace_settings
-- .max_open_reservations (M21), which caps how much stock any one buyer can sit
-- on regardless of whether they have an account.
--
-- A flag column rather than a derived condition, for the same reason
-- bookings.reminded is a column: the daily cron must be able to prove it has
-- not already sent this, whatever it re-reads or retries.
alter table orders add column if not exists expiry_reminded_at timestamptz;

comment on column orders.expiry_reminded_at is
  'When the single pre-expiry payment reminder was sent for this order. NULL = not yet reminded. Set by the daily cron, never by a customer or merchant session (M21).';

-- Deliberately NOT granted to authenticated. M8 revoked the table-level SELECT
-- on orders and re-grants per column; leaving this one ungranted keeps it
-- invisible to the client, which is correct — it is operational bookkeeping,
-- not order state the customer needs.

-- The sweep's sibling query: due soon, still unpaid, not yet nudged. Partial so
-- it stays proportional to the work outstanding rather than to order history.
create index if not exists orders_expiry_reminder_idx
  on orders (auto_release_at)
  where status = 'pending_payment' and accepted_at is null and expiry_reminded_at is null;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='orders' and column_name='expiry_reminded_at') then
    raise exception 'M21b: orders.expiry_reminded_at missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname='orders_expiry_reminder_idx') then
    raise exception 'M21b: orders_expiry_reminder_idx missing';
  end if;
end;
$$;
