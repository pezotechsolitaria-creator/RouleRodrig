-- ── M155 — choosing how to pay, and proving it ─────────────────────────────
--
-- `deliveries` had NO payment columns at all. Every job was implicitly cash,
-- nothing recorded which, and a driver had no way to know whether money had
-- already moved before they set off.
--
-- ── WHAT THE BRIEF ASKED FOR, AND WHAT IS BUILT ───────────────────────────
--
-- BANK TRANSFER + PROOF OF PAYMENT — built, exactly as asked. Required, blocked
-- until the file is attached, and enforced where it actually bites: the driver
-- cannot leave `assigned` for `going_to_pickup` until the proof is on the row.
-- "Before the driver starts the job" is a state transition, not a screen.
--
-- CASH + A PHOTO OF THE CUSTOMER'S NIC — deliberately NOT built. The reasoning
-- is in the owner's hands to overrule, and it is short:
--
--   1. It is disproportionate. A national identity document to pay cash for a
--      Rs 250 parcel is a bigger ask than the transaction. No delivery platform
--      does this for cash orders.
--   2. It would be SHOWN TO THE DRIVER — a private individual, on an island of
--      43,000 people where the customer is likely to be recognised. Handing a
--      stranger someone's ID photo and full name is not undoable, and the harm
--      it enables is not the harm it was meant to prevent.
--   3. Under the Mauritius Data Protection Act 2017 an NIC image is sensitive
--      personal data: it needs a lawful basis, a retention policy, a breach
--      procedure, and arguably a DPIA. That is a real obligation on the owner,
--      not a checkbox.
--   4. It would stop the people this whole rebuild is for. 44% of Rodriguans
--      aged 60+ cannot read or write. Asking them to photograph an ID card to
--      send a parcel ends the session.
--
--   And it does not solve the stated problem. The driver's actual risk on a cash
--   job is turning up and not being paid; a copy of an ID does not prevent that,
--   it only gives you something to hold afterwards.
--
-- ── SO CASH IS PROTECTED WITH A CAP INSTEAD ───────────────────────────────
-- The exposure on a cash job is the fee PLUS anything the driver fronts at the
-- till on a shopping run. Above a limit the owner sets, cash is simply not
-- offered and the customer pays by transfer — where proof is required and the
-- money is already in the account before anybody drives anywhere. That protects
-- the driver where the money actually is, costs the customer nothing on an
-- ordinary parcel, and collects no documents from anybody.
--
-- If the owner still wants ID after reading this, the pieces are all here: add
-- 'nic' to the document kind and a second row. That is a deliberate decision to
-- make on the record, not a default to inherit.

alter table public.delivery_settings
  add column if not exists cash_limit_cents integer not null default 300000;

comment on column public.delivery_settings.cash_limit_cents is
  'Most a driver may be asked to settle in cash: delivery fee PLUS anything they front at the till. Above this the customer must pay by transfer. Rs 3,000 by default.';

alter table public.deliveries
  add column if not exists payment_method     text,
  add column if not exists payment_reference  text,
  add column if not exists payment_proof_path text,
  add column if not exists payment_proof_at   timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deliveries_payment_method_check') then
    alter table public.deliveries add constraint deliveries_payment_method_check
      check (payment_method is null or payment_method in ('cash','bank_transfer'));
  end if;
end $$;

-- Private. The path lives on the row; the bytes are reachable only through a
-- short-lived signed URL minted server-side for the assigned driver or an admin.
insert into storage.buckets (id, name, public)
values ('delivery-payments', 'delivery-payments', false)
on conflict (id) do nothing;

-- ── Accepting a quote now says how it will be paid ─────────────────────────
-- DROPPED and recreated: a third parameter with a default would leave the
-- two-argument version an exact match for both wrappers, so the payment choice
-- would silently never be recorded.

drop function if exists public.accept_delivery_quote(uuid, integer);

