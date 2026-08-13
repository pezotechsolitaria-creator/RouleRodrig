-- ── M93 — a refund nobody sent ────────────────────────────────────────────
--
-- M90 records the obligation and shows it on three screens. What it does not do
-- is NAG. A merchant who never opens /merchant, or who quietly decides the
-- customer will forget, was unopposed: the row sat at 'owed' forever and the
-- only person who noticed was the customer who never got their money.
--
-- Roulé Rodrigues cannot send it — the money went straight to the shop and was
-- never ours to move. Attention, applied repeatedly, is the only lever there is.
--
-- CHASED, NOT SPAMMED. `last_chased_at` means the first nudge lands 48h after
-- the refund opens and then at most once every 48h. A daily email about the
-- same debt is one people filter; a reminder every other day that keeps
-- arriving is one they act on.
--
-- M93b FOLDED IN: the first version wrote an admin notification with a NULL
-- recipient_id, which is NOT NULL — and it only failed on the SECOND chase, so
-- a single-pass test would have gone green. The platform owner is not a
-- `notifications` recipient at all; owner alerts go out by email and WhatsApp
-- from the cron. So this returns WHAT to escalate and the caller sends it,
-- which keeps email out of the database.
--
-- Verified: first chase 1, immediate re-run 0 (no spam), after 48h the second
-- chase escalates with order number, shop, customer and amount.
alter table public.refunds
  add column if not exists last_chased_at timestamptz,
  add column if not exists chase_count integer not null default 0;

create or replace function public.chase_stale_refunds(p_hours integer default 48)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_r record; v_n integer := 0; v_escalated jsonb := '[]'::jsonb;
begin
  for v_r in
    select r.id, r.amount, r.currency, r.chase_count, o.id as order_id,
           o.order_number, o.store_id, o.customer_name, s.name as store_name
      from refunds r
      join orders o on o.id = r.order_id
      join stores s on s.id = o.store_id
     where r.status = 'owed'
       and r.created_at < now() - make_interval(hours => greatest(1, coalesce(p_hours, 48)))
       and (r.last_chased_at is null
            or r.last_chased_at < now() - make_interval(hours => greatest(1, coalesce(p_hours, 48))))
     order by r.created_at
     limit 200
  loop
    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)
    select 'merchant', ms.user_id, v_r.order_id, 'order_status_changed',
           'Still owed: refund for ' || v_r.order_number,
           'A customer has been waiting since this order was cancelled. Please return their money and mark it sent.',
           jsonb_build_object('refund_amount', v_r.amount, 'chase', v_r.chase_count + 1)
      from stores s2 join merchant_staff ms on ms.merchant_id = s2.merchant_id
     where s2.id = v_r.store_id;

    -- From the second chase this has stopped being forgetfulness.
    if v_r.chase_count >= 1 then
      v_escalated := v_escalated || jsonb_build_object(
        'orderNumber', v_r.order_number, 'store', v_r.store_name,
        'customer', v_r.customer_name, 'amount', v_r.amount,
        'currency', v_r.currency, 'chase', v_r.chase_count + 1);
    end if;

    update refunds set last_chased_at = now(), chase_count = chase_count + 1 where id = v_r.id;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('chased', v_n, 'escalated', v_escalated);
end;
$function$;

-- "Money owed by somebody who has been asked twice" — a different, worse thing
-- than outstanding_refund_count(), so it gets its own Command Center line.
create or replace function public.ignored_refund_count(p_hours integer default 96)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int from refunds
   where status = 'owed'
     and created_at < now() - make_interval(hours => greatest(1, coalesce(p_hours, 96)));
$function$;

revoke all on function public.chase_stale_refunds(integer) from public;
revoke all on function public.ignored_refund_count(integer) from public;
grant execute on function public.chase_stale_refunds(integer) to service_role;
grant execute on function public.ignored_refund_count(integer) to service_role;
