-- ── M140 — a won quote was only half a delivery ────────────────────────────
--
-- M136 made the loop reachable and M138 made it visible. An adversarial audit
-- of both then found that the delivery a won quote CREATES is not the same
-- object a dispatched delivery is, and four things downstream depend on the
-- difference. Two of them are severe, and both are mine: M136 fixed one join in
-- driver_dashboard() and left its twin fourteen lines below untouched, and it
-- copied an INSERT without noticing what the store path does immediately after.
--
-- ── 1. THE OFFERS BLOCK STILL INNER-JOINED stores ──────────────────────────
-- M136 rewrote driver_dashboard()'s `active` list to LEFT JOIN. The `offers`
-- list in the same function kept `join stores s on s.id = d.store_id`.
--
-- That is not cosmetic. A direct delivery goes BACK to 'searching_driver' by
-- two live paths — driver_cannot_complete() before pickup, and
-- admin_reassign_delivery() — and is then offered to other drivers through
-- delivery_offers. Every one of those offers was invisible: the row was
-- offered, no driver could see it, and it could never be claimed by anybody.
-- A customer's package, already paid for in a booking, would sit for ever.
--
-- ── 2. NO CLOCK, SO NO ESCALATION COULD EVER FIRE ──────────────────────────
-- accept_delivery() sets pickup_due_at and delivery_due_at the moment a driver
-- takes a store job. accept_delivery_quote() set neither, because it was
-- written from the INSERT rather than from the accept path.
--
-- sweep_delivery_escalations() drives both of its loops off those columns, so
-- with them NULL a direct delivery is skipped for ever: no driver_unresponsive
-- transition, no auto-reassign before pickup, no unresponsive_events metric, no
-- owner alert. A driver could book a job at 09:00, never move, and at midnight
-- nothing anywhere would have noticed. The owner's board computes `lateBy` from
-- the same columns, so it would also have shown 0 minutes late, for ever.
--
-- ── 3. THE CAP WAS NOT ENFORCED ────────────────────────────────────────────
-- accept_delivery() refuses at max_active_deliveries. accept_delivery_quote()
-- did not check at all, so a customer could book a driver who already held the
-- owner's maximum — the limit that exists so nobody carries more than they can.
--
-- Quoting while full stays allowed on purpose: a quote commits the driver to
-- nothing and the job may be for later. The gate belongs at ACCEPT, which is
-- the moment it becomes real. The message names the way out rather than just
-- refusing, because the customer did nothing wrong.
--
-- ── 4. THE DRIVER WAS NEVER MARKED BUSY ────────────────────────────────────
-- M116 made `availability` derived: sync_driver_availability() is the single
-- minter, and accept_delivery() calls it. accept_delivery_quote() did not, so a
-- driver who won a quote still read 'available' to dispatch_candidates() — and
-- would have been offered store work on top of the job they had just won.

create or replace function public.accept_delivery_quote(p_quote_id uuid)
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

  -- M139 — the clock on the request itself.
  if v_r.expires_at is not null and v_r.expires_at <= now() then
    raise exception 'This request has expired. Post it again and drivers will see it fresh.'
      using errcode = 'P0001';
  end if;
  if v_q.expires_at is not null and v_q.expires_at <= now() then
    raise exception 'That price has expired.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from delivery_drivers d
     where d.id = v_q.driver_id
       and d.status = 'approved'
       and vehicle_can_carry(d.vehicle_type, v_r.size_class)
  ) then
    raise exception 'That driver can no longer take this delivery.' using errcode = 'P0001';
  end if;

  select * into v_set from delivery_settings where id = 'main';

  -- M140 (3) — the owner's limit, enforced at the moment it becomes real.
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
    pin, assigned_at,
    -- M140 (2) — the clocks, exactly as accept_delivery() sets them. Without
    -- these sweep_delivery_escalations() skips the row for ever.
    pickup_due_at, delivery_due_at
  ) values (
    v_r.id, null, null, v_q.driver_id, 'assigned',
    v_q.fee, v_driver, v_q.fee - v_driver,
    v_r.dropoff_lat, v_r.dropoff_lng, v_r.dropoff_text,
    lpad((floor(random() * 10000))::int::text, 4, '0'), now(),
    now() + make_interval(mins => v_set.pickup_window_minutes),
    now() + make_interval(mins => v_set.delivery_window_minutes)
  ) returning id into v_id;

  update delivery_quotes set status = 'accepted' where id = v_q.id;
  update delivery_quotes set status = 'declined'
   where request_id = v_r.id and id <> v_q.id and status = 'offered';
  update delivery_requests set status = 'accepted' where id = v_r.id;

  -- M140 (4) — availability is DERIVED (M116). Without this the driver still
  -- reads 'available' to dispatch_candidates() and gets offered store work on
  -- top of the job they have just won.
  perform sync_driver_availability(v_q.driver_id);

  update driver_metrics set offers_accepted = offers_accepted + 1, updated_at = now()
   where driver_id = v_q.driver_id;

  perform log_delivery_event(
    v_id, 'customer', v_r.customer_id, 'delivery.quote_accepted',
    null, 'assigned', null,
    jsonb_build_object('quoteId', v_q.id, 'fee', v_q.fee,
                       'driverEarning', v_driver, 'kind', v_r.kind,
                       'sizeClass', v_r.size_class)
  );
  return v_id;
