-- M47 — Ticket packages: the content a customer actually chooses between.
--
-- M34 made a ticket type a product_variant and gave it a sales window. That is
-- enough to SELL a ticket and nowhere near enough to make somebody WANT one.
-- The spec's "CHOOSE YOUR EXPERIENCE" screen needs each package to carry its
-- own image, subtitle, description and list of inclusions — VIP is not
-- "Standard but dearer", it is a different promise, and a customer cannot tell
-- them apart from a name and a price.
--
-- ── STILL NO NEW INVENTORY ──────────────────────────────────────────────────
-- Capacity remains product_variants.stock_quantity: row-locked in create_order,
-- backed by a stock_non_negative CHECK, proven at 8-way concurrency. This
-- migration adds CONTENT columns and a write path. It does not add a second
-- place where a number could disagree with the first.
--
-- ── THE HARD PART: EDITING CAPACITY ─────────────────────────────────────────
-- stock_quantity is REMAINING, not total. An organiser typing "capacity 400"
-- into a package that has already sold 50 does not mean "400 left" — they mean
-- 400 in the room. Writing 400 into stock_quantity would silently create 50
-- extra seats and oversell the venue.
--
-- So the RPC derives what is already spoken for from the ORDERS (the only
-- authority), computes the new remaining, and refuses outright if the organiser
-- tries to set capacity below what has already been sold. The change is applied
-- as an `adjustment` row in inventory_movements — the same ledger every sale
-- and restock flows through — rather than by writing stock_quantity directly,
-- so "why did this number move?" always has an answer.

alter table ticket_types
  add column if not exists subtitle    text,
  add column if not exists inclusions  text[] not null default '{}',
  add column if not exists image_url   text;

comment on column ticket_types.subtitle is
  'One line under the package name on the selection card ("General admission access"). Not the description — this is what a customer reads while scanning three cards on a phone.';
comment on column ticket_types.inclusions is
  'What this package gets you, as discrete bullets ("Priority entrance", "VIP area"). A list rather than prose because the customer''s real question is "what is different about this one", and prose does not answer it at a glance.';
comment on column ticket_types.image_url is
  'Package-specific image. Deliberately NOT the event poster: forcing every tier to share one picture is what makes a ticket page look like a product listing.';

-- ── The write path ──────────────────────────────────────────────────────────
create or replace function public.upsert_ticket_package(
  p_store_id      uuid,
  p_variant_id    uuid    default null,   -- null = create
  p_name          text    default null,
  p_subtitle      text    default null,
  p_description   text    default null,
  p_inclusions    text[]  default null,
  p_image_url     text    default null,
  p_price         integer default null,
  p_capacity      integer default null,
  p_sales_start   timestamptz default null,
  p_sales_end     timestamptz default null,
  p_min_per_order integer default 1,
  p_max_per_order integer default null,
  p_display_order integer default 0,
  p_is_active     boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_product   uuid;
  v_variant   uuid;
  v_allocated integer;
  v_current   integer;
  v_target    integer;
  v_delta     integer;
begin
  -- M43's predicate. Takes no organiser id, reads status live, so a suspended
  -- or unassigned organiser holding the URL is refused here.
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception using errcode='RR005', message='The package needs a name.';
  end if;
  if p_price is null or p_price < 0 then
    raise exception using errcode='RR005', message='Enter a price of zero or more.';
  end if;
  if p_capacity is null or p_capacity < 0 then
    raise exception using errcode='RR005', message='Enter how many tickets exist for this package.';
  end if;
  if p_sales_start is not null and p_sales_end is not null and p_sales_end <= p_sales_start then
    raise exception using errcode='RR005', message='Sales must end after they start.';
  end if;
  if p_max_per_order is not null and p_max_per_order < greatest(coalesce(p_min_per_order,1), 1) then
    raise exception using errcode='RR005', message='The maximum per order cannot be below the minimum.';
  end if;

  -- One product per event holds every ticket type; it exists only to satisfy
  -- the products→variants shape the marketplace already uses. Created on first
  -- package so an organiser never has to know it exists.
  select p.id into v_product from products p where p.store_id = p_store_id
   order by p.created_at limit 1;
  if v_product is null then
    insert into products (store_id, name, slug, status)
    values (p_store_id, 'Tickets', 'tickets-'||substr(md5(random()::text),1,8), 'active')
    returning id into v_product;
  end if;

  if p_variant_id is null then
    insert into product_variants (product_id, name, price, stock_quantity, is_active)
    values (v_product, btrim(p_name), p_price, p_capacity, coalesce(p_is_active, true))
    returning id into v_variant;

    -- Opening capacity recorded in the ledger too, so a package's whole history
    -- reads from one place.
    insert into inventory_movements (variant_id, delta, reason, note, created_by)
    values (v_variant, 0, 'adjustment', 'package created with capacity '||p_capacity, auth.uid());
  else
    -- The variant must belong to THIS event. Without this, an organiser could
    -- pass another event's variant id and edit its price and capacity.
    select v.id into v_variant
      from product_variants v join products p on p.id = v.product_id
     where v.id = p_variant_id and p.store_id = p_store_id;
    if v_variant is null then
      raise exception using errcode='RR003', message='Package not found.';
    end if;

    -- Everything already spoken for, read from the orders themselves — the only
    -- authority. Cancelled and refunded orders are excluded because they have
    -- already returned their stock via the ledger; counting them would
    -- double-subtract.
    select coalesce(sum(oi.quantity), 0)::int into v_allocated
      from order_items oi join orders o on o.id = oi.order_id
     where oi.variant_id = v_variant
       and o.status not in ('cancelled','refunded');

    if p_capacity < v_allocated then
      raise exception using errcode='RR005',
        message=format('You have already sold or reserved %s of these. Capacity cannot go below that.', v_allocated);
    end if;

    select stock_quantity into v_current from product_variants where id = v_variant for update;
    v_target := p_capacity - v_allocated;
    v_delta  := v_target - v_current;

    if v_delta <> 0 then
      -- Through the ledger, never a direct write: the trigger applies the delta
      -- and the row explains the change forever.
      insert into inventory_movements (variant_id, delta, reason, note, created_by)
      values (v_variant, v_delta, 'adjustment',
              format('capacity set to %s (%s already allocated)', p_capacity, v_allocated), auth.uid());
    end if;

    update product_variants
       set name = btrim(p_name), price = p_price, is_active = coalesce(p_is_active, true)
     where id = v_variant;
  end if;

  insert into ticket_types (
    variant_id, subtitle, description, inclusions, image_url,
    sales_start, sales_end, min_per_order, max_per_order, display_order)
  values (
    v_variant, nullif(btrim(coalesce(p_subtitle,'')),''), nullif(btrim(coalesce(p_description,'')),''),
    coalesce(p_inclusions, '{}'), nullif(btrim(coalesce(p_image_url,'')),''),
    p_sales_start, p_sales_end, greatest(coalesce(p_min_per_order,1),1), p_max_per_order,
    coalesce(p_display_order,0))
  on conflict (variant_id) do update set
    subtitle      = excluded.subtitle,
    description   = excluded.description,
    inclusions    = excluded.inclusions,
    image_url     = excluded.image_url,
    sales_start   = excluded.sales_start,
    sales_end     = excluded.sales_end,
    min_per_order = excluded.min_per_order,
    max_per_order = excluded.max_per_order,
    display_order = excluded.display_order;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'event_organizer',
          case when p_variant_id is null then 'package.created' else 'package.updated' end,
          'ticket_types', v_variant::text,
          jsonb_build_object('storeId', p_store_id, 'name', btrim(p_name),
                             'price', p_price, 'capacity', p_capacity));

  return jsonb_build_object('variantId', v_variant, 'created', p_variant_id is null);
