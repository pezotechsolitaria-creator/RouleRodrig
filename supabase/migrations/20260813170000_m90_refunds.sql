-- ── M90 — refunds ─────────────────────────────────────────────────────────
--
-- Deferred twice, and M89 is what made it urgent: every order is now prepaid,
-- so every cancellation is money the customer has already sent and somebody has
-- to send back. Until now the platform's entire refund handling was one sentence
-- on the cook's screen — "this customer had already paid, Roulé Rodrigues must
-- return their money" — after which nothing existed. No record, no amount, no
-- proof, no way for the customer to see it coming, no way for the owner to know
-- how many were outstanding.
--
-- THE SHAPE IS DECIDED BY WHO HOLDS THE MONEY, WHICH IS NOT US. Customers
-- transfer directly into the merchant's own account (marketplace rule #4), so
-- the platform CANNOT issue a refund. It records that one is owed, tells
-- everybody, collects proof it was sent, and lets the customer confirm it
-- landed. A refund here is an OBLIGATION, not a transaction — which makes it
-- the exact mirror of the payment flow, and it is built that way on purpose:
--
--     pay     customer sends → uploads proof → MERCHANT confirms received
--     refund  merchant sends → uploads proof → CUSTOMER confirms received
--
-- A SEPARATE TABLE, NOT NEGATIVE `payments` ROWS. Negative rows net out nicely
-- in a SUM and then break everything that reads `payments[0]` or assumes an
-- amount is a charge — PaymentConfirmCard does exactly that. The ledger keeps
-- one rule instead, in one function: net = captured − refunded.
--
-- AUTO-CREATED, WHICH IS THE POINT. The trigger opens a refund the moment a
-- PAID order is cancelled. A refund that waits for someone to remember to
-- record it is the refund that never gets paid, and the person who would have
-- to remember is a cook in the middle of service.
--
-- Verified as the real roles, not from the migration succeeding (M88's lesson):
-- cancel → auto-opened 'owed' at the captured amount; customer set a
-- destination; merchant marked it sent with proof; customer confirmed received;
-- order_net_paid went 171000 → 0 and outstanding_refund_count() → 0. A true
-- stranger sees 0 rows through both accessors, and `authenticated` selecting
-- the table directly is refused outright — there is no table grant.

create type public.refund_status as enum ('owed', 'sent', 'received', 'waived');

create table public.refunds (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  amount        integer not null check (amount > 0),
  currency      char(3) not null,
  status        public.refund_status not null default 'owed',
  reason        text,
  opened_by     text not null default 'system'
                  check (opened_by in ('system','merchant','admin','customer')),
  -- WHERE the money goes: the customer's own account, snapshotted onto the
  -- refund so a later edit cannot rewrite where an already-sent refund went.
  -- No table grant exists, so these are only reachable through the accessors —
  -- the shape M8 uses for store bank details, for the same reason.
  dest_bank_name      text,
  dest_account_holder text,
  dest_account_number text,
  proof_path    text,
  sent_at       timestamptz,
  received_at   timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index refunds_order_idx on public.refunds (order_id);
create index refunds_open_idx on public.refunds (status) where status in ('owed','sent');

-- At most ONE automatic refund per order, so a status that flickers
-- cancelled → … → cancelled cannot open a second obligation for the same money.
create unique index refunds_one_auto_per_order
  on public.refunds (order_id) where opened_by = 'system';

create trigger t_refunds_updated
  before update on public.refunds
  for each row execute function public.set_updated_at();

alter table public.refunds enable row level security;
revoke all on public.refunds from anon, authenticated;

-- ── One definition of what has actually been paid ─────────────────────────
create or replace function public.order_net_paid(p_order_id uuid)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select coalesce((select sum(p.amount) from payments p
                    where p.order_id = p_order_id and p.status = 'captured'), 0)
       - coalesce((select sum(r.amount) from refunds r
                    where r.order_id = p_order_id and r.status in ('sent','received')), 0);
$function$;

-- ── A cancelled PAID order owes money back ────────────────────────────────
create or replace function public.open_refund_on_cancel()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare v_captured integer; v_already integer;
begin
  if new.status not in ('cancelled') or old.status = new.status then
    return new;
  end if;

  select coalesce(sum(p.amount), 0) into v_captured
    from payments p where p.order_id = new.id and p.status = 'captured';
  if v_captured <= 0 then
    return new;  -- nothing was ever paid, so nothing is owed back
  end if;

  select coalesce(sum(r.amount), 0) into v_already
    from refunds r where r.order_id = new.id and r.status <> 'waived';
  if v_already >= v_captured then
    return new;
  end if;

  insert into refunds (order_id, amount, currency, reason, opened_by)
  values (new.id, v_captured - v_already, new.currency,
          'Order cancelled after it had been paid', 'system')
  on conflict do nothing;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'customer', new.customer_id, new.id, 'order_status_changed',
         'Refund due for ' || new.order_number,
         'This order was cancelled after payment. The shop has been asked to return your money — you can follow it on your order page.',
         jsonb_build_object('refund_amount', v_captured - v_already)
  where new.customer_id is not null;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'merchant', ms.user_id, new.id, 'order_status_changed',
         'Refund owed on ' || new.order_number,
         'This order was cancelled after the customer had paid. Please return their money and mark it sent.',
         jsonb_build_object('refund_amount', v_captured - v_already)
  from stores s join merchant_staff ms on ms.merchant_id = s.merchant_id
  where s.id = new.store_id;

  return new;
end;
$function$;

create trigger t_orders_open_refund
  after update of status on public.orders
  for each row execute function public.open_refund_on_cancel();

-- ── M90b — the accessors ──────────────────────────────────────────────────
--
-- `refunds` has no table grant, so this is the whole reachable surface. Two
-- identities, because guests are the DEFAULT checkout path here: a signed-in
-- customer proves it with auth.uid(), a guest with order number + email through
-- a privileged route, exactly as guest_report_payment and lookup_order do.
--
-- is_store_staff() covers merchant staff and kitchen OWNERS but not cooks —
-- money is the owner's business, the same line M81 drew for the dashboard.

create or replace function public.store_refunds(p_store_id uuid)
returns table(
  id uuid, order_id uuid, order_number text, customer_name text,
  amount integer, currency text, status text, reason text,
  dest_bank_name text, dest_account_holder text, dest_account_number text,
  proof_path text, sent_at timestamptz, received_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  select r.id, r.order_id, o.order_number, o.customer_name,
         r.amount, r.currency::text, r.status::text, r.reason,
         r.dest_bank_name, r.dest_account_holder, r.dest_account_number,
         r.proof_path, r.sent_at, r.received_at, r.created_at
    from refunds r join orders o on o.id = r.order_id
   where o.store_id = p_store_id
     and (is_store_staff(p_store_id) or is_platform_admin())
   order by (r.status = 'owed') desc, r.created_at desc;
$function$;

create or replace function public.refund_mark_sent(
  p_refund_id uuid, p_proof_path text default null, p_note text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_store uuid; v_status refund_status; v_order uuid; v_num text; v_cust uuid; v_amt integer;
begin
  select o.store_id, r.status, r.order_id, o.order_number, o.customer_id, r.amount
    into v_store, v_status, v_order, v_num, v_cust, v_amt
    from refunds r join orders o on o.id = r.order_id
   where r.id = p_refund_id;

  if v_store is null or not (is_store_staff(v_store) or is_platform_admin()) then
    raise exception using errcode='RR003', message='Refund not found.';
  end if;
  if v_status <> 'owed' then
    raise exception using errcode='RR004', message='That refund has already been sent.';
  end if;

  update refunds
     set status = 'sent', sent_at = now(),
         proof_path = coalesce(nullif(btrim(p_proof_path), ''), proof_path),
         note = coalesce(nullif(btrim(p_note), ''), note)
   where id = p_refund_id;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'customer', v_cust, v_order, 'order_status_changed',
         'Your refund for ' || v_num || ' has been sent',
         'The shop has returned your money. Tell us once it reaches your account.',
         jsonb_build_object('refund_amount', v_amt)
  where v_cust is not null;
end;
$function$;

create or replace function public.order_refunds(p_order_id uuid)
returns table(
  id uuid, amount integer, currency text, status text, reason text,
  has_destination boolean, sent_at timestamptz, received_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  select r.id, r.amount, r.currency::text, r.status::text, r.reason,
         (r.dest_account_number is not null) as has_destination,
         r.sent_at, r.received_at, r.created_at
    from refunds r join orders o on o.id = r.order_id
   where r.order_id = p_order_id
     and (o.customer_id = auth.uid() or is_store_staff(o.store_id) or is_platform_admin())
   order by r.created_at desc;
$function$;

create or replace function public.refund_set_destination(
  p_refund_id uuid, p_bank_name text, p_account_holder text, p_account_number text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_ok boolean; v_status refund_status;
begin
  select (o.customer_id = auth.uid()), r.status into v_ok, v_status
    from refunds r join orders o on o.id = r.order_id where r.id = p_refund_id;
  if not coalesce(v_ok, false) then
    raise exception using errcode='RR003', message='Refund not found.';
  end if;
  if v_status <> 'owed' then
    raise exception using errcode='RR004',
      message='This refund has already been sent, so its destination cannot change.';
  end if;
  if coalesce(btrim(p_account_number), '') = '' or coalesce(btrim(p_account_holder), '') = '' then
    raise exception using errcode='RR005', message='An account holder and account number are required.';
  end if;

  update refunds
     set dest_bank_name = nullif(btrim(p_bank_name), ''),
         dest_account_holder = btrim(p_account_holder),
         dest_account_number = btrim(p_account_number)
   where id = p_refund_id;
end;
$function$;

create or replace function public.refund_confirm_received(p_refund_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_ok boolean; v_status refund_status;
begin
  select (o.customer_id = auth.uid()), r.status into v_ok, v_status
    from refunds r join orders o on o.id = r.order_id where r.id = p_refund_id;
  if not coalesce(v_ok, false) then
    raise exception using errcode='RR003', message='Refund not found.';
  end if;
  if v_status <> 'sent' then
    raise exception using errcode='RR004', message='That refund has not been sent yet.';
  end if;
  update refunds set status = 'received', received_at = now() where id = p_refund_id;
end;
$function$;

-- The guest. service_role only, called from a route that already parsed the
-- input. The email check is INSIDE the function so the credential and the data
-- cannot drift apart, and a wrong email is indistinguishable from a wrong order
-- number — the rule lookup_order follows, so this cannot confirm an order exists.
create or replace function public.guest_refunds(p_order_number text, p_email text)
returns table(
  id uuid, order_id uuid, amount integer, currency text, status text, reason text,
  has_destination boolean, sent_at timestamptz, received_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  select r.id, r.order_id, r.amount, r.currency::text, r.status::text, r.reason,
         (r.dest_account_number is not null), r.sent_at, r.received_at
    from refunds r join orders o on o.id = r.order_id
   where upper(btrim(o.order_number)) = upper(btrim(coalesce(p_order_number, '')))
     and lower(btrim(o.customer_email)) = lower(btrim(coalesce(p_email, '')))
   order by r.created_at desc;
$function$;

create or replace function public.guest_refund_action(
  p_order_number text, p_email text, p_refund_id uuid,
  p_bank_name text default null, p_account_holder text default null,
  p_account_number text default null, p_confirm boolean default false)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_status refund_status;
begin
  select r.status into v_status
    from refunds r join orders o on o.id = r.order_id
   where r.id = p_refund_id
     and upper(btrim(o.order_number)) = upper(btrim(coalesce(p_order_number, '')))
     and lower(btrim(o.customer_email)) = lower(btrim(coalesce(p_email, '')));
  if v_status is null then
    raise exception using errcode='RR003', message='Refund not found.';
  end if;

  if p_confirm then
    if v_status <> 'sent' then
      raise exception using errcode='RR004', message='That refund has not been sent yet.';
    end if;
    update refunds set status = 'received', received_at = now() where id = p_refund_id;
    return;
  end if;

  if v_status <> 'owed' then
    raise exception using errcode='RR004',
      message='This refund has already been sent, so its destination cannot change.';
  end if;
  if coalesce(btrim(p_account_number), '') = '' or coalesce(btrim(p_account_holder), '') = '' then
    raise exception using errcode='RR005', message='An account holder and account number are required.';
  end if;
  update refunds
     set dest_bank_name = nullif(btrim(p_bank_name), ''),
         dest_account_holder = btrim(p_account_holder),
         dest_account_number = btrim(p_account_number)
   where id = p_refund_id;
end;
$function$;

create or replace function public.outstanding_refund_count()
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int from refunds where status = 'owed';
$function$;

-- The guest and admin functions are service_role ONLY: they take the credential
-- as an argument, so anon EXECUTE would make the email check the only thing
-- between the public and every refund destination on the platform.
-- `revoke from public` is the boundary, not the body (M28/M84).
revoke all on function public.store_refunds(uuid) from public;
revoke all on function public.refund_mark_sent(uuid, text, text) from public;
revoke all on function public.order_refunds(uuid) from public;
revoke all on function public.refund_set_destination(uuid, text, text, text) from public;
revoke all on function public.refund_confirm_received(uuid) from public;
revoke all on function public.guest_refunds(text, text) from public;
revoke all on function public.guest_refund_action(text, text, uuid, text, text, text, boolean) from public;
revoke all on function public.outstanding_refund_count() from public;
revoke all on function public.order_net_paid(uuid) from public;

grant execute on function public.store_refunds(uuid) to authenticated, service_role;
grant execute on function public.refund_mark_sent(uuid, text, text) to authenticated, service_role;
grant execute on function public.order_refunds(uuid) to authenticated, service_role;
grant execute on function public.refund_set_destination(uuid, text, text, text) to authenticated;
grant execute on function public.refund_confirm_received(uuid) to authenticated;
grant execute on function public.order_net_paid(uuid) to authenticated, service_role;
grant execute on function public.guest_refunds(text, text) to service_role;
grant execute on function public.guest_refund_action(text, text, uuid, text, text, text, boolean) to service_role;
grant execute on function public.outstanding_refund_count() to service_role;
