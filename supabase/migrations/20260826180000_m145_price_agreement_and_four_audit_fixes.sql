-- ── M145 — what a full adversarial audit found ─────────────────────────────
--
-- A six-lens audit of M136–M144, every finding independently refuted before it
-- was believed: 33 claimed, 31 survived. This migration is the database half of
-- the five that matter most. (The client half — the phone normaliser, the
-- guest push identity, the honest copy — ships alongside it.)
--
-- ── 1. A null ORIGIN excluded every driver who has a location ──────────────
-- dispatch_candidates() computed v_deg from the radius alone, then filtered
-- `l.lat between v_lat - v_deg and v_lat + v_deg`. With v_lat NULL that
-- comparison is NULL — not true — so the driver was dropped. `l.driver_id is
-- null` saved only drivers who have NEVER reported a position.
--
-- A Deliver Anything job has no shop, and its request carries a village name
-- rather than coordinates, so the origin is routinely NULL. A direct delivery
-- that lost its driver was therefore re-offered to NOBODY for rounds 1–3 (~30
-- minutes) and only reached anyone once the ladder ran past its last radius.
--
-- I probed this myself and got the wrong answer first: my test driver has no
-- driver_locations row, so it passed. The verifier that added a location got 0.
-- Hence the one-line fix, and hence the habit: a probe that cannot fail is not
-- a probe.
--
-- ── 2. PRICE AGREEMENT ─────────────────────────────────────────────────────
-- offer_delivery_quote() UPDATES a driver's existing quote in place, keeping
-- its id. So the id on the customer's confirm sheet could carry a DIFFERENT
-- price by the time they tapped Book — and they were charged the new one,
-- silently, having agreed to the old one.
--
-- The fee still comes from the database; the browser never sets a price. What
-- the browser now sends is the price the customer SAW, and a mismatch is
-- refused. That is consent, not trust.
--
-- Dropped and recreated rather than replaced: adding an argument makes a
-- competing OVERLOAD, and a defaulted second parameter would make the existing
-- one-argument call ambiguous. An assertion below pins that exactly one
-- accept_delivery_quote survives.
--
-- Two more went in while the function was open:
--   * availability <> 'offline' — a driver who has gone off duty is telling the
--     system they cannot come. Booking them anyway commits the customer to
--     somebody the platform knows is unavailable, then penalises the driver.
--   * mint_delivery_pin() instead of lpad(floor(random()*10000)) — M131 made
--     that the single minter and this path was still rolling its own.
--
-- ── 3. Cancel could wipe a parcel already in a car ─────────────────────────
-- M143 refused cancellation for picked_up / out_for_delivery / arrived. But a
-- delivery can go picked_up → requires_admin, and requires_admin was not on the
-- list — so the customer could cancel a job whose parcel was in the driver's
-- car, and the driver was told "do not collect it" about a thing they were
-- already carrying. The guard is now keyed on WHETHER PICKUP HAPPENED.
--
-- ── 4. The customer's own list said "Driver booked" for ever ───────────────
-- my_delivery_requests() returned no delivery status, so /deliver reproduced
-- exactly the defect M141 fixed on the tracker — including for jobs already
-- delivered, cancelled, or whose driver had walked away. Three of the six audit
-- lenses found this independently.
--
-- ── 5. An off-duty driver could not withdraw a standing price ──────────────
-- driver_open_requests() returned '[]' for anyone offline, so the board — the
-- only place a quote can be withdrawn — vanished. Going offline is how a driver
-- says they cannot come; their live quotes stayed bookable and unreachable, and
-- being booked while offline is what gets them marked unresponsive. They now
-- see exactly the requests they have a live quote on, flagged offDuty so the UI
-- offers Withdraw and nothing else.

-- ── 1 ──────────────────────────────────────────────────────────────────────
create or replace function public.dispatch_candidates(
  p_lat double precision, p_lng double precision, p_zone_id uuid DEFAULT NULL::uuid,
  p_stage integer DEFAULT 1, p_limit integer DEFAULT 20,
  p_exclude uuid[] DEFAULT '{}'::uuid[], p_size_class text DEFAULT NULL::text)
