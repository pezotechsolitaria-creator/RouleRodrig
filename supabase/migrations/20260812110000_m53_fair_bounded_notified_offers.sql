-- M53 — Three flaws in how a job finds a driver. Found by reading the sweep
-- against the question "what happens on a quiet Tuesday when nobody is online?"
--
-- FLAW 1 — THE SILENT FOREVER LOOP. sweep_delivery_escalations() re-offers any
-- delivery whose window elapsed, with no cap and no alarm. With zero drivers
-- online that repeats every minute until the heat death of the island: the
-- customer waits, the merchant's food goes cold, and nothing anywhere says so.
-- Now bounded by max_offer_rounds, after which it lands in `requires_admin` --
-- a state the control centre already sorts to the top.
--
-- FLAW 2 — RE-OFFERS WERE MUTE. Push fires from the merchant route when the
-- order is marked ready. That happens once. Every later round created offer
-- rows that no phone was ever told about, so a driver coming online at 14:05
-- for a job re-offered at 14:04 learned nothing until he happened to open the
-- page. The sweep now RETURNS the affected ids so the cron worker can notify.
--
-- FLAW 3 — NO ORDER BY. `limit offer_batch_size` with no ordering lets Postgres
-- return whatever the scan finds first, which in practice is stable: the same
-- driver wins every batch and newer drivers see nothing. That is not a queue,
-- it is a lottery with one ticket holder.
alter table public.deliveries
  add column if not exists offer_rounds int not null default 0;

alter table public.delivery_settings
  -- 6 rounds x a 10-minute window = an hour of genuine searching before a human
  -- is asked to intervene. Long enough for a driver to finish lunch, short
  -- enough that nobody is waiting on a dead order all afternoon.
  add column if not exists max_offer_rounds int not null default 6;

create or replace function public.offer_delivery(p_delivery_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d   deliveries%rowtype;
  v_set delivery_settings%rowtype;
  v_n   integer := 0;
  v_row record;
begin
  select * into v_d from deliveries where id = p_delivery_id;
  if not found or v_d.status <> 'searching_driver' then return 0; end if;
  select * into v_set from delivery_settings where id = 'main';

  for v_row in
    select d.id,
           (select count(*) from deliveries dl
             where dl.driver_id = d.id
               and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                 'picked_up','out_for_delivery','arrived')) as load,
           (select max(o.offered_at) from delivery_offers o where o.driver_id = d.id) as last_offered
      from delivery_drivers d
     where d.status = 'approved'
       and d.availability = 'available'
       and (cardinality(d.service_zone_ids) = 0
            or v_d.zone_id is null
            or v_d.zone_id = any (d.service_zone_ids))
       and (select count(*) from deliveries dl
             where dl.driver_id = d.id
               and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                 'picked_up','out_for_delivery','arrived'))
           < v_set.max_active_deliveries
     -- Fairness, in priority order: the least-loaded driver first (he can
     -- actually take it), then whoever has waited longest since his last offer,
     -- then random so a tie never resolves the same way twice.
     order by load asc,
              last_offered asc nulls first,
              random()
     limit v_set.offer_batch_size
  loop
    insert into delivery_offers (delivery_id, driver_id, expires_at)
    values (p_delivery_id, v_row.id, v_d.offer_expires_at)
    on conflict (delivery_id, driver_id) do update
      -- A re-offer must revive the row, not silently do nothing: the previous
      -- round marked it 'expired', and driver_push_targets only wakes drivers
      -- holding an 'offered' row. Without this, round 2 onward reached nobody
      -- who had already been asked once.
      set status = 'offered', expires_at = excluded.expires_at, responded_at = null
      where delivery_offers.status in ('expired', 'withdrawn');
    update driver_metrics set offers_received = offers_received + 1, updated_at = now()
     where driver_id = v_row.id;
    v_n := v_n + 1;
  end loop;

  perform log_delivery_event(p_delivery_id, 'system', null, 'delivery.offered', 'searching_driver',
                             'searching_driver', null, jsonb_build_object('drivers', v_n));
  return v_n;
end;
$function$;

revoke execute on function public.offer_delivery(uuid) from public, anon, authenticated;

create or replace function public.sweep_delivery_escalations()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_set        delivery_settings%rowtype;
  r            record;
  v_released   int := 0;
  v_admin      int := 0;
  v_reoffered  int := 0;
  v_reoffer_ids uuid[] := '{}';
  v_stranded_ids uuid[] := '{}';
  v_released_ids uuid[] := '{}';
  v_n          int;
begin
  select * into v_set from delivery_settings where id = 'main';

  -- 1. Nobody accepted. Not a driver failing — a supply problem. Re-offer,
  --    because drivers come online continuously and the first batch may simply
  --    have been offline. Bounded, because "keep trying" is not a plan.
  for r in
    select d.id, d.offer_rounds from deliveries d
     where d.status = 'searching_driver'
       and (d.offer_expires_at is null or d.offer_expires_at <= now())
     for update of d
  loop
    if r.offer_rounds + 1 >= v_set.max_offer_rounds then
      -- Out of road. A human has to call somebody, so say so loudly rather than
      -- looping in silence.
      update deliveries set status = 'requires_admin' where id = r.id;
      update delivery_offers set status = 'expired', responded_at = now()
       where delivery_id = r.id and status = 'offered';
      perform log_delivery_event(r.id, 'system', null, 'delivery.no_driver_found',
                                 'searching_driver', 'requires_admin',
                                 format('no driver after %s rounds', r.offer_rounds + 1));
      v_stranded_ids := v_stranded_ids || r.id;
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
    perform log_delivery_event(r.id, 'system', null, 'delivery.requires_admin',
                               r.status, 'requires_admin',
                               'no delivery within the window; package is with the driver');
    v_stranded_ids := v_stranded_ids || r.id;
    v_admin := v_admin + 1;
  end loop;

  -- The ids travel back so the cron worker can do what SQL cannot: reach a
  -- phone. Counts alone would leave the worker guessing who to notify.
  return jsonb_build_object(
    'reoffered', v_reoffered, 'released', v_released, 'needsAdmin', v_admin,
    'reofferedIds', to_jsonb(v_reoffer_ids),
    'strandedIds', to_jsonb(v_stranded_ids),
    'releasedIds', to_jsonb(v_released_ids));
end;
$function$;

revoke execute on function public.sweep_delivery_escalations() from public, anon, authenticated;