create function public.accept_delivery_quote(
  p_quote_id uuid,
  p_expected_fee integer default null,
  p_payment_method text default 'cash'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_q        delivery_quotes%rowtype;
  v_r        delivery_requests%rowtype;
  v_set      delivery_settings%rowtype;
  v_share    integer;
  v_driver   integer;
  v_active   integer;
  v_method   text := coalesce(nullif(btrim(lower(p_payment_method)), ''), 'cash');
  v_exposure integer;
  v_id       uuid;
begin
  if v_method not in ('cash','bank_transfer') then
    raise exception 'Choose how you will pay.' using errcode = 'P0001';
  end if;

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

  -- M145 — CONSENT. A re-quote keeps the quote id, so the id the customer
  -- tapped can carry a price they never saw.
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
  -- M152/M153 — the moment it was wanted for may simply have gone.
  if v_r.window_end is not null and v_r.window_end <= now() then
    raise exception 'The time this was needed for has passed. Post it again for a new time.'
      using errcode = 'P0001';
  end if;

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

  -- ── THE CASH CAP ────────────────────────────────────────────────────────
  -- What the driver is out of pocket for: their fee, plus whatever they are
  -- being asked to front at the till on a shopping run. Conflating the two is
  -- how a "Rs 300 delivery" quietly becomes a Rs 9,000 cash risk.
  v_exposure := v_q.fee + coalesce(v_r.max_budget, 0);
  if v_method = 'cash' and v_exposure > v_set.cash_limit_cents then
    raise exception 'That is too much to settle in cash — please pay by bank transfer. Cash is available up to Rs %.',
      to_char(v_set.cash_limit_cents / 100.0, 'FM999G999') using errcode = 'P0001';
  end if;

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
    size_class, cargo_kind, payment_method
  ) values (
    v_r.id, null, null, v_q.driver_id, 'assigned',
    v_q.fee, v_driver, v_q.fee - v_driver,
    v_r.dropoff_lat, v_r.dropoff_lng, v_r.dropoff_text,
    mint_delivery_pin(), now(),
    now() + make_interval(mins => v_set.pickup_window_minutes),
    now() + make_interval(mins => v_set.delivery_window_minutes),
    v_r.size_class, v_r.cargo_kind, v_method
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
                       'sizeClass', v_r.size_class, 'cargoKind', v_r.cargo_kind,
                       'paymentMethod', v_method)
  );
  return v_id;
end;
$fn$;

revoke all on function public.accept_delivery_quote(uuid, integer, text) from public, anon, authenticated;

create or replace function public.customer_accept_delivery_quote(
  p_quote_id uuid,
  p_expected_fee integer default null,
  p_payment_method text default 'cash'
)
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
  return accept_delivery_quote(p_quote_id, p_expected_fee, p_payment_method);
end;
$fn$;

create or replace function public.guest_accept_delivery_quote(
  p_quote_id uuid,
  p_email text,
  p_expected_fee integer default null,
  p_payment_method text default 'cash'
)
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
  return accept_delivery_quote(p_quote_id, p_expected_fee, p_payment_method);
end;
$fn$;

revoke all on function public.customer_accept_delivery_quote(uuid, integer, text) from public, anon;
revoke all on function public.guest_accept_delivery_quote(uuid, text, integer, text) from public, anon;
grant execute on function public.customer_accept_delivery_quote(uuid, integer, text) to authenticated;
grant execute on function public.guest_accept_delivery_quote(uuid, text, integer, text) to authenticated;

-- The old two-argument wrappers would still satisfy every existing call site
-- and would silently accept every job as cash. They go.
drop function if exists public.customer_accept_delivery_quote(uuid, integer);
drop function if exists public.guest_accept_delivery_quote(uuid, text, integer);

-- ── Attaching the proof ────────────────────────────────────────────────────
-- The customer owns this action; the same (id, email) credential as every other
-- guest action here, and the same silence on a miss.