returns TABLE(driver_id uuid, full_name text, distance_km double precision,
  eta_minutes integer, active_jobs integer, accept_rate numeric,
  idle_minutes integer, score numeric, location_age_seconds integer)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_set    dispatch_settings%rowtype;
  v_dset   delivery_settings%rowtype;
  v_radius double precision;
  v_lat    double precision := p_lat;
  v_lng    double precision := p_lng;
  v_deg    double precision;
  v_wsum   numeric;
begin
  select * into v_set  from dispatch_settings where id = 'main';
  select * into v_dset from delivery_settings where id = 'main';

  v_radius := case
    when p_stage is null or p_stage < 1 then v_set.radius_stages_km[1]
    when p_stage > cardinality(v_set.radius_stages_km) then null
    else v_set.radius_stages_km[p_stage]
  end;

  -- M145 — a NULL origin must widen the net, not close it. See the header.
  v_deg := case when v_radius is null or v_lat is null or v_lng is null then null
                else (v_radius * v_set.road_factor) / 111.0 end;

  v_wsum := greatest(
    v_set.weight_proximity + v_set.weight_reliability
      + v_set.weight_workload + v_set.weight_idle,
    0.0001);

  return query
  with eligible as (
    select
      d.id, d.full_name,
      case when l.lat is null or v_lat is null then null
           else 111.045 * sqrt(
                  power(l.lat - v_lat, 2)
                + power((l.lng - v_lng) * cos(radians((l.lat + v_lat) / 2)), 2))
      end as raw_km,
      case when l.recorded_at is null then null
           else extract(epoch from (now() - l.recorded_at))::integer end as loc_age,
      (select count(*)::integer from deliveries dl
        where dl.driver_id = d.id
          and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                            'picked_up','out_for_delivery','arrived')) as jobs,
      case
        when coalesce(m.offers_received, 0) = 0 then 0.70::numeric
        else greatest(0::numeric, round(
          (coalesce(m.offers_accepted, 0)::numeric
             / greatest(coalesce(m.offers_received, 0), 1)::numeric)
          - least(0.4, coalesce(m.driver_cancellations, 0)::numeric * 0.05)
          - least(0.3, coalesce(m.unresponsive_events, 0)::numeric * 0.05)
        , 3))
      end as reliability,
      coalesce(extract(epoch from (now() - (
        select max(o.offered_at) from delivery_offers o where o.driver_id = d.id
      )))::integer / 60, 1440)::integer as idle_min
    from delivery_drivers d
    left join driver_locations l on l.driver_kind = 'delivery' and l.driver_id = d.id
    left join driver_metrics   m on m.driver_id = d.id
    where d.status = 'approved'
      -- M116: DUTY, not capacity.
      and d.availability <> 'offline'
      and not (d.id = any (coalesce(p_exclude, '{}'::uuid[])))
      and (cardinality(d.service_zone_ids) = 0
           or p_zone_id is null
           or p_zone_id = any (d.service_zone_ids))
      -- THE capacity authority, and always was.
      and (select count(*) from deliveries dl
            where dl.driver_id = d.id
              and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                'picked_up','out_for_delivery','arrived'))
          < v_dset.max_active_deliveries
      and vehicle_can_carry(d.vehicle_type, p_size_class)
      and (v_deg is null or l.driver_id is null
           or (l.lat between v_lat - v_deg and v_lat + v_deg
               and l.lng between v_lng - v_deg and v_lng + v_deg))
  ),
  within as (
    select e.*, (e.raw_km * v_set.road_factor)::numeric as road_km
      from eligible e
     where v_radius is null or e.raw_km is null or e.raw_km <= v_radius
  )
  select
    w.id, w.full_name,
    round(w.road_km, 2)::double precision,
    case when w.road_km is null then null
         else ceil(w.road_km / v_set.avg_speed_kmh * 60)::integer end,
    w.jobs, w.reliability, w.idle_min,
    round((
        v_set.weight_proximity * coalesce(greatest(0::numeric, 1 - (w.road_km / 18)), 0.25)
      + v_set.weight_reliability * w.reliability
      + v_set.weight_workload * greatest(0::numeric, 1 - (w.jobs::numeric
          / greatest(v_dset.max_active_deliveries, 1)))
      + v_set.weight_idle * least(1::numeric, w.idle_min::numeric / 120)
    ) / v_wsum, 4)::numeric,
    w.loc_age
  from within w
  order by 8 desc, 3 asc nulls last, w.idle_min desc
  limit greatest(coalesce(p_limit, 20), 1);
