-- ── M104c · A losing quote must not report success ──────────────────────────
--
-- M104's idempotency guard was scoped to the REQUEST, which is right for a
-- double tap on the WINNING quote and wrong for every other quote on it. Two
-- drivers quote, the customer accepts the van, then taps the scooter's quote:
-- that returned the VAN'S delivery and reported success, so the screen would
-- tell them they had booked a driver they had not booked, at a price they had
-- not agreed.
--
-- Nothing was corrupted — no second delivery, no reassignment — which is
-- exactly why it would have survived a casual test. The damage is in what the
-- customer is told. Idempotency belongs to the QUOTE.
create or replace function public.accept_delivery_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_q delivery_quotes%rowtype;
  v_r delivery_requests%rowtype;
  v_share integer;
  v_driver integer;
  v_id uuid;
begin
  -- Lock the QUOTE then the request, always in that order — a stable lock order
  -- is what stops two concurrent accepts deadlocking each other.
  select * into v_q from delivery_quotes where id = p_quote_id for update;
  if not found then raise exception 'That quote no longer exists.' using errcode = 'P0001'; end if;

  select * into v_r from delivery_requests where id = v_q.request_id for update;
  if not found then raise exception 'That request no longer exists.' using errcode = 'P0001'; end if;

  -- THIS quote already won: return its delivery. A double tap is not an error.
  if v_q.status = 'accepted' then
    select id into v_id from deliveries where request_id = v_r.id;
    if v_id is not null then return v_id; end if;
  end if;

  if v_r.status = 'accepted' then
    raise exception 'Another driver has already been chosen for this delivery.' using errcode = 'P0001';
  end if;
  if v_r.status <> 'open' then
    raise exception 'This request is no longer open.' using errcode = 'P0001';
  end if;
  if v_q.status <> 'offered' then
    raise exception 'That quote is no longer available.' using errcode = 'P0001';
  end if;

  -- Re-checked at ACCEPT, not only at quote time: a driver can change vehicle,
  -- be suspended or go offline between quoting and being chosen, and the moment
  -- that matters is the one where the job becomes theirs.
  if not exists (
    select 1 from delivery_drivers d
     where d.id = v_q.driver_id
       and d.status = 'approved'
       and vehicle_can_carry(d.vehicle_type, v_r.size_class)
  ) then
    raise exception 'That driver can no longer take this delivery.' using errcode = 'P0001';
  end if;

  -- THE COMMISSION. The driver named the fee; the platform keeps a share and
  -- never sets it. driver_share_percent is the existing dial, reused rather than
  -- duplicated — two numbers meaning "the split" is how they drift apart.
  select coalesce(driver_share_percent, 80) into v_share from delivery_settings where id = 'main';
  v_driver := round(v_q.fee * v_share / 100.0);

  insert into deliveries (
    request_id, store_id, order_id, driver_id, status,
    customer_fee, driver_earning, platform_fee,
    dropoff_lat, dropoff_lng, dropoff_note, pin, assigned_at
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
$$;

revoke all on function public.accept_delivery_quote(uuid) from public, anon, authenticated;
grant execute on function public.accept_delivery_quote(uuid) to service_role;
