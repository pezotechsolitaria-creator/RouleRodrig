-- ── M149d — quoting and accepting gate on the cargo kind ───────────────────
--
-- Defence in depth. m149c stops a lorry SEEING somebody's dinner on the board;
-- these two stop it taking the job even if the RPC is called directly, which is
-- the only version of the rule that is actually a rule.
--
-- offer_delivery_quote now says WHICH gate refused, because "you cannot take
-- this" without a reason reads as the platform playing favourites.

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
  -- Bounds, not business rules: wide enough that the platform is not setting
  -- prices, narrow enough that a slipped decimal cannot post Rs 2,000,000.
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

  if not vehicle_can_handle(v_d.vehicle_type, v_r.size_class, 'general') then
    raise exception 'This is a large item and needs a car, van, pickup or lorry.'
      using errcode = 'P0001';
  end if;
  if not vehicle_can_handle(v_d.vehicle_type, v_r.size_class, v_r.cargo_kind) then
    raise exception 'This job is not a fit for your vehicle.' using errcode = 'P0001';
  end if;

  -- One standing price per driver per request: re-quoting REPLACES, because two
  -- live prices from the same driver is not a choice a customer can make.
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

create or replace function public.accept_delivery_quote(p_quote_id uuid, p_expected_fee integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_q       delivery_quotes%rowtype;
  v_r       delivery_requests%rowtype;
  v_set     delivery_settings%rowtype;
  v_share   integer;
  v_driver  integer;
  v_active  integer;
  v_id      uuid;
begin
  select * into v_q from delivery_quotes where id = p_quote_id for update;
  if not found then
    raise exception 'That quote no longer exists.' using errcode = 'P0001';
  end if;

  select * into v_r from delivery_requests where id = v_q.request_id for update;
  if not found then
    raise exception 'That request no longer exists.' using errcode = 'P0001';
  end if;

  -- A double tap is not an error.
  if v_q.status = 'accepted' then
    select id into v_id from deliveries where request_id = v_r.id;
    if v_id is not null then return v_id; end if;
  end if;

  if v_r.status = 'accepted' then
    raise exception 'Another driver has already been chosen for this delivery.'
      using errcode = 'P0001';
  end if;
  if v_r.status <> 'open' then
    raise exception 'This request is no longer open.' using errcode = 'P0001';
  end if;
  if v_q.status <> 'offered' then
    raise exception 'That quote is no longer available.' using errcode = 'P0001';
  end if;

  -- M145 — CONSENT. A re-quote keeps the quote's id, so the id the customer
  -- tapped can carry a price they never saw. The fee still comes from the
  -- database; p_expected_fee is only what was on their screen.
  if p_expected_fee is not null and v_q.fee <> p_expected_fee then
    raise exception 'That driver changed their price. Check the new one and choose again.'
      using errcode = 'P0001';
  end if;

  -- M139 — the clock, which nothing checked.
  if v_r.expires_at is not null and v_r.expires_at <= now() then
    raise exception 'This request has expired. Post it again and drivers will see it fresh.'
      using errcode = 'P0001';
  end if;
  if v_q.expires_at is not null and v_q.expires_at <= now() then
    raise exception 'That price has expired.' using errcode = 'P0001';
  end if;

  -- Approved, on duty, AND the right vehicle for this cargo.
  if not exists (
    select 1 from delivery_drivers d
     where d.id = v_q.driver_id
       and d.status = 'approved'
       and d.availability <> 'offline'
       and vehicle_can_handle(d.vehicle_type, v_r.size_class, v_r.cargo_kind)
  ) then
    raise exception 'That driver is not available any more. Choose another price.'
      using errcode = 'P0001';
  end if;

  select * into v_set from delivery_settings where id = 'main';

  -- M140 — the owner's limit, enforced at the moment it becomes real.
  select count(*) into v_active from deliveries
   where driver_id = v_q.driver_id
     and status in ('assigned','going_to_pickup','arrived_at_pickup',
                    'picked_up','out_for_delivery','arrived');
  if v_active >= v_set.max_active_deliveries then
    raise exception 'That driver has their hands full right now. Choose another price, or try them again later.'
      using errcode = 'P0001';
  end if;

  select coalesce(driver_share_percent, 80) into v_share from delivery_settings where id = 'main';
  v_driver := round(v_q.fee * v_share / 100.0);

  insert into deliveries (
    request_id, store_id, order_id, driver_id, status,
    customer_fee, driver_earning, platform_fee,
    dropoff_lat, dropoff_lng, dropoff_note,
    pin, assigned_at, pickup_due_at, delivery_due_at,
    size_class, cargo_kind
  ) values (
    v_r.id, null, null, v_q.driver_id, 'assigned',
    v_q.fee, v_driver, v_q.fee - v_driver,
    v_r.dropoff_lat, v_r.dropoff_lng, v_r.dropoff_text,
    mint_delivery_pin(), now(),
    now() + make_interval(mins => v_set.pickup_window_minutes),
    now() + make_interval(mins => v_set.delivery_window_minutes),
    v_r.size_class, v_r.cargo_kind
  ) returning id into v_id;

  update delivery_quotes set status = 'accepted' where id = v_q.id;
  update delivery_quotes set status = 'declined'
   where request_id = v_r.id and id <> v_q.id and status = 'offered';
  update delivery_requests set status = 'accepted' where id = v_r.id;

  -- M116: availability is DERIVED, so it must be re-minted.
  perform sync_driver_availability(v_q.driver_id);

  update driver_metrics set offers_accepted = offers_accepted + 1, updated_at = now()
   where driver_id = v_q.driver_id;

  perform log_delivery_event(
    v_id, 'customer', v_r.customer_id, 'delivery.quote_accepted',
    null, 'assigned'::delivery_status, null,
    jsonb_build_object('quoteId', v_q.id, 'fee', v_q.fee,
                       'driverEarning', v_driver, 'kind', v_r.kind,
                       'sizeClass', v_r.size_class, 'cargoKind', v_r.cargo_kind)
  );
  return v_id;
end;
$fn$;

-- The engine stays granted to NOBODY: it is reached only through the two
-- ownership-proving wrappers.
revoke all on function public.accept_delivery_quote(uuid, integer) from public, anon, authenticated;

do $assert$
begin
  if has_function_privilege('authenticated','public.accept_delivery_quote(uuid, integer)','execute') then
    raise exception 'M149d: the accept engine is directly callable';
  end if;
  if not has_function_privilege('authenticated','public.offer_delivery_quote(uuid, integer, text)','execute') then
    raise exception 'M149d: a driver cannot reach offer_delivery_quote';
  end if;
end;
$assert$;
