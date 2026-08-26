-- ── M139 — expires_at was decoration ───────────────────────────────────────
--
-- create_delivery_request() has always stamped `expires_at = now() + 48 hours`,
-- with a comment explaining why: "a driver's price on Monday is not a promise
-- on Friday, and a board full of week-old requests is how a marketplace dies".
--
-- Nothing ever read it except two list filters. There is no sweep. The status
-- column has allowed 'expired' since the table was created and no row has ever
-- been given it. So:
--
--   1. THE CLOCK WAS NOT ENFORCED WHERE IT MATTERED. accept_delivery_quote()
--      checks that the request is 'open' and the quote is 'offered' — and both
--      of those stay true FOR EVER, because nothing closes them. A request
--      posted six weeks ago is still bookable today, at a price a driver named
--      in another month, and that driver is committed to it.
--
--   2. THE OPEN-REQUEST CAP FILLED UP WITH THE DEAD. The five-open-request
--      flood control counts `status = 'open'`, so a customer who posted five
--      things last year is locked out permanently with no way to clear them.
--
--   3. The driver board and the owner's board both filter on `expires_at >
--      now()`, so they LOOKED right while the underlying rows never closed.
--      That is why this survived being built: every screen agreed, and every
--      screen was papering over the same missing sweep.
--
-- Two changes. The guard is the protection; the sweep is the housekeeping.

-- ── The guard ──────────────────────────────────────────────────────────────
-- Same signature, so this REPLACES rather than creating a competing overload.
-- Everything else is byte-for-byte the function M136 deliberately left alone;
-- the only addition is the two expiry checks, placed after the status checks so
-- the more specific message wins when both apply.
--
-- Note it checks the QUOTE's clock as well as the request's. A quote inherits
-- its request's expiry when written, but a row can be inserted by an admin or
-- a future path with its own, and "that price has expired" is the truthful
-- sentence in that case.

create or replace function public.accept_delivery_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_q       delivery_quotes%rowtype;
  v_r       delivery_requests%rowtype;
  v_share   integer;
  v_driver  integer;
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

  -- Somebody else won, or the customer withdrew it. Say which.
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

  -- M139 — the clock, which nothing checked. status stays 'open' until the
  -- sweep below runs, and even with the sweep running there is a window; the
  -- database must refuse on its own rather than trusting a cron to have fired.
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

  select coalesce(driver_share_percent, 80) into v_share from delivery_settings where id = 'main';
  v_driver := round(v_q.fee * v_share / 100.0);

  insert into deliveries (
    request_id, store_id, order_id, driver_id, status,
    customer_fee, driver_earning, platform_fee,
    dropoff_lat, dropoff_lng, dropoff_note,
    pin, assigned_at
  ) values (
    v_r.id, null, null, v_q.driver_id, 'assigned',
    v_q.fee, v_driver, v_q.fee - v_driver,
    v_r.dropoff_lat, v_r.dropoff_lng, v_r.dropoff_text,
    lpad((floor(random() * 10000))::int::text, 4, '0'), now()
  ) returning id into v_id;

  update delivery_quotes set status = 'accepted' where id = v_q.id;
  update delivery_quotes set status = 'declined'
   where request_id = v_r.id and id <> v_q.id and status = 'offered';
  update delivery_requests set status = 'accepted' where id = v_r.id;

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

-- ── The housekeeping ───────────────────────────────────────────────────────
-- Called every minute from /api/cron/notifications, alongside
-- sweep_delivery_escalations(). Service-role only.

create or replace function public.sweep_delivery_requests()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_expired        uuid[];
  v_with_quotes    integer := 0;
  v_quotes_expired integer := 0;
begin
  with aged as (
    update delivery_requests
       set status = 'expired', updated_at = now()
     where status = 'open'
       and expires_at is not null
       and expires_at <= now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_expired from aged;

  if array_length(v_expired, 1) is null then
    return jsonb_build_object('requestsExpired', 0, 'quotesExpired', 0, 'expiredWithQuotes', 0);
  end if;

  -- How many died with prices sitting on them. Not a housekeeping number: that
  -- is a customer who WAS quoted and never booked, which is the marketplace
  -- failing at the last step rather than the first. Counted before the update
  -- below changes the rows out from under it.
  select count(distinct request_id) into v_with_quotes
    from delivery_quotes
   where request_id = any(v_expired) and status = 'offered';

  -- 'expired', not 'declined'. A declined quote lost to another driver; these
  -- ran out of time, and a driver reading their own history should be able to
  -- tell those two apart.
  with gone as (
    update delivery_quotes set status = 'expired'
     where request_id = any(v_expired) and status = 'offered'
    returning 1
  )
  select count(*) into v_quotes_expired from gone;

  return jsonb_build_object(
    'requestsExpired', array_length(v_expired, 1),
    'quotesExpired', v_quotes_expired,
    'expiredWithQuotes', v_with_quotes);
end;
$fn$;

revoke all on function public.sweep_delivery_requests() from public, anon, authenticated;

-- ── Proof ──────────────────────────────────────────────────────────────────
do $assert$
declare
  v_out jsonb;
begin
  if has_function_privilege('anon', 'public.sweep_delivery_requests()', 'execute')
     or has_function_privilege('authenticated', 'public.sweep_delivery_requests()', 'execute') then
    raise exception 'M139: the sweep is reachable by a client role';
  end if;

  -- Nothing to do is a valid answer, not an error.
  v_out := sweep_delivery_requests();
  if (v_out->>'requestsExpired')::int <> 0 then
    raise exception 'M139: the sweep expired something unexpected: %', v_out;
  end if;

  -- The probe WRITES rows, so it lives in a subtransaction: raising a sentinel
  -- at the end and catching it here rolls back everything it touched while
  -- leaving the two functions above committed. Raising at the top level would
  -- have taken the whole migration down with it — which is exactly what
  -- happened on the first attempt at this file.
  begin
    declare
      v_r uuid; v_q uuid; v_err text; v_sweep jsonb;
    begin
      v_r := create_delivery_request('package','Probe box','A','B','Probe','+23057000000',
                                     'standard',null,null,null,null,null,null,null,'probe139@example.com');
      update delivery_requests set expires_at = now() - interval '1 hour' where id = v_r;
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, (select id from delivery_drivers where status='approved' limit 1),
              25000, 'offered', now() + interval '1 day')
      returning id into v_q;

      -- The whole point of the guard: an aged-out request is not bookable even
      -- though its status still says 'open' and its quote still says 'offered'.
      begin
        perform accept_delivery_quote(v_q);
        raise exception 'M139_FAIL: an EXPIRED request was still bookable';
      exception when sqlstate 'P0001' then
        get stacked diagnostics v_err = message_text;
        if v_err like 'M139_FAIL%' then raise; end if;
        if v_err not ilike '%expired%' then
          raise exception 'M139_FAIL: expired request refused for the wrong reason: %', v_err;
        end if;
      end;

      v_sweep := sweep_delivery_requests();
      if (v_sweep->>'requestsExpired')::int <> 1
         or (v_sweep->>'quotesExpired')::int <> 1
         or (v_sweep->>'expiredWithQuotes')::int <> 1 then
        raise exception 'M139_FAIL: the sweep did not close it: %', v_sweep;
      end if;
      if (select status from delivery_requests where id = v_r) <> 'expired' then
        raise exception 'M139_FAIL: the request is not marked expired';
      end if;
      if (select status from delivery_quotes where id = v_q) <> 'expired' then
        raise exception 'M139_FAIL: the quote is not marked expired';
      end if;

      raise exception 'M139_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M139_FAIL%' then raise; end if;
      if sqlerrm <> 'M139_PROBE_DONE' then
        raise exception 'M139: the probe failed unexpectedly: %', sqlerrm;
      end if;
  end;

  raise notice 'M139: expiry guard and sweep both proved, probe rolled back';
end;
$assert$;
