-- ── Letting the customer book it themselves ────────────────────────────────
--
-- The owner: "now let customers book themselves from the storefront."
--
-- ── A DURATION IS WHAT MAKES A VARIANT BOOKABLE ────────────────────────────
-- m178 said an absent duration meant "the provider has not said, so one slot".
-- That was a reasonable default while only the provider could book. It stops
-- being reasonable the moment a stranger can, because a trade sells two kinds
-- of thing: a full valet, and a bottle of wax on the shelf beside it. Without a
-- marker, the wax appears in "what are they having done?" and the valet appears
-- in a shopping basket, and both are wrong.
--
-- service_durations IS the marker. Giving a service a length is the act that
-- says "this is booked time", and it is a thing a provider does naturally
-- rather than a second flag to remember.
alter table trade_providers
  -- Some trades will want the diary and not the public door — a mechanic who
  -- needs to hear what is wrong with the car before promising a slot. Default
  -- true because a business that listed itself wants custom, and the toggle is
  -- one tap away in the diary.
  add column if not exists takes_online_bookings boolean not null default true;

comment on column trade_providers.takes_online_bookings is
  'Whether the public storefront may write into this diary. Off means the provider takes bookings by telephone only; service_slots still answers, so the storefront can show the times and ask them to ring.';

-- ── The rules, written once ────────────────────────────────────────────────
-- Both doors — the provider taking a booking on the telephone, and a customer
-- on the storefront — go through this. Two copies of "does the whole job fit
-- inside opening hours" is two copies that drift, and the half that drifts is
-- always the one nobody is testing.
--
-- It authorises NOTHING. Each caller proves its own right to be here first;
-- this is revoked from every role and exists to be called from the two
-- wrappers below.
create or replace function public.service_booking_write(
  p_store_id uuid,
  p_variant_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_note text,
  p_source text
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
  -- Locked for the duration: the serialisation point for the whole diary. Two
  -- people taking the last 09:00 slot at once is the ordinary case on a busy
  -- morning, not an edge case.
  select * into v_tp from trade_providers where store_id = p_store_id for update;
  if not found then
    raise exception 'That business does not take bookings.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_customer_name), '') = '' then
    raise exception 'Who is the booking for?' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_customer_phone), '') = '' then
    raise exception 'A phone number, so they can be reached if anything changes.'
      using errcode = 'P0001';
  end if;
  -- Eight digits is a Rodrigues mobile. Checked because this number is the ONLY
  -- way the provider can reach somebody who booked as a guest.
  if length(regexp_replace(p_customer_phone, '\D', '', 'g')) < 7 then
    raise exception 'That phone number is too short.' using errcode = 'P0001';
  end if;

  select sd.minutes, pv.name into v_minutes, v_name
    from product_variants pv
    join products p on p.id = pv.product_id
    left join service_durations sd on sd.variant_id = pv.id
   where pv.id = p_variant_id
     and p.store_id = p_store_id
     and pv.is_active
     and p.status = 'active';
  if v_name is null then
    raise exception 'Choose which service this is.' using errcode = 'P0001';
  end if;
  if v_minutes is null then
    raise exception 'That one has no length set yet, so it cannot be booked.'
      using errcode = 'P0001';
  end if;
  v_end := p_starts_at + make_interval(mins => v_minutes);

  if p_starts_at < now() then
    raise exception 'That time has already passed.' using errcode = 'P0001';
  end if;
  if p_starts_at > now() + make_interval(days => v_tp.booking_days) then
    raise exception 'That is further ahead than this business takes bookings.'
      using errcode = 'P0001';
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

  return jsonb_build_object('ok', true, 'id', v_id, 'service', v_name,
                            'startsAt', p_starts_at, 'endsAt', v_end,
                            'minutes', v_minutes);
end $function$;

revoke all on function public.service_booking_write(uuid, uuid, timestamptz, text, text, text, text)
  from public, anon, authenticated;

-- ── Door one: the provider, on the telephone ───────────────────────────────
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
begin
  if not (is_store_staff(p_store_id) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  -- Deliberately NOT gated on takes_online_bookings or on the store being
  -- visible: a provider must be able to write into their own diary while the
  -- shop is still a draft, and the public toggle is about the public door.
  return service_booking_write(p_store_id, p_variant_id, p_starts_at,
                               p_customer_name, p_customer_phone, p_note,
                               case when p_source = 'admin' then 'admin' else 'provider' end);
end $function$;

-- ── Door two: the customer, on the storefront ──────────────────────────────
create or replace function public.book_service_slot_public(
  p_store_id uuid,
  p_variant_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tp trade_providers%rowtype;
  v_digits text;
  v_open integer;
  v_res jsonb;
begin
  -- A DRAFT SHOP IS NOT OPEN FOR BUSINESS. store_is_visible is the same rule
  -- the storefront and marketplace_stores use, so a shop that cannot be seen
  -- cannot be booked either — including one an owner has paused mid-season.
  if not store_is_visible(p_store_id) then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_tp from trade_providers where store_id = p_store_id;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if not v_tp.takes_online_bookings then
    raise exception 'This business takes bookings by telephone. Give them a ring.'
      using errcode = 'P0001';
  end if;

  -- ── ONE PHONE CANNOT FILL A DIARY ────────────────────────────────────
  -- The public door has no account behind it, by design: a customer on this
  -- island books from a phone and will not make an account first. That leaves
  -- the phone number as the only identity, so it is what the cap counts. Three
  -- open bookings with one business is generous for a real customer and
  -- useless to somebody trying to take a Saturday off the market.
  v_digits := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  select count(*) into v_open
    from service_bookings b
   where b.store_id = p_store_id
     and b.status = 'booked'
     and b.starts_at > now()
     and regexp_replace(b.customer_phone, '\D', '', 'g') = v_digits;
  if v_open >= 3 then
    raise exception 'You already have three bookings with them. Ring them to change one.'
      using errcode = 'P0001';
  end if;

  v_res := service_booking_write(p_store_id, p_variant_id, p_starts_at,
                                 p_customer_name, p_customer_phone, p_note, 'customer');

  -- ── SOMEBODY HAS TO BE TOLD ──────────────────────────────────────────
  -- A booking that arrives with nobody notified is a promise nobody has seen.
  -- Every person who can act on it, the same way an order reaches a shop.
  insert into notifications (recipient_type, recipient_id, type, title, body, data, category, priority, link)
  select 'merchant', ms.user_id, 'service_booked',
         'New booking: ' || (v_res->>'service'),
         btrim(p_customer_name) || ' — ' ||
           to_char(p_starts_at at time zone 'Indian/Mauritius', 'Dy DD Mon at HH24:MI'),
         jsonb_build_object('bookingId', v_res->>'id', 'storeId', p_store_id,
                            'startsAt', v_res->>'startsAt', 'phone', btrim(p_customer_phone)),
         'bookings', 'high', '/merchant/diary'
    from stores s
    join merchant_staff ms on ms.merchant_id = s.merchant_id
   where s.id = p_store_id;

  return v_res;
end $function$;

revoke all on function public.book_service_slot_public(uuid, uuid, timestamptz, text, text, text)
  from public;
grant execute on function public.book_service_slot_public(uuid, uuid, timestamptz, text, text, text)
  to anon, authenticated;
