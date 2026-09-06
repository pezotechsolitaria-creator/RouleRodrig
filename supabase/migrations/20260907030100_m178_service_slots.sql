-- ── When can I bring the car in? ───────────────────────────────────────────
--
-- Two functions: one that answers that question, and one that takes the answer
-- and writes it down. They share every rule, and they must — a slot finder that
-- offers a time the booker then refuses is worse than no slot finder.

-- ── The offer ──────────────────────────────────────────────────────────────
create or replace function public.service_slots(
  p_store_id uuid,
  p_variant_id uuid default null,
  p_now timestamptz default now()
) returns table (
  slot_date date,
  slot_time time,
  starts_at timestamptz,
  reason text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_zone constant text := 'Indian/Mauritius';
  v_tp trade_providers%rowtype;
  v_width interval;
  v_minutes integer;
  v_earliest timestamp;
  v_now_local timestamp;
  v_d integer; v_date date; v_sch record;
  v_open timestamp; v_close timestamp; v_cursor timestamp; v_floor timestamp;
  v_emitted integer; v_taken integer;
  v_start timestamptz; v_end timestamptz;
begin
  select * into v_tp from trade_providers where store_id = p_store_id;
  if not found then return; end if;              -- not a trade

  v_width := make_interval(mins => v_tp.slot_minutes);

  -- How long THIS service takes. Absent means the provider has not said, so one
  -- slot — an honest default rather than a guess at a duration.
  select minutes into v_minutes from service_durations where variant_id = p_variant_id;
  v_minutes := coalesce(v_minutes, v_tp.slot_minutes);

  v_now_local := (p_now at time zone v_zone);
  v_earliest  := v_now_local + make_interval(hours => v_tp.lead_hours);

  -- booking_days is shown to the provider as "how far ahead people can book",
  -- so fourteen must mean fourteen dates. `0..booking_days` is fifteen.
  for v_d in 0..(v_tp.booking_days - 1) loop
    v_date := v_now_local::date + v_d;
    v_emitted := 0;

    select * into v_sch from store_schedule_at(p_store_id, (v_date + time '00:00')::timestamp);

    if not v_sch.has_schedule then
      return query select v_date, null::time, null::timestamptz, 'no_hours'::text;
      continue;
    end if;
    if v_sch.is_closed or v_sch.opens_at is null or v_sch.closes_at is null then
      return query select v_date, null::time, null::timestamptz, 'closed'::text;
      continue;
    end if;

    v_open  := v_date + v_sch.opens_at;
    v_close := v_date + v_sch.closes_at;

    v_floor  := greatest(v_open, v_earliest);
    -- Snap up to the next slot boundary so the diary reads 09:00, 09:30 rather
    -- than 09:07.
    v_cursor := v_open + (ceil(extract(epoch from (v_floor - v_open))
                               / extract(epoch from v_width))::int) * v_width;
    if v_cursor < v_open then v_cursor := v_open; end if;

    -- THE WHOLE JOB MUST FIT BEFORE CLOSING. A three-hour detail cannot start
    -- an hour before the gate shuts, and offering it would be a booking the
    -- provider has to ring back and cancel.
    while v_cursor + make_interval(mins => v_minutes) <= v_close loop
      v_start := (v_cursor at time zone v_zone);
      v_end   := ((v_cursor + make_interval(mins => v_minutes)) at time zone v_zone);

      select count(*) into v_taken
        from service_bookings b
       where b.store_id = p_store_id
         and b.status = 'booked'
         -- Overlap, not equality: a job occupies every slot it runs through.
         and b.starts_at < v_end
         and b.ends_at   > v_start;

      if v_taken < v_tp.concurrent_jobs then
        return query select v_date, v_cursor::time, v_start, null::text;
        v_emitted := v_emitted + 1;
      end if;

      v_cursor := v_cursor + v_width;
    end loop;

    -- A day that produced nothing still owes the customer a sentence.
    if v_emitted = 0 then
      return query select v_date, null::time, null::timestamptz, 'full'::text;
    end if;
  end loop;
end $function$;

revoke all on function public.service_slots(uuid, uuid, timestamptz) from public;
-- Readable by anyone: a customer deciding whether to walk over needs this
-- before they have an account.
grant execute on function public.service_slots(uuid, uuid, timestamptz) to anon, authenticated;

-- ── Writing it down ────────────────────────────────────────────────────────
create or replace function public.book_service_slot(
  p_store_id uuid,
  p_variant_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_note text default null,
  p_source text default 'provider'
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tp trade_providers%rowtype;
  v_minutes integer;
  v_name text;
  v_end timestamptz;
  v_taken integer;
  v_id uuid;
  v_sch record;
  v_local timestamp;
begin
  -- Locked for the duration: this is the serialisation point for the whole
  -- store's diary.
  select * into v_tp from trade_providers where store_id = p_store_id for update;
  if not found then
    raise exception 'That business does not take bookings.' using errcode = 'P0001';
  end if;
  if not (is_store_staff(p_store_id) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if coalesce(btrim(p_customer_name), '') = '' then
    raise exception 'Who is the booking for?' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_customer_phone), '') = '' then
    raise exception 'A phone number, so they can be reached if anything changes.'
      using errcode = 'P0001';
  end if;

  select sd.minutes, pv.name into v_minutes, v_name
    from product_variants pv
    left join service_durations sd on sd.variant_id = pv.id
   where pv.id = p_variant_id;
  if v_name is null then
    raise exception 'Choose which service this is.' using errcode = 'P0001';
  end if;
  v_minutes := coalesce(v_minutes, v_tp.slot_minutes);
  v_end := p_starts_at + make_interval(mins => v_minutes);

  if p_starts_at < now() then
    raise exception 'That time has already passed.' using errcode = 'P0001';
  end if;

  -- Inside opening hours, checked against the same schedule the storefront
  -- reads — a diary that accepts a booking for a day the shop is shut is worse
  -- than one that refuses honestly.
  v_local := (p_starts_at at time zone 'Indian/Mauritius');
  select * into v_sch from store_schedule_at(p_store_id, date_trunc('day', v_local));
  if not v_sch.has_schedule or v_sch.is_closed then
    raise exception 'They are closed that day.' using errcode = 'P0001';
  end if;
  if v_local::time < v_sch.opens_at
     or (v_local + make_interval(mins => v_minutes))::time > v_sch.closes_at then
    raise exception 'That does not fit inside their opening hours.' using errcode = 'P0001';
  end if;

  select count(*) into v_taken
    from service_bookings b
   where b.store_id = p_store_id
     and b.status = 'booked'
     and b.starts_at < v_end
     and b.ends_at   > p_starts_at;

  if v_taken >= v_tp.concurrent_jobs then
    raise exception 'That time was just taken. Choose another.' using errcode = 'P0001';
  end if;

  insert into service_bookings
    (store_id, variant_id, service_name, starts_at, ends_at,
     customer_name, customer_phone, note, source, created_by)
  values
    (p_store_id, p_variant_id, v_name, p_starts_at, v_end,
     btrim(p_customer_name), btrim(p_customer_phone),
     nullif(btrim(coalesce(p_note, '')), ''),
     case when p_source in ('provider','customer','admin') then p_source else 'provider' end,
     auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
                            'startsAt', p_starts_at, 'endsAt', v_end,
                            'minutes', v_minutes);
end $function$;

revoke all on function public.book_service_slot(uuid, uuid, timestamptz, text, text, text, text)
  from public, anon;
grant execute on function public.book_service_slot(uuid, uuid, timestamptz, text, text, text, text)
  to authenticated;
