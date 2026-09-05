-- ── M161 (part 2) · THE SLOT ENGINE AND THE DOOR ───────────────────────────
--
-- APPLIED TO PRODUCTION 2026-09-05 as migration 20260905184218.
--
-- food_pickup_window  -- is this one date+time a legal collection window?
-- food_pickup_slots   -- what the chips on the picker are made of
-- create_food_order   -- the same order engine, one extra question asked first
-- expire_order        -- do not cancel tomorrow's lunch tonight

create or replace function public.food_pickup_window(
  p_store_id uuid, p_date date, p_time time, p_now timestamptz default now()
) returns tstzrange
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_zone  constant text     := 'Indian/Mauritius';
  v_width constant interval := interval '30 minutes';
  v_today date; v_days smallint; v_on boolean;
  v_start timestamptz; v_end timestamptz;
  v_a record; v_b record;
begin
  -- NULL date/time is not an error. It is ASAP, and ASAP has no window.
  if p_date is null or p_time is null then return null; end if;

  v_today := (p_now at time zone v_zone)::date;

  select coalesce(k.preorder_days, 0) into v_days
    from food_kitchens k where k.store_id = p_store_id;
  if v_days is null then
    raise exception 'That kitchen does not take orders.' using errcode = 'RR030';
  end if;

  select coalesce(m.food_preorder_enabled, false) into v_on
    from marketplace_settings m limit 1;
  if not coalesce(v_on, false) then v_days := 0; end if;

  if p_date < v_today or p_date > v_today + v_days then
    raise exception 'That day is not open for orders.' using errcode = 'RR030';
  end if;

  if extract(minute from p_time) not in (0, 30) or extract(second from p_time) <> 0 then
    raise exception 'Choose one of the offered times.' using errcode = 'RR030';
  end if;

  v_start := (p_date + p_time) at time zone v_zone;
  v_end   := v_start + v_width;

  if v_end <= p_now then
    raise exception 'That time has passed. Choose another.' using errcode = 'RR030';
  end if;

  -- Open at BOTH ends: a 23:30 slot at a kitchen closing 23:59 is refused.
  select * into v_a from store_schedule_at(p_store_id, (v_start at time zone v_zone)::timestamp);
  select * into v_b from store_schedule_at(p_store_id, ((v_end - interval '1 minute') at time zone v_zone)::timestamp);

  -- ── WHY THIS REFUSAL IS LOAD-BEARING ────────────────────────────────────
  -- store_schedule_at does v_open := not v_any, so a store with ZERO
  -- store_hours rows reads as OPEN FOREVER -- deliberately, so an unset
  -- default can never disable a shop for walk-ups. For a slot GENERATOR that
  -- is catastrophic: it would cheerfully sell 08:00-20:00 every day for a
  -- month at a kitchen that has never said when it cooks. Pre-orders fail
  -- closed; walk-ups keep the permissive rule.
  if not v_a.has_schedule then
    raise exception 'This kitchen has not set its opening hours.' using errcode = 'RR030';
  end if;

  if not (v_a.is_open and v_b.is_open) then
    raise exception 'The kitchen is closed then.' using errcode = 'RR030';
  end if;

  return tstzrange(v_start, v_end, '[)');
end $fn$;

create or replace function public.food_pickup_slots(
  p_store_id uuid, p_variant_ids uuid[] default null, p_now timestamptz default now()
) returns table(slot_date date, slot_time time, starts_at timestamptz, reason text)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_zone  constant text     := 'Indian/Mauritius';
  v_width constant interval := interval '30 minutes';
  v_days smallint; v_on boolean; v_lead integer;
  v_now_local timestamp; v_earliest timestamp;
  v_products uuid[]; v_d integer; v_date date; v_sch record;
  v_open timestamp; v_close timestamp; v_cursor timestamp; v_floor timestamp;
  v_emitted integer; v_why text; v_bad text; v_pid uuid;
begin
  select coalesce(k.preorder_days, 0) into v_days
    from food_kitchens k where k.store_id = p_store_id;
  if v_days is null then return; end if;                 -- not a kitchen

  select coalesce(m.food_preorder_enabled, false) into v_on
    from marketplace_settings m limit 1;
  if not coalesce(v_on, false) then v_days := 0; end if;

  select array_agg(distinct pv.product_id) into v_products
    from product_variants pv
   where p_variant_ids is not null and pv.id = any(p_variant_ids);

  -- The basket decides the lead: the slowest dish in it, else the kitchen's
  -- own maximum, else half an hour.
  select greatest(
           coalesce(max(fi.prep_minutes_max), 0),
           coalesce((select k.prep_minutes_max from food_kitchens k where k.store_id = p_store_id), 0),
           30)
    into v_lead
    from food_items fi
   where v_products is not null and fi.product_id = any(v_products);

  v_lead      := coalesce(v_lead, 30);
  v_now_local := (p_now at time zone v_zone);
  v_earliest  := v_now_local + make_interval(mins => v_lead);

  -- One store_schedule_at call PER DAY, not per tick: store_hours can only
  -- express a single interval per weekday (the lookup is `limit 1`), so
  -- probing every tick would buy nothing and cost ~96 plpgsql calls.
  for v_d in 0..v_days loop
    v_date := v_now_local::date + v_d;
    v_emitted := 0;
    v_bad := null;

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
    v_cursor := date_trunc('hour', v_floor)
                + ((ceil(extract(minute from v_floor)::numeric / 30))::int * interval '30 minutes');
    if v_cursor < v_floor then v_cursor := v_cursor + v_width; end if;

    while v_cursor + v_width <= v_close loop
      v_why := null;
      if v_products is not null then
        foreach v_pid in array v_products loop
          v_why := food_item_availability(v_pid, (v_cursor at time zone v_zone));
          if v_why <> 'available' then v_bad := v_why; exit; end if;
          v_why := null;
        end loop;
      end if;

      if v_why is null then
        return query select v_date, v_cursor::time, (v_cursor at time zone v_zone), null::text;
        v_emitted := v_emitted + 1;
      end if;

      v_cursor := v_cursor + v_width;
    end loop;

    -- A day that produced nothing still owes the customer a sentence.
    -- sold_out_until falls out free here: a dish gone until 04:00 tomorrow is
    -- refused for today's ticks and offered for tomorrow's, no special case.
    if v_emitted = 0 then
      return query select v_date, null::time, null::timestamptz, coalesce(v_bad, 'no_slots')::text;
    end if;
  end loop;