end;
$fn$;

-- ── 2 ──────────────────────────────────────────────────────────────────────
drop function if exists public.customer_accept_delivery_quote(uuid);
drop function if exists public.guest_accept_delivery_quote(uuid, text);
drop function if exists public.accept_delivery_quote(uuid);

create function public.accept_delivery_quote(p_quote_id uuid, p_expected_fee integer default null)
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

  -- THIS quote already won: return its delivery. A double tap is not an error.
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

  -- M145 — CONSENT. offer_delivery_quote() updates a quote in place and keeps
  -- its id, so the id the customer tapped can carry a price they never saw. The
  -- fee still comes from the database; p_expected_fee is only what was on their
  -- screen, and a mismatch is refused rather than silently charged.
  if p_expected_fee is not null and v_q.fee <> p_expected_fee then
    raise exception 'That driver changed their price. Check the new one and choose again.'
      using errcode = 'P0001';
  end if;

  if v_r.expires_at is not null and v_r.expires_at <= now() then
    raise exception 'This request has expired. Post it again and drivers will see it fresh.'
      using errcode = 'P0001';
  end if;
  if v_q.expires_at is not null and v_q.expires_at <= now() then
    raise exception 'That price has expired.' using errcode = 'P0001';
  end if;

  -- Approved AND on duty. Going offline is how a driver says they cannot come.
  if not exists (
    select 1 from delivery_drivers d
     where d.id = v_q.driver_id
       and d.status = 'approved'
       and d.availability <> 'offline'
       and vehicle_can_carry(d.vehicle_type, v_r.size_class)
  ) then
    raise exception 'That driver is not available any more. Choose another price.'
      using errcode = 'P0001';
  end if;

  select * into v_set from delivery_settings where id = 'main';

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
    pin, assigned_at, pickup_due_at, delivery_due_at
  ) values (
    v_r.id, null, null, v_q.driver_id, 'assigned',
    v_q.fee, v_driver, v_q.fee - v_driver,
    v_r.dropoff_lat, v_r.dropoff_lng, v_r.dropoff_text,
    -- M131 made this the single minter; this path was still rolling its own.
    mint_delivery_pin(), now(),
    now() + make_interval(mins => v_set.pickup_window_minutes),
    now() + make_interval(mins => v_set.delivery_window_minutes)
  ) returning id into v_id;

  update delivery_quotes set status = 'accepted' where id = v_q.id;
  update delivery_quotes set status = 'declined'
   where request_id = v_r.id and id <> v_q.id and status = 'offered';
  update delivery_requests set status = 'accepted' where id = v_r.id;

  perform sync_driver_availability(v_q.driver_id);

  update driver_metrics set offers_accepted = offers_accepted + 1, updated_at = now()
   where driver_id = v_q.driver_id;

  perform log_delivery_event(
    v_id, 'customer', v_r.customer_id, 'delivery.quote_accepted',
    null, 'assigned'::delivery_status, null,
    jsonb_build_object('quoteId', v_q.id, 'fee', v_q.fee,
                       'driverEarning', v_driver, 'kind', v_r.kind,
                       'sizeClass', v_r.size_class)
  );
  return v_id;
end;
$fn$;

