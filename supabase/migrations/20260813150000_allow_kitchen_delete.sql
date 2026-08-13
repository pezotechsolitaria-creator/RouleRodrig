-- ══════════════════════════════════════════════════════════════════════════
-- A KITCHEN COULD NEVER BE DELETED, BY ANY PATH
-- ══════════════════════════════════════════════════════════════════════════
--
-- The owner, trying to delete the "Ninja" kitchen, got RR041: "Store 'Ninja'
-- belongs to platform infrastructure (system key: food) and cannot be deleted
-- from the marketplace admin."
--
-- ── WHY THE GUARD EXISTS, AND IT IS RIGHT TO ─────────────────────────────
-- Every kitchen is a store under ONE platform merchant, "Roulé Rodrigues
-- Kitchen" (system_key = 'food'). That merchant is infrastructure: deleting it
-- cascades through stores → products → food_items → orders and would take every
-- kitchen, dish and order on the platform with it. So block_system_store_delete()
-- refuses to delete any store belonging to a system merchant. Worth keeping.
--
-- ── WHY IT WAS ALSO WRONG ────────────────────────────────────────────────
-- It protects the MERCHANT by blocking every STORE beneath it — and an individual
-- kitchen is an ordinary operational thing to remove: a seeded demo, a cook who
-- stopped cooking, one created by mistake.
--
-- admin_delete_kitchen() was written for exactly that. It does all the right
-- cleanup and then ends with `delete from stores`, which fires this trigger. So
-- the function had never once succeeded — dead code that looked alive, and only
-- somebody actually trying to use it could reveal that.
--
-- The events path already had a sanctioned escape hatch (app.allow_event_delete).
-- Kitchens get its mirror. Nothing else loosens: the merchant is still
-- undeletable, and a kitchen that has taken orders is still refused by
-- admin_delete_kitchen's own check, because erasing what people ordered is a
-- different act from tidying a roster.

create or replace function public.block_system_store_delete()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_key text;
begin
  select m.system_key into v_key from merchants m where m.id = old.merchant_id;
  if v_key is not null then
    -- The sanctioned exceptions. Each is set by ONE function for the duration of
    -- its own transaction with set_config(..., true) — transaction-local, so it
    -- cannot leak into another statement or another session, and no client can
    -- set it because neither function is reachable outside the service role.
    if coalesce(current_setting('app.allow_event_delete', true), '') = 'on' and v_key = 'events' then
      return old;
    end if;
    if coalesce(current_setting('app.allow_kitchen_delete', true), '') = 'on' and v_key = 'food' then
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

create or replace function public.admin_delete_kitchen(p_store_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_store stores%rowtype; v_orders integer; v_dishes integer;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_store from stores where id = p_store_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  if not exists (select 1 from food_kitchens fk where fk.store_id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'Not a kitchen.';
  end if;

  -- A kitchen that has fed somebody is history, not clutter. Hiding it keeps the
  -- record of what was ordered; deleting it would orphan real orders.
  select count(*) into v_orders from orders where store_id = p_store_id;
  if v_orders > 0 then
    raise exception using errcode = 'RR004',
      message = format(
        '%s has taken %s order%s. Hide it instead — set its visibility to hidden — so the record of what people ordered survives.',
        v_store.name, v_orders, case when v_orders = 1 then '' else 's' end);
  end if;

  select count(*) into v_dishes from products where store_id = p_store_id;

  delete from food_item_categories where product_id in (select id from products where store_id = p_store_id);
  delete from food_items          where product_id in (select id from products where store_id = p_store_id);
  delete from products               where store_id = p_store_id;
  delete from store_hours            where store_id = p_store_id;
  delete from store_payment_settings where store_id = p_store_id;
  delete from food_kitchen_ops       where store_id = p_store_id;
  delete from food_kitchens          where store_id = p_store_id;

  -- THE LINE THAT MAKES THIS FUNCTION WORK AT ALL. Transaction-local, set
  -- immediately before the one delete it authorises; the transaction ending is
  -- what unsets it.
  perform set_config('app.allow_kitchen_delete', 'on', true);
  delete from stores where id = p_store_id;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'kitchen.delete', 'store', p_store_id::text,
          jsonb_build_object('name', v_store.name, 'dishes', v_dishes));
  return jsonb_build_object('ok', true, 'name', v_store.name, 'dishes', v_dishes);
end;
$function$;

revoke all on function public.admin_delete_kitchen(uuid) from public;
revoke all on function public.admin_delete_kitchen(uuid) from anon, authenticated;
grant execute on function public.admin_delete_kitchen(uuid) to service_role;
