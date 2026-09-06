-- ── The photographs themselves ─────────────────────────────────────────────
--
-- The owner: "add the photos to admin so i can see them."
--
-- admin_vehicle_custody returns a COUNT of pickup photos, which answers "was
-- this documented" and not the question somebody actually opens the panel with
-- — does the scratch they are being told about appear in the pickup photo?
--
-- Returns PATHS, never URLs. The delivery-photos bucket is private and nothing
-- in it is displayable without a signature; the route signs them for five
-- minutes at the moment somebody asks. A URL stored or returned here would
-- outlive the reason it was issued, and a lasting link to a photograph of
-- somebody's car is a thing that ends up forwarded.
--
-- Admin-gated in SQL as well as at the route, the same as every other function
-- on that desk: the cookie is the boundary, and this is a second lock on it.
create or replace function public.admin_vehicle_photos(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_out jsonb;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select jsonb_build_object(
    'requestId', r.id,
    'plate', r.vehicle_plate,
    'vehicle', r.vehicle_desc,
    'customerName', r.contact_name,
    -- Both handovers in one payload, so the two sets can be put side by side.
    -- Comparing them IS the feature; making the owner open two screens to do
    -- it would be the same as not having it.
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event', e.event,
               'recordedAt', e.recorded_at,
               'note', e.note,
               'lat', e.lat, 'lng', e.lng,
               'driverName', d.full_name,
               'paths', e.photo_paths
             ) order by case e.event when 'collected' then 0 else 1 end)
        from vehicle_custody_events e
        left join delivery_drivers d on d.id = e.driver_id
       where e.request_id = r.id
    ), '[]'::jsonb)
  ) into v_out
  from delivery_requests r
  where r.id = p_request_id
    and r.errand_kind = 'vehicle';

  if v_out is null then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  return v_out;
end;
$function$;

revoke all on function public.admin_vehicle_photos(uuid) from public, anon, authenticated;
