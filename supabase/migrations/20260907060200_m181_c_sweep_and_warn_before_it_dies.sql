-- ── M181c · THE SWEEP, AND THE NUDGE THAT MAKES IT RARELY NEEDED ──────────
--
-- Applied to production 2026-09-07 (recorded there as m180_c).
--
-- Cancelling silently is the lazy half of this feature. The customer still
-- goes hungry and the kitchen learns that the platform quietly bins their
-- work — which is how a merchant stops trusting a screen.
--
-- So the sweep does two things in one pass:
--
--   WARN  — the collection window has STARTED, nobody has accepted, and the
--           order is still savable. One notification, once, to the kitchen.
--   KILL  — the window ended more than the grace ago. Now it is not savable,
--           and expire_order() cancels and restocks it.
--
-- The warning is deduped by looking for its own notification rather than by a
-- new column: one row is cheaper than a migration on the hot table, and the
-- notification IS the record that the nudge happened.
--
-- CALLED FROM THE EVERY-MINUTE CRON (app/api/cron/notifications), not the
-- daily one. That placement is half the fix: a 15:00 lunch must be gone at
-- 15:30, not at 06:00 tomorrow.

create or replace function public.sweep_expired_orders()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_grace    interval;
  v_warned   integer := 0;
  v_expired  integer := 0;
  v_id       uuid;
begin
  select make_interval(mins => coalesce(pickup_grace_minutes, 30))
    into v_grace from marketplace_settings limit 1;
  v_grace := coalesce(v_grace, interval '30 minutes');

  -- ── 1. Nudge, while there is still something to save ────────────────────
  for v_id in
    select o.id
    from orders o
    where o.status = 'pending_payment'
      and o.accepted_at is null
      and o.pickup_slot is not null
      and not upper_inf(o.pickup_slot)
      and lower(o.pickup_slot) <= now()              -- the window has opened
      and upper(o.pickup_slot) + v_grace > now()     -- and has not lapsed yet
      and not exists (
        select 1 from notifications n
        where n.order_id = o.id and n.type = 'order_collection_due'
      )
    limit 100
  loop
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    select 'merchant', ms.user_id, o.id, 'order_collection_due',
           'Collection time for '||o.order_number,
           'This order has not been accepted and its collection time has arrived. Accept it now, or it will be cancelled shortly and the customer told to order again.',
           jsonb_build_object('order_number', o.order_number)
    from orders o
    join stores s on s.id = o.store_id
    join merchant_staff ms on ms.merchant_id = s.merchant_id
    where o.id = v_id;
    v_warned := v_warned + 1;
  end loop;

  -- ── 2. Expire what is past saving ───────────────────────────────────────
  -- expire_order() re-checks every condition itself and returns false if the
  -- row moved underneath us, so a race with a kitchen accepting right now
  -- resolves in the kitchen's favour.
  for v_id in
    select o.id
    from orders o
    where o.status = 'pending_payment'
      and o.accepted_at is null
      and (
        (o.auto_release_at is not null
           and o.auto_release_at < now()
           and (o.pickup_slot is null or lower(o.pickup_slot) < now()))
        or
        (o.pickup_slot is not null
           and not upper_inf(o.pickup_slot)
           and upper(o.pickup_slot) + v_grace < now())
      )
    limit 200
  loop
    if public.expire_order(v_id) then
      v_expired := v_expired + 1;
    end if;
  end loop;

  return jsonb_build_object('warned', v_warned, 'expired', v_expired);
end $function$;

comment on function public.sweep_expired_orders() is
  'One pass: warns a kitchen whose collection time has arrived on an unaccepted order, then expires the ones past grace (M181). Safe to call every minute.';

revoke all on function public.sweep_expired_orders() from public;
revoke all on function public.sweep_expired_orders() from anon;
revoke all on function public.sweep_expired_orders() from authenticated;
grant execute on function public.sweep_expired_orders() to service_role;

do $$
begin
  if has_function_privilege('anon','public.sweep_expired_orders()','EXECUTE') then
    raise exception 'M181c: anon can sweep orders';
  end if;
end $$;
