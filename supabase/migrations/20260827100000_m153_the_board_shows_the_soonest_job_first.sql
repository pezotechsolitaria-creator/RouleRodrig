-- ── M153 — the board shows the soonest job first ───────────────────────────
--
-- The owner's report: "a request for tomorrow afternoon must appear higher than
-- a request for 25 December even if the December one was posted earlier."
--
-- It could not, and the reason was not the sort. `driver_open_requests()`
-- ordered by `createdAt` — the only time column the table had. M152 added
-- window_start; this is the migration that uses it.
--
-- ── THE SORT KEY IS "HOW SOON CAN THIS START", NOT "WHEN WAS IT BOOKED" ────
--
--     order by greatest(window_start, now()) asc,   -- soonest first
--              distance_km asc nulls last,           -- then nearest
--              created_at asc                        -- then longest waiting
--
-- `greatest(window_start, now())` rather than plain window_start, and the
-- difference is not cosmetic. A "today, morning" job has window_start 08:00. An
-- ASAP posted at 09:00 has window_start 09:00. Sorting on the raw column puts
-- the morning job first because 08:00 < 09:00 — but its window is ALREADY OPEN,
-- so the honest answer to "how soon can I start this" is "now" for both, and
-- they should be separated by distance instead. Clamping to now() says exactly
-- that: everything currently deliverable ties at the top and competes on
-- proximity; everything future queues behind it in time order.
--
-- ── WHY DISTANCE IS SECOND AND NOT WEIGHTED IN ────────────────────────────
-- A single blended score would let a very near December job outrank a far
-- tomorrow one, which is the exact failure being fixed. Time is a hard sort,
-- distance breaks its ties — and it breaks a LOT of them, because every "tomorrow
-- morning" request shares the same 08:00 window_start. This is a lexicographic
-- order, not a score, and that is deliberate.
--
-- ── ONE THING FROM THE BRIEF THAT IS NOT HERE ─────────────────────────────
-- The brief lists "driver rating" as a secondary ranking key for the job feed.
-- It cannot be one: the rating belongs to the DRIVER READING THE BOARD, so it
-- is the same number for every row and cannot order anything. It ranks drivers
-- for dispatch (it already does, in dispatch_candidates) and it ranks quotes for
-- the customer (it already does, in delivery_request_view). Adding it here would
-- be a term that multiplies every row by a constant.
--
-- Vehicle match is likewise not a ranking term — it is a hard gate, and has been
-- since M149. A job a driver cannot carry is not shown at all, which is stronger
-- and kinder than showing it lower down.

drop function if exists public.driver_open_requests();

