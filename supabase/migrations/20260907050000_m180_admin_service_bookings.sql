-- ── The owner's view of every diary ────────────────────────────────────────
--
-- The owner has asked three times now for admin to see what a console sees —
-- the driver's 30-day log, the vehicle custody trail, clearing a delivery. A
-- booking system the platform owner cannot look at is the same gap again: when
-- a customer rings to say a car wash never turned up, there is nowhere to check.
--
-- ── GROUPED BY BUSINESS, NOT BY DAY ────────────────────────────────────────
-- The provider's own diary is grouped by day, because their question is "what
-- does Thursday look like". The owner's question is different — "is anybody
-- using this, and is anybody in trouble" — and that is asked one business at a
-- time.
create or replace function public.admin_service_bookings(
  p_days integer default 14
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_zone constant text := 'Indian/Mauritius';
  v_days int := greatest(1, least(coalesce(p_days, 14), 90));
  v_out jsonb;
begin
  -- The same shape as admin_clear_delivery: a null uid is the admin cookie
  -- session arriving through the service role, which /api/admin/bookings has
  -- already authenticated. A signed-in user must actually be an admin.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select jsonb_build_object(
    'days', v_days,
    'businesses', coalesce(jsonb_agg(b.obj order by b.upcoming desc, b.name), '[]'::jsonb)
  ) into v_out
  from (
    select s.name,
           coalesce((select count(*) from service_bookings sb
                      where sb.store_id = s.id and sb.status = 'booked'
                        and sb.starts_at >= now()), 0) as upcoming,
           jsonb_build_object(
             'storeId', s.id,
             'name', s.name,
             'slug', s.slug,
             'trade', tp.trade,
             'mobile', tp.mobile,
             'online', tp.takes_online_bookings,
             'published', store_is_visible(s.id),
             -- How many services they have actually given a length to. Zero
             -- means nothing on their page can be booked at all, which looks
             -- identical to "no demand" until somebody checks.
             'bookableServices', (select count(*) from service_durations sd
                                    join product_variants pv on pv.id = sd.variant_id
                                    join products p on p.id = pv.product_id
                                   where p.store_id = s.id and pv.is_active
                                     and p.status = 'active'),
             'upcoming', (select count(*) from service_bookings sb
                           where sb.store_id = s.id and sb.status = 'booked'
                             and sb.starts_at >= now()),
             'noShows', (select count(*) from service_bookings sb
                          where sb.store_id = s.id and sb.status = 'no_show'
                            and sb.starts_at >= now() - (v_days || ' days')::interval),
             'cancelled', (select count(*) from service_bookings sb
                            where sb.store_id = s.id and sb.status = 'cancelled'
                              and sb.starts_at >= now() - (v_days || ' days')::interval),
             'fromCustomers', (select count(*) from service_bookings sb
                                where sb.store_id = s.id and sb.source = 'customer'
                                  and sb.starts_at >= now() - (v_days || ' days')::interval),
             'bookings', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', sb.id,
                        'service', sb.service_name,
                        'startsAt', sb.starts_at,
                        'endsAt', sb.ends_at,
                        'status', sb.status,
                        'customerName', sb.customer_name,
                        'customerPhone', sb.customer_phone,
                        'note', sb.note,
                        'source', sb.source
                      ) order by sb.starts_at)
                 from service_bookings sb
                where sb.store_id = s.id
                  and sb.starts_at >= now() - (v_days || ' days')::interval
             ), '[]'::jsonb)
           ) as obj
      from trade_providers tp
      join stores s on s.id = tp.store_id
  ) b;

  return v_out;
end $function$;

revoke all on function public.admin_service_bookings(integer) from public, anon, authenticated;

-- ── And the one lever ──────────────────────────────────────────────────────
-- The owner can settle a dispute by marking what actually happened. Same
-- function the provider uses, so the two screens cannot record it differently;
-- the only change is that the admin cookie session can reach it.
create or replace function public.set_service_booking_status(
  p_booking_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_b service_bookings%rowtype;
begin
  select * into v_b from service_bookings where id = p_booking_id;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  -- A null uid is the admin cookie session through the service role, already
  -- authenticated by the route. Anyone signed in must be staff or an admin.
  if auth.uid() is not null
     and not (is_store_staff(v_b.store_id) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if coalesce(p_status, '') not in ('booked', 'done', 'cancelled', 'no_show') then
    raise exception 'Unknown status.' using errcode = 'P0001';
  end if;

  update service_bookings
     set status = p_status, updated_at = now()
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'status', p_status);
end $function$;

revoke all on function public.set_service_booking_status(uuid, text) from public, anon;
grant execute on function public.set_service_booking_status(uuid, text) to authenticated;
