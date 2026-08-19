-- ══════════════════════════════════════════════════════════════════════════
-- M115 — an invited driver gets a metrics row, like an applying one always has
-- ══════════════════════════════════════════════════════════════════════════
--
-- Applied to production as m115_invited_drivers_get_metrics.
--
-- ── THE BUG ───────────────────────────────────────────────────────────────
-- There are two ways to become a delivery driver, and only one was complete:
--
--   apply_as_driver()      inserts delivery_drivers  AND driver_metrics
--   admin_invite_driver()  inserts delivery_drivers  and nothing else
--
-- driver_metrics is where reliability lives, and every writer to it is an
-- UPDATE:
--
--   offer_delivery                update ... offers_received + 1
--   accept_delivery               update ... offers_accepted + 1
--   complete_delivery_with_pin    update ... deliveries_completed + 1
--   driver_cannot_complete, sweep_delivery_escalations
--
-- An UPDATE against a row that does not exist is NOT an error. It matches
-- nothing and returns quietly. So an invited driver's counters stayed at zero
-- for ever, and dispatch_candidates reads:
--
--   when coalesce(m.offers_received, 0) = 0 then 0.70   -- "unproven"
--
-- An admin-invited driver was therefore permanently unproven: the ranking
-- engine could never learn they were reliable, and could never notice they were
-- not. Their driver_dashboard totals stayed blank too.
--
-- This matters more than it looks, because /admin/people IS the onboarding
-- desk — inviting is how the owner adds everybody. apply_as_driver, the path
-- that worked, is the one almost nobody uses.
--
-- Found while creating the first delivery driver for a live tracking test: the
-- new row had no metrics row and nothing had gone wrong to say so.
create or replace function public.admin_invite_driver(
  p_email text, p_full_name text, p_phone text, p_vehicle_type text,
  p_vehicle_details text default null, p_zone_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_email text; v_d record;
begin
  v_email := lower(btrim(coalesce(p_email,'')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode='RR005', message='That email address is not valid.'; end if;
  if coalesce(btrim(p_full_name),'') = '' then
    raise exception using errcode='RR005', message='A name is required.'; end if;
  if coalesce(btrim(p_phone),'') = '' then
    raise exception using errcode='RR005', message='A phone number is required.'; end if;
  if coalesce(btrim(p_vehicle_type),'') = '' then
    raise exception using errcode='RR005', message='A vehicle type is required.'; end if;

  select d.* into v_d from delivery_drivers d
   where lower(d.invite_email) = v_email
      or d.user_id in (select u.id from auth.users u where lower(u.email) = v_email)
   limit 1;
  if found then
    -- Idempotent, and now self-healing: a driver invited before this migration
    -- gets their missing metrics row the next time somebody re-invites them.
    insert into driver_metrics (driver_id) values (v_d.id) on conflict do nothing;
    return jsonb_build_object('driverId', v_d.id, 'created', false,
                              'claimed', v_d.user_id is not null, 'status', v_d.status);
  end if;

  insert into delivery_drivers (user_id, invite_email, invited_at, invited_by,
                                full_name, phone, vehicle_type, vehicle_details,
                                service_zone_ids, status, availability)
  values (null, v_email, now(), 'admin-session',
          btrim(p_full_name), btrim(p_phone), btrim(p_vehicle_type),
          nullif(btrim(p_vehicle_details),''), coalesce(p_zone_ids,'{}'),
          'pending', 'offline')
  returning * into v_d;

  -- THE FIX. Exactly what apply_as_driver has always done.
  insert into driver_metrics (driver_id) values (v_d.id) on conflict do nothing;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'admin-session', 'driver.invited', 'driver', v_d.id::text,
          jsonb_build_object('email', v_email, 'name', v_d.full_name, 'vehicle', v_d.vehicle_type));

  return jsonb_build_object('driverId', v_d.id, 'created', true, 'claimed', false, 'status', v_d.status);
end $function$;

revoke all on function public.admin_invite_driver(text, text, text, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_invite_driver(text, text, text, text, text, uuid[]) to service_role;

-- Backfill anybody already invited without one. Harmless where a row exists.
insert into driver_metrics (driver_id)
select d.id from delivery_drivers d
 where not exists (select 1 from driver_metrics m where m.driver_id = d.id)
on conflict do nothing;

do $$
declare v_missing integer; v_n integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='admin_invite_driver';
  if v_n <> 1 then raise exception 'admin_invite_driver has % overloads', v_n; end if;

  select count(*) into v_missing
    from delivery_drivers d
   where not exists (select 1 from driver_metrics m where m.driver_id = d.id);
  if v_missing > 0 then
    raise exception '% driver(s) still have no metrics row', v_missing;
  end if;

  -- The body must execute, and re-inviting an existing driver must stay
  -- idempotent rather than erroring or duplicating.
  if exists (select 1 from delivery_drivers where invite_email is not null) then
    perform admin_invite_driver(
      (select invite_email from delivery_drivers where invite_email is not null limit 1),
      'ignored', '+23050000000', 'car');
  end if;

  if has_function_privilege('anon', 'public.admin_invite_driver(text,text,text,text,text,uuid[])', 'EXECUTE') then
    raise exception 'SECURITY: admin_invite_driver is anon-callable';
  end if;
  raise notice 'M115 verified: every delivery driver has a metrics row.';
end $$;