end;
$function$;

revoke all on function public.upsert_ticket_package(uuid,uuid,text,text,text,text[],text,integer,integer,timestamptz,timestamptz,integer,integer,integer,boolean) from public, anon;
grant execute on function public.upsert_ticket_package(uuid,uuid,text,text,text,text[],text,integer,integer,timestamptz,timestamptz,integer,integer,integer,boolean) to authenticated, service_role;

comment on function public.upsert_ticket_package(uuid,uuid,text,text,text,text[],text,integer,integer,timestamptz,timestamptz,integer,integer,integer,boolean) is
  'Creates or edits one ticket package. Capacity is TOTAL, not remaining: the RPC derives what is already sold from the orders, refuses to set capacity below it, and applies the difference as an inventory_movements adjustment so the ledger explains every change. Gated by can_manage_event() (M47).';

-- Hiding a package rather than deleting it: an event's history — orders, order
-- items, issued tickets — references the variant, and a delete would either
-- fail on the foreign key or erase what somebody bought.
create or replace function public.set_ticket_package_active(
  p_store_id uuid, p_variant_id uuid, p_active boolean
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  update product_variants v
     set is_active = coalesce(p_active, false)
    from products p
   where v.product_id = p.id and v.id = p_variant_id and p.store_id = p_store_id;
  if not found then
    raise exception using errcode='RR003', message='Package not found.';
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'event_organizer', 'package.visibility', 'ticket_types', p_variant_id::text,
          jsonb_build_object('isActive', p_active));
  return jsonb_build_object('variantId', p_variant_id, 'isActive', p_active);
end;
$function$;

revoke all on function public.set_ticket_package_active(uuid,uuid,boolean) from public, anon;
grant execute on function public.set_ticket_package_active(uuid,uuid,boolean) to authenticated, service_role;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='ticket_types' and column_name='image_url') then
    raise exception 'M47: package content columns missing'; end if;

  if has_function_privilege('anon','public.upsert_ticket_package(uuid,uuid,text,text,text,text[],text,integer,integer,timestamptz,timestamptz,integer,integer,integer,boolean)','EXECUTE') then
    raise exception 'M47: anon can write packages'; end if;

  -- The gate must be M43's predicate, not a hand-rolled check.
  if position('can_manage_event' in
      (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='upsert_ticket_package')) = 0 then
    raise exception 'M47: upsert_ticket_package is not gated by can_manage_event'; end if;

  -- Capacity must never be written directly — the ledger is the only path.
  if position('update product_variants set stock_quantity' in
      (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='upsert_ticket_package')) > 0 then
    raise exception 'M47: capacity is written directly instead of through inventory_movements'; end if;

  if position('for update of v' in
      (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='create_order')) = 0 then
    raise exception 'M47: the stock row lock vanished from create_order'; end if;
end;
$$;
