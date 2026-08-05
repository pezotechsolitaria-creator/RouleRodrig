-- M6 — private bucket for customer payment receipts.
--
-- Deliberately NOT the public `merchant-media` bucket. A receipt is the
-- customer's own financial document (it can show their name, bank and balance),
-- so it must never be readable by URL guessing. Path convention is
-- `<order_id>/<file>`, mirroring merchant-media's `<store_id>/<file>` shape,
-- and every policy re-derives authority from the orders table rather than
-- trusting the path alone.
insert into storage.buckets (id, name, public)
values ('order-receipts', 'order-receipts', false)
on conflict (id) do nothing;

-- Only the order's own customer may attach a receipt to it.
create policy order_receipts_customer_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-receipts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and exists (
    select 1 from orders o
    where o.id = (split_part(name, '/', 1))::uuid
      and o.customer_id = auth.uid()
  )
);

-- Readable by the customer who uploaded it, the shop that needs to verify it,
-- and platform admins. Nobody else, including other customers of the same shop.
create policy order_receipts_read on storage.objects for select to authenticated
using (
  bucket_id = 'order-receipts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and exists (
    select 1 from orders o
    where o.id = (split_part(name, '/', 1))::uuid
      and (o.customer_id = auth.uid() or is_store_staff(o.store_id) or is_platform_admin())
  )
);

-- Lets a customer replace a receipt they uploaded by mistake.
create policy order_receipts_customer_update on storage.objects for update to authenticated
using (
  bucket_id = 'order-receipts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and exists (
    select 1 from orders o
    where o.id = (split_part(name, '/', 1))::uuid
      and o.customer_id = auth.uid()
  )
);
