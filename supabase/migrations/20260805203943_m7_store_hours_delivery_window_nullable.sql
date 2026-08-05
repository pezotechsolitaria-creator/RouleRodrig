-- Correction to m7_store_hours_schedule_schema, found by attacking the
-- constraint rather than trusting it.
--
-- The original delivery CHECK rejected the most ordinary row there is:
--   "open 07:00-19:00", delivery columns left NULL
-- because it demanded that every open day either set delivery_closed = true or
-- spell out an explicit delivery window. A merchant simply entering their shop
-- hours would have hit a raw 23514 with no idea why.
--
-- The right model: a NULL delivery window means "delivery follows the shop's
-- own hours" — if you are open and you take part in RR delivery, you deliver
-- while you are open. Narrowing the window is the exception, not the norm, and
-- "open but not delivering today" is expressed by delivery_closed = true.
-- Effective window is therefore
--   coalesce(delivery_opens_at, opens_at) .. coalesce(delivery_closes_at, closes_at)
-- and every reader must use that coalesce, never the raw columns.
alter table store_hours drop constraint if exists store_hours_delivery_window;

alter table store_hours add constraint store_hours_delivery_window
  check (
    is_closed
    or delivery_closed
    -- Unset = inherit the shop's hours.
    or (delivery_opens_at is null and delivery_closes_at is null)
    -- Set = must be a real window, and must sit inside the shop's hours.
    or (
      delivery_opens_at is not null
      and delivery_closes_at is not null
      and delivery_closes_at >  delivery_opens_at
      and delivery_opens_at  >= opens_at
      and delivery_closes_at <= closes_at
    )
  );

comment on column store_hours.delivery_opens_at is
  'NULL means delivery follows the shop opening time. Readers must coalesce to opens_at.';

comment on column store_hours.delivery_closes_at is
  'NULL means delivery follows the shop closing time. Readers must coalesce to closes_at.';
