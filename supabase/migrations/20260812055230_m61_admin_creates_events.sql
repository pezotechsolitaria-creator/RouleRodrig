-- M61 — there was no way to create an event.
--
-- The homepage promo strip, the /events listing, the checkout, the tickets, the
-- scanner and the fee model all work and are tested. None of it has ever been
-- reachable by the owner, because nothing in the product creates an event: no
-- RPC, no API route, no admin screen. The single event in this database was
-- inserted by hand during M33 development.
--
-- So "I don't see events on the main page" is not a rendering bug. EventsPromo
-- deliberately renders nothing when there is no upcoming event — an empty
-- "Events" heading advertises that the island has nothing on — and there is no
-- upcoming event because there is no way to make one.
--
-- ── WHY AN EVENT IS A STORE, AGAIN ──────────────────────────────────────────
-- events.store_id is a FK to stores, whose merchant_id is NOT NULL, whose
-- merchants.owner_id is NOT NULL. Creating an event the naive way therefore
-- mints a working MERCHANT login as a side effect (the t_merchant_provision_owner
-- trigger). M40 solved that with one permanent platform merchant per system
-- domain; this function attaches every new event to system_key='events' and
-- never creates a merchant. That is what keeps organisers from becoming
-- marketplace sellers.
--
-- ── PUBLISHING IS A SEPARATE ACT ────────────────────────────────────────────
-- Creation always yields a DRAFT. An event goes public only through
-- admin_publish_event(), which refuses unless it can actually sell: at least one
-- active ticket package, and a payment method the organiser can be paid by.
-- Publishing an event nobody can buy a ticket for is the exact dead end this
-- codebase keeps rediscovering, so it is refused with a message naming what is
-- missing rather than allowed and discovered by a customer.
--
-- NOTE: the slug de-duplication below casts to citext, which FAILS at runtime —
-- this function pins search_path to public and citext lives in `extensions`.
-- M61a fixes it. Kept here as it ran.

