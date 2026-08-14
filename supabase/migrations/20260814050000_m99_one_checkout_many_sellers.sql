-- ── M99 · One checkout, several sellers ────────────────────────────────────
--
-- The marketplace held a basket per shop and made the customer check out once
-- per shop: name, phone, email, fulfilment and address re-entered for every
-- seller. The reasoning was that payment is a bank transfer into each shop's
-- OWN account, so one payment cannot cover two shops — true, and the wrong
-- place to draw the line. The PAYMENT is per seller; the CHECKOUT is not.
-- Everything the customer types is the same for all of them.
--
-- So: one cart, one form, one submit, and the backend splits it into one order
-- per seller — the standard multi-vendor shape. `orders.store_id` stays
-- singular and create_order() is untouched.
--
-- ── WHY THIS WRAPS create_order() RATHER THAN REPLACING IT ─────────────────
-- create_order() is ~250 lines carrying every guarantee this platform has:
-- server-derived prices, row-locked stock, the RR012 price-integrity check, the
-- RR013 reservation cap, opening hours, per-shop payment methods, commission
-- freezing, idempotent replay. A second implementation would be a second set of
-- those rules, and the second set is always the one that drifts.
--
-- Calling it in a loop inside one plpgsql function means one TRANSACTION: if
-- the third seller's stock ran out, the first two orders never existed. That
-- deletes scenario F — "payment succeeds but one order group fails" — at
-- creation time rather than compensating for it afterwards. Proved against the
-- live database before shipping: two sellers split into two orders under one
-- group; a repeated key replayed instead of reserving stock twice; the same
-- shop listed twice refused; and an out-of-stock third seller left ZERO orders
-- behind.

alter table public.orders add column if not exists group_id uuid;
create index if not exists orders_group_id_idx on public.orders (group_id) where group_id is not null;

comment on column public.orders.group_id is
  'Set when one checkout produced several orders, one per seller (M99). The '
  'customer sees a single purchase; each row is still one order for one shop.';

