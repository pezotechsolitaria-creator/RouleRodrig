-- ── M136 — the Deliver Anything loop had no far side ────────────────────────
--
-- delivery_requests has ZERO rows in production. That reads like a marketing
-- problem and is not one: the flow is a ONE-WAY DOOR, broken in three
-- independent places, and no customer could have completed it however hard
-- they tried.
--
--   1. NO DRIVER COULD EVER QUOTE. There is no function that writes to
--      delivery_quotes. Not an ungranted one — none. The table has existed,
--      empty, waiting for a writer that was never built.
--
--   2. NO CUSTOMER COULD EVER ACCEPT. accept_delivery_quote() is complete and
--      correct, and is granted to NEITHER anon NOR authenticated, so nothing
--      outside the database can call it. It also checks the driver, the
--      request and the quote — but never that the CALLER owns the request. So
--      granting it as it stands would have let any signed-in person accept a
--      stranger's quote and commit them to a price.
--
--   3. NO DRIVER COULD EVER SEE THE JOB. accept_delivery_quote() inserts a
--      delivery with store_id = null and order_id = null, and
--      driver_dashboard() reads its active list through
--      `join stores … join orders …` — INNER joins. Even if 1 and 2 were
--      fixed, the accepted job would be invisible to the driver who won it.
--
-- This migration closes all three. It adds no product surface that did not
-- already exist in intent: every table, status value and settings column it
-- uses was already there.
--
-- ── The ownership perimeter ────────────────────────────────────────────────
-- accept_delivery_quote() is left BYTE-FOR-BYTE UNCHANGED and stays granted to
-- nobody. It becomes an engine, reached only through two wrappers that each
-- prove who is asking:
--
--   customer_accept_delivery_quote(quote)         → auth.uid() owns the request
--   guest_accept_delivery_quote(quote, email)     → the guest email matches
--
-- Changing its signature to add an email argument would have created a competing
-- OVERLOAD rather than a replacement, which is how the dispatch_candidates
-- near-miss happened. Wrappers avoid that entirely.

-- ── 1. The board a driver can quote on ─────────────────────────────────────
--
-- Deliberately NOT a dispatch ladder. Store orders are offered to one driver at
-- a time in widening rings because the price is already fixed and the only
-- question is who. A Deliver Anything job has no price yet — the whole point is
-- that several drivers name one and the customer chooses. So it is a board,
-- open to everyone eligible, and the customer picks.

create or replace function public.driver_open_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_d delivery_drivers%rowtype;
begin
  v_d := current_driver();

  -- An unapproved or off-duty driver sees an empty board rather than an error:
  -- the dashboard already explains their status, and a second explanation of
  -- the same fact in a different voice reads as a bug.
  if v_d.status <> 'approved' or v_d.availability = 'offline' then
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
        -- How busy the board already is for this job. A driver deciding whether
        -- to bother deserves to know they are the fourth quote, and the customer
        -- is better served by a driver who priced it knowing that.
        'quoteCount', (select count(*) from delivery_quotes q
                        where q.request_id = r.id and q.status = 'offered'),
        -- Their OWN standing price, so the board shows "you quoted Rs 250"
        -- rather than inviting them to quote twice.
        'myQuote', (select jsonb_build_object('id', q.id, 'fee', q.fee, 'note', q.note)
                      from delivery_quotes q
                     where q.request_id = r.id and q.driver_id = v_d.id
                       and q.status = 'offered')
      ) as x
      from delivery_requests r
      where r.status = 'open'
        and (r.expires_at is null or r.expires_at > now())
        -- M103's rule, applied at the point of quoting rather than only at the
        -- point of accepting: a scooter never sees a job it could not carry, so
        -- it can never quote on one and be refused at the end.
        and vehicle_can_carry(v_d.vehicle_type, r.size_class)
    ) s
  );
end;
$fn$;

-- ── 2. A driver names a price ──────────────────────────────────────────────

create or replace function public.offer_delivery_quote(
  p_request_id uuid,
  p_fee integer,
  p_note text default null
)
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

  -- Bounds, not business rules. Rs 1 to Rs 50,000 in minor units — wide enough
  -- that the platform is not setting prices, narrow enough that a slipped
  -- decimal point cannot post Rs 2,000,000 to a customer's screen.
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
  if not vehicle_can_carry(v_d.vehicle_type, v_r.size_class) then
    raise exception 'This is a large item and needs a car or a van.' using errcode = 'P0001';
  end if;

  -- One standing price per driver per request. Re-quoting REPLACES rather than
  -- adds, because two live prices from the same driver is not a choice the
  -- customer can meaningfully make.
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
            nullif(btrim(coalesce(p_note, '')), ''), 'offered',
            -- A quote cannot outlive the request it answers.
            v_r.expires_at)
    returning id into v_id;
  end if;

  return v_id;
end;
$fn$;

-- ── 3. A driver takes a price back ─────────────────────────────────────────
-- Without this the only way out of a quote is for the customer to accept it.
-- A driver whose van broke down at 6am must be able to withdraw before someone
-- commits to them at 7.

