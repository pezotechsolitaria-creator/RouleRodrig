-- ── The kitchen can finally see past yesterday ─────────────────────────────
--
-- kitchen_dashboard() ends with
--
--     and coalesce(ord.placed_at, ord.created_at) > now() - interval '24 hours'
--
-- so the board can only ever see one day. That limit is RIGHT for the board —
-- it is a live service screen and a two-week-old ticket on it is noise a cook
-- has to look past mid-rush. It is also why a kitchen could never answer the
-- question it actually plans around: what should I prep on Friday.
--
-- Same shape as delivery_log_for: a window over rows that were always kept,
-- not a new store. Nothing is retained that was not already, so switching it on
-- cannot lose anything.
--
-- ── WHAT IT REFUSES TO CLAIM ───────────────────────────────────────────────
-- There is no completion timestamp on an order — `collected` is a status, not a
-- time — so TIME SPENT COOKING CANNOT BE COMPUTED and this does not pretend to.
-- What the table honestly knows is placed_at and accepted_at, which is how long
-- a customer waited for somebody to say yes. That is a real number about a real
-- failure, so that is the one reported.
--
-- Money counts COLLECTED orders only. On the live Ti Kitchen rows that is the
-- difference between Rs 5,330 and Rs 8,850 — one cancelled order would have
-- overstated the kitchen's earnings by two thirds. Test orders are excluded.
create or replace function public.kitchen_log(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids  uuid[];
  v_days int := greatest(1, least(coalesce(p_days, 30), 90));
  v_from timestamptz;
begin
  select array_agg(k) into v_ids from my_kitchen_ids() k;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception using errcode = 'RR081', message = 'You are not on a kitchen team.';
  end if;
  v_from := now() - (v_days || ' days')::interval;

  return (
    with o as (
      select ord.*, coalesce(ord.placed_at, ord.created_at) as at
        from orders ord
       where ord.store_id = any(v_ids)
         and not coalesce(ord.is_test, false)
         and coalesce(ord.placed_at, ord.created_at) >= v_from
    )
    select jsonb_build_object(
      'days', v_days,
      'totals', (
        select jsonb_build_object(
          'orders',    count(*),
          'collected', count(*) filter (where status = 'collected'),
          'cancelled', count(*) filter (where status in ('cancelled','refunded')),
          -- Collected only. See the note above: this is the number a cook would
          -- quote back at somebody, so it may never be the optimistic reading.
          'earned',    coalesce(sum(total) filter (where status = 'collected'), 0),
          -- How long a customer waited to hear yes. Median, because one order
          -- answered the next morning would drag a mean past meaning anything.
          'medianMinutesToAccept', (
            select floor(percentile_cont(0.5) within group (
                     order by extract(epoch from (accepted_at - at)) / 60))::int
              from o where accepted_at is not null and accepted_at >= at)
        ) from o
      ),
      -- ── The list a cook actually wants ───────────────────────────────────
      -- What sold, in what quantity. The one thing the 24-hour board can never
      -- show, and the whole reason to look back at all.
      'dishes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', d.product_name,
                 'variant', d.variant_name,
                 'qty', d.qty,
                 'earned', d.earned) order by d.qty desc, d.product_name)
          from (
            select oi.product_name,
                   nullif(btrim(coalesce(oi.variant_name, '')), '') as variant_name,
                   sum(oi.quantity)::int as qty,
                   sum(oi.line_total)::bigint as earned
              from order_items oi
              join o on o.id = oi.order_id
             where o.status = 'collected'
             group by 1, 2
          ) d
      ), '[]'::jsonb),
      -- One row per day, so a cook can see which days are worth opening for.
      'byDay', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'date', d.day, 'orders', d.orders, 'earned', d.earned)
                 order by d.day desc)
          from (
            select (at at time zone 'Indian/Mauritius')::date as day,
                   count(*) as orders,
                   coalesce(sum(total) filter (where status = 'collected'), 0) as earned
              from o group by 1
          ) d
      ), '[]'::jsonb)
    )
  );
end;
$function$;

revoke all on function public.kitchen_log(integer) from public, anon;
grant execute on function public.kitchen_log(integer) to authenticated;
