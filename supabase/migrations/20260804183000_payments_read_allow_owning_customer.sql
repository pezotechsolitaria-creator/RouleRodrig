-- Bug found while building the M4 customer order detail page: the customer
-- viewing their OWN order got "No payment recorded" even though a captured
-- PayPal payment exists — payments_read only allowed store staff/admin, not
-- the order's own customer. orders_read already has the customer_id =
-- auth.uid() branch; payments_read never got the equivalent, so it's a gap,
-- not an intentional restriction.
drop policy if exists payments_read on payments;

create policy payments_read on payments for select using (
  exists (
    select 1 from orders o
    where o.id = payments.order_id
      and (o.customer_id = auth.uid() or is_store_staff(o.store_id) or is_platform_admin())
  )
);