create function public.customer_accept_delivery_quote(p_quote_id uuid, p_expected_fee integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to accept a price.' using errcode = 'P0001';
  end if;
  select r.customer_id into v_owner
    from delivery_quotes q join delivery_requests r on r.id = q.request_id
   where q.id = p_quote_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'That quote no longer exists.' using errcode = 'P0001';
  end if;
  return accept_delivery_quote(p_quote_id, p_expected_fee);
end;
$fn$;

create function public.guest_accept_delivery_quote(p_quote_id uuid, p_email text, p_expected_fee integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_stored text;
  v_email  text := nullif(btrim(lower(coalesce(p_email, ''))), '');
begin
  select r.guest_email into v_stored
    from delivery_quotes q join delivery_requests r on r.id = q.request_id
   where q.id = p_quote_id;
  if v_email is null or v_stored is null or v_stored is distinct from v_email then
    raise exception 'That quote no longer exists.' using errcode = 'P0001';
  end if;
  return accept_delivery_quote(p_quote_id, p_expected_fee);
end;
$fn$;

revoke all on function public.accept_delivery_quote(uuid, integer) from public, anon, authenticated;
revoke all on function public.customer_accept_delivery_quote(uuid, integer) from public, anon, authenticated;
revoke all on function public.guest_accept_delivery_quote(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.customer_accept_delivery_quote(uuid, integer) to authenticated;

-- ── 3 ──────────────────────────────────────────────────────────────────────
create or replace function public.cancel_delivery_request(
  p_id uuid, p_email text default null, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_r     delivery_requests%rowtype;
  v_d     deliveries%rowtype;
begin
  select * into v_r from delivery_requests where id = p_id for update;
  if not found then return false; end if;

  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return false; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return false; end if;
  end if;

  if v_r.status = 'cancelled' then return true; end if;

  if v_r.status = 'open' then
    update delivery_requests
       set status = 'cancelled',
           cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           updated_at = now()
     where id = v_r.id;
    update delivery_quotes set status = 'declined'
     where request_id = v_r.id and status = 'offered';
    return true;
  end if;

  if v_r.status <> 'accepted' then
    raise exception 'This request is no longer open.' using errcode = 'P0001';
  end if;

  select * into v_d from deliveries where request_id = v_r.id for update;
  if not found then
    raise exception 'A driver has already been chosen for this one.' using errcode = 'P0001';
  end if;

  if v_d.status = 'delivered' then
    raise exception 'This one has already been delivered.' using errcode = 'P0001';
  end if;
  if v_d.status in ('cancelled','failed_delivery','returned_to_merchant') then
    update delivery_requests set status = 'cancelled', updated_at = now() where id = v_r.id;
    return true;
  end if;

  -- M145 — keyed on WHETHER PICKUP HAPPENED, not on the three in-flight legs.
  -- picked_up -> requires_admin has the parcel in somebody's car, and the old
  -- list let that be cancelled: the driver was told "do not collect it" about a
  -- thing they were already carrying.
  if v_d.status in ('picked_up','out_for_delivery','arrived')
     or v_d.picked_up_at is not null then
    raise exception 'Your driver already has it. Call them to sort it out, or contact us.'
      using errcode = 'P0001';
  end if;

  update deliveries
     set status = 'cancelled',
         cancelled_at = now(),
         failure_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''),
                                   'Cancelled by the customer before pickup')
   where id = v_d.id;

  update delivery_requests
     set status = 'cancelled',
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where id = v_r.id;

  if v_d.driver_id is not null then
    perform sync_driver_availability(v_d.driver_id);
  end if;

  perform log_delivery_event(
    v_d.id, 'customer', v_r.customer_id, 'delivery.cancelled_by_customer',
    v_d.status, 'cancelled'::delivery_status,
    nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('requestId', v_r.id, 'driverId', v_d.driver_id, 'fee', v_d.customer_fee)
  );
  return true;
end;
$fn$;

revoke all on function public.cancel_delivery_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_delivery_request(uuid, text, text) to authenticated;

-- ── 4 ──────────────────────────────────────────────────────────────────────
create or replace function public.my_delivery_requests()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'kind', r.kind,
           'what', r.what,
           'status', r.status,
           'pickupText', r.pickup_text,
           'dropoffText', r.dropoff_text,
           'createdAt', r.created_at,
           'expiresAt', r.expires_at,
           -- Without this the list said "Driver booked" for ever, reproducing
           -- on /deliver exactly the defect M141 fixed on the tracker.
           'deliveryStatus', (select d.status from deliveries d
                               where d.request_id = r.id
                               order by d.created_at desc limit 1),
           'quoteCount', (select count(*) from delivery_quotes q
                           where q.request_id = r.id and q.status = 'offered'),
           'bestQuote', (select min(q.fee) from delivery_quotes q
                          where q.request_id = r.id and q.status = 'offered'))
         order by r.created_at desc), '[]'::jsonb)
    from delivery_requests r
   where auth.uid() is not null and r.customer_id = auth.uid();
$fn$;

revoke all on function public.my_delivery_requests() from public, anon, authenticated;
grant execute on function public.my_delivery_requests() to authenticated;

