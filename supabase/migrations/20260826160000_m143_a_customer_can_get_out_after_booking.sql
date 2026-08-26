-- ── M143 — booking a driver was a one-way door ─────────────────────────────
--
-- cancel_delivery_request() refused anything that was not 'open':
--
--     if v_r.status <> 'open' then
--       raise exception 'A driver has already been chosen for this one.';
--
-- So the moment a customer accepted a price they had NO route out. Not a
-- hard one, not a slow one — none. Their van arrives tomorrow instead, they
-- find a cousin going that way, they simply change their mind: the only exits
-- were to phone somebody, or to stand there and let a driver turn up for a job
-- nobody wanted. Meanwhile the driver stayed marked busy, holding a slot
-- against the owner's max_active_deliveries for a delivery that would never
-- happen.
--
-- ── Where the line goes ────────────────────────────────────────────────────
-- BEFORE PICKUP (assigned, going_to_pickup, arrived_at_pickup) the customer
-- may call it off themselves. Nothing has moved, no money has changed hands,
-- and the driver is freed for the next job.
--
-- AFTER PICKUP (picked_up, out_for_delivery, arrived) they may not. The driver
-- is holding their goods, and cancelling stops being a decision a button can
-- make — something physical has to happen to a package that is already in
-- somebody's car. So it refuses, and names the two routes that actually work:
-- call the driver, or contact us.
--
-- ── What is deliberately NOT done ──────────────────────────────────────────
-- driver_cancellations is NOT incremented. That counter feeds a driver's
-- standing, and the driver did nothing wrong here. The message they receive
-- says so out loud (lib/delivery/request-copy.ts), because a driver who
-- believes a customer's change of mind dents their record is a driver who
-- stops accepting the marginal job.
--
-- Same signature, so this REPLACES cancel_delivery_request rather than adding a
-- competing overload — and the API route that already calls it needs no change
-- beyond firing the driver's notification afterwards.

create or replace function public.cancel_delivery_request(
  p_id uuid,
  p_email text default null,
  p_reason text default null
)
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

  -- Identity-neutral, and false rather than an error for "not yours": a
  -- distinguishable refusal would make this an oracle for probing request ids.
  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return false; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return false; end if;
  end if;

  if v_r.status = 'cancelled' then return true; end if;

  -- ── Nobody has been chosen yet ──────────────────────────────────────────
  if v_r.status = 'open' then
    update delivery_requests
       set status = 'cancelled',
           cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           updated_at = now()
     where id = v_r.id;
    -- Every standing price dies with the request it answered, so no driver is
    -- left believing they might still win it.
    update delivery_quotes set status = 'declined'
     where request_id = v_r.id and status = 'offered';
    return true;
  end if;

  if v_r.status <> 'accepted' then
    raise exception 'This request is no longer open.' using errcode = 'P0001';
  end if;

  -- ── A driver is booked ──────────────────────────────────────────────────
  select * into v_d from deliveries where request_id = v_r.id for update;
  if not found then
    raise exception 'A driver has already been chosen for this one.' using errcode = 'P0001';
  end if;

  if v_d.status = 'delivered' then
    raise exception 'This one has already been delivered.' using errcode = 'P0001';
  end if;

  -- Already over by some other route. Bring the request into line rather than
  -- refusing: the customer asked for it to be cancelled and it is.
  if v_d.status in ('cancelled','failed_delivery','returned_to_merchant') then
    update delivery_requests set status = 'cancelled', updated_at = now() where id = v_r.id;
    return true;
  end if;

  if v_d.status in ('picked_up','out_for_delivery','arrived') then
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

  -- Frees them for the next job. availability is DERIVED (M116), so it has to
  -- be re-minted rather than assumed — leaving it stale is how a driver sits
  -- 'busy' against the owner's cap holding a delivery that no longer exists.
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

