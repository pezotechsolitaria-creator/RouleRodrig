-- ── ONE DOCUMENT EXPIRED, THE OTHER WAS KEPT FOR EVER ──────────────────────
--
-- M158 built a whole retention machine for the identity document, and argued
-- at length in its own header that holding a national ID longer than the job
-- needs it would be disproportionate under the Data Protection Act 2017: a
-- setting, an expiry query, a forget function, and a nightly cron.
--
-- The transfer receipt got none of it. `delivery-payments` appears in the
-- bucket creation, the path regex, the customer upload and the driver's signed
-- read — and in no purge, with no retention setting.
--
-- It is a photograph of a Mauritian bank slip. It carries an account number and
-- an account holder's name, and it was being retained indefinitely by a
-- platform whose own reasoning about the ID says it should not be.
--
-- ── WHY 90 DAYS AND NOT 30 ────────────────────────────────────────────────
-- The ID answers "is this the person at the door", which stops mattering the
-- moment the parcel changes hands. A receipt answers "did this money arrive",
-- which somebody may reasonably ask months later — a customer disputing a
-- charge, the owner reconciling a bank statement. So it outlives the ID by
-- design, and the number is the owner's to change.
alter table delivery_settings
  add column if not exists payment_proof_retention_days integer not null default 90;

comment on column public.delivery_settings.payment_proof_retention_days is
  'How long a transfer receipt is kept after the delivery ends. Longer than the ID because it answers a financial question, not an identity one.';

alter table deliveries
  add column if not exists payment_proof_purged_at timestamptz;

-- ── WHAT WAS ACTUALLY SENT ────────────────────────────────────────────────
-- M155 added payment_method, payment_reference, payment_proof_path,
-- payment_proof_at, payment_verified_at and payment_verified_by — and NO
-- AMOUNT. So a customer sent an unspecified sum, uploaded a picture of it, and
-- the driver was released. There was no figure anywhere in the system to
-- compare the receipt against, and no screen on which to compare it.
alter table deliveries
  add column if not exists payment_amount integer
    check (payment_amount is null or payment_amount >= 0);

comment on column public.deliveries.payment_amount is
  'What the customer says they transferred, in minor units. Their claim, not a verified figure — but a figure, which is more than the receipt had before.';

create or replace function public.expired_payment_proofs(p_limit integer default 200)
returns table(delivery_id uuid, storage_path text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select d.id, d.payment_proof_path
    from deliveries d, delivery_settings s
   where s.id = 'main'
     and d.payment_proof_path is not null
     and d.payment_proof_purged_at is null
     and d.status in ('delivered','cancelled','failed_delivery','returned_to_merchant')
     and coalesce(d.delivered_at, d.updated_at)
         < now() - make_interval(days => s.payment_proof_retention_days)
   order by coalesce(d.delivered_at, d.updated_at)
   limit greatest(coalesce(p_limit, 200), 1);
$fn$;

create or replace function public.forget_payment_proof(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  update deliveries
     set payment_proof_path = null,
         payment_proof_purged_at = now()
   where id = p_delivery_id and payment_proof_path is not null;
  -- False rather than an error on a second call: the purge job retries, and a
  -- retry finding the work already done is not a failure.
  if not found then return false; end if;
  perform log_delivery_event(
    p_delivery_id, 'system', null, 'delivery.payment_proof_purged',
    null, null, null, '{}'::jsonb
  );
  return true;
end;
$fn$;

-- Neither is a client action: the purge runs as the service role from the cron.
revoke all on function public.expired_payment_proofs(integer) from public, anon, authenticated;
revoke all on function public.forget_payment_proof(uuid) from public, anon, authenticated;
grant execute on function public.expired_payment_proofs(integer) to service_role;
grant execute on function public.forget_payment_proof(uuid) to service_role;
