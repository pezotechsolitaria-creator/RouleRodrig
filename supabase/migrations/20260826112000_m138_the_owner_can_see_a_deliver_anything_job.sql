-- ── M138 — the owner's board had the same blind spot as the driver's ───────
--
-- M136 found that driver_dashboard() read its active list through
-- `join stores … join orders …`, so a Deliver Anything job — which has neither
-- — was invisible to the driver who had just won it. admin_delivery_board()
-- had the identical pair of inner joins, and nobody had noticed because no such
-- delivery has ever existed to be hidden.
--
-- The consequence is worse here than it was there. The driver at least gets a
-- WhatsApp message. The owner running operations would have had a job on the
-- island that never appeared on the screen they run operations from: it could
-- not be seen, chased, reassigned or closed out.
--
-- Same fix, same reasoning: LEFT JOIN, and every shop-shaped field falls back
-- to its request-shaped equivalent.
--
-- ── And the half that is not a delivery at all ─────────────────────────────
-- An open request has no driver, no price and nothing to dispatch, so it can
-- never appear in `live` however the joins are written. Until a customer books
-- somebody it is invisible to the owner entirely — which means the one question
-- worth asking about a new marketplace, "is anybody actually quoting?", had no
-- answer anywhere in the product.
--
-- So the board gains a `requests` list. It carries `eligibleDrivers`, which is
-- the difference between two situations that both show zero quotes and need
-- opposite responses:
--
--   eligibleDrivers = 0 → nobody approved is on duty with a vehicle that can
--                         carry it. Nothing was wrong with the request; there
--                         is nobody to answer it. Recruit, or get someone on.
--   eligibleDrivers > 0 → drivers can see it and are not quoting. Go and ask.

