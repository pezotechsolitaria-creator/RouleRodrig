-- ── M141 — the tracking screen was reading the wrong row ───────────────────
--
-- `delivery_requests.status` goes to 'accepted' the moment a quote is booked,
-- and NOTHING EVER MOVES IT BACK. driver_cannot_complete() and
-- admin_reassign_delivery() change only the `deliveries` row — to
-- 'searching_driver' with driver_id NULL, or to 'requires_admin'. There is no
-- trigger that syncs the two.
--
-- So the customer's screen, which took its state from the request and its
-- driver from the winning QUOTE, showed this after a driver walked away at
-- 10:20:
--
--     badge     "Driver booked"
--     headline  "Your driver is booked"
--     detail    "Follow their progress below. Pay them directly when they
--                arrive."
--     card      the departed driver's name, with a working call button
--
-- ...for ever, polling every twenty seconds, with no way to withdraw. That is
-- precisely the failure this whole feature was written to prevent — a customer
-- sitting and waiting for a driver nobody sent — arrived at from the other end.
--
-- ── The rule ───────────────────────────────────────────────────────────────
-- THE DELIVERY IS THE TRUTH ABOUT THE JOURNEY. The request is only the truth
-- about whether a choice has been made. The view now returns the delivery's
-- CURRENT driver — name, phone, vehicle — so the screen can stop inferring one
-- from a quote that was accepted hours ago and may belong to nobody.
--
-- driverPhone on a QUOTE keeps its old rule (released only when that quote is
-- accepted) because that field answers a different question: who did I choose.
-- The new one answers: who is actually coming.

create or replace function public.delivery_request_view(
  p_id uuid,
  p_email text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_r     delivery_requests%rowtype;
  v_del   deliveries%rowtype;
  v_drv   delivery_drivers%rowtype;
begin
  select * into v_r from delivery_requests where id = p_id;
  if not found then
    return null;
  end if;

  -- The ownership gate. Returning null rather than raising is deliberate: a
  -- distinguishable "exists but not yours" turns this into an oracle for
  -- probing which request ids are real.
  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return null; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return null; end if;
  end if;

  select * into v_del from deliveries where request_id = v_r.id;
  -- Only when somebody actually holds it. A delivery back in searching_driver
  -- has driver_id NULL, and the whole point is that this comes back NULL too.
  if v_del.driver_id is not null then
    select * into v_drv from delivery_drivers where id = v_del.driver_id;
  end if;

  return jsonb_build_object(
    'id', v_r.id,
    'kind', v_r.kind,
    'what', v_r.what,
    'sizeClass', v_r.size_class,
    'status', v_r.status,
    'pickupText', v_r.pickup_text,
    'pickupNote', v_r.pickup_note,
    'dropoffText', v_r.dropoff_text,
    'dropoffNote', v_r.dropoff_note,
    'spendCap', v_r.max_budget,
    'contactName', v_r.contact_name,
    'contactPhone', v_r.contact_phone,
    'createdAt', v_r.created_at,
    'expiresAt', v_r.expires_at,
    'cancelReason', v_r.cancel_reason,
    'quotes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id,
               'fee', q.fee,
               'note', q.note,
               'status', q.status,
               'createdAt', q.created_at,
               'driverName', d.full_name,
               'vehicleType', d.vehicle_type,
               -- Released only to the customer who has already chosen them.
               'driverPhone', case when q.status = 'accepted' then d.phone end,
               'completed', coalesce(m.deliveries_completed, 0),
               'rating', case when coalesce(m.rating_count, 0) = 0 then null
                              else round(m.rating_sum::numeric / m.rating_count, 1) end)
             order by q.fee, q.created_at), '[]'::jsonb)
        from delivery_quotes q
        join delivery_drivers d on d.id = q.driver_id
        left join driver_metrics m on m.driver_id = q.driver_id
       where q.request_id = v_r.id
         and q.status in ('offered', 'accepted')),
    'delivery', case when v_del.id is null then null else jsonb_build_object(
      'id', v_del.id,
      'status', v_del.status,
      'fee', v_del.customer_fee,
      'pin', v_del.pin,
      'assignedAt', v_del.assigned_at,
      'pickedUpAt', v_del.picked_up_at,
      'deliveredAt', v_del.delivered_at,
      -- M141 — who is ACTUALLY on it, right now.
      'driverId', v_del.driver_id,
      'driverName', v_drv.full_name,
      'driverPhone', v_drv.phone,
      'vehicleType', v_drv.vehicle_type) end
  );
end;
$fn$;

revoke all on function public.delivery_request_view(uuid, text) from public, anon, authenticated;
grant execute on function public.delivery_request_view(uuid, text) to authenticated;

do $assert$
begin
  if has_function_privilege('anon', 'public.delivery_request_view(uuid, text)', 'execute') then
    raise exception 'M141: delivery_request_view is reachable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.delivery_request_view(uuid, text)', 'execute') then
    raise exception 'M141: a signed-in customer cannot reach delivery_request_view';
  end if;
  if delivery_request_view(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M141: delivery_request_view answered for a request that does not exist';
  end if;
end;
$assert$;

-- The behaviour, proved end to end in a subtransaction that rolls back.
do $assert$
declare
  v_driver uuid; v_user uuid;
begin
  select id into v_driver from delivery_drivers where status='approved' limit 1;
  select id into v_user from auth.users limit 1;
  if v_driver is null or v_user is null then
    raise notice 'M141: no driver or user to probe with, skipping behavioural check';
    return;
  end if;

  begin
    declare
      v_r uuid; v_q uuid; v_del uuid; v_view jsonb;
    begin
      update delivery_drivers set availability='available', user_id=v_user where id=v_driver;
      insert into driver_metrics (driver_id) values (v_driver) on conflict do nothing;

      v_r := create_delivery_request('package','Probe box','A','B','Probe','+23057000000',
                                     'standard',null,null,null,null,null,null,null,'probe141@example.com');
      insert into delivery_quotes (request_id, driver_id, fee, status, expires_at)
      values (v_r, v_driver, 25000, 'offered', now() + interval '1 day') returning id into v_q;
      v_del := accept_delivery_quote(v_q);

      v_view := delivery_request_view(v_r, 'probe141@example.com');
      if (v_view->'delivery'->>'driverName') is null then
        raise exception 'M141_FAIL: the delivery carries no driver name';
      end if;

      -- The case this exists for: the driver walks away before pickup, exactly
      -- as driver_cannot_complete() leaves it. The delivery loses its driver;
      -- the request still says accepted. Both must now be reported truthfully.
      update deliveries set driver_id = null, status = 'searching_driver' where id = v_del;
      v_view := delivery_request_view(v_r, 'probe141@example.com');
      if (v_view->'delivery'->>'driverName') is not null then
        raise exception 'M141_FAIL: a departed driver is still named on the delivery';
      end if;
      if (v_view->'delivery'->>'status') <> 'searching_driver' then
        raise exception 'M141_FAIL: the delivery status is wrong: %', v_view->'delivery'->>'status';
      end if;
      if (v_view->>'status') <> 'accepted' then
        raise exception 'M141_FAIL: the request status changed unexpectedly';
      end if;

      raise exception 'M141_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M141_FAIL%' then raise; end if;
      if sqlerrm <> 'M141_PROBE_DONE' then
        raise exception 'M141: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M141: the view now reports the delivery''s real driver, probe rolled back';
  end;
end;
$assert$;
