-- NOTE ON THE NUMBER: a parallel session shipped its own "m110" (ride/driver
-- tracking) while this was being written, so there are two. The VERSION is
-- unique and is what the migration ledger orders by; the label collision is
-- cosmetic. This file is the one about the order reservation window.
--
-- ── The reservation window becomes a dial the owner can turn (backlog #53) ──
--
-- order_hold_hours() has resolved the window from marketplace_settings since
-- M13, so the value was already configurable in principle — but only by someone
-- willing to write UPDATE ... jsonb by hand against production. In practice
-- that means it was not configurable at all, and the owner could not respond to
-- the thing the window actually governs: how long a customer has to reach a
-- bank.
--
-- Mirrors admin_set_monetization exactly, because that is the established shape
-- for a platform-wide commercial dial: the auth.uid()-null gate for the cookie
-- admin, refusal for a signed-in non-admin, an audit_logs row carrying
-- before/after, and NO grant to anon.

create or replace function public.admin_set_order_hold_hours(
  p_cash integer,
  p_bank_transfer integer,
  p_manual integer,
  p_actor_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_before jsonb; v_after jsonb;
begin
  -- Same two-admin-identities situation as every other /admin write: the
  -- dashboard holds a signed cookie and no Supabase user, so auth.uid() is
  -- null there and the API route's cookie check is the real boundary. A caller
  -- that DOES have a session must be a platform admin.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  -- The same 1..8760 range order_hold_hours() clamps to. Validated here rather
  -- than silently clamped, so an owner who types 0 is told it is not allowed
  -- instead of quietly getting 1.
  if p_cash is null or p_bank_transfer is null or p_manual is null then
    raise exception using errcode='RR005', message='Every window must be set.';
  end if;
  if least(p_cash, p_bank_transfer, p_manual) < 1
     or greatest(p_cash, p_bank_transfer, p_manual) > 8760 then
    raise exception using errcode='RR005',
      message='A reservation window must be between 1 hour and 365 days.';
  end if;

  select s.order_hold_hours into v_before from marketplace_settings s where s.id='main';

  v_after := jsonb_build_object(
    'cash', p_cash, 'bank_transfer', p_bank_transfer, 'manual', p_manual);

  update marketplace_settings set order_hold_hours = v_after where id='main';

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), coalesce(nullif(btrim(p_actor_note),''), 'platform_admin'),
          'order_hold_hours.updated', 'marketplace_settings', 'main',
          jsonb_build_object('before', v_before, 'after', v_after));

  return v_after;
end;
$$;

-- REVOKING FROM public IS NOT ENOUGH, and the first attempt at this migration
-- proved it: Supabase's default privileges attach an EXPLICIT `anon=X/postgres`
-- grant to every new function, which a revoke from PUBLIC leaves untouched. The
-- auth.uid()-null gate above PASSES for anon, so anon must be named here or the
-- function is world-writable.
revoke all on function public.admin_set_order_hold_hours(integer,integer,integer,text)
  from public, anon;
grant execute on function public.admin_set_order_hold_hours(integer,integer,integer,text)
  to authenticated, service_role;

comment on function public.admin_set_order_hold_hours(integer,integer,integer,text) is
  'Sets marketplace_settings.order_hold_hours, the window a new order holds its stock before the sweep may release it. Read back by order_hold_hours() (M13). Audited. Never granted to anon.';

-- Assert the ACL rather than trusting the revoke: a grant that silently did not
-- take is exactly the failure this migration exists to avoid.
do $$
declare v_acl text[];
begin
  select array(select unnest(proacl)::text) into v_acl from pg_proc
   where oid = 'public.admin_set_order_hold_hours(integer,integer,integer,text)'::regprocedure;
  if exists (select 1 from unnest(v_acl) a where a like 'anon=%' or a like '=%') then
    raise exception 'admin_set_order_hold_hours is reachable by anon: %', v_acl;
  end if;
end $$;