create or replace function public.create_order_group(
  p_groups                jsonb,
  p_customer_name         text,
  p_customer_phone        text,
  p_provider              text,
  p_notes                 text    default null,
  p_delivery_lat          double precision default null,
  p_delivery_lng          double precision default null,
  p_delivery_instructions text    default null,
  p_idempotency_key       uuid    default null,
  p_guest_email           text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer uuid := auth.uid();
  v_email    text;
  v_group    uuid;
  v_g        jsonb;
  v_store    uuid;
  v_key      uuid;
  v_row      record;
  v_orders   jsonb := '[]'::jsonb;
  v_total    integer := 0;
  v_seen     uuid[] := '{}';
  v_count    int;
begin
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception using errcode='RR005', message='Your bag is empty.';
  end if;
  v_count := jsonb_array_length(p_groups);
  -- A bound on the transaction. Nobody legitimately checks out from more than a
  -- handful of island shops at once, and each group takes row locks on stock.
  if v_count > 8 then
    raise exception using errcode='RR005',
      message='You can check out with up to 8 shops at a time.';
  end if;

  -- Identity, resolved the SAME way create_order does: a session always wins,
  -- and p_guest_email is ignored for a signed-in caller.
  if v_customer is not null then
    select u.email into v_email from auth.users u where u.id = v_customer;
  else
    v_email := lower(btrim(coalesce(p_guest_email, '')));
    if v_email = '' then
      raise exception using errcode='RR005',
        message='An email address is required to place an order.';
    end if;
  end if;

  -- ── Replay ───────────────────────────────────────────────────────────────
  -- Same contract as create_order: the same key returns the same orders rather
  -- than reserving stock a second time. Checked BEFORE anything is created and
  -- under the same advisory lock, so two simultaneous submits of one bag cannot
  -- both pass.
  v_group := coalesce(p_idempotency_key, gen_random_uuid());
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(coalesce(v_customer::text, v_email) || ':grp:' || p_idempotency_key::text, 0));

    select jsonb_agg(jsonb_build_object(
             'orderId', o.id, 'orderNumber', o.order_number, 'storeId', o.store_id,
             'storeName', s.name, 'total', o.total, 'currency', o.currency,
             'deliveryFee', o.delivery_fee) order by s.name),
           coalesce(sum(o.total), 0)
      into v_orders, v_total
      from orders o join stores s on s.id = o.store_id
     where o.group_id = p_idempotency_key
       and (
         (v_customer is not null and o.customer_id = v_customer)
         or (v_customer is null and o.customer_id is null and lower(o.customer_email) = v_email)
       );

    if v_orders is not null and jsonb_array_length(v_orders) > 0 then
      return jsonb_build_object('groupId', p_idempotency_key, 'orders', v_orders,
                                'total', v_total, 'replayed', true);
    end if;
    v_orders := '[]'::jsonb;
  end if;

  -- ── One order per seller, all inside this transaction ────────────────────
  for v_g in select * from jsonb_array_elements(p_groups) loop
    v_store := (v_g->>'store_id')::uuid;
    if v_store is null then
      raise exception using errcode='RR005', message='A shop is missing from your bag.';
    end if;
    -- Two groups for one shop would double-count that shop against the
    -- reservation cap and produce two orders the customer thinks are one.
    if v_store = any(v_seen) then
      raise exception using errcode='RR005', message='That shop appears twice in your bag.';
    end if;
    v_seen := v_seen || v_store;

    -- A DERIVED per-order key, so an inner replay is impossible while the outer
    -- key still identifies the whole group. Deterministic, so a retry of the
    -- same bag reproduces exactly the same keys.
    v_key := md5(v_group::text || ':' || v_store::text)::uuid;

    -- Every rule lives in here: prices, stock, hours, payment methods, the
    -- RR012 total check, the RR013 cap. A refusal from any seller raises out of
    -- this loop and rolls the whole thing back.
    select * into v_row from public.create_order(
      p_store_id              => v_store,
      p_items                 => v_g->'items',
      p_customer_name         => p_customer_name,
      p_customer_phone        => p_customer_phone,
      p_fulfillment           => v_g->>'fulfillment',
      p_notes                 => p_notes,
      p_provider              => p_provider,
      p_delivery_lat          => p_delivery_lat,
      p_delivery_lng          => p_delivery_lng,
      p_delivery_instructions => p_delivery_instructions,
      p_delivery_zone_id      => nullif(v_g->>'delivery_zone_id', '')::uuid,
      p_expected_total        => nullif(v_g->>'expected_total', '')::integer,
      p_idempotency_key       => v_key,
      p_guest_email           => p_guest_email
    );

    update orders set group_id = v_group where id = v_row.order_id;

    v_orders := v_orders || jsonb_build_object(
      'orderId',     v_row.order_id,
      'orderNumber', v_row.order_number,
      'storeId',     v_store,
      'storeName',   (select s.name from stores s where s.id = v_store),
      'total',       v_row.total,
      'currency',    v_row.currency,
      'deliveryFee', v_row.delivery_fee);
    v_total := v_total + v_row.total;
  end loop;

  return jsonb_build_object('groupId', v_group, 'orders', v_orders,
                            'total', v_total, 'replayed', false);
end;
$$;

comment on function public.create_order_group(jsonb, text, text, text, text, double precision, double precision, text, uuid, text) is
  'One checkout, one order per seller, one transaction. Wraps create_order() so '
  'every price, stock and refusal rule has exactly one implementation.';

-- Same grant shape as create_order: NOT anon. A guest reaches it through
-- /api/checkout, which is rate-limited and Zod-validated, using the service role.
revoke all on function public.create_order_group(jsonb, text, text, text, text, double precision, double precision, text, uuid, text)
  from public, anon;
grant execute on function public.create_order_group(jsonb, text, text, text, text, double precision, double precision, text, uuid, text)
  to authenticated, service_role;

-- Post-condition: the M97 grant trap must not repeat. Supabase's DEFAULT
-- PRIVILEGES grant EXECUTE to anon directly, and revoking from PUBLIC does not
-- touch that — so this asserts the outcome rather than trusting the statement.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join aclexplode(p.proacl) ax on ax.privilege_type = 'EXECUTE'
    join pg_roles r on r.oid = ax.grantee
    where n.nspname = 'public' and p.proname = 'create_order_group' and r.rolname = 'anon'
  ) then
    raise exception 'anon can execute create_order_group';
  end if;
end $$;