-- ── 5 ──────────────────────────────────────────────────────────────────────
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
        'id', r.id,
        'kind', r.kind,
        'what', r.what,
        'sizeClass', r.size_class,
        'pickupText', r.pickup_text,
        'pickupNote', r.pickup_note,
        'dropoffText', r.dropoff_text,
        'dropoffNote', r.dropoff_note,
        'spendCap', r.max_budget,
        'createdAt', r.created_at,
        'expiresAt', r.expires_at,
        -- Off duty: this row exists ONLY so the driver can take their price
        -- back. The UI hides "name your price" and shows Withdraw.
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
        -- M103's rule, applied at the point of quoting.
        and vehicle_can_carry(v_d.vehicle_type, r.size_class)
        and (
          v_d.availability <> 'offline'
          -- Offline: only what they have already priced, so it can be pulled.
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

-- ── Proof ──────────────────────────────────────────────────────────────────
do $assert$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('accept_delivery_quote','guest_accept_delivery_quote',
                       'driver_open_requests','my_delivery_requests',
                       'customer_accept_delivery_quote','cancel_delivery_request',
                       'dispatch_candidates')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad is not null then
    raise exception 'M145: reachable by anon: %', v_bad;
  end if;
  if has_function_privilege('authenticated','public.accept_delivery_quote(uuid, integer)','execute') then
    raise exception 'M145: the engine is directly callable by a signed-in role';
  end if;
  if has_function_privilege('authenticated','public.guest_accept_delivery_quote(uuid, text, integer)','execute') then
    raise exception 'M145: the guest wrapper is callable by a signed-in role';
  end if;
  -- The drop/create must leave exactly one, or an old signature still resolves.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='accept_delivery_quote') <> 1 then
    raise exception 'M145: accept_delivery_quote has an overload';
  end if;
end;
$assert$;

do $assert$
declare v_driver uuid; v_user uuid;
begin
  select id into v_driver from delivery_drivers where status='approved' limit 1;
  select id into v_user from auth.users limit 1;
  if v_driver is null or v_user is null then
    raise notice 'M145: no driver or user to probe with, skipping behavioural check';
    return;
  end if;

  begin
    declare v_r uuid; v_q uuid; v_del uuid; v_err text; v_board jsonb;
    begin
      update delivery_drivers set availability='available', user_id=v_user where id=v_driver;
      insert into driver_metrics (driver_id) values (v_driver) on conflict do nothing;

      v_r := create_delivery_request('package','Probe','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p145@example.com');
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, v_driver, 25000, 'offered', now() + interval '1 day') returning id into v_q;

      -- The price the customer saw is gone: refuse rather than charge the new one.
      update delivery_quotes set fee = 40000 where id = v_q;
      begin
        perform guest_accept_delivery_quote(v_q, 'p145@example.com', 25000);
        raise exception 'M145_FAIL: a changed price was booked anyway';
      exception when sqlstate 'P0001' then
        get stacked diagnostics v_err = message_text;
        if v_err like 'M145_FAIL%' then raise; end if;
        if v_err not ilike '%changed their price%' then
          raise exception 'M145_FAIL: wrong refusal on price change: %', v_err;
        end if;
      end;
      -- Agreeing to the CURRENT price still works.
      v_del := guest_accept_delivery_quote(v_q, 'p145@example.com', 40000);
      if v_del is null then raise exception 'M145_FAIL: the matching price was refused'; end if;

      -- Off duty: the board still surfaces a standing quote so it can be pulled.
      perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
      update delivery_drivers set availability='offline' where id=v_driver;
      v_r := create_delivery_request('package','Probe 2','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p145b@example.com');
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, v_driver, 25000, 'offered', now() + interval '1 day');
      v_board := driver_open_requests();
      if jsonb_array_length(v_board) <> 1 then
        raise exception 'M145_FAIL: an off-duty driver cannot see their own standing quote';
      end if;
      if (v_board->0->>'offDuty') <> 'true' then
        raise exception 'M145_FAIL: the off-duty flag is missing';
      end if;
      perform set_config('request.jwt.claims', '', true);

      raise exception 'M145_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M145_FAIL%' then raise; end if;
      if sqlerrm <> 'M145_PROBE_DONE' then
        raise exception 'M145: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M145: price agreement and the off-duty board both proved';
  end;
end;
$assert$;