-- Who to tell, and what to tell them. Server-only: it returns the driver and
-- the customer's job, and the route calls it straight after a successful
-- cancellation.
create or replace function public.delivery_cancel_facts(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select jsonb_build_object(
           'requestId', r.id,
           'what', r.what,
           'pickupText', r.pickup_text,
           'dropoffText', r.dropoff_text,
           'contactName', r.contact_name,
           'cancelReason', r.cancel_reason,
           'deliveryId', d.id,
           'driverId', d.driver_id,
           'driverName', dd.full_name,
           'fee', d.customer_fee)
    from delivery_requests r
    left join deliveries d on d.request_id = r.id
    left join delivery_drivers dd on dd.id = d.driver_id
   where r.id = p_request_id;
$fn$;

revoke all on function public.delivery_cancel_facts(uuid) from public, anon, authenticated;
revoke all on function public.cancel_delivery_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_delivery_request(uuid, text, text) to authenticated;

do $assert$
begin
  if has_function_privilege('anon', 'public.cancel_delivery_request(uuid, text, text)', 'execute') then
    raise exception 'M143: cancel is reachable by anon';
  end if;
  if has_function_privilege('anon', 'public.delivery_cancel_facts(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.delivery_cancel_facts(uuid)', 'execute') then
    raise exception 'M143: delivery_cancel_facts is reachable by a client role';
  end if;
  if cancel_delivery_request(gen_random_uuid(), 'nobody@example.com') then
    raise exception 'M143: agreed to cancel nothing';
  end if;
  if delivery_cancel_facts(gen_random_uuid()) is not null then
    raise exception 'M143: invented a request';
  end if;
end;
$assert$;

-- Both sides of the line, proved in a subtransaction that rolls back.
do $assert$
declare v_driver uuid; v_user uuid;
begin
  select id into v_driver from delivery_drivers where status='approved' limit 1;
  select id into v_user from auth.users limit 1;
  if v_driver is null or v_user is null then
    raise notice 'M143: no driver or user to probe with, skipping behavioural check';
    return;
  end if;

  begin
    declare
      v_r uuid; v_q uuid; v_del uuid; v_err text; v_av text;
    begin
      update delivery_drivers set availability='available', user_id=v_user where id=v_driver;
      insert into driver_metrics (driver_id) values (v_driver) on conflict do nothing;
      update driver_metrics set driver_cancellations = 0 where driver_id = v_driver;

      -- BEFORE pickup: allowed, and the driver comes out clean and free.
      v_r := create_delivery_request('package','Probe box','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p143@example.com');
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, v_driver, 25000, 'offered', now() + interval '1 day') returning id into v_q;
      v_del := accept_delivery_quote(v_q);

      if not cancel_delivery_request(v_r, 'p143@example.com', 'Changed my mind') then
        raise exception 'M143_FAIL: a pre-pickup cancellation was refused';
      end if;
      if (select status from deliveries where id=v_del)::text <> 'cancelled' then
        raise exception 'M143_FAIL: the delivery was not cancelled';
      end if;
      if (select status from delivery_requests where id=v_r) <> 'cancelled' then
        raise exception 'M143_FAIL: the request was not cancelled';
      end if;
      select availability into v_av from delivery_drivers where id=v_driver;
      if v_av = 'busy' then
        raise exception 'M143_FAIL: the driver was left busy after cancellation';
      end if;
      if (select driver_cancellations from driver_metrics where driver_id=v_driver) <> 0 then
        raise exception 'M143_FAIL: the customer cancellation was charged to the driver';
      end if;
      if delivery_cancel_facts(v_r)->>'driverId' is null then
        raise exception 'M143_FAIL: the cancel facts lost the driver to notify';
      end if;

      -- AFTER pickup: refused, naming the routes that work.
      v_r := create_delivery_request('package','Probe box 2','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p143b@example.com');
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, v_driver, 25000, 'offered', now() + interval '1 day') returning id into v_q;
      v_del := accept_delivery_quote(v_q);
      update deliveries set status='picked_up' where id=v_del;
      begin
        perform cancel_delivery_request(v_r, 'p143b@example.com', null);
        raise exception 'M143_FAIL: a post-pickup cancellation was allowed';
      exception when sqlstate 'P0001' then
        get stacked diagnostics v_err = message_text;
        if v_err like 'M143_FAIL%' then raise; end if;
        if v_err not ilike '%already has it%' then
          raise exception 'M143_FAIL: wrong refusal after pickup: %', v_err;
        end if;
      end;

      raise exception 'M143_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M143_FAIL%' then raise; end if;
      if sqlerrm <> 'M143_PROBE_DONE' then
        raise exception 'M143: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M143: pre-pickup cancel frees the driver, post-pickup is refused';
  end;
end;
$assert$;
