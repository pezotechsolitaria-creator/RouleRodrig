-- M61 — The customer could never see their own delivery PIN.
--
-- THE BUG THIS FIXES IS TOTAL. complete_delivery_with_pin() is the ONLY route
-- to `delivered` — deliberately, so that "delivered" means a human confirmed
-- receipt. But nothing anywhere showed the customer that PIN. Not the order
-- page, not the tracking page, not an email. A driver would stand at the door
-- asking for four digits the customer had never been given, and the delivery
-- could not be completed by anyone, ever.
--
-- Found by asking how the last step of the flow actually ends, rather than by
-- testing the parts I had built. Every DB probe passed because the probes read
-- the PIN with the service role — the one identity a customer never has.
--
-- Deliberately NOT folded into lookup_order(): that function is being edited
-- by other work in flight, and a delivery is a separate concern with a separate
-- audience anyway.
create or replace function public.delivery_view_for_customer(
  p_order_id uuid,
  p_email    text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_o     orders%rowtype;
  v_d     deliveries%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text;
  v_phone text;
begin
  select * into v_o from orders where id = p_order_id;
  if not found then return null; end if;

  -- Two credentials, matching how the rest of the site already treats an order:
  -- a signed-in customer owns it, or a guest proves it with the address the
  -- order was placed under (same strength as lookup_order).
  if auth.uid() is not null and v_o.customer_id = auth.uid() then
    null;
  elsif v_email <> '' and lower(btrim(coalesce(v_o.customer_email, ''))) = v_email then
    null;
  else
    return null;
  end if;

  select * into v_d from deliveries where order_id = p_order_id;
  if not found then return null; end if;

  -- The driver's first name and phone only, and only once he actually holds the
  -- job. Before that there is nobody to name, and handing out a full identity
  -- for a delivery that may be reassigned helps no one.
  if v_d.driver_id is not null then
    select split_part(btrim(dd.full_name), ' ', 1), dd.phone
      into v_name, v_phone
      from delivery_drivers dd where dd.id = v_d.driver_id;
  end if;

  return jsonb_build_object(
    'status',      v_d.status,
    -- The PIN is the customer's own credential for their own delivery. It is
    -- useless to anyone else: only the assigned driver can spend it, it is
    -- single-use, and it burns after a fixed number of wrong attempts.
    'pin',         v_d.pin,
    'driverName',  v_name,
    'driverPhone', v_phone,
    'pickedUpAt',  v_d.picked_up_at,
    'deliveredAt', v_d.delivered_at,
    'dueAt',       v_d.delivery_due_at);
end;
$function$;

revoke execute on function public.delivery_view_for_customer(uuid, text) from public;
-- anon included on purpose: a guest tracking an order has no session, and
-- proves themselves with the order's own email inside the function.
grant execute on function public.delivery_view_for_customer(uuid, text) to anon, authenticated;

-- Verified separately in a rolled-back transaction rather than here, because a
-- probe that has to create a delivery would leave real rows behind in a
-- migration. Results: correct email -> the PIN; wrong email, no credential, and
-- a different signed-in user -> null on every path.