end $fn$;

-- ── The door. Same order engine, one extra question asked first. ──────────
-- A NEW signature, so create_order keeps its 14 args, its lock ordering and
-- its six asserting migrations. Shop and event checkout cannot be affected.
create or replace function public.create_food_order(
  p_store_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_fulfillment text, p_notes text, p_provider text,
  p_delivery_lat double precision, p_delivery_lng double precision,
  p_delivery_instructions text, p_delivery_zone_id uuid, p_expected_total integer,
  p_idempotency_key uuid, p_guest_email text,
  p_pickup_date date default null, p_pickup_time time default null
) returns table(order_id uuid, order_number text, total integer, currency text, delivery_fee integer)
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_win tstzrange;
  v_row record;
begin
  -- Raises RR030 with a sentence a customer can read if the window is illegal.
  v_win := food_pickup_window(p_store_id, p_pickup_date, p_pickup_time, now());

  -- Transaction-local: PostgREST wraps each RPC in one transaction, so this
  -- cannot leak into another request over a shared pooled connection.
  if v_win is not null then
    perform set_config('rr.fulfil_at', lower(v_win)::text, true);
  end if;

  select * into v_row from create_order(
    p_store_id, p_items, p_customer_name, p_customer_phone, p_fulfillment,
    p_notes, p_provider, p_delivery_lat, p_delivery_lng, p_delivery_instructions,
    p_delivery_zone_id, p_expected_total, p_idempotency_key, p_guest_email);

  if v_win is not null and v_row.order_id is not null then
    -- The `pickup_slot is null` guard makes an idempotent replay non-restamping:
    -- create_order returns the ORIGINAL order for a repeated key, and that
    -- order's slot must not be rewritten by the retry.
    update orders o
       set pickup_slot     = v_win,
           auto_release_at = greatest(coalesce(o.auto_release_at, upper(v_win)),
                                      upper(v_win) + interval '2 hours')
     where o.id = v_row.order_id and o.pickup_slot is null;
  end if;

  perform set_config('rr.fulfil_at', '', true);

  return query select v_row.order_id, v_row.order_number, v_row.total,
                      v_row.currency, v_row.delivery_fee;
end $fn$;

-- ── Do not cancel tomorrow's lunch tonight ────────────────────────────────
-- With prepayment on, a pre-order is a bank transfer sitting in
-- pending_payment with auto_release_at days out. The reminders sweep would
-- have released the stock and emailed the customer that their order expired --
-- for food they are collecting tomorrow at 08:00. The guard is in SQL rather
-- than in app/api/cron/reminders so every caller inherits it.
create or replace function public.expire_order(p_order_id uuid)
returns boolean
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  perform 1
  from orders o
  where o.id = p_order_id
    and o.status = 'pending_payment'
    and o.accepted_at is null
    and o.auto_release_at is not null
    and o.auto_release_at < now()
    and (o.pickup_slot is null or lower(o.pickup_slot) < now())   -- M161
  for update;

  if not found then return false; end if;

  insert into inventory_movements (variant_id, delta, reason, order_id, note)
  select oi.variant_id, oi.quantity, 'restock', p_order_id, 'auto-released: reservation expired'
  from order_items oi where oi.order_id = p_order_id;

  update orders set status = 'cancelled' where id = p_order_id;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'customer', o.customer_id, o.id, 'order_status_changed',
         'Order '||o.order_number||' expired',
         'The reservation window passed before the shop confirmed it, so the items were released. You have not been charged.',
         jsonb_build_object('new_status','cancelled')
  from orders o where o.id = p_order_id and o.customer_id is not null;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, o.id, 'order_status_changed',
         'Order '||o.order_number||' expired',
         'It was not confirmed in time, so the stock has been returned to your shelf.',
         jsonb_build_object('new_status','cancelled')
  from orders o
  join stores s on s.id = o.store_id
  join merchant_staff ms on ms.merchant_id = s.merchant_id
  where o.id = p_order_id;

  return true;
end $fn$;

revoke all on function public.food_pickup_slots(uuid, uuid[], timestamptz) from public;
revoke all on function public.food_pickup_window(uuid, date, time, timestamptz) from public;
revoke all on function public.create_food_order(uuid, jsonb, text, text, text, text, text,
  double precision, double precision, text, uuid, integer, uuid, text, date, time) from public;

-- Reading which times are offered is harmless, and guest checkout is the
-- default path here, so the picker works before anybody signs in.
grant execute on function public.food_pickup_slots(uuid, uuid[], timestamptz) to anon, authenticated, service_role;
grant execute on function public.food_pickup_window(uuid, date, time, timestamptz) to anon, authenticated, service_role;

-- Placing one mirrors create_order exactly: authenticated + service_role.
grant execute on function public.create_food_order(uuid, jsonb, text, text, text, text, text,
  double precision, double precision, text, uuid, integer, uuid, text, date, time)
  to authenticated, service_role;
