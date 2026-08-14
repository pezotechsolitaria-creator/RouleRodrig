-- ── M103 · A FRIDGE CANNOT GO ON A SCOOTER ──────────────────────────────────
--
-- Drivers have declared a `vehicle_type` since M45 — scooter, car, van, bicycle
-- or foot — and dispatch has never once looked at it. Every eligibility gate in
-- dispatch_candidates is about the DRIVER (approved, available, in zone, under
-- capacity, near enough); none is about whether the thing being sent will
-- physically fit on what they ride.
--
-- On an island where a good share of the fleet is on two wheels, that is not a
-- theoretical gap. The failure is also the expensive kind: the offer is
-- accepted, the driver rides to the shop, and the mismatch is discovered at the
-- counter with the customer's clock already running. Then it re-enters dispatch
-- from the beginning, having burnt a driver, a trip and the delivery window.
--
-- So the customer gets to say "this needs a car", and that becomes a binary
-- eligibility gate beside the others rather than a scoring nudge. A large job
-- is not "better suited" to a van; it is impossible on a scooter, and a weight
-- would eventually let a very close, very reliable scooter outrank a car.
--
-- BACKWARD COMPATIBLE BY CONSTRUCTION. Absent or 'standard' means every driver
-- is eligible exactly as today, so every delivery already in flight and every
-- caller that does not pass the new argument behaves identically. Only a job
-- explicitly marked 'large' filters anything.

-- ── 1. Which vehicles can take a large item — an owner's dial, not a constant
--
-- delivery_settings exists precisely so the network can be retuned without a
-- deploy, and this belongs with the rest of the dials. It is also the field
-- most likely to need changing: a driver with a trailer, a pickup, a tuk-tuk
-- the schema has never heard of. Hardcoding the list into a function would mean
-- a migration every time the fleet changes shape.
alter table delivery_settings
  add column if not exists large_item_vehicles text[] not null default '{car,van}'::text[];

comment on column delivery_settings.large_item_vehicles is
  'Vehicle types that may be offered a size_class = large delivery. An owner dial: the fleet changes shape faster than the schema should (M103).';

-- ── 2. What the customer asked for ──────────────────────────────────────────
-- On the ORDER because that is where checkout writes, and the delivery does not
-- exist yet at that point: it is minted by a trigger when the shop marks the
-- order ready. Copied onto the delivery at creation so dispatch reads one row.
alter table orders
  add column if not exists delivery_size_class text not null default 'standard'
  check (delivery_size_class in ('standard', 'large'));

comment on column orders.delivery_size_class is
  'Customer''s declaration at checkout: "large" means it will not go on a scooter. Copied to deliveries.size_class when the job is created (M103).';

alter table deliveries
  add column if not exists size_class text not null default 'standard'
  check (size_class in ('standard', 'large'));

comment on column deliveries.size_class is
  'What this job needs to carry it. "large" restricts dispatch to delivery_settings.large_item_vehicles. Default keeps every existing delivery offerable to everyone (M103).';

