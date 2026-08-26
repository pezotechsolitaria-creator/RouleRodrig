-- ── M148 — a photo, for the people who cannot write ────────────────────────
--
-- The brief was "so that even old people can order". Research into who that
-- actually is on Rodrigues returned one number that reframes the whole task:
--
--     44% of Rodriguans aged 60+ cannot read or write.
--     64% at 75+. 68% of women over 75.
--     (2022 Housing & Population Census, Vol. VI, Table E2a)
--
-- For close to half the people this redesign is for, no font size and no plain
-- English reaches them at all. Typography helps the other half; it does nothing
-- here. "What are we collecting?" is a writing task. Holding up a phone is not.
--
-- delivery_requests.photo_url has existed, unused, since the table was created
-- (M104). This finally writes to it, and makes a photo a FIRST-CLASS answer:
-- the form's first step is satisfied by a description OR a picture, not both.
--
-- ── Private bucket, deliberately ───────────────────────────────────────────
-- A photo of a parcel is often a photo of somebody's doorway, their kitchen
-- table, or a document. It goes to a private bucket; photo_url holds a storage
-- PATH, not a URL, and the customer's and driver's own endpoints sign it for a
-- few minutes when they need to show it. An unguessable name in the existing
-- public `uploads` bucket would have been less work and is not the same thing.
--
-- Limits are set INLINE on the bucket rather than trusting the M11 guard, which
-- is a one-shot assertion at migration time and not a live invariant.
--
-- ── Why create_delivery_request is dropped and recreated ───────────────────
-- Adding a parameter makes a competing OVERLOAD, and the GRANT in M105 pins the
-- exact 15-argument signature. Both old versions have to go.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-photos', 'delivery-photos', false, 4194304,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = 4194304,
      -- No SVG, everywhere in this codebase: it is a script-execution shape
      -- wearing an image extension.
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic'];

drop function if exists public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text);

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
  p_photo_url text default null
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
begin
  -- A signed-in customer's identity comes from the SESSION. p_guest_email is
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
    size_class, max_budget, customer_id, guest_email,
    contact_name, contact_phone, photo_url,
    -- Quotes go stale: a driver's price on Monday is not a promise on Friday.
    expires_at
  ) values (
    p_kind, btrim(p_what), btrim(p_pickup_text), nullif(btrim(coalesce(p_pickup_note,'')),''),
    p_pickup_lat, p_pickup_lng,
    btrim(p_dropoff_text), nullif(btrim(coalesce(p_dropoff_note,'')),''),
    p_dropoff_lat, p_dropoff_lng,
    coalesce(nullif(p_size_class,''), 'standard'), p_max_budget, v_uid, v_email,
    btrim(p_contact_name), btrim(p_contact_phone),
    nullif(btrim(coalesce(p_photo_url, '')), ''),
    now() + interval '48 hours'
  ) returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text, text)
  from public, anon;
grant execute on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text, text)
  to authenticated;

-- ── Who may see the photo ──────────────────────────────────────────────────
-- The customer who posted it, and any approved driver — a driver deciding
-- whether to quote is exactly who the picture is for. Server-only: the caller
-- signs the returned path.
create or replace function public.delivery_photo_path(p_request_id uuid, p_email text default null)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_r     delivery_requests%rowtype;
begin
  select * into v_r from delivery_requests where id = p_request_id;
  if not found or v_r.photo_url is null then return null; end if;

  if v_uid is not null then
    if v_r.customer_id = v_uid then return v_r.photo_url; end if;
    if exists (select 1 from delivery_drivers d
                where d.user_id = v_uid and d.status = 'approved') then
      return v_r.photo_url;
    end if;
    return null;
  end if;

  if v_email is not null and v_r.guest_email = v_email then return v_r.photo_url; end if;
  return null;
end;
$fn$;

revoke all on function public.delivery_photo_path(uuid, text) from public, anon, authenticated;

do $assert$
begin
  if (select count(*) from storage.buckets where id='delivery-photos' and not public) <> 1 then
    raise exception 'M148: the photo bucket is missing or public';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='create_delivery_request') <> 1 then
    raise exception 'M148: create_delivery_request has an overload';
  end if;
  if has_function_privilege('anon','public.delivery_photo_path(uuid, text)','execute')
     or has_function_privilege('authenticated','public.delivery_photo_path(uuid, text)','execute') then
    raise exception 'M148: the photo lookup is reachable by a client role';
  end if;
  if delivery_photo_path(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M148: invented a photo';
  end if;

  begin
    declare v_r uuid;
    begin
      v_r := create_delivery_request('package','A box','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p148@example.com',
               'delivery/abc123.jpg');
      if (select photo_url from delivery_requests where id=v_r) <> 'delivery/abc123.jpg' then
        raise exception 'M148_FAIL: the photo path was not stored';
      end if;
      if delivery_photo_path(v_r, 'p148@example.com') <> 'delivery/abc123.jpg' then
        raise exception 'M148_FAIL: the owner cannot read their own photo';
      end if;
      if delivery_photo_path(v_r, 'someone-else@example.com') is not null then
        raise exception 'M148_FAIL: a stranger can read the photo';
      end if;
      v_r := create_delivery_request('package','No photo','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p148b@example.com');
      if delivery_photo_path(v_r, 'p148b@example.com') is not null then
        raise exception 'M148_FAIL: invented a photo for a request without one';
      end if;
      raise exception 'M148_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M148_FAIL%' then raise; end if;
      if sqlerrm <> 'M148_PROBE_DONE' then
        raise exception 'M148: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M148: photo stored, owner reads it, stranger does not';
  end;
end;
$assert$;
