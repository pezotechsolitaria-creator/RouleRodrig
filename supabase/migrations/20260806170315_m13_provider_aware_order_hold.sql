-- M13 — Provider-aware order hold windows.
--
-- ROOT CAUSE
-- `pending_payment` means two different things depending on how the customer
-- pays, and the stock-release sweep only understood one of them.
--
--   bank transfer : a TRANSIENT waiting room. The customer owes money now, and
--                   48h is a fair deadline to send it.
--   cash          : the NORMAL RESTING STATE until handover. The customer owes
--                   nothing yet; they pay the shop at pickup or delivery.
--
-- create_order stamped `auto_release_at = now()+interval '48 hours'` in the
-- VALUES list unconditionally — p_provider was never consulted — and inserted
-- every order as 'pending_payment'. The sweep then cancels and restocks any
-- 'pending_payment' order past its fuse. So a cash customer behaving exactly as
-- intended could have their order destroyed for the crime of not having paid
-- money that was not yet due.
--
-- The sweep is opportunistic (it runs inside create_order, scoped to the
-- variants being bought right now), so this is not a guaranteed timer — it needs
-- merchant inaction past the window AND a later purchase of the same variant.
-- That makes it rare, silent and very hard to diagnose from a support ticket,
-- which is worse than a loud failure, not better.
--
-- WHY NOT THE ALTERNATIVES
--   "cash never expires" — removes stock protection from the DEFAULT payment
--   method. One abandoned cash order would hold a single-stock item forever.
--   Trades a rare silent cancellation for a permanent inventory leak.
--
--   "add a pending_cash_confirmation status" — denormalises payments.provider
--   into orders.status. Every status switch, badge map, filter, timeline index,
--   RLS policy and E2E spec would have to learn a new enum member, for zero new
--   information: the system already knows the provider. Maximum blast radius,
--   no expressiveness gained.
--
-- THIS MIGRATION keeps one status vocabulary and fixes the miscalibration. The
-- fuse now means the same thing for both providers: "nobody has touched this
-- order". For cash only merchant inaction can trigger it, and a shop that has
-- not acknowledged an order in a week is not trading.
--
-- The window lives in marketplace_settings (beside plan_prices) and is read
-- through ONE function, so it is owner-configurable without a deploy and is not
-- duplicated between SQL and the app.

-- ── 1. Configurable windows ──────────────────────────────────────────────────
alter table marketplace_settings
  add column if not exists order_hold_hours jsonb
    not null default '{"cash": 168, "bank_transfer": 48, "manual": 48}'::jsonb;

-- Every value must be a positive integer number of hours. A zero or negative
-- window would cancel orders the instant they are created.
--
-- A CHECK cannot contain a subquery (0A000), so the per-key rule lives in an
-- IMMUTABLE helper. This is write-side validation; order_hold_hours() also
-- clamps on read, so an unsafe window cannot reach create_order even if a value
-- arrives through some future path that bypasses this constraint.
create or replace function public.hold_hours_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) kv
      where jsonb_typeof(kv.value) <> 'number'
         or (kv.value)::text::numeric < 1
         or (kv.value)::text::numeric > 8760
    )
  );
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketplace_settings_hold_hours_sane') then
    alter table marketplace_settings
      add constraint marketplace_settings_hold_hours_sane check (hold_hours_valid(order_hold_hours));
  end if;
end;
$$;

