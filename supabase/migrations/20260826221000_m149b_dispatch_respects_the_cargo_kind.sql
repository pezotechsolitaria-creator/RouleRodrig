-- ── M149b — dispatch gates on the cargo kind ───────────────────────────────
--
-- See 20260826220000_m149_a_lorry_cannot_deliver_food.sql for the model and the
-- reasoning. This is the half that makes it BITE: a rule nothing calls is a
-- rule that does not exist.
--
-- dispatch_candidates gains p_cargo_kind. DROPPED and recreated rather than
-- replaced, because an eighth parameter with a default would leave the 7-arg
-- version as an exact match for every existing call — so the new gate would
-- silently never run.
--
-- offer_delivery passes deliveries.cargo_kind, and while it was open it gained
-- the request-coordinate fallback: a direct job has no shop, and its pickup
-- lat/lng have been arriving from the form since the place picker replaced the
-- free-text address.

drop function if exists public.dispatch_candidates(
  double precision, double precision, uuid, integer, integer, uuid[], text);

create function public.dispatch_candidates(
  p_lat double precision, p_lng double precision, p_zone_id uuid DEFAULT NULL::uuid,
  p_stage integer DEFAULT 1, p_limit integer DEFAULT 20,
  p_exclude uuid[] DEFAULT '{}'::uuid[], p_size_class text DEFAULT NULL::text,
  p_cargo_kind text DEFAULT 'general')
returns TABLE(driver_id uuid, full_name text, distance_km double precision,
  eta_minutes integer, active_jobs integer, accept_rate numeric,
  idle_minutes integer, score numeric, location_age_seconds integer)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_set    dispatch_settings%rowtype;
  v_dset   delivery_settings%rowtype;
  v_radius double precision;
  v_lat    double precision := p_lat;
  v_lng    double precision := p_lng;
  v_deg    double precision;
  v_wsum   numeric;
begin
  select * into v_set  from dispatch_settings where id = 'main';
  select * into v_dset from delivery_settings where id = 'main';

  v_radius := case
    when p_stage is null or p_stage < 1 then v_set.radius_stages_km[1]
    when p_stage > cardinality(v_set.radius_stages_km) then null
    else v_set.radius_stages_km[p_stage]
  end;

  -- M145 — a NULL origin must widen the net, not close it.
  v_deg := case when v_radius is null or v_lat is null or v_lng is null then null
                else (v_radius * v_set.road_factor) / 111.0 end;

  v_wsum := greatest(
    v_set.weight_proximity + v_set.weight_reliability
      + v_set.weight_workload + v_set.weight_idle,
    0.0001);

  return query
  with eligible as (
    select
      d.id, d.full_name,
      case when l.lat is null or v_lat is null then null
           else 111.045 * sqrt(
                  power(l.lat - v_lat, 2)
                + power((l.lng - v_lng) * cos(radians((l.lat + v_lat) / 2)), 2))
      end as raw_km,
      case when l.recorded_at is null then null
           else extract(epoch from (now() - l.recorded_at))::integer end as loc_age,
      (select count(*)::integer from deliveries dl
        where dl.driver_id = d.id
          and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                            'picked_up','out_for_delivery','arrived')) as jobs,
      case
        when coalesce(m.offers_received, 0) = 0 then 0.70::numeric
        else greatest(0::numeric, round(
          (coalesce(m.offers_accepted, 0)::numeric
             / greatest(coalesce(m.offers_received, 0), 1)::numeric)
          - least(0.4, coalesce(m.driver_cancellations, 0)::numeric * 0.05)
          - least(0.3, coalesce(m.unresponsive_events, 0)::numeric * 0.05)
        , 3))
      end as reliability,
      coalesce(extract(epoch from (now() - (
        select max(o.offered_at) from delivery_offers o where o.driver_id = d.id
      )))::integer / 60, 1440)::integer as idle_min
    from delivery_drivers d
    left join driver_locations l on l.driver_kind = 'delivery' and l.driver_id = d.id
    left join driver_metrics   m on m.driver_id = d.id
    where d.status = 'approved'
      -- M116: DUTY, not capacity.
      and d.availability <> 'offline'
      and not (d.id = any (coalesce(p_exclude, '{}'::uuid[])))
      and (cardinality(d.service_zone_ids) = 0
           or p_zone_id is null
           or p_zone_id = any (d.service_zone_ids))
      -- THE capacity authority, and always was.
      and (select count(*) from deliveries dl
            where dl.driver_id = d.id
              and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                'picked_up','out_for_delivery','arrived'))
          < v_dset.max_active_deliveries
      -- M149 — BOTH gates: does it fit, and is this the right tool.
      and vehicle_can_handle(d.vehicle_type, p_size_class, p_cargo_kind)
      and (v_deg is null or l.driver_id is null
           or (l.lat between v_lat - v_deg and v_lat + v_deg
               and l.lng between v_lng - v_deg and v_lng + v_deg))
  ),
  within as (
    select e.*, (e.raw_km * v_set.road_factor)::numeric as road_km
      from eligible e
     where v_radius is null or e.raw_km is null or e.raw_km <= v_radius
  )
  select
    w.id, w.full_name,
    round(w.road_km, 2)::double precision,
    case when w.road_km is null then null
         else ceil(w.road_km / v_set.avg_speed_kmh * 60)::integer end,
    w.jobs, w.reliability, w.idle_min,
    round((
        v_set.weight_proximity * coalesce(greatest(0::numeric, 1 - (w.road_km / 18)), 0.25)
      + v_set.weight_reliability * w.reliability
      + v_set.weight_workload * greatest(0::numeric, 1 - (w.jobs::numeric
          / greatest(v_dset.max_active_deliveries, 1)))
      + v_set.weight_idle * least(1::numeric, w.idle_min::numeric / 120)
    ) / v_wsum, 4)::numeric,
    w.loc_age
  from within w
  order by 8 desc, 3 asc nulls last, w.idle_min desc
  limit greatest(coalesce(p_limit, 20), 1);
