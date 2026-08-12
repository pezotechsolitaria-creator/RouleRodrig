-- M70 — The admin shop list hid 6 of the 10 shops.
--
-- Counted, not guessed: 10 rows in `stores`, 4 returned by
-- admin_store_schedules(). The missing six were every KITCHEN (Ti Kitchen,
-- Chez Banane, Ninja) and every EVENT store (Summer Fest, Tomorrow Land,
-- Meunier Rohan) — precisely the ones the owner needed to edit. It also meant
-- a closed kitchen could not be reopened: admin_set_store_hours() worked fine,
-- but the shop was not on the screen to click.
--
-- Two lines did it:
--
--   join merchants m on m.id = s.merchant_id   -- INNER: no merchant => gone
--   where m.system_key is null                 -- excludes platform-owned
--
-- The `system_key is null` filter came from M40 and is right for its original
-- audience: platform-owned merchants (Events, the food platform) are not real
-- businesses paying a subscription, so they do not belong in a subscriptions
-- view. But this same function backs /admin/stores, where the owner manages
-- EVERY shop. One function was serving two questions and answering the second
-- one wrongly.
--
-- Fixed by REPORTING rather than hiding: the join is now LEFT, the filter is
-- gone, and `platform_owned` / `is_kitchen` flags let a caller exclude what it
-- does not want. Hiding a row from an admin screen should be the caller's
-- decision, never a surprise buried in a join.
drop function if exists public.admin_store_schedules();

create function public.admin_store_schedules()
returns table (
  store_id uuid, store_name text, slug text, store_status text,
  merchant_id uuid, merchant_name text, merchant_status text,
  platform_owned boolean, is_kitchen boolean,
  offers_rr_delivery boolean, offers_pickup boolean, offers_customer_delivery boolean,
  accepts_cash boolean, accepts_bank_transfer boolean, has_bank_details boolean,
  has_schedule boolean, is_open boolean, delivery_available boolean,
  opens_at time without time zone, closes_at time without time zone, is_closed boolean,
  delivery_opens_at time without time zone, delivery_closes_at time without time zone,
  delivery_closed boolean, weekday smallint, next_open_at timestamp with time zone,
  sub_plan text, sub_status text, sub_period_end timestamp with time zone,
  sub_grace_days integer, sub_started_at timestamp with time zone,
  sub_cancelled_at timestamp with time zone, selling boolean,
  last_paid_at timestamp with time zone, last_paid_amount integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.id, s.name, s.slug::text, s.status::text,
         m.id, m.display_name, m.status::text,
         -- New: lets a caller exclude platform merchants deliberately instead
         -- of this function deciding for everyone.
         (m.id is not null and m.system_key is not null),
         exists (select 1 from food_kitchens fk where fk.store_id = s.id),
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
         -- A store with no merchant has no subscription to be active.
         case when m.id is null then false else merchant_subscription_active(m.id) end,
         inv.paid_at, inv.amount
  from stores s
  -- LEFT: a kitchen or an event store may have no merchant of its own, and it
  -- still has to appear on the screen that manages shops.
  left join merchants m on m.id = s.merchant_id
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
$function$;

revoke execute on function public.admin_store_schedules() from public, anon, authenticated;

do $$
declare v_all int; v_seen int;
begin
  select count(*) into v_all from stores;
  select count(*) into v_seen from admin_store_schedules();
  if v_seen <> v_all then
    raise exception 'M70: admin still sees %/% shops — the join is still dropping rows.', v_seen, v_all;
  end if;
end;
$$;

-- Verified after applying: 10/10 shops returned, and admin_set_store_hours()
-- accepted a 24/7 schedule for Ti Kitchen (DEMO) with is_open flipping to true.
-- Editing was never broken; the kitchen simply was not on the screen to click.
