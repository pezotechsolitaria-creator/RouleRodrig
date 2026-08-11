-- M44 — The organiser dashboard's read model.
--
-- Two functions, both gated by can_manage_event() from M43. No new tables: the
-- dashboard is a VIEW of data that already exists, and inventing a stats table
-- would create a second source of truth that drifts the moment an order is
-- cancelled.
--
-- ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
-- The organiser wants: "500 tickets, 327 reserved, 280 confirmed, 173 left."
-- None of those are stored. All are derived, which is what keeps them true:
--
--   remaining  = product_variants.stock_quantity        (the authoritative count,
--                                                        row-locked at checkout)
--   awaiting   = units on orders in pending_payment / awaiting_payment_confirmation
--   confirmed  = units on orders in paid / preparing / ready_for_pickup / collected
--   capacity   = remaining + awaiting + confirmed
--   redeemed   = tickets in state 'used'
--
-- CAPACITY IS DERIVED, NOT STORED, and that is deliberate. stock_quantity is
-- decremented when an order is placed and RESTORED when it is cancelled or
-- expires (the inventory_movements ledger), so remaining+held reconstructs the
-- original capacity exactly — and it self-corrects. A stored capacity column
-- would be a number somebody has to remember to update, and the first time an
-- organiser edited it the dashboard would start lying.
--
-- ── WHY cancelled/refunded ARE EXCLUDED ─────────────────────────────────────
-- Those orders already returned their stock. Counting them would double-count:
-- once in `remaining` and again in `awaiting`.

create or replace function public.organizer_my_events()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  -- No parameter, so there is nothing to tamper with: the list IS the caller's
  -- assignments. A platform admin sees everything, which is the M43 rule.
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.starts_at)
    from (
      select
        s.id            as store_id,
        s.slug,
        s.name,
        e.starts_at,
        e.ends_at,
        e.venue_name,
        e.cancelled_at,
        event_phase(s.id)                                   as phase,
        s.status::text                                      as store_status,
        coalesce(inv.remaining, 0)                          as remaining,
        coalesce(units.awaiting, 0)                         as awaiting,
        coalesce(units.confirmed, 0)                        as confirmed,
        coalesce(inv.remaining, 0) + coalesce(units.awaiting, 0)
          + coalesce(units.confirmed, 0)                    as capacity,
        coalesce(tk.issued, 0)                              as issued,
        coalesce(tk.redeemed, 0)                            as redeemed,
        coalesce(money.gross, 0)                            as gross_confirmed,
        a.can_verify_payments
      from event_organizer_assignments a
      join stores s on s.id = a.store_id
      join events e on e.store_id = s.id
      join event_organizers o on o.id = a.organizer_id
      -- Remaining capacity across every ticket type of this event.
      left join lateral (
        select sum(v.stock_quantity)::int as remaining
        from product_variants v
        join products p on p.id = v.product_id
        join ticket_types tt on tt.variant_id = v.id
        where p.store_id = s.id and v.is_active
      ) inv on true
      -- Units held, split by whether the money has landed.
      left join lateral (
        select
          sum(oi.quantity) filter (
            where ord.status in ('pending_payment','awaiting_payment_confirmation'))::int as awaiting,
          sum(oi.quantity) filter (
            where ord.status in ('paid','preparing','ready_for_pickup','collected'))::int as confirmed
        from orders ord
        join order_items oi on oi.order_id = ord.id
        join ticket_types tt on tt.variant_id = oi.variant_id
        where ord.store_id = s.id
      ) units on true
      left join lateral (
        select count(*)::int as issued,
               count(*) filter (where t.state = 'used')::int as redeemed
        from tickets t where t.store_id = s.id and t.state <> 'void'
      ) tk on true
      -- Money the ORGANISER is owed/has taken. Roulé Rodrigues never holds it,
      -- so this is informational for the organiser, not a platform balance.
      left join lateral (
        select sum(oi.line_total)::int as gross
        from orders ord
        join order_items oi on oi.order_id = ord.id
        join ticket_types tt on tt.variant_id = oi.variant_id
        where ord.store_id = s.id
          and ord.status in ('paid','preparing','ready_for_pickup','collected')
      ) money on true
      where o.user_id = auth.uid() and o.status = 'active'
    ) x), '[]'::jsonb);
end;
$function$;

