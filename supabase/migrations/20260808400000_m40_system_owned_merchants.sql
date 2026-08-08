-- M40 — System-owned merchants: the Events product boundary, enforced.
--
-- NUMBERING: jumped to M40 deliberately. A parallel session owns the ticketing
-- foundation at M33/M34 and will take M35+; this migration is infrastructure
-- underneath it, not part of that sequence.
--
-- ── THE PRODUCT DECISION THIS ENFORCES ──────────────────────────────────────
-- An event organiser is NOT a Roulé Rodrigues user. No account, no merchant
-- record of their own, no dashboard, no subscription. They receive exactly one
-- thing: a revocable, event-scoped gate-scanner link. The Roulé Rodrigues admin
-- creates and manages every event.
--
-- ── THE SCHEMA PROBLEM IT SOLVES ────────────────────────────────────────────
-- Ticketing is being built as "an event IS a store" (M33/M34), which is the
-- right call — it reuses the inventory locking, create_order, lookup_order and
-- the payment handshake instead of growing a second copy of all of it. But the
-- chain that comes with it is:
--
--     events.store_id → stores.merchant_id (NOT NULL)
--                     → merchants.owner_id (NOT NULL → auth.users)
--
-- and t_merchant_provision_owner then inserts a merchant_staff row with role
-- 'owner' for that user. So creating an event the naive way mints a WORKING
-- MERCHANT LOGIN as a side effect. That is the product requirement we rejected,
-- arriving through a foreign key rather than through a decision.
--
-- ── THE FIX: ONE PERMANENT PLATFORM MERCHANT ────────────────────────────────
-- Every event store belongs to a single system-owned merchant (system_key =
-- 'events'). The organiser exists only as event data — name, phone, contact.
-- Nothing about the marketplace is weakened to achieve it:
--
--   * merchants.owner_id stays NOT NULL. Verified feasible first: stores'
--     merchant_id index is NON-unique, so one merchant may own many stores;
--     merchants_one_active_per_owner constrains one USER to one MERCHANT, which
--     a dedicated service identity satisfies on its own.
--   * merchant provisioning is untouched globally.
--   * no second authentication architecture. The service identity that owns the
--     platform merchant is exactly that — an identity nobody signs in as, never
--     handed to an organiser.
--
-- ── AND IT MUST NOT BE DELETABLE ────────────────────────────────────────────
-- M31/M32 gave /admin a real "delete this shop and its account" button, and
-- stores cascades to products and (via the ticketing tables) would take events,
-- ticket types, reservations, tickets and the whole attendance record with it.
-- One mis-click on the wrong row would erase the events platform.
--
-- The guard is a TRIGGER, not a check inside admin_delete_shop(). Same reasoning
-- as M23's order_financials and M28's pickup trigger: the RPC is today's only
-- deletion path, and "today's only path" is how the last several gaps in this
-- schema began. A trigger covers every writer — the RPC, a future admin screen,
-- a repair script, a hand-typed DELETE at 2am.

-- ── 1. Mark system-owned merchants ──────────────────────────────────────────
alter table merchants
  add column if not exists system_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'merchants_system_key_key') then
    alter table merchants add constraint merchants_system_key_key unique (system_key);
  end if;
end;
$$;

comment on column merchants.system_key is
  'Non-null marks this merchant as PLATFORM-OWNED infrastructure rather than a real seller. ''events'' owns every ticketed-event store so that organisers never need a merchant account (M40). System-owned merchants and their stores cannot be deleted — see t_merchants_block_system_delete.';

-- ── 2. Make them undeletable, by every path ─────────────────────────────────
create or replace function public.block_system_merchant_delete()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.system_key is not null then
    raise exception using errcode = 'RR041',
      message = format(
        'Merchant "%s" is platform infrastructure (system key: %s) and cannot be deleted. Deleting it would take every event, ticket and attendance record with it.',
        old.display_name, old.system_key);
  end if;
  return old;
end;
$function$;

revoke execute on function public.block_system_merchant_delete() from public, anon, authenticated;

drop trigger if exists t_merchants_block_system_delete on merchants;
create trigger t_merchants_block_system_delete
  before delete on merchants
  for each row execute function block_system_merchant_delete();

-- The stores under it are protected too. Deleting the event store for a single
-- concert is a legitimate future need, but it must be a deliberate act through
-- an events-aware path, never a side effect of the marketplace shop-delete
-- button, which also destroys the merchant and its logins.
create or replace function public.block_system_store_delete()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_key text;
begin
  select m.system_key into v_key from merchants m where m.id = old.merchant_id;
  if v_key is not null then
    raise exception using errcode = 'RR041',
      message = format(
        'Store "%s" belongs to platform infrastructure (system key: %s) and cannot be deleted from the marketplace admin.',
        old.name, v_key);
  end if;
  return old;
