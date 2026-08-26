-- ── M137 — a request nobody hears about is a request nobody answers ────────
--
-- M136 made the Deliver Anything loop possible. This makes it AUDIBLE.
--
-- Every existing driver-notification lookup is keyed by delivery_id, because
-- until now every notifiable delivery event began life as a store order. A
-- Deliver Anything job has no delivery row until somebody has already been
-- chosen — the whole notifiable window happens BEFORE that — so none of them
-- can reach the drivers who need to know a job is on the board.
--
-- Five lookups, none of them reachable by any client role. They return phone
-- numbers, WhatsApp keys and a customer's email, which is exactly why the
-- grants below name the roles rather than trusting `revoke from public`:
-- Supabase's default ACLs already reach `anon`, so a new function is
-- anon-callable the moment it exists unless something says otherwise.

-- ── Who should hear about a new job ────────────────────────────────────────
--
-- Approved, on duty, and driving something that can carry it — the same three
-- conditions driver_open_requests() applies to the board itself, so a driver is
-- never messaged about a job their vehicle would not let them quote on.
--
-- The `not exists` clause is the one that matters on re-notify: a driver who
-- has ALREADY quoted has done their part, and messaging them again about the
-- same job is how a delivery network teaches its drivers to mute it.

create or replace function public.request_push_targets(p_request_id uuid)
returns table(endpoint text, p256dh text, auth text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_carry(d.vehicle_type, r.size_class)
    join push_subscriptions s on s.user_id = d.user_id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$fn$;

-- The same audience over the channel that survives a cleared browser, a
-- declined permission and an iPhone that was never added to the Home Screen.
create or replace function public.request_whatsapp_targets(p_request_id uuid)
returns table(phone text, api_key text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_carry(d.vehicle_type, r.size_class)
    join driver_contact_channels c on c.driver_id = d.id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> ''
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$fn$;

-- ── The one driver who won ─────────────────────────────────────────────────
-- driver_whatsapp_target_assigned() answers the same question for a store
-- order, keyed by delivery_id. This is keyed by DRIVER, because at the moment a
-- quote is accepted the caller is holding the quote, not the delivery.
create or replace function public.driver_whatsapp_target_for_driver(p_driver_id uuid)
returns table(phone text, api_key text, driver_name text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_drivers d
    join driver_contact_channels c on c.driver_id = d.id
   where d.id = p_driver_id
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> '';
$fn$;

-- ── The facts a message is written from ────────────────────────────────────
--
-- One read rather than four. Includes the customer's identity — user id AND
-- guest email — because a quote arriving is the one event the CUSTOMER must
-- hear about, and which of the two they have is not knowable at the call site.

create or replace function public.delivery_request_facts(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
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
           'contactName', r.contact_name,
           'contactPhone', r.contact_phone,
           'customerId', r.customer_id,
           'guestEmail', r.guest_email,
           'status', r.status,
           'expiresAt', r.expires_at,
           'quoteCount', (select count(*) from delivery_quotes q
                           where q.request_id = r.id and q.status = 'offered'))
    from delivery_requests r
   where r.id = p_request_id;
$fn$;

-- The winning quote, the driver behind it, the job it answers, and the PIN the
-- customer will read out at the door.
create or replace function public.delivery_quote_facts(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select jsonb_build_object(
           'quoteId', q.id,
           'fee', q.fee,
           'note', q.note,
           'status', q.status,
           'driverId', q.driver_id,
           'driverName', d.full_name,
           'driverPhone', d.phone,
           'vehicleType', d.vehicle_type,
           'request', delivery_request_facts(q.request_id),
           'deliveryId', (select dl.id from deliveries dl where dl.request_id = q.request_id),
           'pin', (select dl.pin from deliveries dl where dl.request_id = q.request_id))
    from delivery_quotes q
    join delivery_drivers d on d.id = q.driver_id
   where q.id = p_quote_id;
$fn$;

-- ── Server-only, and proved so ─────────────────────────────────────────────
revoke all on function public.request_push_targets(uuid) from public, anon, authenticated;
revoke all on function public.request_whatsapp_targets(uuid) from public, anon, authenticated;
revoke all on function public.driver_whatsapp_target_for_driver(uuid) from public, anon, authenticated;
revoke all on function public.delivery_request_facts(uuid) from public, anon, authenticated;
revoke all on function public.delivery_quote_facts(uuid) from public, anon, authenticated;

do $assert$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('request_push_targets','request_whatsapp_targets',
                       'driver_whatsapp_target_for_driver','delivery_request_facts',
                       'delivery_quote_facts')
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'M137: notification lookups reachable by a client role: %', v_bad;
  end if;

  -- Each body resolves, and each answers nothing for an id that does not exist
  -- rather than erroring — the notifier sits on paths that have already
  -- committed and must never be the thing that fails them.
  if (select count(*) from request_push_targets(gen_random_uuid())) <> 0 then
    raise exception 'M137: request_push_targets found targets for a request that does not exist';
  end if;
  if (select count(*) from request_whatsapp_targets(gen_random_uuid())) <> 0 then
    raise exception 'M137: request_whatsapp_targets found targets for a request that does not exist';
  end if;
  if (select count(*) from driver_whatsapp_target_for_driver(gen_random_uuid())) <> 0 then
    raise exception 'M137: driver_whatsapp_target_for_driver found a driver that does not exist';
  end if;
  if delivery_request_facts(gen_random_uuid()) is not null then
    raise exception 'M137: delivery_request_facts invented a request';
  end if;
  if delivery_quote_facts(gen_random_uuid()) is not null then
    raise exception 'M137: delivery_quote_facts invented a quote';
  end if;
end;
$assert$;