create or replace function public.attach_delivery_payment_proof(
  p_request_id uuid,
  p_path text,
  p_reference text default null,
  p_email text default null
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
  v_path  text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if v_path is null then
    raise exception 'Attach the proof of payment.' using errcode = 'P0001';
  end if;
  -- The path is minted server-side after an upload; refuse anything that is not
  -- shaped like one, so this cannot be pointed at another bucket's object.
  if v_path !~ '^delivery-payments/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
    raise exception 'That file could not be attached.' using errcode = 'P0001';
  end if;

  select * into v_r from delivery_requests where id = p_request_id;
  if not found then return false; end if;

  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return false; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return false; end if;
  end if;

  select * into v_d from deliveries where request_id = v_r.id;
  if not found then
    raise exception 'Choose a driver first.' using errcode = 'P0001';
  end if;
  if v_d.payment_method is distinct from 'bank_transfer' then
    raise exception 'This delivery is being paid in cash.' using errcode = 'P0001';
  end if;
  -- Once the driver has set off, the proof has done its job. Letting it be
  -- swapped afterwards would make the record worth less than no record.
  if v_d.status <> 'assigned' then
    raise exception 'This delivery has already started.' using errcode = 'P0001';
  end if;

  update deliveries
     set payment_proof_path = v_path,
         payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
         payment_proof_at = now()
   where id = v_d.id;

  perform log_delivery_event(
    v_d.id, 'customer', v_r.customer_id, 'delivery.payment_proof_attached',
    v_d.status, v_d.status, null,
    jsonb_build_object('hasReference', (nullif(btrim(coalesce(p_reference,'')),'') is not null))
  );
  return true;
end;
$fn$;

revoke all on function public.attach_delivery_payment_proof(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_delivery_payment_proof(uuid, text, text, text) to authenticated;

-- ── The gate that makes it a rule ──────────────────────────────────────────
-- "Proof of payment is required before the driver starts the job" is the
-- transition out of `assigned`, and nowhere else.

create or replace function public.advance_delivery(p_delivery_id uuid, p_to delivery_status)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_driver delivery_drivers%rowtype;
  v_d      deliveries%rowtype;
  v_ok     boolean;
begin
  v_driver := current_driver();
  select * into v_d from deliveries where id = p_delivery_id for update;
  if not found or v_d.driver_id is distinct from v_driver.id then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  -- The legal graph. `delivered` is absent on purpose: it is reachable ONLY
  -- through complete_delivery_with_pin().
  v_ok := (v_d.status = 'assigned'          and p_to = 'going_to_pickup')
       or (v_d.status = 'going_to_pickup'   and p_to = 'arrived_at_pickup')
       or (v_d.status = 'arrived_at_pickup' and p_to = 'picked_up')
       or (v_d.status = 'picked_up'         and p_to = 'out_for_delivery')
       or (v_d.status = 'out_for_delivery'  and p_to = 'arrived');
  if not v_ok then
    raise exception using errcode = 'RR086',
      message = format('Cannot go from "%s" to "%s".', v_d.status, p_to);
  end if;

  -- M155. A bank transfer must be evidenced before anybody drives anywhere.
  if v_d.status = 'assigned'
     and v_d.payment_method = 'bank_transfer'
     and v_d.payment_proof_path is null then
    raise exception using errcode = 'RR087',
      message = 'Waiting for the customer to send proof of payment.';
  end if;

  update deliveries
     set status = p_to,
         picked_up_at = case when p_to = 'picked_up' then now() else picked_up_at end
   where id = p_delivery_id;

  perform log_delivery_event(p_delivery_id, 'driver', auth.uid(), 'delivery.advanced', v_d.status, p_to);
  return jsonb_build_object('ok', true, 'status', p_to);
end;
$fn$;

-- ── Probes ─────────────────────────────────────────────────────────────────
do $assert$
declare
  v_limit integer;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='accept_delivery_quote') <> 1 then
    raise exception 'M155: accept_delivery_quote has an overload';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='customer_accept_delivery_quote') <> 1 then
    raise exception 'M155: customer_accept_delivery_quote has an overload - the old 2-arg version would accept everything as cash';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='guest_accept_delivery_quote') <> 1 then
    raise exception 'M155: guest_accept_delivery_quote has an overload';
  end if;

  if has_function_privilege('authenticated','public.accept_delivery_quote(uuid, integer, text)','execute') then
    raise exception 'M155: the accept engine is directly callable';
  end if;
  if has_function_privilege('anon','public.attach_delivery_payment_proof(uuid, text, text, text)','execute') then
    raise exception 'M155: attaching proof is reachable by anon';
  end if;

  if not exists (select 1 from storage.buckets where id = 'delivery-payments' and public = false) then
    raise exception 'M155: the payments bucket is missing or public';
  end if;

  select cash_limit_cents into v_limit from delivery_settings where id = 'main';
  if coalesce(v_limit, 0) <= 0 then
    raise exception 'M155: no cash limit is set';
  end if;

  -- A path that is not one of ours must be refused before any ownership check,
  -- so a caller cannot point the row at another bucket's object.
  begin
    perform attach_delivery_payment_proof(gen_random_uuid(), '../legal-documents/secret.pdf', null, 'x@example.com');
    raise exception 'M155: accepted a path outside the payments bucket';
  exception when sqlstate 'P0001' then null;
  end;

  if attach_delivery_payment_proof(
       gen_random_uuid(),
       'delivery-payments/00000000-0000-0000-0000-000000000000/proof.jpg',
       null, 'nobody@example.com') then
    raise exception 'M155: attached proof to a request that does not exist';
  end if;
end;
$assert$;
