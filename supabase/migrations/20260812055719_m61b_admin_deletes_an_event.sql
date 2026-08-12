-- M61b — an event could be created but never removed.
--
-- M40 put block_system_store_delete() on stores so the marketplace admin's
-- delete-shop flow (M31/M32) cannot destroy platform infrastructure. That is
-- right, and it stays. But it blocks EVERY delete unconditionally, and now that
-- M61 lets an admin create events, the first mistyped name is permanent — there
-- is no path, from any screen, that removes an event.
--
-- Found while testing M61: the probe could not clean up after itself.
--
-- ── THE SHAPE OF THE EXCEPTION ──────────────────────────────────────────────
-- The trigger keeps refusing by default and yields only to a transaction-local
-- flag that exactly one function sets. So the marketplace admin path is as
-- blocked as it was, and the only way through is the dedicated function below,
-- which carries its own admin gate and its own refusal rules.
--
-- ── WHAT IS NOT DELETABLE ───────────────────────────────────────────────────
-- An event with ANY order attached. Someone has reserved or paid for a ticket,
-- and the honest action for that is cancellation — which voids tickets, tells
-- the buyer, and leaves the money trail intact — not erasure. Deleting would
-- cascade away order_items and tickets and silently rewrite history that a
-- customer is holding a receipt for. So this is a tool for removing a mistake
-- made a minute ago, not for closing a sold event.

create or replace function public.block_system_store_delete()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
declare
  v_key text;
begin
  select m.system_key into v_key from merchants m where m.id = old.merchant_id;
  if v_key is not null then
    -- The one sanctioned exception: admin_delete_event() sets this for the
    -- duration of its own transaction. Nothing else sets it, and it is local, so
    -- it cannot leak into another statement or another session.
    if coalesce(current_setting('app.allow_event_delete', true), '') = 'on' and v_key = 'events' then
      return old;
    end if;
    raise exception using errcode = 'RR041',
      message = format(
        'Store "%s" belongs to platform infrastructure (system key: %s) and cannot be deleted from the marketplace admin.',
        old.name, v_key);
  end if;
  return old;
end;
$function$;

create or replace function public.admin_delete_event(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_name text; v_orders int;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select s.name into v_name
    from stores s join events e on e.store_id = s.id
   where s.id = p_store_id;
  if v_name is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select count(*) into v_orders from orders where store_id = p_store_id;
  if v_orders > 0 then
    raise exception using errcode='RR004',
      message=format('This event has %s order(s). Cancel it instead — deleting would erase tickets somebody is holding.', v_orders);
  end if;

  -- Ordered by dependency. No orders means no order_items and no tickets.
  delete from managed_ticketing_agreements where store_id = p_store_id;
  delete from event_organizer_assignments where store_id = p_store_id;
  delete from inventory_movements m
   where m.variant_id in (select v.id from product_variants v
                            join products p on p.id = v.product_id
                           where p.store_id = p_store_id);
  delete from ticket_types tt
   where tt.variant_id in (select v.id from product_variants v
                             join products p on p.id = v.product_id
                            where p.store_id = p_store_id);
  delete from product_variants v
   using products p where p.id = v.product_id and p.store_id = p_store_id;
  delete from products where store_id = p_store_id;
  delete from store_payment_settings where store_id = p_store_id;
  delete from events where store_id = p_store_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'event.deleted', 'stores', p_store_id::text,
          jsonb_build_object('name', v_name));

  perform set_config('app.allow_event_delete', 'on', true);
  delete from stores where id = p_store_id;
  perform set_config('app.allow_event_delete', 'off', true);

  return jsonb_build_object('deleted', true, 'name', v_name);
end;
$function$;

revoke all on function public.admin_delete_event(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_event(uuid) to service_role;

-- Prove all three properties: a clean event deletes, one with an order does not,
-- and the marketplace path is still blocked.
do $$
declare v_j jsonb; v_store uuid; v_fixture uuid;
begin
  v_j := admin_create_event(p_name => 'M61b delete probe', p_starts_at => now() + interval '10 days');
  v_store := (v_j->>'storeId')::uuid;

  v_j := admin_delete_event(v_store);
  if not (v_j->>'deleted')::boolean then raise exception 'M61b: clean event was not deleted.'; end if;
  if exists (select 1 from stores where id = v_store) then
    raise exception 'M61b: the store survived deletion.'; end if;

  -- An event WITH an order must be refused.
  select s.id into v_fixture from stores s join events e on e.store_id=s.id
   where exists (select 1 from orders o where o.store_id = s.id) limit 1;
  if v_fixture is not null then
    begin
      perform admin_delete_event(v_fixture);
      raise exception 'M61b: an event with orders was deleted.';
    exception when sqlstate 'RR004' then
      null;  -- expected
    end;
  end if;

  -- And the ordinary path stays blocked without the flag.
  begin
    delete from stores where id = (select s.id from stores s join merchants m on m.id=s.merchant_id
                                    where m.system_key='events' limit 1);
    raise exception 'M61b: a system store was deletable without the flag.';
  exception when sqlstate 'RR041' then
    null;  -- expected
  end;
end;
$$;
