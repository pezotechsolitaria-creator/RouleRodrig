-- ── M105 · Posting a Deliver Anything request ───────────────────────────────
--
-- M104 built the tables; this is the only supported way to write one. Those
-- tables have RLS with zero policies, so a customer cannot insert directly —
-- every rule below has to be enforced somewhere, and a SECURITY DEFINER
-- function is the one place that can see all of them at once.
--
-- Guests may post, exactly as they may check out (M20). Identity is decided
-- HERE and never taken from the body when a session exists.
--
-- Verified by calling it: a guest package request lands open with a 48h expiry;
-- a shopping run with no budget, a collection WITH a budget, and a guest with no
-- email are each refused with a sentence a person can act on.
create or replace function public.create_delivery_request(
  p_kind          text,
  p_what          text,
  p_pickup_text   text,
  p_dropoff_text  text,
  p_contact_name  text,
  p_contact_phone text,
  p_size_class    text default 'standard',
  p_max_budget    integer default null,
  p_pickup_note   text default null,
  p_dropoff_note  text default null,
  p_pickup_lat    double precision default null,
  p_pickup_lng    double precision default null,
  p_dropoff_lat   double precision default null,
  p_dropoff_lng   double precision default null,
  p_guest_email   text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_open  integer;
  v_id    uuid;
begin
  -- A signed-in customer's identity comes from the SESSION. p_guest_email is
  -- accepted only when nobody is signed in — otherwise anyone could file a
  -- request under somebody else's address.
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

  -- The table CHECK enforces the shape; these turn it into a sentence.
  if p_kind = 'shop_and_deliver' and coalesce(p_max_budget, 0) <= 0 then
    raise exception 'Set the most we may spend on the item.' using errcode = 'P0001';
  end if;
  if p_kind = 'package' and p_max_budget is not null then
    raise exception 'A collection has nothing to buy, so it takes no budget.' using errcode = 'P0001';
  end if;

  -- Flood control. Somebody with fifty open requests is not a customer, and
  -- every open request costs drivers attention. Identity-neutral, so it reads
  -- the same for a guest and an account holder — the M21 principle.
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
    contact_name, contact_phone,
    -- Quotes go stale: a driver's price on Monday is not a promise on Friday,
    -- and a board full of week-old requests is how a marketplace dies.
    expires_at
  ) values (
    p_kind, btrim(p_what), btrim(p_pickup_text), nullif(btrim(coalesce(p_pickup_note,'')),''),
    p_pickup_lat, p_pickup_lng,
    btrim(p_dropoff_text), nullif(btrim(coalesce(p_dropoff_note,'')),''),
    p_dropoff_lat, p_dropoff_lng,
    coalesce(nullif(p_size_class,''), 'standard'), p_max_budget, v_uid, v_email,
    btrim(p_contact_name), btrim(p_contact_phone),
    now() + interval '48 hours'
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text) from public, anon;
grant execute on function public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision, text)
  to authenticated, service_role;