revoke all on function public.organizer_my_events() from public, anon;
grant execute on function public.organizer_my_events() to authenticated, service_role;

comment on function public.organizer_my_events() is
  'The organiser dashboard home. Takes NO parameter — the list is the caller''s own assignments, so there is nothing to tamper with. Every number is derived from authoritative inventory and order state rather than stored, so it cannot drift (M44).';

-- ── One event, in depth ─────────────────────────────────────────────────────
create or replace function public.organizer_event_detail(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_out jsonb;
begin
  -- THE gate. M43's predicate, which takes no organiser id and reads status
  -- live — so a suspended or unassigned organiser is refused here even if they
  -- kept the URL.
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select jsonb_build_object(
    'storeId', s.id,
    'slug', s.slug,
    'name', s.name,
    'phase', event_phase(s.id),
    'startsAt', e.starts_at,
    'endsAt', e.ends_at,
    'venueName', e.venue_name,
    'venueAddress', e.venue_address,
    'timezone', e.timezone,
    'cancelledAt', e.cancelled_at,
    'canVerifyPayments', can_verify_event_payments(s.id),

    -- Per ticket type: the organiser's real operating view.
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', v.id,
        'name', v.name,
        'price', v.price,
        'remaining', v.stock_quantity,
        'isActive', v.is_active,
        'salesOpen', ticket_sales_open(v.id),
        'salesStart', tt.sales_start,
        'salesEnd', tt.sales_end,
        'minPerOrder', tt.min_per_order,
        'maxPerOrder', tt.max_per_order,
        'sold', coalesce((
          select sum(oi.quantity)::int from orders o2
          join order_items oi on oi.order_id = o2.id
          where oi.variant_id = v.id
            and o2.status in ('paid','preparing','ready_for_pickup','collected')), 0),
        'awaiting', coalesce((
          select sum(oi.quantity)::int from orders o2
          join order_items oi on oi.order_id = o2.id
          where oi.variant_id = v.id
            and o2.status in ('pending_payment','awaiting_payment_confirmation')), 0))
        order by tt.display_order, v.name)
      from product_variants v
      join products p on p.id = v.product_id
      join ticket_types tt on tt.variant_id = v.id
      where p.store_id = s.id), '[]'::jsonb),

    -- Recent reservations. Capped: an organiser scanning a list needs the last
    -- page, not the whole history, and an unbounded read is how a dashboard
    -- becomes the slowest page on the site.
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderNumber', o2.order_number,
        'status', o2.status,
        'customerName', o2.customer_name,
        'customerPhone', o2.customer_phone,
        'total', o2.total,
        'placedAt', o2.placed_at,
        'autoReleaseAt', o2.auto_release_at,
        'units', (select sum(oi.quantity)::int from order_items oi where oi.order_id = o2.id))
        order by o2.placed_at desc)
      from (
        select o3.* from orders o3
        where o3.store_id = s.id
        order by o3.placed_at desc nulls last
        limit 50) o2), '[]'::jsonb)
  ) into v_out
  from stores s join events e on e.store_id = s.id
  where s.id = p_store_id;

  return v_out;
end;
$function$;

revoke all on function public.organizer_event_detail(uuid) from public, anon;
grant execute on function public.organizer_event_detail(uuid) to authenticated, service_role;

comment on function public.organizer_event_detail(uuid) is
  'One event in depth for its organiser: packages with sold/awaiting counts, and the last 50 reservations. Gated by can_manage_event(), so a suspended or unassigned organiser holding the URL is refused (M44).';

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon','public.organizer_my_events()','EXECUTE')
     or has_function_privilege('anon','public.organizer_event_detail(uuid)','EXECUTE') then
    raise exception 'M44: anon can read organiser dashboards'; end if;

  -- The detail function must refuse an unknown event rather than leak a shape.
  begin
    perform organizer_event_detail('00000000-0000-0000-0000-000000000000');
    raise exception 'M44: organizer_event_detail did not refuse an unknown event';
  exception when sqlstate 'RR003' then null;
  end;

  -- M43's predicate must still be the gate.
  if position('can_manage_event' in
      (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='organizer_event_detail')) = 0 then
    raise exception 'M44: the detail function is not gated by can_manage_event'; end if;

  -- Checkout untouched.
  if position('for update of v' in
      (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='create_order')) = 0 then
    raise exception 'M44: the stock row lock vanished from create_order'; end if;
end;
$$;
