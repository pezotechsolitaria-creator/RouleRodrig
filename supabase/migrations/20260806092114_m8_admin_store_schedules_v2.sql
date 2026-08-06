-- The admin store list becomes a real control-centre read model: schedule,
-- fulfillment participation, payment methods, subscription state and last
-- payment, for every shop, in ONE round trip.
--
-- DROP then CREATE because a RETURNS TABLE signature cannot be widened by
-- CREATE OR REPLACE.
--
-- Reuse, not reimplementation:
--   store_schedule_status()          — the M7 scheduling engine, lateral-joined
--                                      per row so this stays one query
--   merchant_subscription_active()   — the SAME predicate create_order() gates
--                                      on, so "selling" here can never disagree
--                                      with what checkout actually does
-- Grace-window arithmetic is deliberately NOT recomputed here; asking the
-- canonical function is the whole point.
drop function if exists admin_store_schedules();

create function admin_store_schedules()
returns table (
  store_id uuid, store_name text, slug text, store_status text,
  merchant_id uuid, merchant_name text, merchant_status text,
  offers_rr_delivery boolean, offers_pickup boolean, offers_customer_delivery boolean,
  accepts_cash boolean, accepts_bank_transfer boolean,
  has_bank_details boolean,
  has_schedule boolean, is_open boolean, delivery_available boolean,
  opens_at time, closes_at time, is_closed boolean,
  delivery_opens_at time, delivery_closes_at time, delivery_closed boolean,
  weekday smallint, next_open_at timestamptz,
  sub_plan text, sub_status text, sub_period_end timestamptz, sub_grace_days integer,
  sub_started_at timestamptz, sub_cancelled_at timestamptz,
  selling boolean,
  last_paid_at timestamptz, last_paid_amount integer
)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.slug::text, s.status::text,
         m.id, m.display_name, m.status::text,
         coalesce(p.offers_rr_delivery, true),
         coalesce(p.offers_pickup, true),
         coalesce(p.offers_customer_delivery, true),
         coalesce(p.accepts_cash, true),
         coalesce(p.accepts_bank_transfer, false),
         (p.bank_name is not null and p.account_number is not null),
         st.has_schedule, st.is_open, st.delivery_available,
         st.opens_at, st.closes_at, st.is_closed,
         st.delivery_opens_at, st.delivery_closes_at, st.delivery_closed,
         st.weekday, st.next_open_at,
         ms.plan::text, ms.status::text, ms.current_period_end, ms.grace_days,
         ms.started_at, ms.cancelled_at,
         merchant_subscription_active(m.id),
         inv.paid_at, inv.amount
  from stores s
  join merchants m on m.id = s.merchant_id
  left join store_payment_settings p on p.store_id = s.id
  left join merchant_subscriptions ms on ms.merchant_id = m.id
  cross join lateral store_schedule_status(s.id) st
  left join lateral (
    select i.paid_at, i.amount
    from subscription_invoices i
    where i.merchant_id = m.id and i.status = 'paid'
    order by i.paid_at desc nulls last
    limit 1
  ) inv on true
  order by s.name;
$$;

revoke execute on function admin_store_schedules() from public, anon, authenticated;

grant  execute on function admin_store_schedules() to service_role;