create function public.driver_open_requests(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_d    delivery_drivers%rowtype;
  v_zone constant text := 'Indian/Mauritius';
  v_lat  double precision;
  v_lng  double precision;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    return '[]'::jsonb;
  end if;

  -- Where this driver last reported being. Null is normal — a driver who has
  -- never opened the app with location on — and must NOT drop them to the
  -- bottom of every list, so the ordering puts nulls last only within a tie.
  select l.lat, l.lng into v_lat, v_lng
    from driver_locations l
   where l.driver_kind = 'delivery' and l.driver_id = v_d.id;

  return (
    select coalesce(
             jsonb_agg(s.x order by s.ord_start, s.ord_km nulls last, s.ord_created),
             '[]'::jsonb)
    from (
      select
        jsonb_build_object(
          'id', r.id, 'kind', r.kind, 'what', r.what,
          'sizeClass', r.size_class,
          'cargoKind', r.cargo_kind,
          'pickupText', r.pickup_text, 'pickupNote', r.pickup_note,
          'dropoffText', r.dropoff_text, 'dropoffNote', r.dropoff_note,
          'spendCap', r.max_budget,
          'createdAt', r.created_at, 'expiresAt', r.expires_at,
          'photoPath', r.photo_url,
          -- M152. The driver needs the WINDOW, not just a "posted 2h ago".
          'scheduleKind', r.schedule_kind,
          'timeSlot', r.time_slot,
          'windowStart', r.window_start,
          'windowEnd', r.window_end,
          -- Already startable: the window is open right now.
          'startsNow', (r.window_start <= now()),
          'distanceKm', case
             when v_lat is null or r.pickup_lat is null then null
             else round((111.045 * sqrt(
                    power(r.pickup_lat - v_lat, 2)
                  + power((r.pickup_lng - v_lng) * cos(radians((r.pickup_lat + v_lat) / 2)), 2)
                 ))::numeric, 1)
           end,
          'offDuty', (v_d.availability = 'offline'),
          'quoteCount', (select count(*) from delivery_quotes q
                          where q.request_id = r.id and q.status = 'offered'),
          'myQuote', (select jsonb_build_object('id', q.id, 'fee', q.fee, 'note', q.note)
                        from delivery_quotes q
                       where q.request_id = r.id and q.driver_id = v_d.id
                         and q.status = 'offered')
        ) as x,
        greatest(r.window_start, now()) as ord_start,
        case
          when v_lat is null or r.pickup_lat is null then null
          else 111.045 * sqrt(
                 power(r.pickup_lat - v_lat, 2)
               + power((r.pickup_lng - v_lng) * cos(radians((r.pickup_lat + v_lat) / 2)), 2))
        end as ord_km,
        r.created_at as ord_created
      from delivery_requests r
      where r.status = 'open'
        and (r.expires_at is null or r.expires_at > now())
        -- A window that has closed is not a job any more, whatever the TTL says.
        and (r.window_end is null or r.window_end > now())
        and vehicle_can_handle(v_d.vehicle_type, r.size_class, r.cargo_kind)
        -- The optional filter. Compared on the LOCAL date, because a driver
        -- picking "tomorrow" means their tomorrow, not UTC's.
        and (p_from is null or (r.window_start at time zone v_zone)::date >= p_from)
        and (p_to   is null or (r.window_start at time zone v_zone)::date <= p_to)
        and (
          v_d.availability <> 'offline'
          or exists (select 1 from delivery_quotes q
                      where q.request_id = r.id and q.driver_id = v_d.id
                        and q.status = 'offered')
        )
    ) s
  );
end;
$fn$;

revoke all on function public.driver_open_requests(date, date) from public, anon, authenticated;
grant execute on function public.driver_open_requests(date, date) to authenticated;

-- ── A price is a promise about a time ──────────────────────────────────────
-- Quoting is how a driver says "I can do this, then". So the window is checked
-- at the moment the promise is made: a driver cannot quote on a job whose time
-- has already gone, even by calling the RPC directly. Without this the board
-- filter would be the only guard, and a filter is not a rule.
create or replace function public.offer_delivery_quote(
  p_request_id uuid, p_fee integer, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
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
$fn$;

revoke all on function public.offer_delivery_quote(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.offer_delivery_quote(uuid, integer, text) to authenticated;

-- ── Probes ─────────────────────────────────────────────────────────────────
do $assert$
declare
  v_soon uuid; v_late uuid; v_now uuid;
  v_ids  uuid[];
  v_zone constant text := 'Indian/Mauritius';
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'driver_open_requests') <> 1 then
    raise exception 'M153: driver_open_requests has an overload';
  end if;
  if has_function_privilege('anon','public.driver_open_requests(date, date)','execute') then
    raise exception 'M153: the board is reachable by anon';
  end if;

  -- ── THE OWNER'S EXAMPLE, asserted against the real ordering ────────────
  -- Three requests: one for Christmas posted FIRST, one for tomorrow posted
  -- second, one ASAP posted last. The old board returned them in exactly that
  -- order. The new one must not.
  insert into delivery_requests
    (kind, what, pickup_text, dropoff_text, contact_name, contact_phone,
     guest_email, schedule_kind, time_slot, window_start, window_end,
     expires_at, created_at)
  values
    ('package','Christmas hamper','Port Mathurin','Mont Lubin','A','+23050000001',
     'probe@example.com','date','any',
     (date '2026-12-25' + time '08:00') at time zone v_zone,
     (date '2026-12-25' + time '20:00') at time zone v_zone,
     now() + interval '90 days', now() - interval '3 hours')
  returning id into v_late;

  insert into delivery_requests
    (kind, what, pickup_text, dropoff_text, contact_name, contact_phone,
     guest_email, schedule_kind, time_slot, window_start, window_end,
     expires_at, created_at)
  values
    ('package','Box for tomorrow','Port Mathurin','Mont Lubin','B','+23050000002',
     'probe@example.com','tomorrow','afternoon',
     now() + interval '1 day', now() + interval '1 day' + interval '5 hours',
     now() + interval '2 days', now() - interval '2 hours')
  returning id into v_soon;

  insert into delivery_requests
    (kind, what, pickup_text, dropoff_text, contact_name, contact_phone,
     guest_email, schedule_kind, time_slot, window_start, window_end,
     expires_at, created_at)
  values
    ('package','Need it now','Port Mathurin','Mont Lubin','C','+23050000003',
     'probe@example.com','asap','any',
     now(), now() + interval '4 hours',
     now() + interval '4 hours', now() - interval '1 minute')
  returning id into v_now;

  -- Ordered the way the board orders, without needing a driver session.
  select array_agg(id order by greatest(window_start, now()), created_at)
    into v_ids
    from delivery_requests
   where guest_email = 'probe@example.com';

  if v_ids[1] <> v_now then
    raise exception 'M153: the ASAP job is not first';
  end if;
  if v_ids[2] <> v_soon then
    raise exception 'M153: tomorrow is not second';
  end if;
  if v_ids[3] <> v_late then
    raise exception 'M153: Christmas is not last — the whole point of this migration';
  end if;

  -- And the old key would have given the opposite, which is what was wrong.
  select array_agg(id order by created_at) into v_ids
    from delivery_requests where guest_email = 'probe@example.com';
  if v_ids[1] <> v_late then
    raise exception 'M153: the probe is not reproducing the old behaviour, so it proves nothing';
  end if;

  delete from delivery_requests where guest_email = 'probe@example.com';

  if (select count(*) from delivery_requests) <> 0 then
    raise exception 'M153: probe rows were left behind';
  end if;
end;
$assert$;