-- ── 2. Single source of truth for the window ─────────────────────────────────
create or replace function public.order_hold_hours(p_provider text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(1, least(8760, coalesce(
    -- configured value for this provider
    (select (s.order_hold_hours ->> coalesce(nullif(btrim(p_provider), ''), 'cash'))::int
       from marketplace_settings s where s.id = 'main'),
    -- provider missing from config: fall back to the built-in default rather
    -- than to NULL, which would drop the fuse entirely and leak stock.
    case when coalesce(nullif(btrim(p_provider), ''), 'cash') = 'cash' then 168 else 48 end
  )));
$$;

revoke all on function public.order_hold_hours(text) from public;
grant execute on function public.order_hold_hours(text) to anon, authenticated, service_role;

comment on function public.order_hold_hours(text) is
  'Hours a new order holds its stock before the sweep may release it. Cash pays at handover so it gets a longer window than bank transfer. Configured in marketplace_settings.order_hold_hours; this is the only place the value is resolved (M13).';

-- ── 3. create_order: use the provider-aware window ───────────────────────────
-- String-replace rather than a full redefinition: create_order is large and has
-- been amended by five prior migrations. Rewriting it wholesale here would
-- silently revert whichever of those is not reproduced. Each replacement is
-- guarded so the migration fails loudly if the expected text is absent.
do $$
declare
  v_src text;
  v_new text;
  v_old_fuse constant text := 'now()+interval ''48 hours''';
  v_new_fuse constant text := 'now() + make_interval(hours => order_hold_hours(p_provider))';
  v_old_body constant text :=
    '''Order ''||o.order_number||'' expired'',''It was not paid in time, so the items were released.'',';
  v_new_body constant text :=
    '''Order ''||o.order_number||'' expired'',''The reservation window passed before the shop confirmed it, so the items were released. You have not been charged.'',';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_order';

  if v_src is null then
    raise exception 'M13: create_order not found';
  end if;
  if position(v_old_fuse in v_src) = 0 then
    raise exception 'M13: expected hardcoded 48h fuse not found in create_order — it may already be provider-aware, or the function changed shape';
  end if;
  if position(v_old_body in v_src) = 0 then
    raise exception 'M13: expected sweep notification copy not found in create_order';
  end if;

  v_new := replace(v_src, v_old_fuse, v_new_fuse);
  v_new := replace(v_new, v_old_body, v_new_body);

  -- The sweep told the customer and left the merchant to discover the missing
  -- order on their own. They are the party who could have prevented it.
  v_new := replace(
    v_new,
    'from orders o where o.id=v_stale.id and o.customer_id is not null;',
    'from orders o where o.id=v_stale.id and o.customer_id is not null;' || E'\n' ||
    '    insert into notifications (recipient_type, recipient_id, order_id, type, title, body, data)' || E'\n' ||
    '    select ''merchant'', ms.user_id, o.id, ''order_status_changed'',' || E'\n' ||
    '           ''Order ''||o.order_number||'' expired'',' || E'\n' ||
    '           ''It was not confirmed in time, so the reservation was released and the stock returned.'',' || E'\n' ||
    '           jsonb_build_object(''new_status'',''cancelled'')' || E'\n' ||
    '    from orders o join stores s on s.id = o.store_id' || E'\n' ||
    '    join merchant_staff ms on ms.merchant_id = s.merchant_id' || E'\n' ||
    '    where o.id = v_stale.id;'
  );

  execute v_new;
end;
$$;

-- ── 4. submit_payment_receipt: refuse cash ───────────────────────────────────
-- It checked auth, ownership, status and the path prefix — never the provider.
-- A cash order could therefore be pushed to awaiting_payment_confirmation,
-- notifying the merchant "The customer says they have paid" for an order where
-- payment is not due until handover. No UI offers this, but the endpoint did.
do $$
declare
  v_src text;
  v_old constant text :=
    '  if v_order.status <> ''pending_payment'' then';
  v_guard constant text :=
    '  if exists (select 1 from payments pm where pm.order_id = p_order_id and pm.provider = ''cash'') then' || E'\n' ||
    '    raise exception using errcode = ''RR009'',' || E'\n' ||
    '      message = ''Cash orders are paid to the shop at handover — there is no receipt to upload.'';' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if v_order.status <> ''pending_payment'' then';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_payment_receipt';

  if v_src is null then
    raise exception 'M13: submit_payment_receipt not found';
  end if;
  if position(v_old in v_src) = 0 then
    raise exception 'M13: expected status check not found in submit_payment_receipt';
  end if;
  if position('provider = ''cash''' in v_src) > 0 then
    raise exception 'M13: submit_payment_receipt already has a cash guard';
  end if;

  execute replace(v_src, v_old, v_guard);
end;
$$;

-- ── 5. Prove it took ─────────────────────────────────────────────────────────
do $$
declare
  v_co text;
  v_sr text;
begin
  select pg_get_functiondef(p.oid) into v_co from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='create_order';
  select pg_get_functiondef(p.oid) into v_sr from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='submit_payment_receipt';

  if position('order_hold_hours(p_provider)' in v_co) = 0 then
    raise exception 'M13 verify: create_order is not using the provider-aware window';
  end if;
  if position('interval ''48 hours''' in v_co) > 0 then
    raise exception 'M13 verify: a hardcoded 48h fuse survives in create_order';
  end if;
  if position('provider = ''cash''' in v_sr) = 0 then
    raise exception 'M13 verify: submit_payment_receipt still accepts cash orders';
  end if;
end;
$$;
