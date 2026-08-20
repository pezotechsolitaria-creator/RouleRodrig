-- ══════════════════════════════════════════════════════════════════════════
-- M134 — a reassigned delivery gets a fresh ladder, and cannot mint one
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE BUDGET IS READ OFF A LIFETIME TALLY ───────────────────────────────
-- sweep_delivery_escalations gives up with
--
--     if r.offer_rounds + 1 >= v_set.max_offer_rounds then
--
-- against max_offer_rounds = 6. offer_rounds is a LIFETIME count of how many
-- times this job has been put to drivers, and nothing resets it. So a delivery
-- that has already burnt five rounds and is then reassigned by the owner gets
-- ONE round before it strands again. The reassign bought a single attempt, not
-- the fresh search the owner thought he was ordering.
--
-- ── WHY THE COUNTER IS NOT RESET ──────────────────────────────────────────
-- Because offer_rounds is also the RADIUS CURSOR. dispatch_candidates does
--
--     when p_stage > cardinality(v_set.radius_stages_km) then null
--
-- and the live array is {3,8,18}, so stage 4 and beyond search the whole island
-- with no distance filter at all. Restarting a reassigned delivery at 0 would
-- spend two ten-minute windows at 3 km and 8 km — NARROWER than the island-wide
-- round that had just failed. The cursor must keep climbing.
--
-- So the BUDGET re-bases instead of the counter: every owner intervention buys
-- another full ladder, measured from wherever the search has actually got to.
--
--     budget = max_offer_rounds * (reassignments + 1)
--
-- ── WHY THIS CANNOT RUN AWAY, AND THE HOLE THAT HAD TO CLOSE FIRST ────────
-- reassignment_count only grows when a HUMAN presses Reassign, or when loop 2
-- releases a driver who accepted and never collected. Loop 1 never touches it,
-- so the system can never extend its own budget for a job nobody has accepted.
--
-- Except it could, through driver_cannot_complete. That function withdrew only
--
--     where delivery_id = p_delivery_id and status = 'offered'
--
-- leaving the BAILING driver's own row at 'accepted'. offer_delivery excludes
-- by `o.status in ('declined','withdrawn')`, so an 'accepted' row excludes
-- nobody: the same man is re-offered the same job, accepts, bails again, and
-- each bail increments reassignment_count. Today that is a nuisance loop. With
-- a per-reassignment budget it would be an unbounded one, so it is closed in
-- the same migration — that dependency is why these ship together.
--
-- ── AND THE DELIVERY SIDE OF M129 ─────────────────────────────────────────
-- offer_delivery has the identical false-increment M129 fixed for rides:
--
--     on conflict (delivery_id, driver_id) do update
--       set status='offered', ...
--       where delivery_offers.status in ('expired','withdrawn');
--     update driver_metrics set offers_received = offers_received + 1 ...
--
-- When the driver's row is already 'offered' that WHERE matches nothing, no row
-- is written, and the counter rose anyway. offers_received is the denominator of
-- the reliability score in dispatch_candidates, so every re-offer round quietly
-- charged every already-offered driver for a card he was never sent twice.

-- ── 1 · the give-up rule, named once ──────────────────────────────────────
create or replace function public.delivery_rounds_budget(p_max_offer_rounds integer, p_reassignments integer)
returns integer
language sql immutable set search_path to 'pg_temp'
as $function$
  select greatest(coalesce(p_max_offer_rounds, 6), 1)
       * (greatest(coalesce(p_reassignments, 0), 0) + 1);
$function$;

comment on function public.delivery_rounds_budget(integer, integer) is
  'How many offer rounds a delivery is allowed in total, given how many times it has been handed on. The counter is a lifetime tally AND the radius cursor, so the budget re-bases rather than the counter — resetting offer_rounds would rewind a reassigned delivery to a narrower search than the one that just failed.';

revoke all on function public.delivery_rounds_budget(integer, integer) from public, anon, authenticated;
grant execute on function public.delivery_rounds_budget(integer, integer) to service_role;

