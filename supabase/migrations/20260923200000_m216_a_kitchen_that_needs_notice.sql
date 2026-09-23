-- ── M216 · A KITCHEN THAT NEEDS NOTICE ────────────────────────────────────
--
-- The owner, 23 Sept 2026: "turn on advance ordering 1-2 days for chez
-- banane". Chez Banane's cook wrote his own rule into the kitchen record
-- months ago — food_kitchen_ops.cooker_notes: "Call before a 24-48
-- hours(1-2days) time frame" — while the site promised "ready in 15-30 min".
-- Since M201 (the same day) the kitchen takes cash, so an order the cook
-- cannot cook is no longer hypothetical.
--
-- ── WHAT M161 ALREADY HAD, AND WHAT IT DID NOT ─────────────────────────────
-- M161 built pre-ordering and never switched it on:
--   · food_kitchens.preorder_days — a HORIZON (today + N days of slots);
--   · marketplace_settings.food_preorder_enabled — the platform rollback
--     lever that forces every horizon to 0 while it is off.
-- It had no idea of NOTICE. The earliest slot was now + prep minutes; the
-- server-side validator, food_pickup_window(), enforced no lead at all; and
-- an order with no time never met the validator — /api/checkout sends it
-- straight to create_order(), which `authenticated` can also call directly.
--
-- ── ONE QUESTION ───────────────────────────────────────────────────────────
-- kitchen_notice_hours(store) — how far ahead this kitchen must be booked,
-- RIGHT NOW. It is 0 whenever the platform lever is off, so switching the
-- lever off is a real rollback to walk-up ordering, not a switch that leaves
-- a notice kitchen with no bookable time at all.
--
-- Asked by:
--   1. food_pickup_slots()        never OFFERS a time inside the notice, and
--                                 names a day that falls inside it 'notice'.
--   2. food_pickup_window()       refuses one with a sentence (RR030), and
--                                 refuses ASAP for a notice kitchen.
--   3. t_orders_kitchen_notice    BEFORE INSERT on orders — THE WALL. Every
--                                 path ends in create_order's INSERT: the
--                                 route's ASAP branch, create_order_group, a
--                                 signed-in client calling create_order
--                                 directly. It reads rr_fulfil_at(), the slot
--                                 create_food_order stamped for THIS
--                                 transaction; unset, that is now(), which is
--                                 inside any notice.
--   4. food_catalog               a notice kitchen's dish is ORDERABLE (it can
--                                 go in the basket for a later slot) while the
--                                 kitchen is closed now, but never READY NOW.
--
-- GRACE. The first slot offered is the first :00/:30 at or after
-- now + notice; by the time the customer presses the button it is a few
-- minutes INSIDE the notice. Layers 2-3 allow one slot width (30 min) of
-- grace, so the picker's own default is never refused. The cook asked for
-- "24-48 hours"; 23½ is the price of a checkout that works.
--
-- ── DOWNSTREAM, IN THE SAME MIGRATION ─────────────────────────────────────
--   · food_catalog.orderable widens for notice kitchens; a new ready_now
--     keeps today's meaning, and 'Ready now' / "Ready to order now" /
--     'Quickest' use it — otherwise they would list a dish you cannot have
--     today, all day.
--   · kitchen_dashboard() dropped every cash order 24 hours after it was
--     PLACED. With 24 hours' notice that is every order, gone from the cook's
--     board before its own collection day. A slotted order now stays until a
--     day after its slot, and the board is told the slot.
--   · lookup_order() tells a guest customer the slot they booked.
--   · create_food_order was executable by `anon` (Supabase default
--     privileges survived M161b's `revoke ... from public`), so the public key
--     could create orders past /api/checkout's rate limit. Guests reach it
--     through the service role; anon loses it.
--
-- ── CHEZ BANANE ────────────────────────────────────────────────────────────
-- min_notice_hours = 24, preorder_days = 2: an order is placed between one
-- and two days ahead — the owner's "1-2 days", the cook's "24-48 hours".
--
-- REVERSE for this kitchen (walk-up, same day only):
--   update food_kitchens set min_notice_hours = 0, preorder_days = 0
--    where store_id = 'd522e765-78c3-43da-ab4e-db2b7977acaa';
-- REVERSE for the platform (every kitchen back to walk-up; notice ignored):
--   update marketplace_settings set food_preorder_enabled = false;
-- That is a CODE rollback, not a safe state for Chez Banane: it reopens the
-- same-day orders its cook said he cannot take. To stop this kitchen taking
-- orders at all, pause the store or its dishes instead.

begin;

-- ── Refuse to overwrite anything that changed since it was read ────────────
-- Four definitions are replaced whole. Each was read live on 23 Sept 2026 and
-- its checksum recorded here; if any has moved since, this stops rather than
-- silently reverting someone else's change.
do $guard$
declare r record; v_md5 text;
begin
  for r in select * from (values
      ('food_pickup_slots',  '3ec15ed162ede369ae69067731e7a455'),
      ('food_pickup_window', 'c7c7eae8f16f015a41033748830d4ad6'),
      ('kitchen_dashboard',  '8db3e202d58d951fad14aa787e089da9')) t(fn, md5)
  loop
    select md5(pg_get_functiondef(p.oid)) into v_md5
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if v_md5 is distinct from r.md5
       and position('M216' in coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                                          join pg_namespace n on n.oid = p.pronamespace
                                         where n.nspname = 'public' and p.proname = r.fn), '')) = 0 then
      raise exception 'M216: % changed since it was read (md5 %) — refusing to overwrite', r.fn, v_md5;
    end if;
  end loop;

  if md5(pg_get_viewdef('public.food_catalog'::regclass, true)) <> 'de6f7b685feffb8aea9c792bb57cd17d'
     and position('min_notice_hours' in pg_get_viewdef('public.food_catalog'::regclass, true)) = 0 then
    raise exception 'M216: food_catalog changed since it was read — refusing to overwrite';
  end if;
