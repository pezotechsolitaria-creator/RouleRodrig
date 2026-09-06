-- create_delivery_request, carrying both halves of the errand work.
--
-- It is the ONLY function in this database that switches on the kind literal —
-- every other RPC (driver_open_requests, offer_delivery_quote,
-- accept_delivery_quote, the admin board) carries `kind` through as data.
-- Verified with pg_get_functiondef across all of public before touching
-- anything, which is why the errand feature is a handful of migrations and not
-- a sweep.
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
  p_errand_kind text default null
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

  -- ── The errand's own question ──────────────────────────────────────────
  -- An errand is asked what KIND of errand it is, not what kind of object is
  -- being carried — there is often no object. The two are kept strictly apart:
  -- a non-errand may not carry one at all.
  if p_kind = 'errand' then
    if v_errand is null then
      raise exception 'Choose what kind of errand this is.' using errcode = 'P0001';
    end if;
    if v_errand not in ('pay_bill','queue','collect','gas','other') then
      raise exception 'Choose what kind of errand this is.' using errcode = 'P0001';
    end if;
  elsif v_errand is not null then
    raise exception 'Only a "do it for me" request has an errand type.' using errcode = 'P0001';
  end if;

  v_win := compute_delivery_window(v_sched, v_slot, p_needed_date);

  -- ── The budget, per kind ───────────────────────────────────────────────
  -- Mirrors delivery_requests_budget_shape, in words a person can act on. The
  -- CHECK is the authority; this exists so the answer arrives beside the field
  -- instead of as a 23514.
  if p_kind = 'shop_and_deliver' and coalesce(p_max_budget, 0) <= 0 then
    raise exception 'Set the most we may spend on the item.' using errcode = 'P0001';
  end if;
  if p_kind = 'package' and p_max_budget is not null then
    raise exception 'A collection has nothing to buy, so it takes no budget.' using errcode = 'P0001';
  end if;
  -- An errand may cost nothing (queue at the bank) or cost money (pay a bill).
  -- Both are ordinary, so the budget is optional — but a ZERO ceiling is not a
  -- third meaning, it is a mistake. Sent to the board it would read to a driver
  -- as "spend up to Rs 0", and they would decline a job that was fundable.
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
    errand_kind
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
    v_errand
  ) returning id into v_id;

  return v_id;
end;
$function$;