-- ── 2 · offer_delivery only charges for a card actually written ───────────
create or replace function public.offer_delivery(p_delivery_id uuid)
returns integer
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
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
    v_oid := null;
    insert into delivery_offers (delivery_id, driver_id, expires_at)
    values (p_delivery_id, v_row.driver_id, v_d.offer_expires_at)
    on conflict (delivery_id, driver_id) do update
      set status = 'offered', expires_at = excluded.expires_at, responded_at = null
      where delivery_offers.status in ('expired', 'withdrawn')
    returning id into v_oid;

    -- M134 · NOTHING WAS WRITTEN. His row is already 'offered', so the DO
    -- UPDATE's WHERE matched nothing and he has no new card. Charging him a
    -- denominator for it is the delivery twin of the ride bug fixed in M129.
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
      'hadOrigin', (v_lat is not null and v_lng is not null),
      'radiusKm', (select case when v_stage > cardinality(ds.radius_stages_km) then null
                               else ds.radius_stages_km[v_stage] end
                     from dispatch_settings ds where ds.id = 'main')
    )
  );
  return v_n;
end;
$function$;

-- ── 3 · a driver who bails is excluded from the re-offer ──────────────────
create or replace function public.driver_cannot_complete(p_delivery_id uuid, p_reason text, p_note text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_driver delivery_drivers%rowtype;
  v_d      deliveries%rowtype;
  v_after  boolean;
  v_to     delivery_status;
begin
  v_driver := current_driver();
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found or v_d.driver_id is distinct from v_driver.id then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_note), '') = '' then
    raise exception using errcode = 'RR088', message = 'Tell us briefly what happened.';
  end if;

  v_after := v_d.status in ('picked_up', 'out_for_delivery', 'arrived');
  v_to := case when v_after then 'requires_admin' else 'searching_driver' end;

  update deliveries
     set status = v_to,
         driver_id = case when v_after then driver_id else null end,
         failure_reason = p_reason,
         admin_note = p_note,
         reassignment_count = reassignment_count + case when v_after then 0 else 1 end,
         offer_expires_at = case when v_after then offer_expires_at
                                 else now() + interval '10 minutes' end,
         -- M131 · Only when custody actually changes.
         pin = case when v_after then pin else public.mint_delivery_pin() end,
         pin_attempts = case when v_after then pin_attempts else 0 end
   where id = p_delivery_id;

  perform sync_driver_availability(v_driver.id);
  update driver_metrics
     set driver_cancellations = driver_cancellations + 1, updated_at = now()
   where driver_id = v_driver.id;

  -- M134 · The bailing driver's OWN row goes too, whatever state it is in.
  -- It was 'accepted', and offer_delivery excludes only 'declined'/'withdrawn',
  -- so he was immediately re-offered the job he had just walked away from —
  -- accept, bail, accept, bail, each pass incrementing reassignment_count.
  -- Harmless-ish before; with a per-reassignment budget it would be an
  -- unbounded ladder, which is why this lands in the same migration.
  update delivery_offers set status = 'withdrawn', responded_at = now()
   where delivery_id = p_delivery_id
     and (status = 'offered' or driver_id = v_driver.id);

  perform log_delivery_event(p_delivery_id, 'driver', auth.uid(), 'delivery.driver_cannot_complete',
                             v_d.status, v_to, p_reason,
                             jsonb_build_object('afterPickup', v_after, 'note', p_note));

  return jsonb_build_object('ok', true, 'status', v_to, 'afterPickup', v_after);
end;
$function$;

-- ── 4 · the sweep spends a budget, not a tally ────────────────────────────
-- Body identical to the deployed one except the loop-1 cursor now selects
-- reassignment_count and the give-up test calls delivery_rounds_budget.
create or replace function public.sweep_delivery_escalations()
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_set        delivery_settings%rowtype;
  r            record;
  v_released   int := 0;
  v_admin      int := 0;
  v_reoffered  int := 0;
  v_reoffer_ids uuid[] := '{}';
  v_no_driver_ids     uuid[] := '{}';
  v_not_collected_ids uuid[] := '{}';
  v_package_ids       uuid[] := '{}';
  v_released_ids uuid[] := '{}';
  v_n          int;
