-- ── M149 — a lorry cannot deliver food ─────────────────────────────────────
--
-- The dispatch model asked ONE question: does it FIT? A job was 'standard' or
-- 'large', and large meant car-or-van. That is necessary and nowhere near
-- sufficient, and the owner put his finger on exactly why.
--
-- A lorry is not refused a takeaway because the takeaway does not fit. It is
-- refused because it is the wrong tool: a lorry is slow, it cannot reach half
-- the tracks on this island, and a hot meal on a flatbed arrives cold and
-- covered in dust. Equally an open pickup is right for cement and wrong for
-- documents in the rain, and a bicycle is right for an envelope and wrong for
-- a gas bottle.
--
-- So a job now carries a CARGO KIND as well as a size, and each vehicle
-- declares what it can actually do. Both gates must pass.
--
-- ── The two words that had to be defined carefully ─────────────────────────
-- `enclosed` means THE LOAD IS CONTAINED — a bag, a top box, a boot, a closed
-- van. NOT "the vehicle has a roof". Reading it the other way excluded scooters,
-- bicycles and foot from every food job on the island, when a scooter with an
-- insulated box is how food is delivered the world over. Two iterations of this
-- migration got that wrong before the matrix was printed out and read.
--
-- `nimble` means it can reach a narrow track and get there while the food is
-- still hot. Only the lorry fails it. A van is NOT un-nimble — marking it so
-- narrowed hot food to cars alone, which on an island with a handful of drivers
-- costs real supply for no physical reason.
--
-- The resulting matrix, printed from the live function:
--
--     vehicle   general  food  fragile  heavy   large
--     foot         y      y      y        n       n
--     bicycle      y      y      y        n       n
--     scooter      y      y      y        n       n
--     car          y      y      y        n       y
--     van          y      y      y        y       y
--     pickup       y      n      n        y       y
--     lorry        y      n      n        y       y
--
-- lib/delivery/vehicle.ts mirrors this exactly, with tests. If the two ever
-- disagree, a screen is explaining a rule dispatch does not follow.

alter table delivery_requests
  add column if not exists cargo_kind text not null default 'general';
