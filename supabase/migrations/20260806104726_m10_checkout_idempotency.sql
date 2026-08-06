-- Checkout idempotency.
--
-- A dropped response on a Rodrigues mobile network is routine. Today the
-- customer taps Place order again and gets a SECOND real order: a second stock
-- reservation held for 48h, a second payments row, a second merchant
-- notification. On a shop with one of something, the item immediately reads as
-- out of stock. A fast double-tap does the same thing, because canSubmit is a
-- render-time constant and a second click can land before React commits the
-- disabled state.
--
-- The key lives on `orders` rather than in a separate response cache: the order
-- IS the response, so a side table would duplicate state that can drift.
--
-- Scoped to (customer_id, idempotency_key), not to the key alone. A globally
-- unique key would let a replayed key from another session return somebody
-- else's order id and number — a small but real information leak. Partial,
-- because existing rows and any caller that omits a key keep NULL.
alter table orders add column if not exists idempotency_key uuid;

comment on column orders.idempotency_key is
  'Client-generated per checkout attempt. Retries reuse it so a dropped response cannot create a second order. Scoped per customer.';

create unique index if not exists orders_customer_idempotency_key
  on orders (customer_id, idempotency_key)
  where idempotency_key is not null;

-- M7 replaced the table-level SELECT on orders with explicit per-column grants,
-- so a NEW column is unreadable until granted and any `select *` would start
-- failing with a confusing 42501. Not sensitive — it is the client's own random
-- token — so it is granted like the rest of the row.
grant select (idempotency_key) on orders to anon, authenticated;

do $do$
declare
  src text; newsrc text;

  old_sig text := 'p_expected_total integer DEFAULT NULL::integer)';
  new_sig text := 'p_expected_total integer DEFAULT NULL::integer, p_idempotency_key uuid DEFAULT NULL::uuid)';

  old_decl text := '  v_order_id uuid; v_order_number text;';
  new_decl text := '  v_order_id uuid; v_order_number text;
  v_existing record;';

  -- Everything below needs v_customer, so the gate goes immediately after the
  -- authentication check and before any validation, stock work or inserts.
  old_auth text := '  if v_customer is null then raise exception ''not authenticated''; end if;';
  new_auth text := '  if v_customer is null then raise exception ''not authenticated''; end if;

  -- Idempotency. The advisory lock serialises concurrent attempts carrying the
  -- SAME key for this customer: the second request blocks here until the first
  -- commits, then finds the order below and returns it instead of racing to
  -- create a twin. Transaction-scoped, so it is released automatically on
  -- commit or rollback — a failed checkout leaves no lock and no order.
  -- The unique index remains the hard backstop if this is ever bypassed.
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_customer::text || '':'' || p_idempotency_key::text, 0));

    select o.id, o.order_number, o.total, o.currency, o.delivery_fee
      into v_existing
      from orders o
     where o.customer_id = v_customer
       and o.idempotency_key = p_idempotency_key
     limit 1;

    -- Replay: hand back the order that already exists. Returning HERE is the
    -- whole point — no stock is reserved twice, no second payments row, no
    -- duplicate merchant notification.
    if v_existing.id is not null then
      return query select v_existing.id, v_existing.order_number, v_existing.total,
                          v_existing.currency::text, v_existing.delivery_fee;
      return;
    end if;
  end if;';

  old_cols text := 'fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, auto_release_at, delivery_zone_id)';
  new_cols text := 'fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, auto_release_at, delivery_zone_id, idempotency_key)';

  old_vals text := 'nullif(trim(p_delivery_instructions),''''), now()+interval ''48 hours'', p_delivery_zone_id)';
  new_vals text := 'nullif(trim(p_delivery_instructions),''''), now()+interval ''48 hours'', p_delivery_zone_id, p_idempotency_key)';
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname='create_order' and pronamespace='public'::regnamespace;
  if src is null then raise exception 'create_order() not found'; end if;

  if position('p_idempotency_key' in src) > 0 then
    raise notice 'create_order already idempotent; nothing to do';
    return;
  end if;

  if position(old_sig  in src) = 0 then raise exception 'signature anchor not found';   end if;
  if position(old_decl in src) = 0 then raise exception 'declare anchor not found';     end if;
  if position(old_auth in src) = 0 then raise exception 'auth-check anchor not found';  end if;
  if position(old_cols in src) = 0 then raise exception 'insert-columns anchor not found'; end if;
  if position(old_vals in src) = 0 then raise exception 'insert-values anchor not found';  end if;

  newsrc := replace(src,    old_sig,  new_sig);
  newsrc := replace(newsrc, old_decl, new_decl);
  newsrc := replace(newsrc, old_auth, new_auth);
  newsrc := replace(newsrc, old_cols, new_cols);
  newsrc := replace(newsrc, old_vals, new_vals);
  execute newsrc;
end
$do$;

revoke execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid) from public, anon;

grant  execute on function create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer, uuid) to authenticated;

-- Retire the previous signature so nothing can bind to the non-idempotent one.
drop function if exists create_order(uuid, jsonb, text, text, text, text, text, double precision, double precision, text, uuid, integer);