end
$guard$;

-- ── The setting ────────────────────────────────────────────────────────────
alter table public.food_kitchens
  add column if not exists min_notice_hours smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'food_kitchens_min_notice_hours_range') then
    alter table public.food_kitchens
      add constraint food_kitchens_min_notice_hours_range check (min_notice_hours between 0 and 72);
  end if;
  -- A notice longer than the horizon leaves a kitchen with no bookable time
  -- at all. Refuse the configuration rather than discover it as an empty menu.
  if not exists (select 1 from pg_constraint where conname = 'food_kitchens_notice_within_horizon') then
    alter table public.food_kitchens
      add constraint food_kitchens_notice_within_horizon check (min_notice_hours <= preorder_days * 24);
  end if;
end $$;

comment on column public.food_kitchens.min_notice_hours is
  'Hours ahead an order must be placed. 0 = walk-up (default). >0 = pre-order only: no ASAP, no slot inside the notice (30-min grace). Ignored while marketplace_settings.food_preorder_enabled is off. Read through kitchen_notice_hours(). M216.';

-- ── The one question ───────────────────────────────────────────────────────
create or replace function public.kitchen_notice_hours(p_store_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  -- M216. 0 for a store that is not a kitchen, for a walk-up kitchen, and for
  -- EVERY kitchen while the platform lever is off.
  select case
           when coalesce((select m.food_preorder_enabled from marketplace_settings m limit 1), false)
           then coalesce((select k.min_notice_hours from food_kitchens k where k.store_id = p_store_id), 0)
           else 0
         end::integer;
$fn$;
revoke all on function public.kitchen_notice_hours(uuid) from public;
grant execute on function public.kitchen_notice_hours(uuid) to anon, authenticated;

-- ── Layer 1 · never offer a time inside the notice ─────────────────────────
-- M161's body, plus the notice. Identical signature and result columns —
-- CREATE OR REPLACE, never a new parameter (a defaulted extra parameter makes
-- a second overload and PostgREST refuses the endpoint with PGRST203).
create or replace function public.food_pickup_slots(
  p_store_id uuid,
  p_variant_ids uuid[] default null,
  p_now timestamptz default now()
) returns table(slot_date date, slot_time time, starts_at timestamptz, reason text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_zone  constant text     := 'Indian/Mauritius';
  v_width constant interval := interval '30 minutes';
  v_days smallint; v_on boolean; v_lead integer; v_notice integer;
  v_now_local timestamp; v_earliest timestamp; v_notice_floor timestamp;
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

  -- M216: hours ahead this kitchen must be booked (0 while the lever is off).
  v_notice := kitchen_notice_hours(p_store_id);

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

  v_lead         := coalesce(v_lead, 30);
  v_now_local    := (p_now at time zone v_zone);
  v_notice_floor := v_now_local + make_interval(hours => v_notice);
  -- M216: the notice, when longer than the cooking time, IS the lead.
  v_earliest     := greatest(v_now_local + make_interval(mins => v_lead), v_notice_floor);

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

    -- M216: an open day whose last slot starts inside the notice is not
    -- "sold out" and not "no times left" — it is too soon. Say so.
    if v_notice > 0 and v_close - v_width < v_notice_floor then
      return query select v_date, null::time, null::timestamptz, 'notice'::text;
      continue;
    end if;

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
    if v_emitted = 0 then
      return query select v_date, null::time, null::timestamptz, coalesce(v_bad, 'no_slots')::text;
    end if;
  end loop;
end $function$;

-- ── Layer 2 · refuse with a sentence ───────────────────────────────────────
create or replace function public.food_pickup_window(
  p_store_id uuid,
  p_date date,
  p_time time,
  p_now timestamptz default now()
) returns tstzrange
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_zone  constant text     := 'Indian/Mauritius';
  v_width constant interval := interval '30 minutes';
  v_today date; v_days smallint; v_on boolean; v_notice integer;
  v_start timestamptz; v_end timestamptz;
  v_a record; v_b record;
begin
  -- M216: hours ahead this kitchen must be booked (0 while the lever is off).
  v_notice := kitchen_notice_hours(p_store_id);

  -- NULL date/time is ASAP, and ASAP has no window — unless the kitchen needs
  -- notice, in which case "as soon as it's ready" is exactly what it cannot do.
  if p_date is null or p_time is null then
    if v_notice > 0 then
      raise exception using errcode = 'RR030',
        message = format('This kitchen cooks to order and needs %s hours'' notice. Choose a day and time.', v_notice);
    end if;
    return null;
  end if;

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

  -- M216: inside the notice, less one slot of grace (see the header).
  if v_notice > 0 and v_end <= p_now + make_interval(hours => v_notice) then
    raise exception using errcode = 'RR030',
      message = format('This kitchen needs %s hours'' notice. Choose a later time.', v_notice);
  end if;

  select * into v_a from store_schedule_at(p_store_id, (v_start at time zone v_zone)::timestamp);
  select * into v_b from store_schedule_at(p_store_id, ((v_end - interval '1 minute') at time zone v_zone)::timestamp);

  -- store_schedule_at does v_open := not v_any, so a store with ZERO
  -- store_hours rows reads as OPEN FOREVER -- deliberately, so an unset
  -- default can never disable a shop for walk-ups. For a slot generator that
  -- is catastrophic. Pre-orders fail closed; walk-ups keep the permissive rule.
  if not v_a.has_schedule then
    raise exception 'This kitchen has not set its opening hours.' using errcode = 'RR030';
  end if;

  if not (v_a.is_open and v_b.is_open) then
    raise exception 'The kitchen is closed then.' using errcode = 'RR030';
  end if;

  return tstzrange(v_start, v_end, '[)');
end $function$;

-- ── Layer 3 · the wall ─────────────────────────────────────────────────────
create or replace function public.enforce_kitchen_notice()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_notice integer;
begin
  v_notice := kitchen_notice_hours(new.store_id);
  if v_notice = 0 then return new; end if;   -- not a kitchen, walk-up, or lever off

  -- rr_fulfil_at() is the slot start create_food_order stamped for THIS
  -- transaction, or now() when nothing did — which is inside any notice.
  -- Same grace as food_pickup_window: the slot must END after now + notice.
  if rr_fulfil_at() + interval '30 minutes' <= now() + make_interval(hours => v_notice) then
    raise exception using errcode = 'RR030',
      message = format('This kitchen cooks to order and needs %s hours'' notice. Choose a day and time.', v_notice);
  end if;
  return new;
end $fn$;
revoke all on function public.enforce_kitchen_notice() from public, anon, authenticated;

drop trigger if exists t_orders_kitchen_notice on public.orders;
create trigger t_orders_kitchen_notice
  before insert on public.orders
  for each row execute function public.enforce_kitchen_notice();

-- ── Layer 4 · the menu: orderable is not "ready now" ───────────────────────
-- Columns 1-33 are M161's, in order and type; the expressions for
-- `orderable` and card.orderable/reason change, card gains minNoticeHours and
-- readyNow, and two columns are appended.
create or replace view public.food_catalog as
 SELECT p.id AS product_id,
    fi.slug,
    p.name,
    fi.descriptor,
    fi.descriptor_fr,
    fi.descriptor_cr,
    p.description,
    fi.allergens,
    p.min_price AS price,
    p.currency,
    med.url AS image_url,
    COALESCE(fi.prep_minutes_min, fk.prep_minutes_min) AS prep_min,
    COALESCE(fi.prep_minutes_max, fk.prep_minutes_max) AS prep_max,
    fi.spice_level,
    COALESCE(fi.dietary, '{}'::text[]) ||
        CASE
            WHEN COALESCE(fk.halal_certified, false) AND (fk.halal_certified_until IS NULL OR fk.halal_certified_until >= CURRENT_DATE) AND NOT COALESCE(fi.dietary, '{}'::text[]) @> ARRAY['halal'::text] THEN ARRAY['halal'::text]
            ELSE '{}'::text[]
        END AS dietary,
    fi.meal_times,
    fi.is_signature,
    fi.serves,
    fi."position" AS sort_position,
    avail.av AS availability,
    COALESCE(v.total_stock, 0) AS stock,
    v.single_variant_id AS variant_id,
    COALESCE(v.variant_count, 0::bigint)::integer AS variant_count,
    s.id AS kitchen_id,
    s.name AS kitchen_name,
    s.slug AS kitchen_slug,
    COALESCE(sch.is_open, true) AS kitchen_open,
    fk.pickup_hint,
    COALESCE(cat.slugs, '{}'::text[]) AS category_slugs,
    p.created_at,
    p.search_vector,
    ord.orderable,
    jsonb_build_object('id', p.id, 'slug', fi.slug, 'name', p.name, 'descriptor', fi.descriptor, 'descriptorFr', fi.descriptor_fr, 'descriptorCr', fi.descriptor_cr, 'price', p.min_price, 'currency', p.currency, 'imageUrl', med.url, 'prepMin', COALESCE(fi.prep_minutes_min, fk.prep_minutes_min), 'prepMax', COALESCE(fi.prep_minutes_max, fk.prep_minutes_max), 'spiceLevel', fi.spice_level, 'dietary', to_jsonb(COALESCE(fi.dietary, '{}'::text[]) ||
        CASE
            WHEN COALESCE(fk.halal_certified, false) AND (fk.halal_certified_until IS NULL OR fk.halal_certified_until >= CURRENT_DATE) AND NOT COALESCE(fi.dietary, '{}'::text[]) @> ARRAY['halal'::text] THEN ARRAY['halal'::text]
            ELSE '{}'::text[]
        END), 'mealTimes', to_jsonb(fi.meal_times), 'isSignature', fi.is_signature, 'serves', fi.serves, 'stock', COALESCE(v.total_stock, 0), 'variantId', v.single_variant_id, 'variantCount', COALESCE(v.variant_count, 0::bigint)::integer, 'kitchenId', s.id, 'kitchenName', s.name, 'kitchenOpen', COALESCE(sch.is_open, true), 'kitchenHalalCertified', COALESCE(fk.halal_certified, false) AND (fk.halal_certified_until IS NULL OR fk.halal_certified_until >= CURRENT_DATE), 'kitchenHalalCertifier', fk.halal_certifier, 'categories', to_jsonb(COALESCE(cat.slugs, '{}'::text[])), 'orderable', ord.orderable, 'reason',
        CASE
            WHEN ord.orderable THEN NULL::text
            WHEN avail.av <> 'available'::text AND NOT (nt.h > 0 AND avail.av = ANY (ARRAY['wrong_time'::text, 'wrong_day'::text])) THEN avail.av
            WHEN nt.h = 0 AND NOT COALESCE(sch.is_open, true) THEN 'kitchen_closed'::text
            WHEN COALESCE(v.total_stock, 0) <= 0 THEN 'sold_out'::text
            ELSE NULL::text
        END, 'minNoticeHours', nt.h, 'readyNow', ord.ready_now) AS card,
    ord.ready_now,
    nt.h AS min_notice_hours
   FROM food_items fi
     JOIN products p ON p.id = fi.product_id AND p.status = 'active'::product_status
     JOIN stores s ON s.id = p.store_id
     JOIN food_kitchens fk ON fk.store_id = s.id AND store_is_visible(s.id)
     LEFT JOIN LATERAL ( SELECT pm.url
           FROM product_media pm
          WHERE pm.product_id = p.id AND pm.kind = 'image'::media_kind
          ORDER BY pm."position"
         LIMIT 1) med ON true
     LEFT JOIN LATERAL ( SELECT sum(pv.stock_quantity)::integer AS total_stock,
            count(*) AS variant_count,
                CASE
                    WHEN count(*) = 1 THEN (array_agg(pv.id))[1]
                    ELSE NULL::uuid
                END AS single_variant_id
           FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active) v ON true
     LEFT JOIN LATERAL ( SELECT array_agg(fc.slug::text ORDER BY fc."position", fc.name) AS slugs
           FROM food_item_categories fic
             JOIN food_categories fc ON fc.id = fic.category_id AND fc.is_active
          WHERE fic.product_id = p.id) cat ON true
     LEFT JOIN LATERAL store_schedule_status(s.id) sch(has_schedule, is_open, delivery_available, local_date, local_time, weekday, opens_at, closes_at, is_closed, delivery_opens_at, delivery_closes_at, delivery_closed, is_override, next_open_at) ON true
     LEFT JOIN LATERAL ( SELECT food_item_availability(p.id) AS av) avail ON true
     -- M216: the kitchen's notice, and the two meanings of "can I have this".
     LEFT JOIN LATERAL ( SELECT kitchen_notice_hours(s.id) AS h) nt ON true
     LEFT JOIN LATERAL ( SELECT
            -- READY NOW: M161's definition, and only for a walk-up kitchen.
            avail.av = 'available'::text AND COALESCE(sch.is_open, true) AND COALESCE(v.total_stock, 0) > 0 AND nt.h = 0 AS ready_now,
            -- ORDERABLE: can go in the basket. A notice kitchen is booked for a
            -- LATER slot, so "closed now" and "not served at this hour/day" do
            -- not stop it; food_pickup_slots() re-checks every dish at every
            -- slot, so a dish only offers the times it is actually served.
            CASE
                WHEN nt.h > 0 THEN (avail.av = ANY (ARRAY['available'::text, 'wrong_time'::text, 'wrong_day'::text])) AND COALESCE(v.total_stock, 0) > 0
                ELSE avail.av = 'available'::text AND COALESCE(sch.is_open, true) AND COALESCE(v.total_stock, 0) > 0
            END AS orderable) ord ON true;

-- ── The readers that meant "now" ask ready_now; kitchens carry the notice ───
-- Anchored substitutions with a count guard, the M201 pattern: read the live
-- definition, replace an exact phrase, refuse if the count is not what was
-- measured on 23 Sept 2026.
do $rw$
declare
  r      record;
  v_src  text;
  v_n    int;
begin
  for r in
    select * from (values
      -- "Ready now" chip on /food.
      (1, 'browse_food',  'or c.orderable)', 'or c.ready_now)', 1),
      -- "Quickest": a kitchen that needs a day is not quick, whatever it
      -- quotes for cooking once it starts.
      (2, 'browse_food',  'when p_sort = ''fastest''    then b.prep_max',
                          'when p_sort = ''fastest''    then b.min_notice_hours end asc nulls last,' || chr(10) ||
                          '       case when p_sort = ''fastest''    then b.prep_max', 1),
      -- The first rail, "Ready to order now".
      (3, 'food_home',    'where c.orderable', 'where c.ready_now', 1),
      (4, 'food_home',    '''pickupHint'',  fk.pickup_hint,',
                          '''pickupHint'',  fk.pickup_hint,' || chr(10) ||
                          '             ''minNoticeHours'', kitchen_notice_hours(k.kitchen_id),', 1),
      (5, 'food_kitchen', '''prepMax'',        fk.prep_minutes_max,',
                          '''prepMax'',        fk.prep_minutes_max,' || chr(10) ||
                          '    ''minNoticeHours'', kitchen_notice_hours(k.kitchen_id),', 1),
      -- The guest tracking page: the slot they booked.
      (6, 'lookup_order', '''autoReleaseAt'', o.auto_release_at,',
                          '''autoReleaseAt'', o.auto_release_at,' || chr(10) ||
                          '           ''pickupFrom'',    lower(o.pickup_slot),' || chr(10) ||
                          '           ''pickupTo'',      upper(o.pickup_slot),', 1)
    ) as t(ord, fn, needle, repl, expected)
    order by ord
  loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if v_src is null then raise exception 'M216: % not found', r.fn; end if;

    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    if v_n = 0 and position(r.repl in v_src) > 0 then
      raise notice 'M216: % step % already applied', r.fn, r.ord;
      continue;
    end if;
    if v_n <> r.expected then
      raise exception 'M216: % has % x "%", expected % — shape changed, refusing', r.fn, v_n, r.needle, r.expected;
    end if;
    execute replace(v_src, r.needle, r.repl);
  end loop;
end
$rw$;

-- ── The cook's board keeps a booked order until its day is over ────────────
-- M101's window, plus: an order with a slot stays until a day after that slot
-- (finished or not), and the board is told the slot and sorts by it.
create or replace function public.kitchen_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_ids uuid[]; v_orders jsonb; v_kitchens jsonb;
begin
  select array_agg(k) into v_ids from my_kitchen_ids() k;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception using errcode = 'RR081', message = 'You are not on a kitchen team.';
  end if;

  select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
    into v_kitchens from stores s where s.id = any(v_ids);

  -- M216: in the order it must be COOKED — the slot when there is one.
  select jsonb_agg(o order by coalesce(o->>'pickupFrom', o->>'placedAt'))
    into v_orders
    from (
      select jsonb_build_object(
               'id', ord.id,
               'orderNumber', ord.order_number,
               'kitchen', s.name,
               'status', ord.status::text,
               'customer', split_part(btrim(coalesce(ord.customer_name, '')), ' ', 1),
               'fulfillment', ord.fulfillment_method,
               'placedAt', coalesce(ord.placed_at, ord.created_at),
               -- M216: the booked window. Null for an as-soon-as-ready order.
               'pickupFrom', lower(ord.pickup_slot),
               'pickupTo', upper(ord.pickup_slot),
               'total', ord.total,
               'currency', ord.currency,
               'payOnCollection', (ord.status = 'pending_payment'
                                   and exists (select 1 from payments p
                                                where p.order_id = ord.id and p.provider = 'cash')),
               'waitingOnTransfer', (ord.status = 'pending_payment'
                                     and not exists (select 1 from payments p
                                                      where p.order_id = ord.id and p.provider = 'cash')),
               'awaitingPayment', (ord.status = 'awaiting_payment_confirmation'),
               'hasReceipt', (coalesce(ord.payment_receipt_path, '') <> ''),
               'finished', (ord.status in ('collected','cancelled','refunded')),
               'balanceDue', coalesce((select sum(p.amount) from payments p
                                        where p.order_id = ord.id
                                          and p.status = 'pending'
                                          and p.provider = 'cash'
                                          and ord.status not in ('cancelled','refunded')), 0),
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'name', oi.product_name,
                          'variant', oi.variant_name,
                          'qty', oi.quantity,
                          'productId', pv.product_id,
                          'soldOut', coalesce(fi.sold_out_until > now(), false))
                        order by oi.product_name)
                   from order_items oi
                   left join product_variants pv on pv.id = oi.variant_id
                   left join food_items fi on fi.product_id = pv.product_id
                  where oi.order_id = ord.id), '[]'::jsonb),
               'note', ord.notes
             ) as o
        from orders ord
        join stores s on s.id = ord.store_id
       where ord.store_id = any(v_ids)
         -- M101: evidence outlives the service day. 24h for an ordinary order,
         -- 7 days for one carrying proof of payment — a dispute never happens
         -- during the service the order belongs to.
         and (coalesce(ord.placed_at, ord.created_at) >
              now() - (case when coalesce(ord.payment_receipt_path, '') <> ''
                            then interval '7 days'
                            else interval '24 hours' end)
              -- M216: a booked order belongs to the day it is FOR. With 24
              -- hours' notice the rule above drops every one of them before
              -- that day arrives.
              or (ord.pickup_slot is not null
                  and upper(ord.pickup_slot) > now() - interval '24 hours'))
         and ord.status in ('pending_payment','awaiting_payment_confirmation',
                            'paid','preparing','ready_for_pickup',
                            'collected','cancelled','refunded')
    ) q;

  return jsonb_build_object(
    'kitchens', coalesce(v_kitchens, '[]'::jsonb),
    'orders',   coalesce(v_orders, '[]'::jsonb));
