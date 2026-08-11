-- M49b — make the events payment path actually reachable.
--
-- Three separate things blocked a ticket buyer, each individually fatal:
--
--   1. A GUEST COULD NOT ATTACH PROOF. guest_report_payment() takes no receipt
--      path, and refuses outright when the store sets require_receipt:
--        'This shop needs a photo of your transfer receipt. Please sign in…'
--      Events are guest-first by design, so that instruction is a dead end —
--      the whole point of M20/M21 was that a ticket buyer never has to make an
--      account. The account-holder path (submit_payment_receipt) can't help: it
--      opens by requiring auth.uid().
--
--   2. NOBODY WAS TOLD. The notification goes to merchant_staff joined through
--      stores.merchant_id, which for an event resolves to M40's shared
--      system-owned merchant rather than the people running the event.
--
--   3. NOBODY COULD CONFIRM IT. confirm_order_payment() gates on
--      is_store_staff(), and an organiser is deliberately not staff (M43).
--      can_verify_event_payments() has existed since M43 and nothing has ever
--      called it — the permission was modelled but never wired up.
--
-- So an event could take an order, and the money could arrive, and there was no
-- way for anyone to move that order to 'paid' — which is what issues the ticket
-- (trigger orders_sync_tickets → sync_tickets_lifecycle).
--
-- WHY THE RECEIPT PATH IS STILL CHECKED HERE. The route derives the path from
-- the order id it resolved server-side, so a client cannot choose it. This
-- re-check is defence in depth against a future caller that is less careful:
-- the path must live under this order's own folder, which is the same rule
-- submit_payment_receipt() enforces for account holders.

-- The 2-arg signature must go, not gain a default: keeping both makes a 2-arg
-- call ambiguous and Postgres would refuse it at runtime.
drop function if exists public.guest_report_payment(text, text);

create or replace function public.guest_report_payment(
  p_order_number text,
  p_email        text,
  p_receipt_path text default null
) returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_num       text;
  v_email     text;
  v_path      text;
  v_order     record;
  v_is_event  boolean;
  v_required  boolean;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  v_path  := nullif(btrim(coalesce(p_receipt_path, '')), '');
  if length(v_num) < 6 or v_email = '' then
    raise exception using errcode='RR003', message='Order not found.';
  end if;

  select o.id, o.status, o.store_id, o.order_number
    into v_order
  from orders o
  where o.order_number = v_num
    and lower(o.customer_email) = v_email
    and o.customer_id is null
  for update;

  if v_order.id is null then
    raise exception using errcode='RR003', message='Order not found.';
  end if;

  -- A path may only ever point inside this order's own folder.
  if v_path is not null and v_path !~ ('^' || v_order.id::text || '/') then
    raise exception using errcode='RR005', message='That receipt does not belong to this order.';
  end if;

  if exists (select 1 from payments pm where pm.order_id = v_order.id and pm.provider = 'cash') then
    raise exception using errcode='RR009',
      message='Cash orders are paid in person — there is nothing to report here.';
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception using errcode='RR004', message='This order is no longer awaiting payment.';
  end if;

  select coalesce(require_receipt, false) into v_required
    from store_payment_settings where store_id = v_order.store_id;

  -- The refusal now depends on whether proof was actually supplied, not on
  -- whether the buyer happens to have an account.
  if coalesce(v_required, false) and v_path is null then
    raise exception using errcode='RR005',
      message='Please attach a photo or PDF of your transfer so it can be checked.';
  end if;

  update orders set
    status               = 'awaiting_payment_confirmation',
    receipt_submitted_at = now(),
    payment_receipt_path = coalesce(v_path, payment_receipt_path),
    auto_release_at      = null
  where id = v_order.id;

  select exists (select 1 from events e where e.store_id = v_order.store_id) into v_is_event;

  if v_is_event then
    -- The people who actually run this event, read live from their assignment.
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    select 'organizer', o.user_id, v_order.id, 'order_status_changed',
           'Payment reported for ' || v_order.order_number,
           'The buyer says they have paid. Check the transfer, then confirm to issue the ticket.',
           jsonb_build_object('new_status', 'awaiting_payment_confirmation',
                              'hasReceipt', v_path is not null)
      from event_organizer_assignments a
      join event_organizers o on o.id = a.organizer_id
     where a.store_id = v_order.store_id
       and o.status = 'active'
       and a.can_verify_payments;
  else
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    select 'merchant', ms.user_id, v_order.id, 'order_status_changed',
           'Payment reported for ' || v_order.order_number,
           'The customer says they have paid. Please check your account and confirm.',
           jsonb_build_object('new_status', 'awaiting_payment_confirmation')
    from merchant_staff ms
    join stores s on s.merchant_id = ms.merchant_id
    where s.id = v_order.store_id;
  end if;

  return jsonb_build_object(
    'orderId', v_order.id,
    'status', 'awaiting_payment_confirmation',
    'hasReceipt', v_path is not null);
