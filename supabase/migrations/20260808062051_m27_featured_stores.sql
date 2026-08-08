-- M27 — Featured shops.
--
-- Launching on ONE subscription tier. starter/standard/premium are currently
-- identical: nothing in the codebase branches on plan (verified — every match is
-- storing, defaulting or listing it in a dropdown), and all three are priced at
-- 0 in marketplace_settings.plan_prices. Rather than invent tier differences
-- nobody has asked for, featuring is a single owner-controlled flag — the lever
-- that actually matters early, when you want to reward a first merchant or push
-- a seasonal shop without promising a package you would then have to maintain.
--
-- featured_until exists so a promotion can EXPIRE on its own. A flag with no end
-- date quietly becomes permanent: every featured shop stays featured until
-- someone remembers to turn it off, and then featuring means nothing.

alter table stores add column if not exists featured boolean not null default false;
alter table stores add column if not exists featured_until timestamptz;

comment on column stores.featured is
  'Owner-controlled promotion. Sorts the shop to the top of the public directory. Not tied to subscription plan — the platform launched on a single tier (M27).';
comment on column stores.featured_until is
  'Optional expiry. NULL means featured indefinitely; a past timestamp means the promotion has lapsed and browse_stores stops honouring it without anyone having to remember.';

-- M5.1 locked stores down to per-column grants, so a new column is unreadable
-- until granted — the same trap that produced "Failed to load orders" (M16).
-- These two are public promotional facts, not secrets.
grant select (featured, featured_until) on stores to anon, authenticated;

-- Patch browse_stores by guarded string-replace rather than redefining it: it
-- carries filtering, search, paging and the schedule LATERAL, and a wholesale
-- rewrite here would risk losing any of that silently.
do $$
declare
  v_src text;
  v_new text;
  v_old_cols constant text := '      s.created_at,';
  v_new_cols constant text := '      s.created_at,' || E'\n' ||
    '      (s.featured and (s.featured_until is null or s.featured_until > now())) as featured,';
  v_old_sort constant text := '          f.accepting_orders desc,';
  v_new_sort constant text := '          f.accepting_orders desc,' || E'\n' ||
    '          f.featured desc,';
  v_old_out  constant text := '               ''acceptingOrders'',   r.accepting_orders,';
  v_new_out  constant text := '               ''featured'',          r.featured,' || E'\n' ||
    '               ''acceptingOrders'',   r.accepting_orders,';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'browse_stores';

  if v_src is null then raise exception 'M27: browse_stores not found'; end if;
  if position(v_old_cols in v_src) = 0 then raise exception 'M27: base column list not found'; end if;
  if position(v_old_sort in v_src) = 0 then raise exception 'M27: ranked sort not found'; end if;
  if position(v_old_out  in v_src) = 0 then raise exception 'M27: json output not found'; end if;

  v_new := replace(v_src,  v_old_cols, v_new_cols);
  v_new := replace(v_new,  v_old_sort, v_new_sort);
  v_new := replace(v_new,  v_old_out,  v_new_out);
  execute v_new;
end;
$$;

-- Owner-only toggle. SECURITY DEFINER with an explicit platform-admin check
-- rather than relying on a grant: featuring is a commercial decision and must
-- never be reachable by a merchant promoting their own shop.
create or replace function public.admin_set_store_featured(
  p_store_id uuid,
  p_featured boolean,
  p_until    timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Called from /admin, which runs on the service role behind a cookie session
  -- (see the two-admin-identities note): auth.uid() is NULL there, and that is
  -- precisely the signal that this is the platform owner rather than a merchant.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  update stores
     set featured       = coalesce(p_featured, false),
         featured_until = case when coalesce(p_featured, false) then p_until else null end,
         updated_at     = now()
   where id = p_store_id;

  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
end;
$$;

revoke all on function public.admin_set_store_featured(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.admin_set_store_featured(uuid, boolean, timestamptz) to service_role;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='browse_stores';
  if position('f.featured desc' in v_def) = 0 then
    raise exception 'M27 verify: featured is not in the directory sort';
  end if;
  -- Guard against a future rewrite silently dropping earlier work.
  if position('store_schedule_at' in v_def) = 0 then
    raise exception 'M27 verify: the schedule LATERAL was lost from browse_stores';
  end if;
  if not has_column_privilege('anon', 'stores', 'featured', 'SELECT') then
    raise exception 'M27 verify: featured is not readable by anon';
  end if;
end;
$$;
