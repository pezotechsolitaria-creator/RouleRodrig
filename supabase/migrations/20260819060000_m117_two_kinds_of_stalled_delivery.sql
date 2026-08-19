-- ══════════════════════════════════════════════════════════════════════════
-- M117 — "stranded" was two opposite situations wearing one word
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE REPORT ────────────────────────────────────────────────────────────
-- "Fix the stranded driver alert wording."
--
-- The wording could not be fixed where it is written, because ONE array
-- carried TWO opposite facts, and one array cannot produce two messages.
--
--   loop 1  offers ran out, nobody ever accepted
--           -> THE PACKAGE IS ON THE SHOP COUNTER
--           -> send it out again, or call the shop
--
--   loop 3  a driver collected it and went quiet
--           -> THE PACKAGE IS IN HIS BAG
--           -> call THAT DRIVER, and do NOT send a second driver to a shop
--              that has nothing to give him
--
-- Both pushed to v_stranded_ids, so both came out of notifyOwnerNoDriver as
-- "No driver found. The customer is waiting. Assign someone or call them."
-- For the second case that sentence prescribes the one action that cannot
-- work — and admin_reassign_delivery raises RR091 to refuse it.
--
-- Loop 2's else branch is the same defect with the volume at zero: it sets
-- 'driver_unresponsive' and pushes to NO array, so nobody is told anything.
-- Dormant today (auto_reassign_before_pickup = true) and terminal when it
-- fires, because no later loop selects that status.
--
-- ── THE PART THAT IS NOT WORDING AT ALL ───────────────────────────────────
-- Because both kinds produced the SAME dedupe key — notifyOwnerNoDriver built
-- 'delivery:no-driver:' || deliveryId for both — the second alert about one
-- delivery was not merely mislabelled. It was DELETED.
--
--   notification_jobs_dedupe_key  unique (dedupe_key) where dedupe_key is not null
--   enqueue_notification()        exception when unique_violation then null
--
-- No time window, no status predicate, no log line: a key is claimed for ever
-- and the collision is swallowed in silence. So a delivery that stranded once
-- with nobody taking it, was then reassigned, collected, and abandoned by the
-- driver holding it, produced ZERO owner alerts for the second and far more
-- expensive event. Splitting the arrays is what makes distinct keys possible.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ───────────────────────────────────────
-- No new status. No new loop. No changed WHERE clause, UPDATE, counter or
-- log_delivery_event call — all byte identical to the deployed body. Only the
-- id bookkeeping changes.
--
-- ── strandedIds STAYS ─────────────────────────────────────────────────────
-- SQL deploys before the app, and a rollback runs them the other way. If this
-- stopped returning the key the running app reads, owner alerts would go
-- silent for that window — precisely the class of bug this change exists to
-- remove. It is kept as the exact union of the two stranding kinds, appended
-- in the same order as before, so an un-upgraded app behaves identically
-- rather than merely similarly.
--
-- notCollectedIds is deliberately NOT in the union: today those ids reach no
-- array at all, so folding them in would make an OLD app start sending "No
-- driver found" about a delivery a named driver accepted — inventing a new
-- wrong message during the deploy window.
--
-- It may be dropped only after the app that no longer reads it is live AND its
-- fallback branch has been deleted — two separate releases, or the same window
-- reopens in the opposite direction.

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
  -- M117: one array with two meanings becomes three arrays with one each.
  v_no_driver_ids     uuid[] := '{}';   -- nobody accepted; package at the shop
  v_not_collected_ids uuid[] := '{}';   -- accepted, never collected; at the shop
  v_package_ids       uuid[] := '{}';   -- collected, driver silent; in his bag
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
      -- M117: nothing was ever collected, so the package is at the shop.
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
      -- the driver keeps 'busy' while counting zero jobs — on duty, holding
      -- nothing, and under the old dispatch predicate, unreachable for ever.
      perform sync_driver_availability(r.driver_id);
      -- M117: this branch told NOBODY. It is terminal — no later loop selects
      -- 'driver_unresponsive' — so a delivery landing here simply stopped, with
      -- the package sitting on a shop counter and no message to anyone.
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
    -- M116: the package stays with him and the delivery stays his, but
    -- 'requires_admin' is outside the active set, so his row must stop claiming
    -- a job the rest of the system no longer counts him as holding. This is the
    -- branch that would have retired a real driver mid-shift, silently.
    perform sync_driver_availability(r.driver_id);
    perform log_delivery_event(r.id, 'system', null, 'delivery.requires_admin',
                               r.status, 'requires_admin',
                               'no delivery within the window; package is with the driver');
    -- M117: the package is IN HIS BAG. This is the id that must never again be
    -- described to the owner as "no driver found".
    v_package_ids := v_package_ids || r.id;
    v_admin := v_admin + 1;
  end loop;

  -- The ids travel back so the cron worker can do what SQL cannot: reach a
  -- phone. Counts alone would leave the worker guessing who to notify.
  return jsonb_build_object(
    'reoffered', v_reoffered, 'released', v_released, 'needsAdmin', v_admin,
    'reofferedIds', to_jsonb(v_reoffer_ids),
    'releasedIds', to_jsonb(v_released_ids),
    -- M117: what actually happened, one key per situation.
    'noDriverIds', to_jsonb(v_no_driver_ids),
    'notCollectedIds', to_jsonb(v_not_collected_ids),
    'packageWithDriverIds', to_jsonb(v_package_ids),
    -- LEGACY, for the deploy window only. Loop 1 appends before loop 3 runs, so
    -- this concatenation is element-for-element what v_stranded_ids held.
    'strandedIds', to_jsonb(v_no_driver_ids || v_package_ids));
end;
$function$;

do $$
declare v jsonb; v_n integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sweep_delivery_escalations';
  if v_n <> 1 then raise exception 'sweep_delivery_escalations has % overloads', v_n; end if;

  -- plpgsql bodies are not resolved until first CALL. All three loops match
  -- zero rows right now (verified before applying), so this exercises the body
  -- without moving a single delivery.
  v := sweep_delivery_escalations();

  if not (v ? 'noDriverIds' and v ? 'notCollectedIds' and v ? 'packageWithDriverIds') then
    raise exception 'the split keys are missing from the return: %', v;
  end if;
  if not (v ? 'strandedIds' and v ? 'reofferedIds' and v ? 'releasedIds') then
    raise exception 'an existing key was dropped — an un-upgraded app would go silent: %', v;
  end if;
  if (v->>'reoffered')::int <> 0 or (v->>'released')::int <> 0 or (v->>'needsAdmin')::int <> 0 then
    raise exception 'the sweep changed data during verification: %', v;
  end if;

  -- The legacy key must be exactly the union of the two stranding kinds, or an
  -- app mid-deploy sends the wrong number of alerts.
  if (v->'strandedIds') <> ((v->'noDriverIds') || (v->'packageWithDriverIds')) then
    raise exception 'strandedIds is not the union of the two stranding kinds: %', v;
  end if;

  raise notice 'M117 verified: three situations, three arrays, legacy union intact.';
end $$;
