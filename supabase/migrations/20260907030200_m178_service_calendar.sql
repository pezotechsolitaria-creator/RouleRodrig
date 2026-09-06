-- ── The provider's diary ───────────────────────────────────────────────────
--
-- Grouped BY DAY, because that is how somebody running a car wash thinks: not
-- "here are 47 appointments" but "what does Thursday look like". Each day
-- carries whether they are open and how full it is, so a quiet day and a closed
-- day are never confused — the difference between "nobody booked" and "we shut"
-- is the difference between a marketing problem and no problem at all.
create or replace function public.service_calendar(
  p_store_id uuid,
  p_days integer default 14,
  p_from date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_zone constant text := 'Indian/Mauritius';
  v_days int := greatest(1, least(coalesce(p_days, 14), 60));
  v_from date := coalesce(p_from, (now() at time zone v_zone)::date);
  v_tp trade_providers%rowtype;
  v_out jsonb;
begin
  if not (is_store_staff(p_store_id) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_tp from trade_providers where store_id = p_store_id;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select jsonb_build_object(
    'from', v_from,
    'days', v_days,
    'concurrentJobs', v_tp.concurrent_jobs,
    'slotMinutes', v_tp.slot_minutes,
    'trade', v_tp.trade,
    'calendar', coalesce(jsonb_agg(d.day_obj order by d.the_date), '[]'::jsonb)
  ) into v_out
  from (
    select gs::date as the_date,
           jsonb_build_object(
             'date', gs::date,
             'isClosed', not coalesce(sch.has_schedule, false) or coalesce(sch.is_closed, true),
             'opensAt', sch.opens_at,
             'closesAt', sch.closes_at,
             'bookings', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', b.id,
                        'service', b.service_name,
                        'startsAt', b.starts_at,
                        'endsAt', b.ends_at,
                        'status', b.status,
                        'customerName', b.customer_name,
                        'customerPhone', b.customer_phone,
                        'note', b.note,
                        'source', b.source
                      ) order by b.starts_at)
                 from service_bookings b
                where b.store_id = p_store_id
                  and b.status <> 'cancelled'
                  and (b.starts_at at time zone v_zone)::date = gs::date
             ), '[]'::jsonb),
             -- Minutes actually committed that day. A count of appointments
             -- says nothing when one is a 20-minute wash and the next is a
             -- three-hour detail.
             'bookedMinutes', coalesce((
               select sum(extract(epoch from (b.ends_at - b.starts_at)) / 60)::int
                 from service_bookings b
                where b.store_id = p_store_id
                  and b.status = 'booked'
                  and (b.starts_at at time zone v_zone)::date = gs::date
             ), 0)
           ) as day_obj
      from generate_series(v_from, v_from + (v_days - 1), interval '1 day') gs
      left join lateral store_schedule_at(p_store_id, (gs::date + time '00:00')::timestamp) sch on true
  ) d;

  return v_out;
end $function$;

revoke all on function public.service_calendar(uuid, integer, date) from public, anon;
grant execute on function public.service_calendar(uuid, integer, date) to authenticated;

-- ── Changing one ───────────────────────────────────────────────────────────
-- Done, cancelled or a no-show. Not a delete: the diary is also the record of
-- what happened, and a cancelled Saturday that vanishes takes with it the
-- reason Saturday was empty.
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
  if not (is_store_staff(v_b.store_id) or is_platform_admin()) then
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