end;
$function$;

-- ── The public key cannot place orders ─────────────────────────────────────
revoke execute on function public.create_food_order(
  uuid, jsonb, text, text, text, text, text, double precision, double precision,
  text, uuid, integer, uuid, text, date, time without time zone) from anon;

-- ── The owner's decision ───────────────────────────────────────────────────
update public.food_kitchens
   set min_notice_hours = 24, preorder_days = 2, updated_at = now()
 where store_id = 'd522e765-78c3-43da-ab4e-db2b7977acaa';

update public.marketplace_settings set food_preorder_enabled = true;

-- New function, new column: PostgREST must see them before the site asks.
notify pgrst, 'reload schema';

-- ── Proof ──────────────────────────────────────────────────────────────────
do $assert$
declare
  v_cb  constant uuid := 'd522e765-78c3-43da-ab4e-db2b7977acaa';
  -- A fixed Wednesday 10:00 in Rodrigues, so the proof does not depend on
  -- when it runs. The kitchen opens 08:00-17:00 Monday to Saturday.
  v_wed constant timestamptz := timestamptz '2026-09-23 10:00 Indian/Mauritius';
  v_var constant uuid := '25f84a73-675e-4f35-9d49-aa24543598c2';   -- a Chez Banane dish
  v_first record;
  v_try timestamptz;
  v_leak boolean := false;