create or replace function public.withdraw_delivery_quote(p_quote_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_d delivery_drivers%rowtype;
  v_q delivery_quotes%rowtype;
begin
  v_d := current_driver();

  select * into v_q from delivery_quotes where id = p_quote_id for update;
  if not found then
    return false;
  end if;
  if v_q.driver_id <> v_d.id then
    raise exception 'That quote is not yours.' using errcode = 'P0001';
  end if;
  if v_q.status = 'accepted' then
    raise exception 'That job is already yours — cancel it from your deliveries instead.'
      using errcode = 'P0001';
  end if;
  if v_q.status <> 'offered' then
    return false;
  end if;

  update delivery_quotes set status = 'withdrawn' where id = v_q.id;
  return true;
end;
$fn$;

-- ── 4. What the customer sees ──────────────────────────────────────────────
--
-- One function for both identities, because the request itself does not care
-- which it is and two near-identical readers would drift. The email argument is
-- IGNORED whenever there is a session — the M21 principle, and the same rule
-- create_delivery_request() already applies when writing.
--
-- Driver PHONE NUMBERS are withheld until a quote is accepted. Before that the
-- customer is choosing between prices, and a board that hands out every
-- driver's number invites the whole negotiation to leave the platform — which
-- is also how the driver loses the protection of a recorded job.

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
      'deliveredAt', v_del.delivered_at) end
  );
end;
$fn$;

-- The customer's own list. Signed-in only: a guest has no stable identity to
-- list BY, which is exactly why the guest path goes through one id at a time.
create or replace function public.my_delivery_requests()
returns jsonb
language sql
stable
security definer
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
           'quoteCount', (select count(*) from delivery_quotes q
                           where q.request_id = r.id and q.status = 'offered'),
           'bestQuote', (select min(q.fee) from delivery_quotes q
                          where q.request_id = r.id and q.status = 'offered'))
         order by r.created_at desc), '[]'::jsonb)
    from delivery_requests r
   where auth.uid() is not null and r.customer_id = auth.uid();
$fn$;

-- ── 5. Accepting, with the caller proved ───────────────────────────────────

create or replace function public.customer_accept_delivery_quote(p_quote_id uuid)
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

  return accept_delivery_quote(p_quote_id);
end;
$fn$;

create or replace function public.guest_accept_delivery_quote(p_quote_id uuid, p_email text)
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

  return accept_delivery_quote(p_quote_id);
end;
$fn$;

-- ── 6. Withdrawing the request ─────────────────────────────────────────────
-- A customer who has found another way must be able to stop drivers spending
-- attention on them. Only while open — once accepted it is a real job with a
-- driver on the way, and cancelling that is a different act with different
-- consequences for the driver's record.

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
begin
  select * into v_r from delivery_requests where id = p_id for update;
  if not found then return false; end if;

  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return false; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return false; end if;
  end if;

  if v_r.status = 'cancelled' then return true; end if;
  if v_r.status <> 'open' then
    raise exception 'A driver has already been chosen for this one.' using errcode = 'P0001';
  end if;

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
end;
$fn$;

-- ── 7. The driver can see the job they won ─────────────────────────────────
--
-- The inner joins become LEFT joins and every shop-shaped field falls back to
-- its request-shaped equivalent. A driver's screen must not care which kind of
-- job it is looking at — the actions are identical, and the only differences
-- are what to call the pickup and who holds the money.

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
               -- Which kind of job this is. The driver's UI needs it to choose
               -- the right words for the pickup; everything else is the same.
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
               -- On a store order, cash owed is whatever is still pending on the
               -- order. On a direct job there is no order and no payments row:
               -- the whole fee is collected at the door, in cash, by the driver.
               'collectCash', case
                 when d.request_id is not null then d.customer_fee
                 when o.status in ('cancelled','refunded') then 0
                 else coalesce((select sum(p.amount) from payments p
                                 where p.order_id = o.id
                                   and p.status = 'pending'
                                   and p.provider = 'cash'), 0) end,
               -- Direct-job facts. Null on a store order, and the UI reads them
               -- only when jobKind = 'direct'.
               'what', r.what,
               'requestKind', r.kind,
               -- What the driver may lay out on the customer's behalf, and be
               -- repaid at the door. Separate from the fee on purpose: merging
               -- the two is how a driver ends up out of pocket.
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
               'storeName', s.name, 'storeAddress', s.address,
               'dropoffNote', d.dropoff_note,
               'expiresAt', o.expires_at)
             order by o.offered_at), '[]'::jsonb)
        from delivery_offers o
        join deliveries d on d.id = o.delivery_id
        join stores s on s.id = d.store_id
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

-- ── 8. Who may call what ───────────────────────────────────────────────────
--
-- Named explicitly, both roles, every function. `revoke from public` alone is
-- not a boundary here: Supabase's default ACLs already reach `anon`, so a new
-- function is anon-callable the moment it exists unless this block says
-- otherwise. Asserted below rather than assumed.