alter table deliveries
  add column if not exists cargo_kind text not null default 'general';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_requests_cargo_kind_check') then
    alter table delivery_requests add constraint delivery_requests_cargo_kind_check
      check (cargo_kind in ('general','food','fragile','heavy'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deliveries_cargo_kind_check') then
    alter table deliveries add constraint deliveries_cargo_kind_check
      check (cargo_kind in ('general','food','fragile','heavy'));
  end if;
end;
$$;

create or replace function public.vehicle_can_handle(
  p_vehicle_type text,
  p_size_class text,
  p_cargo_kind text default 'general'
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with cap as (
    select *
      from (values
        ('foot',    false, true,  true,  false),
        ('bicycle', false, true,  true,  false),
        ('scooter', false, true,  true,  false),
        ('car',     true,  true,  true,  false),
        ('van',     true,  true,  true,  true),
        -- The two open beds: normal-sized, go anywhere, protect nothing.
        ('pickup',  true,  false, true,  true),
        ('lorry',   true,  false, false, true)
      ) as v(kind, can_large, enclosed, nimble, heavy)
     where v.kind = coalesce(p_vehicle_type, '')
  ),
  demand as (
    select *
      from (values
        ('general', false, false, false),
        ('food',    true,  true,  false),
        ('fragile', true,  false, false),
        ('heavy',   false, false, true)
      ) as d(kind, needs_enclosed, needs_nimble, needs_heavy)
     where d.kind = coalesce(nullif(p_cargo_kind, ''), 'general')
  )
  select
    -- SIZE is judged cautiously: a vehicle nobody has described is not assumed
    -- to be a van, so it does not get the fridge. The M103 contract, unchanged.
    case when coalesce(p_size_class, 'standard') = 'large'
           and not coalesce((select can_large from cap), false)
         then false
    -- SUITABILITY is judged permissively: with no capability row there is
    -- nothing to check, and refusing would strand a job rather than merely
    -- offering it a little too widely. A job offered too widely has a driver
    -- who can decline; a job offered to nobody just sits there.
         when not exists (select 1 from cap) then true
         when not exists (select 1 from demand) then true
         when (select needs_enclosed from demand) and not (select enclosed from cap) then false
         when (select needs_nimble   from demand) and not (select nimble   from cap) then false
         when (select needs_heavy    from demand) and not (select heavy    from cap) then false
         else true
    end;
$fn$;

-- The old two-argument contract, preserved for every existing caller.
create or replace function public.vehicle_can_carry(p_vehicle_type text, p_size_class text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select vehicle_can_handle(p_vehicle_type, p_size_class, 'general');
$fn$;

-- A KITCHEN order is food by definition. This is what stops a lorry being
-- offered somebody's dinner, and it needs no new input from anybody.
create or replace function public.set_delivery_size_from_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_size text; v_cargo text;
begin
  if new.order_id is not null then
    select o.delivery_size_class into v_size from orders o where o.id = new.order_id;
    if exists (select 1 from orders o join food_kitchens fk on fk.store_id = o.store_id
                where o.id = new.order_id) then
      v_cargo := 'food';
    end if;
  elsif new.request_id is not null then
    select r.size_class, r.cargo_kind into v_size, v_cargo
      from delivery_requests r where r.id = new.request_id;
  end if;

  -- coalesce OUTSIDE the select, so a lookup that matches nothing leaves the
  -- default standing instead of nulling the column.
  if new.size_class is not distinct from 'standard' then
    new.size_class := coalesce(v_size, 'standard');
  end if;
  if new.cargo_kind is not distinct from 'general' then
    new.cargo_kind := coalesce(v_cargo, 'general');
  end if;
  return new;
end;
$fn$;

do $assert$
begin
  -- The rule this migration exists for.
  if vehicle_can_handle('lorry','standard','food') then
    raise exception 'M149: a lorry was offered food';
  end if;
  if vehicle_can_handle('pickup','standard','food') then
    raise exception 'M149: an open bed was offered food';
  end if;

  -- The classic food vehicles, which two earlier drafts wrongly excluded.
  if not vehicle_can_handle('scooter','standard','food') then
    raise exception 'M149: a scooter was refused a takeaway';
  end if;
  if not vehicle_can_handle('van','standard','food') then
    raise exception 'M149: a van was refused food';
  end if;

  -- Weight, and the things that cannot take it.
  if vehicle_can_handle('bicycle','standard','heavy') then
    raise exception 'M149: a bicycle was offered a gas bottle';
  end if;
  if vehicle_can_handle('car','standard','heavy') then
    raise exception 'M149: a car was offered cement';
  end if;
  if not vehicle_can_handle('van','large','heavy') then
    raise exception 'M149: a van was refused a large heavy job';
  end if;

  -- Size cautious, suitability permissive.
  if vehicle_can_handle('hovercraft','large','general') then
    raise exception 'M149: an unknown vehicle was given a large job';
  end if;
  if not vehicle_can_handle('hovercraft','standard','food') then
    raise exception 'M149: an unknown vehicle was stranded by a cargo rule';
  end if;
  if not vehicle_can_handle('lorry','standard','spaceship') then
    raise exception 'M149: an unknown cargo kind stranded a job';
  end if;

  -- The legacy contract is untouched.
  if not vehicle_can_carry('scooter','standard') then
    raise exception 'M149: the legacy contract changed for a standard job';
  end if;
  if vehicle_can_carry('scooter','large') then
    raise exception 'M149: the legacy contract changed for a large job';
  end if;

  -- No combination may leave the island with nobody eligible.
  if exists (
    select 1 from unnest(array['standard','large']) sz
    cross join unnest(array['general','food','fragile','heavy']) ck
    where not exists (
      select 1 from unnest(array['foot','bicycle','scooter','car','van','pickup','lorry']) v
       where vehicle_can_handle(v, sz, ck))
  ) then
    raise exception 'M149: some job kind has no eligible vehicle at all';
  end if;
end;
$assert$;