begin
  if kitchen_notice_hours(v_cb) <> 24 then
    raise exception 'M216: Chez Banane notice is %, expected 24', kitchen_notice_hours(v_cb);
  end if;
  if (select preorder_days from food_kitchens where store_id = v_cb) <> 2 then
    raise exception 'M216: Chez Banane horizon is not 2 days';
  end if;

  -- Nothing today; the first offer is tomorrow at 10:00 — exactly 24h out.
  select * into v_first from food_pickup_slots(v_cb, null, v_wed)
   where slot_time is not null order by starts_at limit 1;
  if v_first.slot_date is distinct from date '2026-09-24' or v_first.slot_time is distinct from time '10:00' then
    raise exception 'M216: first slot is % %, expected 2026-09-24 10:00', v_first.slot_date, v_first.slot_time;
  end if;
  if not exists (select 1 from food_pickup_slots(v_cb, null, v_wed)
                  where slot_date = date '2026-09-23' and reason = 'notice') then
    raise exception 'M216: today is not explained as "notice"';
  end if;
  if not exists (select 1 from food_pickup_slots(v_cb, null, v_wed)
                  where slot_date = date '2026-09-25' and slot_time is not null) then
    raise exception 'M216: no Friday slots — the two-day horizon is not open';
  end if;

  -- The validator agrees with every offer, and refuses inside the notice and ASAP.
  for v_first in select * from food_pickup_slots(v_cb, null, v_wed) where slot_time is not null loop
    perform food_pickup_window(v_cb, v_first.slot_date, v_first.slot_time, v_wed);
  end loop;
  begin
    perform food_pickup_window(v_cb, date '2026-09-23', time '15:00', v_wed);
    raise exception 'M216: a same-day slot was accepted';
  exception when sqlstate 'RR030' then null;
  end;
  begin
    perform food_pickup_window(v_cb, null, null, v_wed);
    raise exception 'M216: ASAP was accepted for a kitchen that needs notice';
  exception when sqlstate 'RR030' then null;
  end;
  -- Grace: 25 minutes after the list was drawn, its first slot still holds.
  perform food_pickup_window(v_cb, date '2026-09-24', time '10:00', v_wed + interval '25 minutes');

  -- The menu: orderable at any hour, never "ready now".
  if exists (select 1 from food_catalog where kitchen_id = v_cb and (not orderable or ready_now)) then
    raise exception 'M216: a Chez Banane dish is unorderable or claims to be ready now';
  end if;
  if exists (select 1 from food_catalog where kitchen_id = v_cb and (card->>'minNoticeHours')::int <> 24) then
    raise exception 'M216: the card does not carry the notice';
  end if;
  if (browse_food(p_orderable_only => true)->>'total')::int <>
     (select count(*) from food_catalog where ready_now) then
    raise exception 'M216: "Ready now" does not follow ready_now';
  end if;
  if (food_kitchen('chez-banane')->>'minNoticeHours')::int is distinct from 24 then
    raise exception 'M216: the kitchen page does not carry the notice';
  end if;

  -- The wall exists; the four readers were rewritten.
  if not exists (select 1 from pg_trigger where tgname = 't_orders_kitchen_notice'
                  and tgrelid = 'public.orders'::regclass and not tgisinternal) then
    raise exception 'M216: the orders trigger is missing';
  end if;

  -- The wall, EXERCISED. An order for a time inside the notice, sent straight
  -- to create_order — the route's ASAP branch, or a signed-in client calling
  -- the RPC — must be refused. The instant is tomorrow 10:00, when the kitchen
  -- is open (so "closed right now", RR010, cannot answer first), and inside
  -- 24 hours of any evening this runs. It runs in a SEALED sub-transaction:
  -- if the wall ever let the order through, the block undoes it before
  -- failing the migration, so a proof can never leave a real order behind.
  v_try := (((now() at time zone 'Indian/Mauritius')::date + 1) + time '10:00') at time zone 'Indian/Mauritius';
  if v_try + interval '30 minutes' <= now() + interval '24 hours'
     and extract(dow from (v_try at time zone 'Indian/Mauritius')) <> 0 then
    begin
      perform set_config('rr.fulfil_at', v_try::text, true);
      perform * from create_order(v_cb,
        jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1)),
        'M216 proof', '57000000', 'pickup', null, 'cash', null, null, null, null, null,
        gen_random_uuid(), 'm216-proof@example.com');
      raise exception using errcode = 'P0216', message = 'accepted';
    exception
      when sqlstate 'RR030' then null;             -- the wall held
      when sqlstate 'P0216' then v_leak := true;   -- undone with the sub-transaction
    end;
    perform set_config('rr.fulfil_at', '', true);
    if v_leak then
      raise exception 'M216: an order inside the notice got past the wall';
    end if;
  else
    raise notice 'M216: wall proof skipped — tomorrow 10:00 is not inside the notice from now';
  end if;
  if position('pickupFrom' in pg_get_functiondef('public.lookup_order(text,text)'::regprocedure)) = 0
     or position('pickupFrom' in pg_get_functiondef('public.kitchen_dashboard()'::regprocedure)) = 0 then
    raise exception 'M216: the slot does not reach the tracking page or the board';
  end if;

  -- One overload each; guests still see times; the public key cannot order.
  if (select count(*) from pg_proc where proname = 'food_pickup_slots') <> 1
     or (select count(*) from pg_proc where proname = 'food_pickup_window') <> 1 then
    raise exception 'M216: a second overload appeared';
  end if;
  if not has_function_privilege('anon', 'public.food_pickup_slots(uuid, uuid[], timestamptz)', 'execute')
     or not has_function_privilege('anon', 'public.kitchen_notice_hours(uuid)', 'execute') then
    raise exception 'M216: guests can no longer see collection times';
  end if;
  if has_function_privilege('anon', 'public.create_food_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid, text, date, time without time zone)', 'execute') then
    raise exception 'M216: anon can still create orders';
  end if;
  if not has_function_privilege('service_role', 'public.create_food_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid, text, date, time without time zone)', 'execute') then
    raise exception 'M216: guest checkout (service role) lost create_food_order';
  end if;
end
$assert$;

commit;
