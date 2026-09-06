-- The posting RPC and the driver's console learn about the car.
--
-- ── THE DROP AT THE BOTTOM IS NOT OPTIONAL ─────────────────────────────────
-- create_delivery_request gains two defaulted parameters, which CHANGES ITS
-- SIGNATURE — so `create or replace` makes a second function and leaves the old
-- one live. Two overloads make PostgREST refuse the endpoint outright with
-- PGRST203, for every kind of request and not only for car jobs. This is the
-- third time the pattern has come up in this feature; it has bitten once
-- already, on the errand_kind change.
create or replace function public.create_delivery_request(
  p_kind text, p_what text, p_pickup_text text, p_dropoff_text text,
  p_contact_name text, p_contact_phone text,
  p_size_class text default 'standard', p_max_budget integer default null,
  p_pickup_note text default null, p_dropoff_note text default null,
  p_pickup_lat double precision default null, p_pickup_lng double precision default null,
  p_dropoff_lat double precision default null, p_dropoff_lng double precision default null,
  p_guest_email text default null, p_photo_url text default null,
  p_cargo_kind text default 'general', p_schedule_kind text default 'asap',
  p_time_slot text default 'any', p_needed_date date default null,
  p_errand_kind text default null,
  p_vehicle_plate text default null, p_vehicle_desc text default null
) returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_open  integer;
  v_id    uuid;
  v_cargo text := coalesce(nullif(btrim(p_cargo_kind), ''), 'general');
  v_sched text := coalesce(nullif(btrim(p_schedule_kind), ''), 'asap');
  v_slot  text := coalesce(nullif(btrim(p_time_slot), ''), 'any');
  v_errand text := nullif(btrim(coalesce(p_errand_kind, '')), '');
  v_plate  text := nullif(btrim(upper(coalesce(p_vehicle_plate, ''))), '');
  v_win   tstzrange;
begin
  if v_uid is not null then
    v_email := null;
  else
    v_email := nullif(btrim(lower(coalesce(p_guest_email, ''))), '');
    if v_email is null then
      raise exception 'Enter your email so we can send you the quotes.' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(p_kind,'') not in ('package','shop_and_deliver','errand') then
    raise exception 'Choose whether we are collecting something, buying it, or doing it for you.'
      using errcode = 'P0001';
  end if;
  if v_cargo not in ('general','food','fragile','heavy') then
    raise exception 'Choose what kind of thing it is.' using errcode = 'P0001';
  end if;

  if p_kind = 'errand' then
    if v_errand is null then
      raise exception 'Choose what kind of errand this is.' using errcode = 'P0001';
    end if;
    if v_errand not in ('pay_bill','queue','collect','gas','vehicle','other') then
      raise exception 'Choose what kind of errand this is.' using errcode = 'P0001';
    end if;
  elsif v_errand is not null then
    raise exception 'Only a "do it for me" request has an errand type.' using errcode = 'P0001';
  end if;

  -- ── The car ────────────────────────────────────────────────────────────
  -- A collection with no plate cannot be proved afterwards, and the whole
  -- point of a custody trail is that it settles an argument.
  if v_errand = 'vehicle' and v_plate is null then
    raise exception 'Give the car''s number plate.' using errcode = 'P0001';
  end if;
  if v_errand is distinct from 'vehicle' and v_plate is not null then
    raise exception 'Only a car collection carries a number plate.' using errcode = 'P0001';
  end if;

  v_win := compute_delivery_window(v_sched, v_slot, p_needed_date);

  if p_kind = 'shop_and_deliver' and coalesce(p_max_budget, 0) <= 0 then
    raise exception 'Set the most we may spend on the item.' using errcode = 'P0001';
  end if;
  if p_kind = 'package' and p_max_budget is not null then
    raise exception 'A collection has nothing to buy, so it takes no budget.' using errcode = 'P0001';
  end if;
  if p_kind = 'errand' and p_max_budget is not null and p_max_budget <= 0 then
    raise exception 'Either leave the spending limit empty, or set a real amount.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_open from delivery_requests
   where status = 'open'
     and ((v_uid is not null and customer_id = v_uid)
       or (v_uid is null and guest_email = v_email));
  if v_open >= 5 then
    raise exception 'You already have 5 requests waiting for quotes.' using errcode = 'P0001';
  end if;

  insert into delivery_requests (
    kind, what, pickup_text, pickup_note, pickup_lat, pickup_lng,
    dropoff_text, dropoff_note, dropoff_lat, dropoff_lng,
    size_class, cargo_kind, max_budget, customer_id, guest_email,
    contact_name, contact_phone, photo_url,
    schedule_kind, time_slot, window_start, window_end, expires_at,
    errand_kind, vehicle_plate, vehicle_desc
  ) values (
    p_kind, btrim(p_what), btrim(p_pickup_text), nullif(btrim(coalesce(p_pickup_note,'')),''),
    p_pickup_lat, p_pickup_lng,
    btrim(p_dropoff_text), nullif(btrim(coalesce(p_dropoff_note,'')),''),
    p_dropoff_lat, p_dropoff_lng,
    coalesce(nullif(p_size_class,''), 'standard'), v_cargo, p_max_budget, v_uid, v_email,
    btrim(p_contact_name), btrim(p_contact_phone),
    nullif(btrim(coalesce(p_photo_url, '')), ''),
    v_sched, v_slot, lower(v_win), upper(v_win),
    greatest(upper(v_win), now() + interval '2 hours'),
    v_errand, v_plate, nullif(btrim(coalesce(p_vehicle_desc, '')), '')
  ) returning id into v_id;

  return v_id;