revoke all on function public.driver_open_requests() from public, anon, authenticated;
revoke all on function public.offer_delivery_quote(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.withdraw_delivery_quote(uuid) from public, anon, authenticated;
revoke all on function public.delivery_request_view(uuid, text) from public, anon, authenticated;
revoke all on function public.my_delivery_requests() from public, anon, authenticated;
revoke all on function public.customer_accept_delivery_quote(uuid) from public, anon, authenticated;
revoke all on function public.guest_accept_delivery_quote(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_delivery_request(uuid, text, text) from public, anon, authenticated;

grant execute on function public.driver_open_requests() to authenticated;
grant execute on function public.offer_delivery_quote(uuid, integer, text) to authenticated;
grant execute on function public.withdraw_delivery_quote(uuid) to authenticated;
grant execute on function public.delivery_request_view(uuid, text) to authenticated;
grant execute on function public.my_delivery_requests() to authenticated;
grant execute on function public.customer_accept_delivery_quote(uuid) to authenticated;
grant execute on function public.cancel_delivery_request(uuid, text, text) to authenticated;

-- guest_accept_delivery_quote is granted to NOBODY. The guest path runs through
-- the server's service-role key, which is the only thing holding the guest's
-- proven email — exactly the split /api/delivery-requests already uses for
-- create_delivery_request.

-- ── 9. Proof, not hope ─────────────────────────────────────────────────────
-- A plpgsql body is not resolved until the first CALL, so a typo inside any
-- function above would ship silently and fail on a driver's phone. Every one of
-- them is called here, inside the migration's transaction, so a mistake rolls
-- the whole thing back instead.

do $assert$
declare
  v_anon boolean;
begin
  -- The grants are what they claim to be.
  for v_anon in
    select has_function_privilege('anon', p.oid, 'execute')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('driver_open_requests','offer_delivery_quote',
                         'withdraw_delivery_quote','delivery_request_view',
                         'my_delivery_requests','customer_accept_delivery_quote',
                         'guest_accept_delivery_quote','cancel_delivery_request')
  loop
    if v_anon then
      raise exception 'M136: a new delivery function is reachable by anon';
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public.guest_accept_delivery_quote(uuid, text)', 'execute') then
    raise exception 'M136: guest_accept_delivery_quote must not be callable by a signed-in role';
  end if;
  if not has_function_privilege('authenticated', 'public.offer_delivery_quote(uuid, integer, text)', 'execute') then
    raise exception 'M136: a driver cannot reach offer_delivery_quote';
  end if;

  -- Bodies resolve. auth.uid() is null here, so each takes its no-identity
  -- path — which is itself the behaviour worth pinning: nothing leaks to a
  -- caller with no session.
  if my_delivery_requests() <> '[]'::jsonb then
    raise exception 'M136: my_delivery_requests returned rows with no session';
  end if;
  if delivery_request_view(gen_random_uuid(), 'nobody@example.com') is not null then
    raise exception 'M136: delivery_request_view answered for a request that does not exist';
  end if;
  if cancel_delivery_request(gen_random_uuid(), 'nobody@example.com') then
    raise exception 'M136: cancel_delivery_request agreed to cancel nothing';
  end if;

  -- The two driver-side functions raise RR080 with no session, which is the
  -- correct answer and proves current_driver() is reached.
  begin
    perform driver_open_requests();
    raise exception 'M136: driver_open_requests answered with no session';
  exception when sqlstate 'RR080' then null;
  end;
  begin
    perform offer_delivery_quote(gen_random_uuid(), 50000, null);
    raise exception 'M136: offer_delivery_quote answered with no session';
  exception when sqlstate 'RR080' then null;
  end;
  begin
    perform withdraw_delivery_quote(gen_random_uuid());
    raise exception 'M136: withdraw_delivery_quote answered with no session';
  exception when sqlstate 'RR080' then null;
  end;

  -- The accept wrappers refuse a caller they cannot identify.
  begin
    perform customer_accept_delivery_quote(gen_random_uuid());
    raise exception 'M136: customer_accept_delivery_quote accepted without a session';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform guest_accept_delivery_quote(gen_random_uuid(), 'nobody@example.com');
    raise exception 'M136: guest_accept_delivery_quote accepted an unknown quote';
  exception when sqlstate 'P0001' then null;
  end;
end;
$assert$;

-- driver_dashboard() cannot be probed the same way — it raises RR080 before it
-- reads anything — so its rewritten query is checked directly instead. This is
-- the LEFT JOIN that was the third break: with the old inner joins an accepted
-- Deliver Anything job returned no row here at all.
do $assert$
declare v_n integer;
begin
  select count(*) into v_n
    from deliveries d
    left join stores s on s.id = d.store_id
    left join orders o on o.id = d.order_id
    left join delivery_requests r on r.id = d.request_id
   where d.status in ('assigned','going_to_pickup','arrived_at_pickup',
                      'picked_up','out_for_delivery','arrived');
  raise notice 'M136: % active deliveries visible through the rewritten join', v_n;

  begin
    perform driver_dashboard();
    raise exception 'M136: driver_dashboard answered with no session';
  exception when sqlstate 'RR080' then null;
  end;
end;
$assert$;