create or replace function public.admin_create_event(
  p_name          text,
  p_starts_at     timestamptz,
  p_slug          text default null,
  p_ends_at       timestamptz default null,
  p_doors_open_at timestamptz default null,
  p_venue_name    text default null,
  p_venue_address text default null,
  p_timezone      text default 'Indian/Mauritius',
  p_support_phone text default null,
  p_terms         text default null,
  p_capacity      int default null,
  p_is_test       boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_merchant uuid; v_store uuid; v_slug text; v_base text; v_n int := 1;
begin
  -- The M25 gate: /admin arrives as service_role with auth.uid() NULL, so
  -- is_platform_admin() can never be true for it. "If there IS a user, it must
  -- be an admin" admits the panel and refuses a signed-in organiser.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception using errcode='RR005', message='The event needs a name.';
  end if;
  if p_starts_at is null then
    raise exception using errcode='RR005', message='The event needs a start date and time.';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception using errcode='RR005', message='The end time has to be after the start time.';
  end if;
  if p_capacity is not null and p_capacity <= 0 then
    raise exception using errcode='RR005', message='Capacity has to be at least 1, or empty for no limit.';
  end if;

  select id into v_merchant from merchants where system_key = 'events';
  if v_merchant is null then
    raise exception using errcode='RR004',
      message='The platform events merchant is missing. M40 must run before events can be created.';
  end if;

  v_base := lower(regexp_replace(btrim(coalesce(nullif(btrim(coalesce(p_slug,'')),''), p_name)),
                                 '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'event'; end if;
  v_slug := v_base;
  while exists (select 1 from stores s where s.slug = v_slug::citext) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into stores (merchant_id, name, slug, status, is_test)
  values (v_merchant, btrim(p_name), v_slug::citext, 'draft', coalesce(p_is_test, false))
  returning id into v_store;

  insert into events (store_id, starts_at, ends_at, doors_open_at, venue_name,
                      venue_address, timezone, support_phone, terms, capacity)
  values (v_store, p_starts_at, p_ends_at, p_doors_open_at,
          nullif(btrim(coalesce(p_venue_name,'')),''),
          nullif(btrim(coalesce(p_venue_address,'')),''),
          coalesce(nullif(btrim(coalesce(p_timezone,'')),''), 'Indian/Mauritius'),
          nullif(btrim(coalesce(p_support_phone,'')),''),
          nullif(btrim(coalesce(p_terms,'')),''),
          p_capacity);

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'event.created', 'stores', v_store::text,
          jsonb_build_object('name', btrim(p_name), 'slug', v_slug, 'startsAt', p_starts_at,
                             'isTest', coalesce(p_is_test,false)));

  return jsonb_build_object('storeId', v_store, 'slug', v_slug, 'status', 'draft');
end;
$function$;

create or replace function public.admin_update_event(
  p_store_id      uuid,
  p_name          text default null,
  p_starts_at     timestamptz default null,
  p_ends_at       timestamptz default null,
  p_doors_open_at timestamptz default null,
  p_venue_name    text default null,
  p_venue_address text default null,
  p_support_phone text default null,
  p_terms         text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if not exists (select 1 from events where store_id = p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  if p_name is not null and btrim(p_name) <> '' then
    update stores set name = btrim(p_name) where id = p_store_id;
  end if;

  update events set
    starts_at     = coalesce(p_starts_at, starts_at),
    ends_at       = coalesce(p_ends_at, ends_at),
    doors_open_at = coalesce(p_doors_open_at, doors_open_at),
    venue_name    = coalesce(nullif(btrim(coalesce(p_venue_name,'')),''), venue_name),
    venue_address = coalesce(nullif(btrim(coalesce(p_venue_address,'')),''), venue_address),
    support_phone = coalesce(nullif(btrim(coalesce(p_support_phone,'')),''), support_phone),
    terms         = coalesce(nullif(btrim(coalesce(p_terms,'')),''), terms)
  where store_id = p_store_id;

  return jsonb_build_object('storeId', p_store_id, 'updated', true);
end;
$function$;

-- ── Publish / unpublish ─────────────────────────────────────────────────────
create or replace function public.admin_publish_event(p_store_id uuid, p_publish boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_packages int; v_pay record; v_is_test boolean;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  select s.is_test into v_is_test from stores s
    join events e on e.store_id = s.id where s.id = p_store_id;
  if v_is_test is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  if not p_publish then
    update stores set status = 'draft' where id = p_store_id;
    return jsonb_build_object('storeId', p_store_id, 'status', 'draft');
  end if;

  -- A test event must never become public. M48 already makes store_is_visible()
  -- false for is_test, so publishing one would produce a store marked active
  -- that still shows nowhere — confusing rather than dangerous, but a refusal
  -- with a reason beats a button that appears to work.
  if v_is_test then
    raise exception using errcode='RR004',
      message='This is a test event. Test events are never shown publicly — create a real one to publish.';
  end if;

  -- Refuse to publish something nobody can buy. Both halves have been a real
  -- dead end in this codebase before.
  select count(*) into v_packages
    from product_variants v
    join products p on p.id = v.product_id
    join ticket_types tt on tt.variant_id = v.id
   where p.store_id = p_store_id and v.is_active;
  if v_packages = 0 then
    raise exception using errcode='RR004',
      message='Add at least one ticket package before publishing, or nobody can buy a ticket.';
  end if;

  select accepts_cash, accepts_bank_transfer into v_pay
    from store_payment_settings where store_id = p_store_id;
  if v_pay is null or not (coalesce(v_pay.accepts_cash,false) or coalesce(v_pay.accepts_bank_transfer,false)) then
    raise exception using errcode='RR004',
      message='Set how the organiser gets paid before publishing, or checkout will refuse every order.';
  end if;

  update stores set status = 'active' where id = p_store_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'event.published', 'stores', p_store_id::text,
          jsonb_build_object('packages', v_packages));

  return jsonb_build_object('storeId', p_store_id, 'status', 'active');
end;
$function$;

-- Everything the admin screen needs, including WHY an event cannot be published.
create or replace function public.admin_list_events()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'storeId', s.id, 'slug', s.slug, 'name', s.name,
             'status', s.status, 'isTest', s.is_test,
             'phase', event_phase(s.id),
             'publiclyVisible', store_is_visible(s.id),
             'startsAt', e.starts_at, 'endsAt', e.ends_at,
             'venueName', e.venue_name, 'venueAddress', e.venue_address,
             'capacity', e.capacity, 'cancelledAt', e.cancelled_at,
             'packages', (select count(*) from product_variants v
                            join products p on p.id = v.product_id
                            join ticket_types tt on tt.variant_id = v.id
                           where p.store_id = s.id and v.is_active),
             'hasPaymentMethod', coalesce((select sp.accepts_cash or sp.accepts_bank_transfer
                                             from store_payment_settings sp where sp.store_id = s.id), false),
             'organisers', (select count(*) from event_organizer_assignments a
                             where a.store_id = s.id and a.role = 'organizer'),
             'ticketsSold', coalesce((select sum(oi.quantity)::int
                                        from orders o join order_items oi on oi.order_id = o.id
                                       where o.store_id = s.id
                                         and o.status in ('paid','preparing','ready_for_pickup','collected')), 0))
           order by e.starts_at desc)
    from stores s join events e on e.store_id = s.id), '[]'::jsonb);
end;
$function$;

revoke all on function public.admin_create_event(text, timestamptz, text, timestamptz, timestamptz, text, text, text, text, text, int, boolean) from public, anon, authenticated;
revoke all on function public.admin_update_event(uuid, text, timestamptz, timestamptz, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_publish_event(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_list_events() from public, anon, authenticated;
grant execute on function public.admin_create_event(text, timestamptz, text, timestamptz, timestamptz, text, text, text, text, text, int, boolean) to service_role;
grant execute on function public.admin_update_event(uuid, text, timestamptz, timestamptz, timestamptz, text, text, text, text) to service_role;
grant execute on function public.admin_publish_event(uuid, boolean) to service_role;
grant execute on function public.admin_list_events() to service_role;

do $$
declare v_name text; v_src text;
begin
  foreach v_name in array array['admin_create_event','admin_update_event','admin_publish_event','admin_list_events']
  loop
    select pg_get_functiondef(p.oid) into v_src from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name;
    if position('auth.uid() is not null and not is_platform_admin()' in v_src) = 0 then
      raise exception '%: missing the M25 admin gate.', v_name; end if;
    if has_function_privilege('authenticated', (select p.oid from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name), 'EXECUTE') then
      raise exception '%: authenticated can execute an admin function.', v_name; end if;
  end loop;

  -- Creation must never mint a merchant.
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_create_event';
  if position('insert into merchants' in v_src) > 0 then
    raise exception 'M61: create_event inserts a merchant — organisers would become marketplace sellers.'; end if;
  if position('''draft''' in v_src) = 0 then
    raise exception 'M61: create_event does not start in draft.'; end if;
end;
$$;
