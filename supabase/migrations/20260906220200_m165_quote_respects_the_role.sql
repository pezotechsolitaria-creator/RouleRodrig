-- THE GATE THAT MATTERS. driver_open_requests decides what a person is SHOWN;
-- offer_delivery_quote decides what they can actually take. Gating only the
-- first is a filter, not a rule — the request id appears in the URL of every
-- job the board has ever shown, and a POST with a stale id would let somebody
-- price work they are not signed up for. Checked in the same function that
-- already refuses on approval and on vehicle.
create or replace function public.offer_delivery_quote(
  p_request_id uuid, p_fee integer, p_note text default null
) returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d  delivery_drivers%rowtype;
  v_r  delivery_requests%rowtype;
  v_id uuid;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    raise exception 'Your driver account is not approved yet.' using errcode = 'P0001';
  end if;
  if p_fee is null or p_fee < 100 or p_fee > 5000000 then
    raise exception 'Enter a price between Rs 1 and Rs 50,000.' using errcode = 'P0001';
  end if;

  select * into v_r from delivery_requests where id = p_request_id for update;
  if not found then
    raise exception 'That request no longer exists.' using errcode = 'P0001';
  end if;
  if v_r.status <> 'open' then
    raise exception 'This request is no longer open.' using errcode = 'P0001';
  end if;
  if v_r.expires_at is not null and v_r.expires_at <= now() then
    raise exception 'This request has expired.' using errcode = 'P0001';
  end if;
  if v_r.window_end is not null and v_r.window_end <= now() then
    raise exception 'The time this was needed for has passed.' using errcode = 'P0001';
  end if;

  -- Signed up for this kind of work?
  if v_r.kind = 'errand' and not v_d.can_run_errands then
    raise exception 'You are not signed up for errands. Ask us to add them to your account.'
      using errcode = 'P0001';
  end if;
  if v_r.kind <> 'errand' and not v_d.can_deliver then
    raise exception 'You are signed up for errands only. Ask us to add deliveries to your account.'
      using errcode = 'P0001';
  end if;

  if not vehicle_can_handle(v_d.vehicle_type, v_r.size_class, 'general') then
    raise exception 'This is a large item and needs a car, van, pickup or lorry.'
      using errcode = 'P0001';
  end if;
  if not vehicle_can_handle(v_d.vehicle_type, v_r.size_class, v_r.cargo_kind) then
    raise exception 'This job is not a fit for your vehicle.' using errcode = 'P0001';
  end if;

  update delivery_quotes
     set fee = p_fee,
         note = nullif(btrim(coalesce(p_note, '')), ''),
         created_at = now(),
         expires_at = v_r.expires_at
   where request_id = v_r.id and driver_id = v_d.id and status = 'offered'
  returning id into v_id;

  if v_id is null then
    insert into delivery_quotes (request_id, driver_id, fee, note, status, expires_at)
    values (v_r.id, v_d.id, p_fee,
            nullif(btrim(coalesce(p_note, '')), ''), 'offered', v_r.expires_at)
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;
