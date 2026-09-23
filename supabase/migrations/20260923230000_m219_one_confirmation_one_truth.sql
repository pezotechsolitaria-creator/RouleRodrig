-- ── M219 · ONE CONFIRMATION, AND IT IS TRUE ───────────────────────────────
--
-- M217's admin_accept_order() wrote its own in-app notice: "Confirmed for
-- <day>. Nothing has been charged — you pay the kitchen at handover." The
-- review of that change (24 Sept 2026) found two things wrong with it:
--   · it is false for a Roulé delivery (the customer pays when the food
--     reaches them, not "the kitchen") and for a bank transfer already sent
--     ("Confirmed with cook" is offered at awaiting_payment_confirmation too);
--   · /api/admin/food/orders then calls notifyOrderCustomer(…, 'accepted'),
--     whose registry entry already writes an in-app row — slot-aware and
--     worded per fulfilment — so a signed-in customer got TWO notices, in
--     different words, for one confirmation.
--
-- So the RPC records the confirmation and nothing else. The engine's
-- order.accepted, sent by the route, is the one notice. The body is otherwise
-- M217's, unchanged: same signature (CREATE OR REPLACE, no second overload),
-- same guard, same idempotency, still no payment touched.

begin;

create or replace function public.admin_accept_order(p_order_id uuid)
returns table(order_id uuid, accepted_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_order record;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR004', message = 'Not authorized.';
  end if;

  select o.id, o.status::text as status, o.accepted_at
    into v_order
    from orders o where o.id = p_order_id
   for update;

  if v_order.id is null then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  if v_order.status not in ('pending_payment', 'awaiting_payment_confirmation') then
    raise exception using errcode = 'RR004', message = 'This order can no longer be confirmed.';
  end if;

  -- Idempotent: a double tap returns the first confirmation.
  if v_order.accepted_at is not null then
    return query select v_order.id, v_order.accepted_at;
    return;
  end if;

  -- accepted_at is what stops expire_order()'s sweep; the hold is cleared as
  -- accept_order() clears it. The customer is told by the route (M219).
  update orders o set accepted_at = now(), auto_release_at = null where o.id = p_order_id;

  return query select o.id, o.accepted_at from orders o where o.id = p_order_id;
end;
$fn$;

revoke all on function public.admin_accept_order(uuid) from public, anon, authenticated;
grant execute on function public.admin_accept_order(uuid) to service_role;

do $assert$
declare v_def text := lower(pg_get_functiondef('public.admin_accept_order(uuid)'::regprocedure));
begin
  if position('insert into notifications' in v_def) > 0 then
    raise exception 'M219: admin_accept_order still writes its own notice';
  end if;
  if position('payments' in v_def) > 0 then
    raise exception 'M219: admin_accept_order touches payments';
  end if;
  if (select count(*) from pg_proc where proname = 'admin_accept_order') <> 1 then
    raise exception 'M219: a second overload appeared';
  end if;
  if has_function_privilege('anon', 'public.admin_accept_order(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_accept_order(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.admin_accept_order(uuid)', 'execute') then
    raise exception 'M219: grants are wrong';
  end if;
end
$assert$;

commit;
