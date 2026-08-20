-- ══════════════════════════════════════════════════════════════════════════
-- M131 — a new driver gets a fresh PIN, not the last one's burnt attempts
-- ══════════════════════════════════════════════════════════════════════════
--
-- complete_delivery_with_pin locks a driver out after five wrong codes:
--
--     if v_d.pin_attempts >= 5 then
--       raise exception using errcode = 'RR087',
--         message = 'Too many wrong codes. Contact the office to complete this delivery.';
--
-- That is correct as a brute-force guard on a four-digit PIN. What was missing
-- is that pin_attempts is NEVER RESET — verified across every plpgsql and sql
-- body in the schema: only complete_delivery_with_pin writes it, and only
-- upward. driver_dashboard reads it. Nothing anywhere sets it back to zero.
--
-- ── WHAT THAT COSTS ───────────────────────────────────────────────────────
-- A delivery whose first driver burnt five attempts — bad light, a customer
-- reading the wrong number off a screen, a fat thumb — carries the lockout with
-- it. The owner reassigns to somebody else, and the NEW driver arrives at the
-- door already locked out. He has done nothing wrong, the customer is standing
-- in front of him with the right code, and the button raises RR087. The only
-- way out is the owner forcing the status by hand.
--
-- ── THE RULE: CUSTODY, NOT REASSIGNMENT ───────────────────────────────────
-- The reset belongs exactly where the package changes hands, and nowhere else:
--
--   admin_reassign_delivery          the driver is released, a new one will
--                                    collect it -> reset
--   driver_cannot_complete, BEFORE   the package never left the shop and the
--   pickup (v_after false)           delivery goes back to searching -> reset
--
--   driver_cannot_complete, AFTER    the SAME driver still physically holds it
--   pickup (v_after true)            and the row keeps his driver_id -> NO
--                                    reset. Custody has not changed; clearing
--                                    his attempts would just hand the same man
--                                    five more guesses at the same door.
--
-- ── AND THE PIN ITSELF IS RE-MINTED ───────────────────────────────────────
-- Not only the counter. The old driver knows the code, and a delivery that
-- changes hands should not leave a working code with somebody who no longer has
-- the package. Safe to rotate because the customer reads it live —
-- delivery_view_for_customer returns `pin` on every load, so their page shows
-- the current one with nothing to re-send.
--
-- ── ONE MINTER ────────────────────────────────────────────────────────────
-- Extracted verbatim from create_delivery_for_order rather than re-derived, so
-- the two cannot drift into producing different shapes. It carries a wider
-- search_path than its callers because gen_random_bytes lives in `extensions`,
-- which is exactly what create_delivery_for_order already does.

create or replace function public.mint_delivery_pin()
returns text
language plpgsql volatile security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare v_rand bigint;
begin
  v_rand := (get_byte(gen_random_bytes(4), 0)::bigint << 24)
          | (get_byte(gen_random_bytes(4), 1)::bigint << 16)
          | (get_byte(gen_random_bytes(4), 2)::bigint << 8)
          |  get_byte(gen_random_bytes(4), 3)::bigint;
  return lpad((v_rand % 10000)::text, 4, '0');
end;
$function$;

comment on function public.mint_delivery_pin() is
  'A fresh four-digit delivery PIN, minted exactly as create_delivery_for_order does. Used when a delivery changes hands: the outgoing driver already knows the old code.';

revoke all on function public.mint_delivery_pin() from public, anon, authenticated;
grant execute on function public.mint_delivery_pin() to service_role;