end;
$fn$;

create or replace function public.offer_delivery(p_delivery_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_d     deliveries%rowtype;
  v_set   delivery_settings%rowtype;
  v_n     integer := 0;
  v_stage integer;
  v_row   record;
  v_lat   double precision;
  v_lng   double precision;
  v_oid   uuid;
begin
  select * into v_d from deliveries where id = p_delivery_id;
  if not found or v_d.status <> 'searching_driver' then return 0; end if;
  select * into v_set from delivery_settings where id = 'main';

  select s.lat, s.lng into v_lat, v_lng from stores s where s.id = v_d.store_id;
  -- A direct job has no shop; its origin is on the request.
  if v_lat is null and v_d.request_id is not null then
    select r.pickup_lat, r.pickup_lng into v_lat, v_lng
      from delivery_requests r where r.id = v_d.request_id;
  end if;

  v_stage := coalesce(v_d.offer_rounds, 0) + 1;

  for v_row in
    select c.driver_id
      from dispatch_candidates(
             v_lat, v_lng, v_d.zone_id, v_stage,
             greatest(coalesce(v_set.offer_batch_size, 2), 1),
             coalesce(array(
               select o.driver_id from delivery_offers o
                where o.delivery_id = p_delivery_id
                  and o.status in ('declined','withdrawn')
             ), '{}'::uuid[]),
             v_d.size_class,
             v_d.cargo_kind
           ) c
  loop
    v_oid := null;
    insert into delivery_offers (delivery_id, driver_id, expires_at)
    values (p_delivery_id, v_row.driver_id, v_d.offer_expires_at)
    on conflict (delivery_id, driver_id) do update
      set status = 'offered', expires_at = excluded.expires_at, responded_at = null
      where delivery_offers.status in ('expired', 'withdrawn')
    returning id into v_oid;

    -- M134 — nothing was written, so his row is already 'offered' and he has no
    -- new card. Charging him a denominator would be unfair.
    if v_oid is null then continue; end if;

    update driver_metrics set offers_received = offers_received + 1, updated_at = now()
     where driver_id = v_row.driver_id;
    v_n := v_n + 1;
  end loop;

  perform log_delivery_event(
    p_delivery_id, 'system', null, 'delivery.offered',
    'searching_driver', 'searching_driver', null,
    jsonb_build_object(
      'drivers', v_n, 'stage', v_stage,
      'sizeClass', v_d.size_class,
      'cargoKind', v_d.cargo_kind,
      'hadOrigin', (v_lat is not null and v_lng is not null),
      'radiusKm', (select case when v_stage > cardinality(ds.radius_stages_km) then null
                               else ds.radius_stages_km[v_stage] end
                     from dispatch_settings ds where ds.id = 'main')
    )
  );
  return v_n;
end;
$fn$;

do $assert$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='dispatch_candidates') <> 1 then
    raise exception 'M149b: dispatch_candidates has an overload';
  end if;
  perform count(*) from dispatch_candidates(null, null, null, 1, 5, '{}'::uuid[], 'standard', 'food');
  perform offer_delivery(gen_random_uuid());
end;
$assert$;
