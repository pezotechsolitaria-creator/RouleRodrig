-- ── M104b · The size trigger must survive a delivery with no order ──────────
--
-- M103 wrote set_delivery_size_from_order() when order_id was still NOT NULL,
-- so it could assume the lookup found a row:
--
--   select coalesce(o.delivery_size_class,'standard') into new.size_class
--     from orders o where o.id = new.order_id;
--
-- With M104's request-based deliveries order_id is null, that SELECT matches
-- nothing, and `SELECT ... INTO` sets the target to NULL rather than leaving it
-- alone — so every Deliver Anything job failed the NOT NULL on size_class, and
-- the whole accept_delivery_quote transaction aborted. A customer accepting a
-- quote would have got an error and no delivery.
--
-- Caught by CALLING the RPC. M104 applied cleanly and would have shipped.
create or replace function public.set_delivery_size_from_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_size text;
begin
  if new.size_class is distinct from 'standard' then
    return new;
  end if;

  if new.order_id is not null then
    select o.delivery_size_class into v_size from orders o where o.id = new.order_id;
  elsif new.request_id is not null then
    select r.size_class into v_size from delivery_requests r where r.id = new.request_id;
  end if;

  -- coalesce OUTSIDE the select, so a lookup matching nothing leaves the
  -- default standing instead of nulling the column. This is the whole bug.
  new.size_class := coalesce(v_size, 'standard');
  return new;
end;
$$;

revoke execute on function public.set_delivery_size_from_order() from public, anon, authenticated;