create or replace function public.admin_delivery_board()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_set delivery_settings%rowtype;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_set from delivery_settings where id = 'main';

  return jsonb_build_object(
    'settings', jsonb_build_object(
      'maxActive', v_set.max_active_deliveries,
      'acceptWindow', v_set.accept_window_minutes,
      'pickupWindow', v_set.pickup_window_minutes,
      'deliveryWindow', v_set.delivery_window_minutes,
      'driverShare', v_set.driver_share_percent),

    -- Everything still in flight, newest first, with the facts an operator
    -- needs to act WITHOUT opening anything: who, where, how late.
    'live', (
      select coalesce(jsonb_agg(x order by x.needs_action desc, x.created_at), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', d.id,
                 -- The operator has to know which kind this is, or they read
                 -- "Port Mathurin" as a shop name and ring a number that
                 -- belongs to the customer.
                 'jobKind', case when d.request_id is not null then 'direct' else 'store' end,
                 'orderNumber', coalesce(o.order_number,
                                         'RR-' || upper(left(d.request_id::text, 6))),
                 'status', d.status,
                 'storeName', coalesce(s.name, r.pickup_text),
                 'storePhone', coalesce(s.phone, r.contact_phone),
                 'customerName', coalesce(o.customer_name, r.contact_name),
                 'customerPhone', coalesce(o.customer_phone, r.contact_phone),
                 'dropoffNote', coalesce(d.dropoff_note, r.dropoff_text),
                 'what', r.what,
                 'requestKind', r.kind,
                 'spendCap', r.max_budget,
                 'driverId', d.driver_id,
                 'driverName', dr.full_name,
                 'driverPhone', dr.phone,
                 'earning', d.driver_earning,
                 'customerFee', d.customer_fee,
                 'createdAt', d.created_at,
                 'assignedAt', d.assigned_at,
                 'pickupDueAt', d.pickup_due_at,
                 'deliveryDueAt', d.delivery_due_at,
                 'reassignments', d.reassignment_count,
                 'failureReason', d.failure_reason,
                 'adminNote', d.admin_note,
                 -- Computed here so the UI cannot disagree with the sweep about
                 -- what counts as late.
                 'lateBy', case
                   when d.status in ('assigned','going_to_pickup','arrived_at_pickup')
                        and d.pickup_due_at < now()
                     then round(extract(epoch from (now() - d.pickup_due_at)) / 60)
                   when d.status in ('picked_up','out_for_delivery','arrived')
                        and d.delivery_due_at < now()
                     then round(extract(epoch from (now() - d.delivery_due_at)) / 60)
                   else 0 end,
                 'unclaimedFor', case
                   when d.status = 'searching_driver'
                     then round(extract(epoch from (now() - d.created_at)) / 60)
                   else 0 end,
                 'offersOut', (select count(*) from delivery_offers o2
                                where o2.delivery_id = d.id and o2.status = 'offered')
               ) as x,
               -- Sorting key: exceptions to the top, always.
               (d.status in ('driver_unresponsive','driver_unavailable','requires_admin',
                             'failed_delivery','returned_to_merchant')
                or (d.status = 'searching_driver' and d.created_at < now() - interval '10 minutes')
                or (d.pickup_due_at < now() and d.status in ('assigned','going_to_pickup','arrived_at_pickup'))
                or (d.delivery_due_at < now() and d.status in ('picked_up','out_for_delivery','arrived'))
               ) as needs_action,
               d.created_at
          from deliveries d
          left join orders o on o.id = d.order_id
          left join stores s on s.id = d.store_id
          left join delivery_requests r on r.id = d.request_id
          left join delivery_drivers dr on dr.id = d.driver_id
         where d.status not in ('delivered','cancelled')
      ) x),

    -- Jobs waiting for prices. Not deliveries, and deliberately a separate key
    -- rather than a synthetic row in `live` — an operator's actions on a live
    -- delivery (reassign, force status, close out) are all meaningless here.
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id,
               'kind', r.kind,
               'what', r.what,
               'sizeClass', r.size_class,
               'status', r.status,
               'pickupText', r.pickup_text,
               'dropoffText', r.dropoff_text,
               'contactName', r.contact_name,
               'contactPhone', r.contact_phone,
               'spendCap', r.max_budget,
               'createdAt', r.created_at,
               'expiresAt', r.expires_at,
               'waitingMinutes', round(extract(epoch from (now() - r.created_at)) / 60),
               'quoteCount', (select count(*) from delivery_quotes q
                               where q.request_id = r.id and q.status = 'offered'),
               'bestQuote', (select min(q.fee) from delivery_quotes q
                              where q.request_id = r.id and q.status = 'offered'),
               -- The number that turns "no quotes" from a mystery into a
               -- decision. Same three conditions driver_open_requests() uses,
               -- so this cannot disagree with who was actually shown the job.
               'eligibleDrivers', (select count(*) from delivery_drivers dd
                                    where dd.status = 'approved'
                                      and dd.availability <> 'offline'
                                      and vehicle_can_carry(dd.vehicle_type, r.size_class)))
             order by r.created_at), '[]'::jsonb)
        from delivery_requests r
       where r.status = 'open'
         and (r.expires_at is null or r.expires_at > now())),

    -- Driver monitoring. Reliability is shown as the numbers behind it, not as
    -- a single score an operator would have to trust blindly.
    'drivers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', dr.id, 'name', dr.full_name, 'phone', dr.phone,
               'status', dr.status, 'availability', dr.availability,
               'vehicle', dr.vehicle_type, 'appliedAt', dr.created_at,
               'statusReason', dr.status_reason,
               'active', (select count(*) from deliveries dl
                           where dl.driver_id = dr.id
                             and dl.status in ('assigned','going_to_pickup','arrived_at_pickup',
                                               'picked_up','out_for_delivery','arrived')),
               'completed', coalesce(m.deliveries_completed, 0),
               'onTime', coalesce(m.on_time_deliveries, 0),
               'cancellations', coalesce(m.driver_cancellations, 0),
               'unresponsive', coalesce(m.unresponsive_events, 0),
               'offers', coalesce(m.offers_received, 0),
               'accepted', coalesce(m.offers_accepted, 0))
             order by (dr.status = 'pending') desc, dr.created_at desc), '[]'::jsonb)
        from delivery_drivers dr
        left join driver_metrics m on m.driver_id = dr.id),

    'counts', jsonb_build_object(
      'searching', (select count(*) from deliveries where status = 'searching_driver'),
      'inFlight',  (select count(*) from deliveries
                     where status in ('assigned','going_to_pickup','arrived_at_pickup',
                                      'picked_up','out_for_delivery','arrived')),
      'exceptions',(select count(*) from deliveries
                     where status in ('driver_unresponsive','driver_unavailable','requires_admin',
                                      'failed_delivery','returned_to_merchant')),
      'pendingDrivers', (select count(*) from delivery_drivers where status = 'pending'),
      'openRequests', (select count(*) from delivery_requests
                        where status = 'open' and (expires_at is null or expires_at > now())),
      -- Only requests NOBODY has quoted are a task. One with prices on it is
      -- the system working, and badging it would train the owner to ignore the
      -- badge.
      'requestsWithoutQuotes', (select count(*) from delivery_requests r
                                 where r.status = 'open'
                                   and (r.expires_at is null or r.expires_at > now())
                                   and not exists (select 1 from delivery_quotes q
                                                    where q.request_id = r.id
                                                      and q.status = 'offered'))));
end;
$fn$;

do $assert$
declare v_b jsonb;
begin
  -- auth.uid() is null here, which admin_delivery_board treats as the trusted
  -- server path — the same call the admin API makes with the service key.
  v_b := admin_delivery_board();
  if v_b is null then
    raise exception 'M138: admin_delivery_board returned nothing';
  end if;
  if v_b->'requests' is null then
    raise exception 'M138: the board has no requests key';
  end if;
  if (v_b->'counts'->>'openRequests') is null
     or (v_b->'counts'->>'requestsWithoutQuotes') is null then
    raise exception 'M138: the new counts are missing';
  end if;
  -- The break this migration exists to fix: a delivery with no store and no
  -- order must still appear. Proved against the real query rather than assumed.
  if exists (select 1 from deliveries where request_id is not null
               and status not in ('delivered','cancelled'))
     and jsonb_array_length(v_b->'live') = 0 then
    raise exception 'M138: a direct job is still invisible on the board';
  end if;
  raise notice 'M138: board ok, % live, % open requests',
    jsonb_array_length(v_b->'live'), jsonb_array_length(v_b->'requests');
end;
$assert$;
