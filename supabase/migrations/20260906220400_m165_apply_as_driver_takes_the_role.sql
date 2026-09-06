-- The application now carries what the person is signing up to do.
--
-- NOTE THE DROP AT THE BOTTOM. Adding defaulted parameters changes the
-- signature, so `create or replace` creates a SECOND function and leaves the
-- old one live — which is exactly the two-overload state that makes PostgREST
-- refuse the whole endpoint with PGRST203. It happened to
-- create_delivery_request one migration earlier; this one does not repeat it.
create or replace function public.apply_as_driver(
  p_full_name text, p_phone text, p_vehicle_type text,
  p_vehicle_details text default null, p_licence_reference text default null,
  p_service_zone_ids uuid[] default '{}'::uuid[], p_preferred_hours text default null,
  p_experience_note text default null, p_emergency_contact text default null,
  p_accept_terms boolean default false,
  p_can_deliver boolean default true, p_can_run_errands boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_phone text;
  v_id    uuid;
  v_status driver_status;
  v_deliver boolean := coalesce(p_can_deliver, false);
  v_errands boolean := coalesce(p_can_run_errands, false);
begin
  if v_uid is null then
    raise exception using errcode = 'RR080', message = 'Sign in to apply.';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception using errcode = 'RR089', message = 'You must accept the driver terms to apply.';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception using errcode = 'RR089', message = 'Please give your full name.';
  end if;

  -- Applying to do nothing is not an application. Guarded here as well as by
  -- delivery_drivers_does_something, so the answer is a sentence rather than a
  -- 23514 the form cannot show anybody.
  if not (v_deliver or v_errands) then
    raise exception using errcode = 'RR089',
      message = 'Choose at least one kind of work: deliveries, errands, or both.';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if left(v_phone, 1) <> '+' then v_phone := '+' || v_phone; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,15}$' then
    raise exception using errcode = 'RR089', message = 'Use your full number with country code, e.g. +230 5835 5588.';
  end if;

  select id, status into v_id, v_status from delivery_drivers where user_id = v_uid;

  -- A rejected or suspended driver cannot quietly re-apply their way back in.
  if v_status in ('rejected', 'suspended') then
    raise exception using errcode = 'RR090',
      message = 'Your application was not approved. Contact Roulé Rodrigues if you think this is wrong.';
  end if;

  if v_id is null then
    insert into delivery_drivers (user_id, full_name, phone, vehicle_type, vehicle_details,
                                  licence_reference, service_zone_ids, preferred_hours,
                                  experience_note, emergency_contact, terms_accepted_at, status,
                                  can_deliver, can_run_errands)
    values (v_uid, btrim(p_full_name), v_phone, coalesce(nullif(btrim(p_vehicle_type), ''), 'scooter'),
            p_vehicle_details, p_licence_reference, coalesce(p_service_zone_ids, '{}'),
            p_preferred_hours, p_experience_note, p_emergency_contact, now(), 'pending',
            v_deliver, v_errands)
    returning id into v_id;
    insert into driver_metrics (driver_id) values (v_id) on conflict do nothing;
  else
    update delivery_drivers
       set full_name = btrim(p_full_name), phone = v_phone,
           vehicle_type = coalesce(nullif(btrim(p_vehicle_type), ''), 'scooter'),
           vehicle_details = p_vehicle_details, licence_reference = p_licence_reference,
           service_zone_ids = coalesce(p_service_zone_ids, '{}'),
           preferred_hours = p_preferred_hours, experience_note = p_experience_note,
           emergency_contact = p_emergency_contact, terms_accepted_at = now(),
           can_deliver = v_deliver, can_run_errands = v_errands
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'driverId', v_id,
                            'status', coalesce(v_status, 'pending'));
end;
$function$;

drop function if exists public.apply_as_driver(
  text, text, text, text, text, uuid[], text, text, text, boolean
);
