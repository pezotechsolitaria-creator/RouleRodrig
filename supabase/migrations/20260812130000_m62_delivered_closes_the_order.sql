-- M62 — A delivered delivery left its order open forever.
--
-- Found by running the whole loop and reading the LAST line of output rather
-- than the one I was checking: the delivery reached `delivered`, the customer
-- had confirmed with their PIN at the door — and the order was still sitting at
-- `ready_for_pickup`. It would have stayed there. The merchant's queue would
-- show it outstanding, the customer's page would say "ready to collect" for an
-- order already in their kitchen, and every revenue report keyed on `collected`
-- would undercount every delivery the network ever made.
--
-- WHY A DIRECT UPDATE. update_order_status() opens by requiring auth.uid() and
-- then checks store staff membership. At this moment the caller is the DRIVER —
-- not staff of that shop, correctly — so routing through it would always fail.
-- The transition is not user input anyway: it is the consequence of a PIN that
-- the state machine has already validated as single-use and driver-owned.
create or replace function public.close_order_on_delivered()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'delivered' and old.status is distinct from new.status then
    -- Guarded rather than blind: a cancelled or refunded order must not be
    -- resurrected into `collected` by a late delivery event.
    update orders
       set status = 'collected'
     where id = new.order_id
       and status in ('paid', 'preparing', 'ready_for_pickup');

    perform log_delivery_event(new.id, 'system', null, 'order.closed',
                               'delivered', 'delivered',
                               'order marked collected: the customer confirmed with their PIN');
  end if;
  return null;
end;
$function$;

revoke execute on function public.close_order_on_delivered() from public, anon, authenticated;

drop trigger if exists t_deliveries_close_order on deliveries;
create trigger t_deliveries_close_order
  after update of status on deliveries
  for each row execute function close_order_on_delivered();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 't_deliveries_close_order') then
    raise exception 'M62: trigger did not attach — delivered orders would never close.';
  end if;
end;
$$;

-- Verified in a rolled-back transaction: a real completion moves the order to
-- `collected`; an order cancelled while the driver was still carrying it stays
-- `cancelled` after that same completion.