end;
$fn$;

-- ── The other half of the join fix ─────────────────────────────────────────
-- `active` was fixed in M136. `offers` is fixed here, the same way, and gains
-- the direct-job fields so a re-offered Deliver Anything job reads as itself
-- rather than as a nameless shop pickup.

create or replace function public.driver_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_d   delivery_drivers%rowtype;
  v_set delivery_settings%rowtype;
  v_m   driver_metrics%rowtype;
begin
  v_d := current_driver();
  select * into v_set from delivery_settings where id = 'main';
  select * into v_m from driver_metrics where driver_id = v_d.id;

  return jsonb_build_object(
    'driver', jsonb_build_object(
      'id', v_d.id, 'name', v_d.full_name, 'phone', v_d.phone,
      'status', v_d.status, 'availability', v_d.availability,
      'vehicleType', v_d.vehicle_type, 'statusReason', v_d.status_reason,
      'serviceZoneIds', v_d.service_zone_ids),
    'limits', jsonb_build_object('maxActive', v_set.max_active_deliveries),
    'metrics', jsonb_build_object(
      'completed', coalesce(v_m.deliveries_completed, 0),
      'accepted', coalesce(v_m.offers_accepted, 0),
      'offers', coalesce(v_m.offers_received, 0),
      'cancellations', coalesce(v_m.driver_cancellations, 0),
      'onTime', coalesce(v_m.on_time_deliveries, 0),
      'rating', case when coalesce(v_m.rating_count,0) = 0 then null
                     else round(v_m.rating_sum::numeric / v_m.rating_count, 1) end),
    'today', jsonb_build_object(
      'completed', (select count(*) from deliveries
                     where driver_id = v_d.id and status = 'delivered'
                       and delivered_at >= date_trunc('day', now() at time zone 'Indian/Mauritius')),
      'earned', (select coalesce(sum(driver_earning), 0) from deliveries
                  where driver_id = v_d.id and status = 'delivered'
                    and delivered_at >= date_trunc('day', now() at time zone 'Indian/Mauritius'))),
    'active', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'status', d.status, 'earning', d.driver_earning,
               'jobKind', case when d.request_id is not null then 'direct' else 'store' end,
               'storeName', coalesce(s.name, r.pickup_text),
               'storePhone', coalesce(s.phone, r.contact_phone),
               'storeAddress', coalesce(s.address, r.pickup_text),
               'pickupNote', r.pickup_note,
               'orderNumber', coalesce(o.order_number, 'RR-' || upper(left(d.request_id::text, 6))),
               'customerName', coalesce(o.customer_name, r.contact_name),
               'customerPhone', coalesce(o.customer_phone, r.contact_phone),
               'dropoffLat', d.dropoff_lat, 'dropoffLng', d.dropoff_lng,
               'dropoffNote', coalesce(d.dropoff_note, r.dropoff_text),
               'pickupDueAt', d.pickup_due_at, 'deliveryDueAt', d.delivery_due_at,
               'pinAttempts', d.pin_attempts,
               'collectCash', case
                 when d.request_id is not null then d.customer_fee
                 when o.status in ('cancelled','refunded') then 0
                 else coalesce((select sum(p.amount) from payments p
                                 where p.order_id = o.id
                                   and p.status = 'pending'
                                   and p.provider = 'cash'), 0) end,
               'what', r.what,
               'requestKind', r.kind,
               'spendCap', r.max_budget,
               'currency', coalesce(o.currency, 'MUR'))
             order by d.assigned_at), '[]'::jsonb)
        from deliveries d
        left join stores s on s.id = d.store_id
        left join orders o on o.id = d.order_id
        left join delivery_requests r on r.id = d.request_id
       where d.driver_id = v_d.id
         and d.status in ('assigned','going_to_pickup','arrived_at_pickup',
                          'picked_up','out_for_delivery','arrived')),
    'offers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'earning', d.driver_earning,
               'jobKind', case when d.request_id is not null then 'direct' else 'store' end,
               'storeName', coalesce(s.name, r.pickup_text),
               'storeAddress', coalesce(s.address, r.pickup_text),
               'what', r.what,
               'dropoffNote', coalesce(d.dropoff_note, r.dropoff_text),
               'expiresAt', o.expires_at)
             order by o.offered_at), '[]'::jsonb)
        from delivery_offers o
        join deliveries d on d.id = o.delivery_id
        left join stores s on s.id = d.store_id
        left join delivery_requests r on r.id = d.request_id
       where o.driver_id = v_d.id
         and o.status = 'offered'
         and d.status = 'searching_driver'
         and (o.expires_at is null or o.expires_at > now())
         and v_d.status = 'approved'
         and v_d.availability <> 'offline'
         and (select count(*) from deliveries dl
               where dl.driver_id = v_d.id
                 and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                   'picked_up','out_for_delivery','arrived'))
             < v_set.max_active_deliveries));