begin
  select * into v_set from delivery_settings where id = 'main';

  -- 1. Nobody accepted. Not a driver failing — a supply problem. Re-offer,
  --    because drivers come online continuously and the first batch may simply
  --    have been offline. Bounded, because "keep trying" is not a plan.
  for r in
    select d.id, d.offer_rounds, d.reassignment_count from deliveries d
     where d.status = 'searching_driver'
       and (d.offer_expires_at is null or d.offer_expires_at <= now())
     for update of d
  loop
    -- M134 · THE BUDGET, NOT THE COUNTER. offer_rounds stays a lifetime tally
    -- and the radius cursor both; every owner intervention buys another full
    -- ladder measured from where the search actually is.
    if r.offer_rounds + 1 >= delivery_rounds_budget(v_set.max_offer_rounds, r.reassignment_count) then
      -- Out of road. A human has to call somebody, so say so loudly rather than
      -- looping in silence.
      update deliveries set status = 'requires_admin' where id = r.id;
      update delivery_offers set status = 'expired', responded_at = now()
       where delivery_id = r.id and status = 'offered';
      perform log_delivery_event(r.id, 'system', null, 'delivery.no_driver_found',
                                 'searching_driver', 'requires_admin',
                                 format('no driver after %s rounds', r.offer_rounds + 1));
      v_no_driver_ids := v_no_driver_ids || r.id;
      v_admin := v_admin + 1;
    else
      update deliveries
         set offer_expires_at = now() + make_interval(mins => v_set.accept_window_minutes),
             offer_rounds = offer_rounds + 1
       where id = r.id;
      update delivery_offers set status = 'expired', responded_at = now()
       where delivery_id = r.id and status = 'offered';
      v_n := offer_delivery(r.id);
      perform log_delivery_event(r.id, 'system', null, 'delivery.reoffered',
                                 'searching_driver', 'searching_driver',
                                 format('offer window elapsed; round %s reached %s drivers',
                                        r.offer_rounds + 1, v_n));
      -- Only worth waking phones if the round actually reached anyone.
      if v_n > 0 then v_reoffer_ids := v_reoffer_ids || r.id; end if;
      v_reoffered := v_reoffered + 1;
    end if;
  end loop;

  -- 2. Accepted but stalled BEFORE pickup. The package is still at the shop, so
  --    releasing it is safe and is the fastest route to a delivered order.
  for r in
    select d.id, d.driver_id, d.status from deliveries d
     where d.status in ('assigned','going_to_pickup','arrived_at_pickup')
       and d.pickup_due_at is not null
       and d.pickup_due_at + make_interval(mins => v_set.unresponsive_after_minutes) <= now()
     for update of d
  loop
    if r.driver_id is not null then
      update driver_metrics set unresponsive_events = unresponsive_events + 1, updated_at = now()
       where driver_id = r.driver_id;
    end if;
    perform log_delivery_event(r.id, 'system', null, 'delivery.driver_unresponsive',
                               r.status, 'searching_driver', 'no pickup within the window');
    if v_set.auto_reassign_before_pickup then
      perform admin_reassign_delivery(r.id, false, 'Released automatically: driver did not collect in time.');
      -- The driver who lost it must be told, or he rides to a shop for nothing.
      v_released_ids := v_released_ids || r.id;
      v_released := v_released + 1;
    else
      update deliveries set status = 'driver_unresponsive' where id = r.id;
      -- M116: 'driver_unresponsive' is outside the active set, so without this
      -- the driver keeps 'busy' while counting zero jobs.
      perform sync_driver_availability(r.driver_id);
      -- M117: this branch told NOBODY, and it is terminal.
      v_not_collected_ids := v_not_collected_ids || r.id;
      v_admin := v_admin + 1;
    end if;
  end loop;

  -- 3. Stalled AFTER pickup. The goods are in someone's possession. This is the
  --    case that must NEVER auto-reassign — a second driver sent to the shop
  --    finds nothing, and the package is still in the first driver's bag.
  for r in
    select d.id, d.driver_id, d.status from deliveries d
     where d.status in ('picked_up','out_for_delivery','arrived')
       and d.delivery_due_at is not null
       and d.delivery_due_at + make_interval(mins => v_set.unresponsive_after_minutes) <= now()
     for update of d
  loop
    if r.driver_id is not null then
      update driver_metrics set unresponsive_events = unresponsive_events + 1, updated_at = now()
       where driver_id = r.driver_id;
    end if;
    update deliveries set status = 'requires_admin' where id = r.id;
    perform sync_driver_availability(r.driver_id);
    perform log_delivery_event(r.id, 'system', null, 'delivery.requires_admin',
                               r.status, 'requires_admin',
                               'no delivery within the window; package is with the driver');
    v_package_ids := v_package_ids || r.id;
    v_admin := v_admin + 1;
  end loop;

  return jsonb_build_object(
    'reoffered', v_reoffered, 'released', v_released, 'needsAdmin', v_admin,
    'reofferedIds', to_jsonb(v_reoffer_ids),
    'releasedIds', to_jsonb(v_released_ids),
    'noDriverIds', to_jsonb(v_no_driver_ids),
    'notCollectedIds', to_jsonb(v_not_collected_ids),
    'packageWithDriverIds', to_jsonb(v_package_ids),
    -- LEGACY (M117), for the deploy window only.
    'strandedIds', to_jsonb(v_no_driver_ids || v_package_ids));