-- ── 1 · reassignment is a change of custody ───────────────────────────────
create or replace function public.admin_reassign_delivery(p_delivery_id uuid, p_force boolean default false, p_note text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_d      deliveries%rowtype;
  v_after  boolean;
  v_old    uuid;
  v_set    delivery_settings%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_set from delivery_settings where id = 'main';

  v_after := v_d.status in ('picked_up','out_for_delivery','arrived','requires_admin');
  if v_after and not coalesce(p_force, false) then
    raise exception using errcode = 'RR091',
      message = 'This driver already has the package. Confirm where it is before reassigning — the new driver cannot collect it from the shop.';
  end if;

  v_old := v_d.driver_id;

  update deliveries
     set driver_id = null,
         status = 'searching_driver',
         reassignment_count = reassignment_count + 1,
         admin_note = coalesce(p_note, admin_note),
         offer_expires_at = now() + make_interval(mins => v_set.accept_window_minutes),
         pickup_due_at = null, delivery_due_at = null,
         -- M131 · The package is changing hands. A new driver must not inherit
         -- the last one's burnt attempts and arrive at the door already locked
         -- out, and the outgoing driver must not keep a working code for a
         -- delivery he no longer has. The customer reads the PIN live, so
         -- rotating it costs nothing.
         pin = public.mint_delivery_pin(),
         pin_attempts = 0
   where id = p_delivery_id;

  -- Old offers are dead; a stale card in someone's app that 409s on tap is
  -- worse than no card.
  update delivery_offers set status = 'withdrawn', responded_at = now()
   where delivery_id = p_delivery_id and status in ('offered','accepted');

  -- M116: sync_driver_availability is null-safe, so the `if v_old is not null`
  -- wrapper is gone rather than duplicated.
  perform sync_driver_availability(v_old);

  perform log_delivery_event(p_delivery_id, 'admin', auth.uid(), 'delivery.reassigned',
                             v_d.status, 'searching_driver', p_note,
                             jsonb_build_object('previousDriver', v_old, 'forced', coalesce(p_force,false)));
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'delivery.reassign', 'delivery', p_delivery_id::text,
          jsonb_build_object('from', v_d.status, 'previousDriver', v_old,
                             'forced', coalesce(p_force,false), 'note', p_note));

  perform offer_delivery(p_delivery_id);
  return jsonb_build_object('ok', true, 'status', 'searching_driver');
end;
$function$;

-- ── 2 · giving up BEFORE pickup is a change of custody; after it is not ────
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
         -- M131 · Only when custody actually changes. Before pickup the package
         -- never left the shop and the delivery goes back out to somebody else,
         -- so the next driver starts clean. AFTER pickup this same man still
         -- physically holds it — the row keeps his driver_id — so clearing his
         -- attempts would just hand him five more guesses at the same door.
         pin = case when v_after then pin else public.mint_delivery_pin() end,
         pin_attempts = case when v_after then pin_attempts else 0 end
   where id = p_delivery_id;

  perform sync_driver_availability(v_driver.id);
  update driver_metrics
     set driver_cancellations = driver_cancellations + 1, updated_at = now()
   where driver_id = v_driver.id;
  update delivery_offers set status = 'withdrawn'
   where delivery_id = p_delivery_id and status = 'offered';

  perform log_delivery_event(p_delivery_id, 'driver', auth.uid(), 'delivery.driver_cannot_complete',
                             v_d.status, v_to, p_reason,
                             jsonb_build_object('afterPickup', v_after, 'note', p_note));

  return jsonb_build_object('ok', true, 'status', v_to, 'afterPickup', v_after);
end;
$function$;

-- ── VERIFICATION ──────────────────────────────────────────────────────────
do $$
declare
  v_n integer; v_pin text; v_pin2 text;
begin
  for v_n in
    select 1 from (values ('mint_delivery_pin'),('admin_reassign_delivery'),('driver_cannot_complete')) t(nm)
     where (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname = t.nm) <> 1
  loop
    raise exception 'M131: a function has the wrong number of overloads';
  end loop;

  if has_function_privilege('anon', 'public.mint_delivery_pin()', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.mint_delivery_pin()', 'EXECUTE') then
    raise exception 'M131: mint_delivery_pin is EXECUTE-able by a client role';
  end if;

  -- A plpgsql body is not checked until it is called, and this one reaches into
  -- another schema for gen_random_bytes.
  v_pin := public.mint_delivery_pin();
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'M131: minted PIN "%" is not four digits', v_pin;
  end if;
  v_pin2 := public.mint_delivery_pin();
  if v_pin2 !~ '^[0-9]{4}$' then
    raise exception 'M131: the second minted PIN is malformed';
  end if;

  -- The rule itself, asserted against the deployed source rather than by
  -- driving a whole delivery through dispatch: reassignment always resets, and
  -- giving up resets ONLY on the pre-pickup branch.
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='admin_reassign_delivery') !~ 'pin_attempts = 0' then
    raise exception 'M131: reassignment does not reset pin_attempts';
  end if;
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='driver_cannot_complete')
     !~ 'pin_attempts = case when v_after then pin_attempts else 0 end' then
    raise exception 'M131: giving up does not reset pin_attempts on the pre-pickup branch only';
  end if;

  -- And the lockout it exists to relieve is still there.
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='complete_delivery_with_pin') !~ 'pin_attempts >= 5' then
    raise exception 'M131: the five-attempt lockout has gone — the reset now guards nothing';
  end if;

  raise notice 'M131 verified: custody changes hands with a clean PIN.';
end $$;
