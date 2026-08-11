-- M60d — the audit trigger fired too early to audit anything.
--
-- M60 registered one BEFORE INSERT OR UPDATE trigger, because it needed BEFORE
-- to set updated_at on NEW. But the same function also inserts the audit row,
-- and at BEFORE INSERT the agreement does not exist yet — so
-- managed_ticketing_events.agreement_id had nothing to point at and the FK
-- refused it. Every attempt by an organiser to request the service failed with
-- a foreign key violation.
--
-- Caught by the adversarial suite trying the ordinary happy path, which is the
-- argument for including "does the normal thing still work" in a security run:
-- the migration's own assertions all passed, because they only checked that
-- functions and policies existed.
--
-- Two triggers now, each at the only time it can work:
--   BEFORE UPDATE — stamp updated_at, which requires modifying NEW.
--   AFTER  INSERT OR UPDATE — write history, which requires the row to exist.

drop trigger if exists managed_ticketing_audit on managed_ticketing_agreements;

create or replace function public.stamp_managed_ticketing_updated()
returns trigger language plpgsql set search_path = public, pg_temp
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists managed_ticketing_touch on managed_ticketing_agreements;
create trigger managed_ticketing_touch
  before update on managed_ticketing_agreements
  for each row execute function stamp_managed_ticketing_updated();

create or replace function public.log_managed_ticketing_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_role text;
begin
  -- auth.uid() is NULL for the cookie-session admin panel, which reaches
  -- Postgres as service_role (M25). That is 'platform_admin' too, not 'system'.
  v_role := case
    when auth.uid() is null then 'platform_admin'
    when is_platform_admin() then 'platform_admin'
    else 'organizer' end;

  if TG_OP = 'INSERT' then
    insert into managed_ticketing_events (agreement_id, actor_id, actor_role, action, to_status, detail)
    values (new.id, auth.uid(), v_role, 'created', new.status,
            jsonb_build_object('storeId', new.store_id));
    return null;  -- AFTER trigger: the return value is ignored.
  end if;

  if new.status is distinct from old.status then
    insert into managed_ticketing_events (agreement_id, actor_id, actor_role, action, from_status, to_status, detail)
    values (new.id, auth.uid(), v_role, 'status_changed', old.status, new.status, '{}'::jsonb);
  end if;

  if new.fee_type is distinct from old.fee_type
     or new.fee_amount_cents is distinct from old.fee_amount_cents
     or new.fee_rate_e5 is distinct from old.fee_rate_e5
     or new.service_includes is distinct from old.service_includes then
    insert into managed_ticketing_events (agreement_id, actor_id, actor_role, action, from_status, to_status, detail)
    values (new.id, auth.uid(), v_role, 'fee_changed', old.status, new.status,
            jsonb_build_object(
              'from', jsonb_build_object('type', old.fee_type, 'amount', old.fee_amount_cents, 'rateE5', old.fee_rate_e5),
              'to',   jsonb_build_object('type', new.fee_type, 'amount', new.fee_amount_cents, 'rateE5', new.fee_rate_e5)));
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into managed_ticketing_events (agreement_id, actor_id, actor_role, action, from_status, to_status, detail)
    values (new.id, auth.uid(), v_role, 'payment_status_changed', old.status, new.status,
            jsonb_build_object('from', old.payment_status, 'to', new.payment_status,
                               'invoicedFeeCents', new.invoiced_fee_cents));
  end if;

  return null;
end;
$function$;

create trigger managed_ticketing_audit
  after insert or update on managed_ticketing_agreements
  for each row execute function log_managed_ticketing_change();

-- Prove it end to end rather than trusting the trigger definition: create an
-- agreement as an organiser, confirm the audit row lands, then remove both.
do $$
declare
  v_store uuid; v_uid uuid; v_j jsonb; v_id uuid; v_events int;
begin
  select a.store_id, o.user_id into v_store, v_uid
    from event_organizer_assignments a join event_organizers o on o.id=a.organizer_id
   where a.role='organizer' and o.status='active' and o.user_id is not null limit 1;
  if v_store is null then raise notice 'M60d: no organiser to probe with.'; return; end if;

  delete from managed_ticketing_agreements where store_id = v_store;

  perform set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  v_j := organizer_request_managed_ticketing(v_store, 'M60d probe');
  execute 'reset role';
  perform set_config('request.jwt.claims','', true);

  v_id := (v_j->>'id')::uuid;
  if v_id is null then raise exception 'M60d: request still fails.'; end if;

  select count(*) into v_events from managed_ticketing_events where agreement_id = v_id;
  if v_events < 1 then raise exception 'M60d: no audit row was written.'; end if;

  delete from managed_ticketing_agreements where id = v_id;
  raise notice 'M60d ok: request succeeded and wrote % audit row(s).', v_events;
end;
$$;
