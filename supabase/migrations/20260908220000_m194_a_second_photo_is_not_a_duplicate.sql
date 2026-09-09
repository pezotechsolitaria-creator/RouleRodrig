-- ── TOLD IT WORKED, AND THE PHOTOS WERE DROPPED ────────────────────────────
--
-- record_vehicle_custody() ended with:
--
--     on conflict (request_id, event) do nothing
--     returning id into v_id;
--     if v_id is null then
--       return jsonb_build_object('ok', true, 'alreadyRecorded', true);
--
-- The intent is right and stays: a driver double-tapping on a bad signal must
-- not be told something went wrong.
--
-- But it could not tell a double-tap from a SECOND, BETTER PHOTOGRAPH. A driver
-- who looks at what they took, sees it is dark or blurred or missing the
-- scratch on the wing, and photographs the car again was answered `ok: true`
-- while the new pictures were discarded. On the one screen in this product
-- whose entire purpose is evidence — of a customer's car, the most valuable
-- thing the platform ever moves — that is the worst outcome available: the
-- driver believes they are protected and they are not.
--
-- ── EVIDENCE IS ADDITIVE ──────────────────────────────────────────────────
-- A conflict now APPENDS, and appends only paths that are not already there. A
-- double-tap sends the same paths and adds nothing, which is the old behaviour
-- exactly. A re-photograph sends new paths and keeps them.
--
-- Nothing is ever removed. The first photographs stay whatever the second set
-- shows — a driver must be able to add to evidence, never to replace it.
--
-- Verified against production, rolled back:
--   start          a.jpg, b.jpg
--   double-tap  -> a.jpg, b.jpg              (identical set, nothing added)
--   b,c,d       -> a.jpg, b.jpg, c.jpg, d.jpg (only the new two appended)
create or replace function public.record_vehicle_custody(
  p_request_id uuid,
  p_event text,
  p_photos text[],
  p_note text default null::text,
  p_lat double precision default null::double precision,
  p_lng double precision default null::double precision
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d   delivery_drivers%rowtype;
  v_r   delivery_requests%rowtype;
  v_has_collected boolean;
  v_id  uuid;
  v_before integer;
  v_after  integer;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    raise exception 'Your driver account is not approved yet.' using errcode = 'P0001';
  end if;
  if coalesce(p_event, '') not in ('collected', 'returned') then
    raise exception 'Say whether the car was collected or returned.' using errcode = 'P0001';
  end if;
  if p_photos is null or cardinality(p_photos) = 0 then
    -- The whole point. See the CHECK on the table.
    raise exception 'Take at least one photo of the car first — it is what protects you both.'
      using errcode = 'P0001';
  end if;

  select * into v_r from delivery_requests where id = p_request_id;
  if not found or v_r.errand_kind is distinct from 'vehicle' then
    raise exception 'That is not a car collection.' using errcode = 'P0001';
  end if;

  -- THE JOB MUST BE THEIRS. Without this any approved driver could file a
  -- handover against somebody else's job and muddy the only evidence there is.
  if not exists (
    select 1 from deliveries dl
     where dl.request_id = v_r.id and dl.driver_id = v_d.id
  ) then
    raise exception 'This job is not yours.' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from vehicle_custody_events e
     where e.request_id = v_r.id and e.event = 'collected'
  ) into v_has_collected;

  if p_event = 'returned' and not v_has_collected then
    -- A return with no collection is a trail that reads as though the car
    -- appeared from nowhere.
    raise exception 'Record the collection first.' using errcode = 'P0001';
  end if;

  select cardinality(e.photo_paths) into v_before
    from vehicle_custody_events e
   where e.request_id = v_r.id and e.event = p_event;

  insert into vehicle_custody_events
    (request_id, event, driver_id, photo_paths, note, lat, lng)
  values
    (v_r.id, p_event, v_d.id, p_photos,
     nullif(btrim(coalesce(p_note, '')), ''), p_lat, p_lng)
  on conflict (request_id, event) do update
    set photo_paths = (
          -- Append only what is genuinely new, keeping the original order.
          -- Capped, so a stuck retry loop cannot grow the row without bound.
          (vehicle_custody_events.photo_paths || (
            select coalesce(array_agg(x), '{}'::text[])
              from unnest(excluded.photo_paths) as x
             where x <> all (vehicle_custody_events.photo_paths)
          ))[1:24]
        ),
        -- A later note or pin fills a gap; it never erases what was there.
        note = coalesce(vehicle_custody_events.note, excluded.note),
        lat  = coalesce(vehicle_custody_events.lat, excluded.lat),
        lng  = coalesce(vehicle_custody_events.lng, excluded.lng)
  returning id into v_id;

  select cardinality(e.photo_paths) into v_after
    from vehicle_custody_events e
   where e.request_id = v_r.id and e.event = p_event;

  if v_before is not null then
    -- The row already existed. Whether that was a double-tap or a second set
    -- of photographs is the difference between these two answers.
    return jsonb_build_object(
      'ok', true,
      'alreadyRecorded', true,
      'added', coalesce(v_after, 0) - coalesce(v_before, 0),
      'photos', coalesce(v_after, 0)
    );
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'event', p_event);
end;
$function$;
