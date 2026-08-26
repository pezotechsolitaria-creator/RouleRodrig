-- ── M158 — the identity document on a cash job ─────────────────────────────
--
-- The owner asked for a photo of the customer's National Identity Card on cash
-- orders, shown to the driver at the door. I argued against it at length in
-- M155 and they asked again having read that. It is their business, their legal
-- risk and their call, and the call is made.
--
-- So the argument is over and the job now is to handle it properly. The case
-- against is preserved in M155 rather than repeated here; what follows is what
-- was built around the decision.
--
-- ── FOUR THINGS THAT MAKE IT SURVIVABLE ────────────────────────────────────
--
--  1. ITS OWN PRIVATE BUCKET. Not mixed in with the payment receipts:
--     different sensitivity, different retention, and a bucket is the unit both
--     are set on.
--
--  2. READABLE BY ONE PERSON. driver_identity_document_path() returns the path
--     only to the driver CURRENTLY holding the delivery. A driver reassigned
--     off the job keeps no claim on it.
--
--  3. READABLE FOR ONE WINDOW. It also returns null once the delivery is
--     delivered, cancelled or failed. A payment receipt stays useful afterwards
--     — it is evidence about money. An identity document exists for a single
--     moment: checking that the person at the door is the person who ordered.
--     After that moment nobody has a reason to look, so nobody can.
--
--  4. IT EXPIRES. delivery_settings.id_document_retention_days (30 by default)
--     and a nightly purge that deletes the object and nulls the path. Under the
--     Mauritius Data Protection Act 2017 storage limitation is not optional:
--     personal data is kept no longer than the purpose requires. The purpose
--     here ends at the door. A bucket quietly accumulating scans of several
--     hundred Rodriguans' ID cards is the failure mode this feature has, and
--     the only real mitigation is for them not to be there.
--
-- The gate mirrors the bank-transfer one exactly: a cash job cannot leave
-- `assigned` without it, so "required" is a state transition rather than a
-- screen somebody could skip.

alter table public.delivery_settings
  add column if not exists id_document_retention_days integer not null default 30;

comment on column public.delivery_settings.id_document_retention_days is
  'Days after a delivery is settled before its identity document is purged. The document exists to be checked at the door; keeping it past that is holding somebody personal data for no live purpose.';

alter table public.deliveries
  add column if not exists id_document_path text,
  add column if not exists id_document_at timestamptz,
  add column if not exists id_document_purged_at timestamptz;

insert into storage.buckets (id, name, public)
values ('delivery-identity', 'delivery-identity', false)
on conflict (id) do nothing;

