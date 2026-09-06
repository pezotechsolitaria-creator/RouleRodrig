-- The board now offers a person only the work they signed up for.
--
-- One line in the WHERE, and it is the whole point of the role: an errand
-- runner on foot should never be shown a parcel collection they have no way to
-- carry, and a lorry driver should not have their board filled with somebody's
-- bank queue.
--
-- The approval gate above it is unchanged and still absolute: `status <>
-- 'approved'` returns an empty board before any of this is reached.
create or replace function public.driver_open_requests(
  p_from date default null, p_to date default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d    delivery_drivers%rowtype;
  v_zone constant text := 'Indian/Mauritius';
  v_lat  double precision;
  v_lng  double precision;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    return '[]'::jsonb;
  end if;

  select l.lat, l.lng into v_lat, v_lng
    from driver_locations l
   where l.driver_kind = 'delivery' and l.driver_id = v_d.id;

  return (
    select coalesce(
             jsonb_agg(s.x order by s.ord_start, s.ord_km nulls last, s.ord_created),
             '[]'::jsonb)
    from (
      select
        jsonb_build_object(
          'id', r.id, 'kind', r.kind, 'what', r.what,
          'errandKind', r.errand_kind,
          'sizeClass', r.size_class,
          'cargoKind', r.cargo_kind,
          'pickupText', r.pickup_text, 'pickupNote', r.pickup_note,
          'dropoffText', r.dropoff_text, 'dropoffNote', r.dropoff_note,
          'spendCap', r.max_budget,
          'createdAt', r.created_at, 'expiresAt', r.expires_at,
          'photoPath', r.photo_url,
          'scheduleKind', r.schedule_kind,
          'timeSlot', r.time_slot,
          'windowStart', r.window_start,
          'windowEnd', r.window_end,
          'startsNow', (r.window_start <= now()),
          'distanceKm', case
             when v_lat is null or r.pickup_lat is null then null
             else round((111.045 * sqrt(
                    power(r.pickup_lat - v_lat, 2)
                  + power((r.pickup_lng - v_lng) * cos(radians((r.pickup_lat + v_lat) / 2)), 2)
                 ))::numeric, 1)
           end,
          'offDuty', (v_d.availability = 'offline'),
          'quoteCount', (select count(*) from delivery_quotes q
                          where q.request_id = r.id and q.status = 'offered'),
          'myQuote', (select jsonb_build_object('id', q.id, 'fee', q.fee, 'note', q.note)
                        from delivery_quotes q
                       where q.request_id = r.id and q.driver_id = v_d.id
                         and q.status = 'offered')
        ) as x,
        greatest(r.window_start, now()) as ord_start,
        case
          when v_lat is null or r.pickup_lat is null then null
          else 111.045 * sqrt(
                 power(r.pickup_lat - v_lat, 2)
               + power((r.pickup_lng - v_lng) * cos(radians((r.pickup_lat + v_lat) / 2)), 2))
        end as ord_km,
        r.created_at as ord_created
      from delivery_requests r
      where r.status = 'open'
        and (r.expires_at is null or r.expires_at > now())
        and (r.window_end is null or r.window_end > now())
        -- Only the work this person signed up for.
        and (case when r.kind = 'errand' then v_d.can_run_errands
                  else v_d.can_deliver end)
        and vehicle_can_handle(v_d.vehicle_type, r.size_class, r.cargo_kind)
        and (p_from is null or (r.window_start at time zone v_zone)::date >= p_from)
        and (p_to   is null or (r.window_start at time zone v_zone)::date <= p_to)
        and (
          v_d.availability <> 'offline'
          or exists (select 1 from delivery_quotes q
                      where q.request_id = r.id and q.driver_id = v_d.id
                        and q.status = 'offered')
        )
    ) s
  );
end;
$function$;