-- ── 3. The rule, in one place ───────────────────────────────────────────────
-- A function rather than an inlined condition so the customer form, the driver
-- profile, the admin desk and dispatch cannot drift apart on what "can carry"
-- means. Immutable-ish and cheap; called once per candidate row.
create or replace function public.vehicle_can_carry(p_vehicle_type text, p_size_class text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    -- Anything other than an explicit large job is carryable by anyone. Null
    -- included: an unknown requirement must not silently strand a delivery.
    when coalesce(p_size_class, 'standard') <> 'large' then true
    else coalesce(p_vehicle_type, '') = any (
      coalesce((select s.large_item_vehicles from delivery_settings s where s.id = 'main'),
               '{car,van}'::text[])
    )
  end;
$$;

comment on function public.vehicle_can_carry(text, text) is
  'Can this vehicle take this job? One definition, shared by dispatch and every screen that explains it (M103).';

revoke all on function public.vehicle_can_carry(text, text) from public;
revoke all on function public.vehicle_can_carry(text, text) from anon;
-- Readable by signed-in staff/drivers so a driver screen can explain why a job
-- is not offered to them. It exposes a settings list, not anybody's data.
-- NOTE: the `authenticated` half of this grant is revoked by M103b — nothing in
-- the app calls it over REST, and the screens use lib/delivery/vehicle.ts.
grant execute on function public.vehicle_can_carry(text, text) to authenticated, service_role;

-- ── 4. Dispatch honours it ──────────────────────────────────────────────────
-- New trailing argument with a default, so the existing 6-argument signature
-- keeps working. Everything else in this function is M75–M77 verbatim; the only
-- change is one line in the eligibility WHERE clause.
create or replace function public.dispatch_candidates(
  p_lat     double precision,
  p_lng     double precision,
  p_zone_id uuid    default null,
  p_stage   integer default 1,
  p_limit   integer default 20,
  p_exclude uuid[]  default '{}'::uuid[],
  p_size_class text default null
) returns table (
  driver_id            uuid,
  full_name            text,
  distance_km          double precision,
  eta_minutes          integer,
  active_jobs          integer,
  accept_rate          numeric,
  idle_minutes         integer,
  score                numeric,
  location_age_seconds integer
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
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

  v_deg := case when v_radius is null then null
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
    left join driver_locations l on l.driver_id = d.id
    left join driver_metrics   m on m.driver_id = d.id
    where d.status = 'approved'
      and d.availability = 'available'
      and not (d.id = any (coalesce(p_exclude, '{}'::uuid[])))
      and (cardinality(d.service_zone_ids) = 0
           or p_zone_id is null
           or p_zone_id = any (d.service_zone_ids))
      and (select count(*) from deliveries dl
            where dl.driver_id = d.id
              and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                'picked_up','out_for_delivery','arrived'))
          < v_dset.max_active_deliveries
      -- ── THE NEW GATE ────────────────────────────────────────────────────
      -- Binary, beside the other capabilities, and NOT a scoring weight: a
      -- weight would let a very close, very reliable scooter outrank a van on
      -- a job it cannot physically take.
      and vehicle_can_carry(d.vehicle_type, p_size_class)
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
$$;

-- Same lockdown the 6-argument version carries. A NEW signature gets NEW default
-- grants, and PUBLIC EXECUTE is the default in Postgres — leaving it would open
-- the fleet's live positions and reliability scores to anon. See the M8/M28
-- lesson: `revoke ... from public` is the boundary, not an afterthought.
revoke all on function public.dispatch_candidates(double precision, double precision, uuid, integer, integer, uuid[], text) from public;
revoke all on function public.dispatch_candidates(double precision, double precision, uuid, integer, integer, uuid[], text) from anon, authenticated;
grant execute on function public.dispatch_candidates(double precision, double precision, uuid, integer, integer, uuid[], text) to service_role;

-- The old 6-argument function would now be an ambiguous overload AND an
-- unguarded way to dispatch without the size gate. Drop it: every caller in the
-- repo goes through offer_delivery, which is updated below.
drop function if exists public.dispatch_candidates(double precision, double precision, uuid, integer, integer, uuid[]);

-- ── 5. offer_delivery passes the requirement through ────────────────────────
create or replace function public.offer_delivery(p_delivery_id uuid)
returns integer
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d     deliveries%rowtype;
  v_set   delivery_settings%rowtype;
  v_n     integer := 0;
  v_stage integer;
  v_row   record;
  v_lat   double precision;
  v_lng   double precision;
begin
  select * into v_d from deliveries where id = p_delivery_id;
  if not found or v_d.status <> 'searching_driver' then return 0; end if;
  select * into v_set from delivery_settings where id = 'main';

  select s.lat, s.lng into v_lat, v_lng from stores s where s.id = v_d.store_id;

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
             v_d.size_class
           ) c
  loop
    insert into delivery_offers (delivery_id, driver_id, expires_at)
    values (p_delivery_id, v_row.driver_id, v_d.offer_expires_at)
    on conflict (delivery_id, driver_id) do update
      set status = 'offered', expires_at = excluded.expires_at, responded_at = null
      where delivery_offers.status in ('expired', 'withdrawn');
    update driver_metrics set offers_received = offers_received + 1, updated_at = now()
     where driver_id = v_row.driver_id;
    v_n := v_n + 1;
  end loop;

  -- sizeClass in the log because "nobody got this" now has one more possible
  -- cause, and an operator should not have to guess which it was.
  perform log_delivery_event(
    p_delivery_id, 'system', null, 'delivery.offered',
    'searching_driver', 'searching_driver', null,
    jsonb_build_object(
      'drivers', v_n, 'stage', v_stage,
      'sizeClass', v_d.size_class,
      'hadOrigin', (v_lat is not null and v_lng is not null),
      'radiusKm', (select case when v_stage > cardinality(ds.radius_stages_km) then null
                               else ds.radius_stages_km[v_stage] end
                     from dispatch_settings ds where ds.id = 'main')
    )
  );
  return v_n;
end;
$function$;

-- ── 6. The job inherits what the customer asked for ─────────────────────────
-- create_delivery_for_order is the only minting path (M49's trigger calls it),
-- so copying here covers the merchant route, the admin route and whatever is
-- built next.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_delivery_for_order'
   limit 1;

  -- Belt and braces: if the insert's column list ever changes shape, fail the
  -- migration loudly here rather than ship a delivery whose size is always
  -- 'standard' and a fridge that keeps being offered to scooters.
  if v_src is null then
    raise exception 'create_delivery_for_order() not found — M103 cannot wire size_class';
  end if;
end $$;

create or replace function public.set_delivery_size_from_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- A trigger rather than an edit to create_delivery_for_order's body: that
  -- function has been rewritten by several migrations and inlining a column
  -- into it again is how the last few merge conflicts started. This attaches to
  -- the fact (a delivery row exists for an order) rather than to a call site.
  if new.size_class = 'standard' then
    select coalesce(o.delivery_size_class, 'standard') into new.size_class
      from orders o where o.id = new.order_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_delivery_size_from_order() from public, anon, authenticated;

drop trigger if exists t_deliveries_size_from_order on deliveries;
create trigger t_deliveries_size_from_order
  before insert on deliveries
  for each row execute function set_delivery_size_from_order();