create or replace function public.attach_delivery_id_document(
  p_request_id uuid,
  p_path text,
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
    raise exception 'Attach a photo of your ID.' using errcode = 'P0001';
  end if;
  -- Re-validated against the bucket prefix, so a forged path cannot be pointed
  -- at another bucket's object.
  if v_path !~ '^delivery-identity/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
    raise exception 'That file could not be attached.' using errcode = 'P0001';
  end if;

  select * into v_r from delivery_requests where id = p_request_id;
  if not found then return false; end if;

  -- The same ownership rule and the same silence as every other guest action.
  if v_uid is not null then
    if v_r.customer_id is distinct from v_uid then return false; end if;
  else
    if v_email is null or v_r.guest_email is distinct from v_email then return false; end if;
  end if;

  select * into v_d from deliveries where request_id = v_r.id;
  if not found then
    raise exception 'Choose a driver first.' using errcode = 'P0001';
  end if;
  if v_d.payment_method is distinct from 'cash' then
    raise exception 'This delivery is being paid by bank transfer.' using errcode = 'P0001';
  end if;
  if v_d.status <> 'assigned' then
    raise exception 'This delivery has already started.' using errcode = 'P0001';
  end if;

  update deliveries
     set id_document_path = v_path,
         id_document_at = now()
   where id = v_d.id;

  perform log_delivery_event(
    v_d.id, 'customer', v_r.customer_id, 'delivery.id_document_attached',
    v_d.status, v_d.status, null, '{}'::jsonb
  );
  return true;
end;
$fn$;

revoke all on function public.attach_delivery_id_document(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_delivery_id_document(uuid, text, text) to authenticated;

create or replace function public.driver_identity_document_path(p_delivery_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_driver delivery_drivers%rowtype;
  v_d      deliveries%rowtype;
begin
  v_driver := current_driver();
  select * into v_d from deliveries where id = p_delivery_id;
  if not found then return null; end if;
  -- The driver who holds it RIGHT NOW.
  if v_d.driver_id is distinct from v_driver.id then return null; end if;
  if v_d.id_document_purged_at is not null then return null; end if;
  -- THE WINDOW. After the door there is nobody with a reason to look.
  if v_d.status in ('delivered','cancelled','failed_delivery') then return null; end if;
  return v_d.id_document_path;
end;
$fn$;

revoke all on function public.driver_identity_document_path(uuid) from public, anon, authenticated;
grant execute on function public.driver_identity_document_path(uuid) to authenticated;

create or replace function public.expired_identity_documents(p_limit integer default 200)
returns table(delivery_id uuid, storage_path text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select d.id, d.id_document_path
    from deliveries d, delivery_settings s
   where s.id = 'main'
     and d.id_document_path is not null
     and d.id_document_purged_at is null
     and d.status in ('delivered','cancelled','failed_delivery')
     and coalesce(d.delivered_at, d.updated_at)
         < now() - make_interval(days => s.id_document_retention_days)
   order by coalesce(d.delivered_at, d.updated_at)
   limit greatest(coalesce(p_limit, 200), 1);
$fn$;

create or replace function public.forget_identity_document(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  update deliveries
     set id_document_path = null,
         id_document_purged_at = now()
   where id = p_delivery_id and id_document_path is not null;
  -- False rather than an error on a second call: the purge job retries, and a
  -- retry finding the work already done is not a failure.
  if not found then return false; end if;
  perform log_delivery_event(
    p_delivery_id, 'system', null, 'delivery.id_document_purged',
    null, null, null, '{}'::jsonb
  );
  return true;
end;
$fn$;

-- Neither of these is a client action. The purge runs as the service role from
-- /api/cron/purge-documents.
revoke all on function public.expired_identity_documents(integer) from public, anon, authenticated;
revoke all on function public.forget_identity_document(uuid) from public, anon, authenticated;

-- ── The gate ───────────────────────────────────────────────────────────────
-- "Required" is a state transition, not a screen. RR088 sits beside RR087 so
-- the driver's card can tell the customer which document it is waiting on.

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

  v_ok := (v_d.status = 'assigned'          and p_to = 'going_to_pickup')
       or (v_d.status = 'going_to_pickup'   and p_to = 'arrived_at_pickup')
       or (v_d.status = 'arrived_at_pickup' and p_to = 'picked_up')
       or (v_d.status = 'picked_up'         and p_to = 'out_for_delivery')
       or (v_d.status = 'out_for_delivery'  and p_to = 'arrived');
  if not v_ok then
    raise exception using errcode = 'RR086',
      message = format('Cannot go from "%s" to "%s".', v_d.status, p_to);
  end if;

  if v_d.status = 'assigned'
     and v_d.payment_method = 'bank_transfer'
     and v_d.payment_proof_path is null then
    raise exception using errcode = 'RR087',
      message = 'Waiting for the customer to send proof of payment.';
  end if;

  if v_d.status = 'assigned'
     and v_d.payment_method = 'cash'
     and v_d.id_document_path is null then
    raise exception using errcode = 'RR088',
      message = 'Waiting for the customer to send their ID.';
  end if;

  update deliveries
     set status = p_to,
         picked_up_at = case when p_to = 'picked_up' then now() else picked_up_at end
   where id = p_delivery_id;

  perform log_delivery_event(p_delivery_id, 'driver', auth.uid(), 'delivery.advanced', v_d.status, p_to);
  return jsonb_build_object('ok', true, 'status', p_to);
end;
$fn$;

do $assert$
declare
  v_days integer;
begin
  if has_function_privilege('anon','public.attach_delivery_id_document(uuid, text, text)','execute') then
    raise exception 'M158: attaching an ID is reachable by anon';
  end if;
  if has_function_privilege('anon','public.driver_identity_document_path(uuid)','execute')
     or has_function_privilege('authenticated','public.expired_identity_documents(integer)','execute')
     or has_function_privilege('authenticated','public.forget_identity_document(uuid)','execute') then
    raise exception 'M158: a purge or read path is reachable by a client role';
  end if;
  if not exists (select 1 from storage.buckets where id = 'delivery-identity' and public = false) then
    raise exception 'M158: the identity bucket is missing or public';
  end if;

  -- Without a retention period nothing would ever be purged, which is the one
  -- failure this feature must not have.
  select id_document_retention_days into v_days from delivery_settings where id = 'main';
  if coalesce(v_days, 0) <= 0 then
    raise exception 'M158: no retention period is set, so nothing would ever be purged';
  end if;

  begin
    perform attach_delivery_id_document(gen_random_uuid(), '../delivery-payments/slip.jpg', 'x@example.com');
    raise exception 'M158: accepted a path outside the identity bucket';
  exception when sqlstate 'P0001' then null;
  end;

  if attach_delivery_id_document(
       gen_random_uuid(),
       'delivery-identity/00000000-0000-0000-0000-000000000000/id.jpg',
       'nobody@example.com') then
    raise exception 'M158: attached an ID to a request that does not exist';
  end if;

  begin
    perform driver_identity_document_path(gen_random_uuid());
    raise exception 'M158: the ID read path answered with no driver session';
  exception when sqlstate 'RR080' then null;
  end;

  if (select count(*) from expired_identity_documents(10)) <> 0 then
    raise exception 'M158: something is already due for purge, which cannot be right yet';
  end if;
end;
$assert$;
