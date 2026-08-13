-- ── M87 + M88 — two things found by running a restaurant end to end ────────
--
-- Both come out of the simulation: playing the customer, the cook, the owner
-- and the admin against production data and writing down every moment where
-- the software knew something and did not say it.
--
--
-- ── M87: a LIVE kitchen with nothing to sell ───────────────────────────────
--
-- M86 answered "can anyone order food at all?" (orderable_dish_count). This is
-- its mirror image, and it was just as invisible: Chez Banane is `active`,
-- passes store_is_visible(), appears in the restaurant list — and holds zero
-- sellable variants. A customer who opens an OPEN restaurant and finds no food
-- concludes the site is broken, not that the kitchen is quiet.
--
-- It reuses store_is_visible() rather than reassembling "live" in TypeScript,
-- for the same reason M86 did: a second copy of that rule would eventually
-- disagree with the page customers actually see.
--
-- Counting VARIANTS, not products, again deliberately: a dish whose variants
-- are all switched off is not buyable, however active the product row looks.
--
-- Verified against production the moment it was applied — 1, and the one it
-- means is Chez Banane. See lib/admin/ops.ts for the alert it feeds and
-- lib/admin/ops.test.ts for the four tests that pin it (both re-injected and
-- watched to fail).
create or replace function public.empty_live_kitchen_count()
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int
    from food_kitchens fk
    join stores s on s.id = fk.store_id
   where store_is_visible(s.id)
     and not exists (
       select 1
         from products p
         join product_variants pv on pv.product_id = p.id
        where p.store_id = s.id
          and p.status = 'active'
          and pv.is_active
     );
$function$;

-- Service role only. /admin runs on the ADMIN_PASSWORD cookie with auth.uid()
-- NULL, so there is no authenticated identity to check inside the function —
-- and a bare `revoke from public` is the boundary, not the auth.uid() gate,
-- which passes for anon (M28/M84, and the hole I opened in M83).
revoke all on function public.empty_live_kitchen_count() from public;
grant execute on function public.empty_live_kitchen_count() to service_role;


-- ── M88: the cook finds out a dish has run out while reading an ORDER ──────
--
-- Marking something sold out lived only on the Menu tab. But nobody opens the
-- menu to discover they are out of fish — they discover it reading the order
-- that asks for it. Leaving the order screen mid-service, finding the dish in
-- a list and coming back is why the next customer still gets offered it.
--
-- The order line needs to know WHICH product it is before the screen can offer
-- that, and it never had it: order_items records variant_id, so the product is
-- one join away.
--
-- ⚠ THE FIRST VERSION OF THIS WAS APPLIED BROKEN. I joined a table called
-- `food_dishes(product_id, sold_out_on)`; the real one is
-- `food_items(product_id, sold_out_until timestamptz)`. `create or replace
-- function` ACCEPTED IT — a plpgsql body is parsed, not resolved, so every
-- table and column inside is only checked the first time it runs. The first
-- cook to open /kitchen would have got 42P01 and an empty board. Exactly the
-- same class of mistake as the ambiguous `status` in confirm_order_payment:
-- the migration succeeding proves nothing, so this one was then run as a real
-- cook (set role authenticated + request.jwt.claims) before being believed.
--
-- Sold out is a TIMESTAMP in the future, not a date equal to today — M77 made
-- it expire at the start of the next island day so nobody has to remember to
-- undo it before service tomorrow.
--
-- Everything else in the payload is unchanged, including the M85 rule that
-- balanceDue counts CASH only.
create or replace function public.kitchen_dashboard()
returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $function$
declare v_ids uuid[]; v_orders jsonb; v_kitchens jsonb;
begin
  select array_agg(k) into v_ids from my_kitchen_ids() k;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception using errcode = 'RR081', message = 'You are not on a kitchen team.';
  end if;

  select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
    into v_kitchens from stores s where s.id = any(v_ids);

  select jsonb_agg(o order by o->>'placedAt')
    into v_orders
    from (
      select jsonb_build_object(
               'id', ord.id,
               'orderNumber', ord.order_number,
               'kitchen', s.name,
               'status', ord.status::text,
               'customer', split_part(btrim(coalesce(ord.customer_name, '')), ' ', 1),
               'fulfillment', ord.fulfillment_method,
               'placedAt', coalesce(ord.placed_at, ord.created_at),
               'total', ord.total,
               'currency', ord.currency,
               'payOnCollection', (ord.status = 'pending_payment'
                                   and exists (select 1 from payments p
                                                where p.order_id = ord.id and p.provider = 'cash')),
               'waitingOnTransfer', (ord.status = 'pending_payment'
                                     and not exists (select 1 from payments p
                                                      where p.order_id = ord.id and p.provider = 'cash')),
               'awaitingPayment', (ord.status = 'awaiting_payment_confirmation'),
               'hasReceipt', (coalesce(ord.payment_receipt_path, '') <> ''),
               'finished', (ord.status in ('collected','cancelled','refunded')),
               -- CASH only (M85): a pending bank transfer is money awaiting
               -- proof, not money owed at the counter.
               'balanceDue', coalesce((select sum(p.amount) from payments p
                                        where p.order_id = ord.id
                                          and p.status = 'pending'
                                          and p.provider = 'cash'
                                          and ord.status not in ('cancelled','refunded')), 0),
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'name', oi.product_name,
                          'variant', oi.variant_name,
                          'qty', oi.quantity,
                          -- M88: so "sold out" is one tap from the ORDER that
                          -- revealed the shortage, not a trip to the menu tab.
                          'productId', pv.product_id,
                          'soldOut', coalesce(fi.sold_out_until > now(), false))
                        order by oi.product_name)
                   from order_items oi
                   left join product_variants pv on pv.id = oi.variant_id
                   left join food_items fi on fi.product_id = pv.product_id
                  where oi.order_id = ord.id), '[]'::jsonb),
               'note', ord.notes
             ) as o
        from orders ord
        join stores s on s.id = ord.store_id
       where ord.store_id = any(v_ids)
         and coalesce(ord.placed_at, ord.created_at) > now() - interval '24 hours'
         and ord.status in ('pending_payment','awaiting_payment_confirmation',
                            'paid','preparing','ready_for_pickup',
                            'collected','cancelled','refunded')
    ) q;

  return jsonb_build_object(
    'kitchens', coalesce(v_kitchens, '[]'::jsonb),
    'orders',   coalesce(v_orders, '[]'::jsonb));
end;
$function$;

-- No new privilege: the cook already writes sold-out through kitchen_update_dish
-- (M77), which resolves their kitchens from my_kitchen_ids() and refuses any
-- product outside them. M88 only gives the ORDER SCREEN the product id it needs
-- to call the verb that already existed.
