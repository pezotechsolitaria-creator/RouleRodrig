-- M50 — create_delivery_for_order() could never have run. Two bugs, one line.
--
--   v_pin := lpad((get_byte(gen_random_bytes(2), 0) * 256
--                + get_byte(gen_random_bytes(2), 1))::int % 10000, 4, '0');
--
--   1. gen_random_bytes() lives in pgcrypto, which is not installed here → 42883.
--   2. lpad() has no (integer, integer, text) overload; the argument needed
--      ::text, not ::int. This one hid behind the first.
--
-- Undetected because M49 is the first code in the project to ever call this
-- function, and my earlier M45/M46 verifications inserted `deliveries` rows
-- directly — exercising the PIN *check* while never touching PIN *generation*.
-- A test that builds its own fixture only ever proves the fixture works.
--
-- pgcrypto goes in `extensions` (Supabase convention, not user-writable) and is
-- reached through an explicit search_path entry, so this SECURITY DEFINER
-- function still cannot be tricked into resolving the name elsewhere.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_delivery_for_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_order    orders%rowtype;
  v_set      delivery_settings%rowtype;
  v_id       uuid;
  v_pin      text;
  v_earning  integer;
  v_rand     bigint;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if coalesce(v_order.fulfillment_method, '') <> 'rr_delivery' then
    raise exception using errcode = 'RR082', message = 'This order is not a Roulé Rodrigues delivery.';
  end if;
  if exists (select 1 from deliveries where order_id = p_order_id) then
    -- Idempotent: a retried caller gets the existing delivery, not a second one.
    return (select id from deliveries where order_id = p_order_id);
  end if;

  select * into v_set from delivery_settings where id = 'main';

  -- 4 digits, cryptographic. Short enough to read across a doorstep; the attempt
  -- counter plus single-use redemption is what makes 10,000 enough.
  -- Four bytes rather than two: 2^16 % 10^4 leaves a visible modulo bias toward
  -- low PINs, 2^32 % 10^4 does not.
  v_rand := (get_byte(gen_random_bytes(4), 0)::bigint << 24)
          | (get_byte(gen_random_bytes(4), 1)::bigint << 16)
          | (get_byte(gen_random_bytes(4), 2)::bigint << 8)
          |  get_byte(gen_random_bytes(4), 3)::bigint;
  v_pin := lpad((v_rand % 10000)::text, 4, '0');

  -- The split is configuration, never hardcoded, and the three amounts are
  -- tracked separately because they are three different things.
  v_earning := (v_order.delivery_fee * v_set.driver_share_percent) / 100;

  insert into deliveries (order_id, store_id, zone_id, status, customer_fee,
                          driver_earning, platform_fee, dropoff_lat, dropoff_lng,
                          dropoff_note, pin, offer_expires_at)
  values (v_order.id, v_order.store_id, v_order.delivery_zone_id, 'searching_driver',
          v_order.delivery_fee, v_earning, v_order.delivery_fee - v_earning,
          v_order.delivery_lat, v_order.delivery_lng, v_order.delivery_instructions,
          v_pin, now() + make_interval(mins => v_set.accept_window_minutes))
  returning id into v_id;

  perform log_delivery_event(v_id, 'system', null, 'delivery.created', null, 'searching_driver');
  return v_id;
end;
$function$;

revoke execute on function public.create_delivery_for_order(uuid) from public, anon, authenticated;

-- Prove PIN generation actually produces 4 digits, and does so 500 times
-- without a type error or a null — the failure mode above was a single bad
-- expression that no amount of reading caught.
do $$
declare v_pin text; i int;
begin
  for i in 1..500 loop
    v_pin := lpad((((get_byte(extensions.gen_random_bytes(4), 0)::bigint << 24)
                  | (get_byte(extensions.gen_random_bytes(4), 1)::bigint << 16)
                  | (get_byte(extensions.gen_random_bytes(4), 2)::bigint << 8)
                  |  get_byte(extensions.gen_random_bytes(4), 3)::bigint) % 10000)::text, 4, '0');
    if v_pin is null or v_pin !~ '^[0-9]{4}$' then
      raise exception 'M50: PIN generation still broken (got %).', v_pin;
    end if;
  end loop;
end;
$$;