end;
$function$;

revoke all on function public.guest_report_payment(text, text, text) from public, anon, authenticated;
grant execute on function public.guest_report_payment(text, text, text) to service_role;

-- ── An organiser may confirm payment for their own event ────────────────────
create or replace function public.confirm_order_payment(p_order_id uuid)
returns table(order_id uuid, status text)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_store_id     uuid;
  v_status       order_status;
  v_customer_id  uuid;
  v_order_number text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select o.store_id, o.status, o.customer_id, o.order_number
    into v_store_id, v_status, v_customer_id, v_order_number
  from orders o where o.id = p_order_id
  for update;

  -- can_verify_event_payments() is event-scoped and reads organiser status
  -- live, so a suspended organiser loses this the moment they are suspended.
  -- Ordinary shops are unaffected: for a non-event store it is simply false.
  if v_store_id is null or not (is_store_staff(v_store_id) or can_verify_event_payments(v_store_id)) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  if v_status not in ('pending_payment', 'awaiting_payment_confirmation') then
    raise exception using errcode = 'RR004',
      message = format('Cannot confirm payment on an order that is "%s".', v_status);
  end if;

  update payments set status = 'captured', updated_at = now() where payments.order_id = p_order_id;
  -- Moving to 'paid' is what issues the ticket, via orders_sync_tickets.
  update orders set status = 'paid', auto_release_at = null where id = p_order_id;

  if v_customer_id is not null then
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    values ('customer', v_customer_id, p_order_id, 'order_status_changed',
      'Order ' || coalesce(v_order_number, '') || ' confirmed',
      'The shop confirmed your payment — your order is being prepared.',
      jsonb_build_object('new_status', 'paid'));
  end if;

  return query select p_order_id, 'paid'::text;
end;
$function$;

-- ── An organiser must be able to SEE the proof they are asked to judge ──────
-- The existing read policy allows the owning customer, store staff and platform
-- admins. An organiser is none of those, so the receipt they are meant to check
-- was unreadable to them. Additive: the original policy is untouched.
drop policy if exists order_receipts_organizer_read on storage.objects;
create policy order_receipts_organizer_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-receipts'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and exists (
      select 1 from orders o
       where o.id = (split_part(objects.name, '/', 1))::uuid
         and can_verify_event_payments(o.store_id))
  );

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='confirm_order_payment';
  if position('can_verify_event_payments' in v_src) = 0 then
    raise exception 'M49b: confirm_order_payment did not gain the organiser gate'; end if;
  if position('is_store_staff' in v_src) = 0 then
    raise exception 'M49b: confirm_order_payment LOST the merchant gate'; end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='guest_report_payment';
  if position('payment_receipt_path' in v_src) = 0 then
    raise exception 'M49b: guest_report_payment still cannot record proof'; end if;
  if position('''organizer''' in v_src) = 0 then
    raise exception 'M49b: guest_report_payment still notifies nobody for events'; end if;

  -- Exactly one signature must remain, or callers get an ambiguity error.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='guest_report_payment') <> 1 then
    raise exception 'M49b: guest_report_payment is overloaded — a 2-arg call would be ambiguous'; end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='order_receipts_read') then
    raise exception 'M49b: the original receipt read policy was removed'; end if;
end;
$$;