end;
$function$;

drop function if exists public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision,
  text, text, text, text, text, date, text
);

-- ── The driver's active job learns it is a CAR ─────────────────────────────
--
-- Patched in place rather than retyped: driver_dashboard is long, owned by
-- earlier work, and transcribing a body by hand to add five fields is how a
-- subtle difference gets introduced into something nobody re-reads. Idempotent.
--
-- `nextHandover` is DERIVED from the two custody rows, never stored — the same
-- rule the admin board reads. A status somebody sets by hand would be a second
-- version of the truth, and this is the one place where the two disagreeing
-- means an argument about somebody's car.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='driver_dashboard';
  if v_def is null then raise exception 'driver_dashboard missing'; end if;

  if position('nextHandover' in v_def) = 0 then
    v_def := replace(
      v_def,
      E'               ''requestKind'', r.kind,\n',
      E'               ''requestKind'', r.kind,\n'
      || E'               ''errandKind'', r.errand_kind,\n'
      || E'               ''vehiclePlate'', r.vehicle_plate,\n'
      || E'               ''vehicleDesc'', r.vehicle_desc,\n'
      || E'               ''nextHandover'', case\n'
      || E'                  when r.errand_kind is distinct from ''vehicle'' then null\n'
      || E'                  when not exists (select 1 from vehicle_custody_events e\n'
      || E'                                    where e.request_id = r.id and e.event = ''collected'')\n'
      || E'                    then ''collected''\n'
      || E'                  when not exists (select 1 from vehicle_custody_events e\n'
      || E'                                    where e.request_id = r.id and e.event = ''returned'')\n'
      || E'                    then ''returned''\n'
      || E'                  else null end,\n'
    );
    if position('nextHandover' in v_def) = 0 then
      raise exception 'anchor not found — refusing to rewrite blind';
    end if;
  end if;

  -- Custody rows hang off the REQUEST, not the delivery, so the handover
  -- control has nothing to post against without this. The payload already knew
  -- request_id well enough to derive jobKind from it; it never said it aloud.
  if position('''requestId''' in v_def) = 0 then
    v_def := replace(
      v_def,
      E'               ''requestKind'', r.kind,\n',
      E'               ''requestId'', r.id,\n               ''requestKind'', r.kind,\n'
    );
    if position('''requestId''' in v_def) = 0 then
      raise exception 'anchor not found — refusing to rewrite blind';
    end if;
  end if;

  execute v_def;
end $$;
