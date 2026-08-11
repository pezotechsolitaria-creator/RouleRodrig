-- M49 — The missing link: an order becomes a delivery job.
--
-- M45/M46/M48 built the whole delivery lifecycle from `searching_driver`
-- onward and nothing ever produced that first state. Verified, not assumed:
-- zero rows in `deliveries`, zero in `delivery_offers`, and no call site
-- anywhere in the app for create_delivery_for_order(). A driver could sign in,
-- go online, and wait forever.
--
-- WHEN, AND WHY NOT EARLIER
-- The trigger fires when the order reaches `ready_for_pickup`, NOT at
-- checkout. A delivery offered at checkout would send a driver to a shop that
-- has not started cooking, packing or even accepting the order — the driver
-- waits, the customer's clock runs, and the platform looks incompetent to
-- both. "Ready" is the first moment the goods actually exist to be collected.
--
-- A TRIGGER, not a call in the merchant route. Same reasoning as M28's pickup
-- code: update_order_status() is today's only path to `ready_for_pickup`, and
-- "today's only path" is how the last several gaps in this schema began. A
-- trigger covers the admin, a repair script, and whatever gets built next.
create or replace function public.create_delivery_on_ready()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid;
begin
  -- Only Roulé Rodrigues delivery. `pickup` is the customer collecting (that
  -- is M28's code) and `customer_delivery` is the merchant's own driver —
  -- neither wants a job on the network.
  if new.status = 'ready_for_pickup'
     and old.status is distinct from new.status
     and coalesce(new.fulfillment_method, '') = 'rr_delivery' then
    -- create_delivery_for_order is idempotent (one delivery per order), so a
    -- status bounced back and forth cannot mint a second job.
    v_id := create_delivery_for_order(new.id);
    if v_id is not null then
      perform offer_delivery(v_id);
    end if;
  end if;
  return null;
end;
$function$;

revoke execute on function public.create_delivery_on_ready() from public, anon, authenticated;

drop trigger if exists t_orders_create_delivery on orders;
create trigger t_orders_create_delivery
  after update of status on orders
  for each row execute function create_delivery_on_ready();

-- Backfill anything already sitting in ready_for_pickup on rr_delivery. There
-- is nothing today, but a migration that only works on future rows leaves a
-- silent hole for whatever was in flight when it shipped.
do $$
declare r record; v_id uuid;
begin
  for r in
    select o.id from orders o
     where o.status = 'ready_for_pickup'
       and coalesce(o.fulfillment_method, '') = 'rr_delivery'
       and not exists (select 1 from deliveries d where d.order_id = o.id)
  loop
    v_id := create_delivery_for_order(r.id);
    if v_id is not null then perform offer_delivery(v_id); end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 't_orders_create_delivery') then
    raise exception 'M49: the delivery-creation trigger did not attach — drivers would never see work.';
  end if;
end;
$$;