end;
$fn$;

do $assert$
declare v_n integer;
begin
  select count(*) into v_n
    from delivery_offers o
    join deliveries d on d.id = o.delivery_id
    left join stores s on s.id = d.store_id
    left join delivery_requests r on r.id = d.request_id;
  raise notice 'M140: % offer rows reachable through the rewritten join', v_n;

  begin
    perform driver_dashboard();
    raise exception 'M140: driver_dashboard answered with no session';
  exception when sqlstate 'RR080' then null;
  end;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='accept_delivery_quote'
       and pg_get_functiondef(p.oid) like '%pickup_due_at%'
       and pg_get_functiondef(p.oid) like '%max_active_deliveries%'
       and pg_get_functiondef(p.oid) like '%sync_driver_availability%') then
    raise exception 'M140: accept_delivery_quote is missing a clock, the cap or the sync';
  end if;
end;
$assert$;

-- Behavioural proof, in a subtransaction so its rows roll back while the two
-- functions above stay committed. Verified when this was applied:
--   pickup_due_at set: t
--   delivery_due_at set: t
--   availability after accept: busy
--   active held: 2 of cap 2
--   over-capacity accept: "That driver has their hands full right now..."
do $assert$
declare
  v_driver uuid; v_user uuid;
begin
  select id into v_driver from delivery_drivers where status='approved' limit 1;
  select id into v_user from auth.users limit 1;
  if v_driver is null or v_user is null then
    raise notice 'M140: no driver or user to probe with, skipping behavioural check';
    return;
  end if;

  begin
    declare
      v_r uuid; v_q uuid; v_del uuid; v_pickup timestamptz; v_avail text;
    begin
      update delivery_drivers set availability='available', user_id=v_user where id=v_driver;
      insert into driver_metrics (driver_id) values (v_driver) on conflict do nothing;

      v_r := create_delivery_request('package','Probe box','A','B','Probe','+23057000000',
                                     'standard',null,null,null,null,null,null,null,'probe140@example.com');
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, v_driver, 25000, 'offered', now() + interval '1 day') returning id into v_q;

      v_del := accept_delivery_quote(v_q);

      select pickup_due_at into v_pickup from deliveries where id = v_del;
      if v_pickup is null then
        raise exception 'M140_FAIL: pickup_due_at is still null after accepting a quote';
      end if;
      select availability into v_avail from delivery_drivers where id = v_driver;
      if v_avail = 'available' then
        raise exception 'M140_FAIL: the driver was never synced to busy (still %)', v_avail;
      end if;

      raise exception 'M140_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M140_FAIL%' then raise; end if;
      if sqlerrm <> 'M140_PROBE_DONE' then
        raise exception 'M140: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M140: clocks, cap and availability sync all proved, probe rolled back';
  end;
end;
$assert$;