end;
$function$;

revoke execute on function public.block_system_store_delete() from public, anon, authenticated;

drop trigger if exists t_stores_block_system_delete on stores;
create trigger t_stores_block_system_delete
  before delete on stores
  for each row execute function block_system_store_delete();

-- ── 3. Resolve the platform Events merchant ─────────────────────────────────
-- Read-only. The row is CREATED by the admin layer, not here, because it needs
-- an auth.users row and creating one belongs to the Auth Admin API (GoTrue owns
-- sessions, identities and refresh tokens; hand-inserting into auth.users
-- produces an account that half-exists). Returning NULL until then is honest —
-- the caller bootstraps and retries.
create or replace function public.platform_events_merchant_id()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select id from merchants where system_key = 'events' limit 1;
$function$;

revoke all on function public.platform_events_merchant_id() from public, anon, authenticated;
grant execute on function public.platform_events_merchant_id() to service_role;

-- ── 4. Teach the shop-delete flow about it ──────────────────────────────────
-- The trigger already makes this impossible, but an exception surfacing as
-- "Could not delete that shop" would send an admin hunting for a bug. Refuse
-- early, in words that explain WHY.
create or replace function public.admin_delete_shop(
  p_store_id   uuid,
  p_force      boolean default false,
  p_actor_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_store    stores%rowtype;
  v_merchant merchants%rowtype;
  v_preview  jsonb;
  v_live     integer;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  select * into v_store from stores where id = p_store_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_merchant from merchants where id = v_store.merchant_id for update;

  -- M40: platform infrastructure is not a shop, and force does not apply.
  -- There is no confirmation strong enough to make deleting the events
  -- platform from the marketplace screen the right action.
  if v_merchant.system_key is not null then
    raise exception using errcode = 'RR041',
      message = format(
        '"%s" is platform infrastructure (%s), not a merchant shop. It cannot be deleted here — every event, ticket and attendance record hangs off it.',
        v_store.name, v_merchant.system_key);
  end if;

  v_preview := admin_store_deletion_preview(p_store_id);
  v_live := jsonb_array_length(v_preview -> 'liveOrders');

  if v_live > 0 and not coalesce(p_force, false) then
    raise exception using errcode = 'RR040',
      message = format(
        '%s has %s order%s still in progress. Deleting the shop would delete the customer''s copy too. Review them, then confirm again to cancel and delete.',
        v_store.name, v_live, case when v_live = 1 then '' else 's' end);
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'shop.delete', 'store', p_store_id::text,
          jsonb_build_object('forced', coalesce(p_force, false),
                             'note', p_actor_note,
                             'destroyed', v_preview));

  delete from orders where store_id = v_store.id;
  delete from merchants where id = v_merchant.id;

  return jsonb_build_object('ok', true, 'destroyed', v_preview);
end;
$function$;

revoke all on function public.admin_delete_shop(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_delete_shop(uuid, boolean, text) to service_role;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v_id uuid;
begin
  if not exists (select 1 from pg_trigger where tgname = 't_merchants_block_system_delete')
     or not exists (select 1 from pg_trigger where tgname = 't_stores_block_system_delete') then
    raise exception 'M40: a delete guard did not attach — system-owned rows would be deletable.';
  end if;

  -- merchants.owner_id must NOT have been relaxed to make this work.
  if (select is_nullable from information_schema.columns
       where table_schema='public' and table_name='merchants' and column_name='owner_id') <> 'NO' then
    raise exception 'M40: merchants.owner_id became nullable — the marketplace constraint was weakened.';
  end if;

  -- One merchant must still be able to own many stores, or one platform
  -- merchant cannot own every event.
  if exists (select 1 from pg_index i join pg_class c on c.oid = i.indrelid
              where c.relname = 'stores' and i.indisunique
                and pg_get_indexdef(i.indexrelid) like '%(merchant_id)%') then
    raise exception 'M40: stores.merchant_id became unique — one platform merchant can no longer own every event.';
  end if;

  -- Prove the guard actually bites, on a real row, then undo it.
  -- 'suspended' so the probe cannot collide with merchants_one_active_per_owner,
  -- which is unique on owner_id only for pending/approved.
  insert into merchants (display_name, legal_name, owner_id, status, system_key)
  select 'M40 guard probe', 'M40 guard probe', m.owner_id, 'suspended', 'm40-probe'
    from merchants m limit 1
  returning id into v_id;

  if v_id is not null then
    begin
      delete from merchants where id = v_id;
      raise exception 'M40: a system-owned merchant was deletable.';
    exception when sqlstate 'RR041' then
      null; -- refused, as intended
    end;
    update merchants set system_key = null where id = v_id;
    delete from merchants where id = v_id;
  end if;
end;
$$;
