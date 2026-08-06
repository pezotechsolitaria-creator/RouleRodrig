-- M14 — Separate ACCEPTANCE from PAYMENT.
--
-- THE PROBLEM M13 LEFT BEHIND
-- After M13 a cash order still had exactly one way to escape the reservation
-- fuse: the merchant moving it to 'paid'. But 'paid' captures the payment
-- (M9 made update_order_status capture in the same statement), so the only way
-- to save a cash order was for the merchant to record money they had not yet
-- received — payment on a cash order happens at handover, later.
--
-- WHY THAT MATTERS BEYOND TIDINESS
-- The platform never touches funds. The payments row is therefore the ONLY
-- evidence that money changed hands, and it is the record both sides would rely
-- on in a dispute. Forcing a merchant to attest payment in order to keep an
-- order destroys that evidence in both directions: a customer who never paid
-- has an order marked 'paid', and a merchant who genuinely was paid cannot
-- distinguish those orders from the ones they rubber-stamped to stop the clock.
-- On an island marketplace where buyer and seller meet in person, that record is
-- the whole dispute-resolution story.
--
-- PRECEDENT
-- Acceptance and payment are orthogonal everywhere this problem has been solved:
-- Uber Eats / Deliveroo / DoorDash have the merchant ACCEPT an order with
-- payment state tracked separately; Shopify's cash-on-delivery creates the order
-- "payment pending" and marks it paid at delivery; Amazon COD confirms, ships,
-- then collects. None of them conflate the two.
--
-- THE DESIGN
-- accepted_at is orthogonal metadata, exactly like auto_release_at — NOT a new
-- order status. This is deliberate and is the same reasoning that rejected a
-- 'pending_cash_confirmation' status in M13: a new enum member would force every
-- status switch, badge map, timeline index, filter, RLS policy and E2E spec to
-- learn about it, for information the system already has.
--
-- The payoff is that the fuse now means ONE thing for both providers:
-- "nobody has accepted this order". Bank transfer additionally lets the customer
-- clear it by paying; cash waits on the merchant, which is why M13 gives cash
-- the longer window.

alter table orders add column if not exists accepted_at timestamptz;

comment on column orders.accepted_at is
  'When the merchant committed to fulfilling this order. Deliberately SEPARATE from payment: the platform never touches funds, so the payments row is the only evidence money changed hands, and forcing a merchant to attest payment in order to save an order would destroy that evidence. Clearing auto_release_at is acceptance''s job, not payment''s (M14).';

create or replace function public.accept_order(p_order_id uuid)
returns table(order_id uuid, accepted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
begin
  select o.id, o.status::text as status, o.store_id, o.customer_id, o.order_number, o.accepted_at
    into v_order
  from orders o where o.id = p_order_id
  for update;

  -- Same message for "no such order" and "not your order" so a merchant cannot
  -- probe for order ids belonging to another shop.
  if v_order.id is null or not is_store_staff(v_order.store_id) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  if v_order.status not in ('pending_payment', 'awaiting_payment_confirmation') then
    raise exception using errcode = 'RR004', message = 'This order can no longer be accepted.';
  end if;

  -- Idempotent: a double-tap or a retried request returns the original
  -- acceptance rather than moving the timestamp or re-notifying the customer.
  if v_order.accepted_at is not null then
    return query select v_order.id, v_order.accepted_at;
    return;
  end if;

  update orders set accepted_at = now(), auto_release_at = null where id = p_order_id;

  insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
  select 'customer', o.customer_id, o.id, 'order_status_changed',
         'Order ' || o.order_number || ' confirmed',
         'The shop has confirmed your order and is holding your items. Nothing has been charged — you pay the shop at handover.',
         jsonb_build_object('accepted', true)
  from orders o where o.id = p_order_id and o.customer_id is not null;

  return query select o.id, o.accepted_at from orders o where o.id = p_order_id;
end;
$$;

revoke all on function public.accept_order(uuid) from public, anon;
grant execute on function public.accept_order(uuid) to authenticated, service_role;

comment on function public.accept_order(uuid) is
  'Merchant commits to fulfilling an order. Clears the reservation fuse WITHOUT claiming payment was received. Idempotent. Ownership re-verified via is_store_staff() independently of RLS (M14).';

-- The sweep must not release stock the merchant has already committed to.
do $$
declare
  v_src text;
  v_old constant text := 'where o.status=''pending_payment'' and o.auto_release_at is not null';
  v_new constant text := 'where o.status=''pending_payment'' and o.accepted_at is null and o.auto_release_at is not null';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_order';

  if v_src is null then
    raise exception 'M14: create_order not found';
  end if;
  if position(v_old in v_src) = 0 then
    raise exception 'M14: expected sweep predicate not found in create_order';
  end if;

  execute replace(v_src, v_old, v_new);
end;
$$;

do $$
declare v_co text;
begin
  select pg_get_functiondef(p.oid) into v_co from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='create_order';
  if position('o.accepted_at is null' in v_co) = 0 then
    raise exception 'M14 verify: sweep still ignores acceptance';
  end if;
  -- Guard against a future migration replaying an older create_order body and
  -- silently reverting M13 while this one appears to succeed.
  if position('order_hold_hours(p_provider)' in v_co) = 0 then
    raise exception 'M14 verify: M13 provider-aware window was lost';
  end if;
end;
$$;
