-- ── M149c — the quote board and the alerts gate on the cargo kind ──────────
--
-- See m149 for the model. create_delivery_request gains p_cargo_kind (dropped
-- and recreated: the GRANT pins an exact signature), and the three places that
-- decide WHO SEES A JOB now use vehicle_can_handle instead of the size-only
-- vehicle_can_carry — the board, the push fan-out and the WhatsApp fan-out.
--
-- Without this a lorry driver would still have been shown somebody's dinner and
-- messaged about it; only dispatch would have known better.

drop function if exists public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text, text);

create function public.create_delivery_request(
  p_kind text,
  p_what text,
  p_pickup_text text,
  p_dropoff_text text,
  p_contact_name text,
  p_contact_phone text,
  p_size_class text default 'standard',
  p_max_budget integer default null,
  p_pickup_note text default null,
  p_dropoff_note text default null,
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null,
  p_dropoff_lat double precision default null,
  p_dropoff_lng double precision default null,
  p_guest_email text default null,
  p_photo_url text default null,
  p_cargo_kind text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_open  integer;
  v_id    uuid;
  v_cargo text := coalesce(nullif(btrim(p_cargo_kind), ''), 'general');
begin
  -- Identity comes from the SESSION when there is one; p_guest_email is
  -- accepted only when there is nobody signed in.
  if v_uid is not null then
    v_email := null;
  else
    v_email := nullif(btrim(lower(coalesce(p_guest_email, ''))), '');
    if v_email is null then
      raise exception 'Enter your email so we can send you the quotes.' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(p_kind,'') not in ('package','shop_and_deliver') then
    raise exception 'Choose whether we are collecting something or buying it.' using errcode = 'P0001';
  end if;
  if v_cargo not in ('general','food','fragile','heavy') then
    raise exception 'Choose what kind of thing it is.' using errcode = 'P0001';
  end if;

  if p_kind = 'shop_and_deliver' and coalesce(p_max_budget, 0) <= 0 then
    raise exception 'Set the most we may spend on the item.' using errcode = 'P0001';
  end if;
  if p_kind = 'package' and p_max_budget is not null then
    raise exception 'A collection has nothing to buy, so it takes no budget.' using errcode = 'P0001';
  end if;

  -- Flood control, identity-neutral (the M21 principle).
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
    contact_name, contact_phone, photo_url, expires_at
  ) values (
    p_kind, btrim(p_what), btrim(p_pickup_text), nullif(btrim(coalesce(p_pickup_note,'')),''),
    p_pickup_lat, p_pickup_lng,
    btrim(p_dropoff_text), nullif(btrim(coalesce(p_dropoff_note,'')),''),
    p_dropoff_lat, p_dropoff_lng,
    coalesce(nullif(p_size_class,''), 'standard'), v_cargo, p_max_budget, v_uid, v_email,
    btrim(p_contact_name), btrim(p_contact_phone),
    nullif(btrim(coalesce(p_photo_url, '')), ''),
    now() + interval '48 hours'
  ) returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text, text, text)
  from public, anon;
grant execute on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text, text, text)
  to authenticated;

create or replace function public.driver_open_requests()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_d delivery_drivers%rowtype;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(x order by x->>'createdAt'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'what', r.what,
        'sizeClass', r.size_class,
        'cargoKind', r.cargo_kind,
        'pickupText', r.pickup_text, 'pickupNote', r.pickup_note,
        'dropoffText', r.dropoff_text, 'dropoffNote', r.dropoff_note,
        'spendCap', r.max_budget,
        'createdAt', r.created_at, 'expiresAt', r.expires_at,
        -- A storage PATH, not a URL: the bucket is private and the driver's
        -- own endpoint signs it briefly.
        'photoPath', r.photo_url,
        -- Off duty: the row exists ONLY so a standing price can be withdrawn.
        'offDuty', (v_d.availability = 'offline'),
        'quoteCount', (select count(*) from delivery_quotes q
                        where q.request_id = r.id and q.status = 'offered'),
        'myQuote', (select jsonb_build_object('id', q.id, 'fee', q.fee, 'note', q.note)
                      from delivery_quotes q
                     where q.request_id = r.id and q.driver_id = v_d.id
                       and q.status = 'offered')
      ) as x
      from delivery_requests r
      where r.status = 'open'
        and (r.expires_at is null or r.expires_at > now())
        -- BOTH gates. A lorry no longer sees somebody's dinner on the board.
        and vehicle_can_handle(v_d.vehicle_type, r.size_class, r.cargo_kind)
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

revoke all on function public.driver_open_requests() from public, anon, authenticated;
grant execute on function public.driver_open_requests() to authenticated;

create or replace function public.request_push_targets(p_request_id uuid)
returns table(endpoint text, p256dh text, auth text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_handle(d.vehicle_type, r.size_class, r.cargo_kind)
    join push_subscriptions s on s.user_id = d.user_id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$fn$;

create or replace function public.request_whatsapp_targets(p_request_id uuid)
returns table(phone text, api_key text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_handle(d.vehicle_type, r.size_class, r.cargo_kind)
    join driver_contact_channels c on c.driver_id = d.id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> ''
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$fn$;

revoke all on function public.request_push_targets(uuid) from public, anon, authenticated;
revoke all on function public.request_whatsapp_targets(uuid) from public, anon, authenticated;

do $assert$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='create_delivery_request') <> 1 then
    raise exception 'M149c: create_delivery_request has an overload';
  end if;
  if has_function_privilege('anon','public.driver_open_requests()','execute') then
    raise exception 'M149c: the board is reachable by anon';
  end if;
  if (select count(*) from request_push_targets(gen_random_uuid())) <> 0 then
    raise exception 'M149c: push targets for a request that does not exist';
  end if;
  begin
    perform driver_open_requests();
    raise exception 'M149c: the board answered with no session';
  exception when sqlstate 'RR080' then null;
  end;
end;
$assert$;