end;
$function$;

-- ── VERIFICATION ──────────────────────────────────────────────────────────
do $$
declare v_n integer; v_sweep jsonb;
begin
  for v_n in
    select 1 from (values ('delivery_rounds_budget'),('offer_delivery'),
                          ('driver_cannot_complete'),('sweep_delivery_escalations')) t(nm)
     where (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname = t.nm) <> 1
  loop
    raise exception 'M134: a function has the wrong number of overloads';
  end loop;

  if has_function_privilege('anon', 'public.delivery_rounds_budget(integer,integer)', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.delivery_rounds_budget(integer,integer)', 'EXECUTE') then
    raise exception 'M134: delivery_rounds_budget is EXECUTE-able by a client role';
  end if;

  -- The arithmetic, including the degenerate inputs.
  if delivery_rounds_budget(6, 0) <> 6  then raise exception 'M134: a fresh job does not get one ladder'; end if;
  if delivery_rounds_budget(6, 1) <> 12 then raise exception 'M134: one reassign does not buy a second ladder'; end if;
  if delivery_rounds_budget(6, 3) <> 24 then raise exception 'M134: three reassigns do not buy four ladders'; end if;
  if delivery_rounds_budget(null, null) <> 6 then raise exception 'M134: nulls do not fall back to one default ladder'; end if;
  if delivery_rounds_budget(0, -5) <> 1 then raise exception 'M134: a nonsense budget is not floored at one round'; end if;

  -- THE CASE THIS EXISTS FOR: five rounds burnt, then reassigned once. Before
  -- this the job had one round left; now it has a full ladder.
  if 5 + 1 >= delivery_rounds_budget(6, 1) then
    raise exception 'M134: a reassigned delivery at 5 rounds still gives up immediately';
  end if;
  -- ...and it is still bounded.
  if 11 + 1 < delivery_rounds_budget(6, 1) then
    raise exception 'M134: the budget is not bounded — a reassigned delivery never gives up';
  end if;

  -- The re-offer exclusion now catches a driver who bailed, not only one who
  -- declined. Asserted against the deployed source: driving a real delivery
  -- through dispatch would need a merchant, an order and a paid customer.
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='driver_cannot_complete')
     !~ 'status = ''offered'' or driver_id = v_driver.id' then
    raise exception 'M134: a bailing driver is still re-offered his own job';
  end if;
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='offer_delivery') !~ 'if v_oid is null then continue' then
    raise exception 'M134: offer_delivery still charges for a card it never wrote';
  end if;

  -- plpgsql bodies are not resolved until first call. All three sweep loops
  -- match zero rows right now, so this exercises the body without moving data.
  v_sweep := sweep_delivery_escalations();
  if (v_sweep->>'reoffered')::int <> 0 or (v_sweep->>'released')::int <> 0
     or (v_sweep->>'needsAdmin')::int <> 0 then
    raise exception 'M134: the sweep changed data during verification: %', v_sweep;
  end if;
  if not (v_sweep ? 'noDriverIds' and v_sweep ? 'notCollectedIds'
          and v_sweep ? 'packageWithDriverIds' and v_sweep ? 'strandedIds') then
    raise exception 'M134: the M117 return shape was lost: %', v_sweep;
  end if;

  raise notice 'M134 verified: the budget re-bases, and a bailing driver cannot mint another.';
end $$;
