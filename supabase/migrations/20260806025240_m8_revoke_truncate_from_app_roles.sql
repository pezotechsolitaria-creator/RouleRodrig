-- TRUNCATE is withdrawn from anon and authenticated on every table in public.
--
-- Supabase's default grants hand anon and authenticated the full verb set on
-- every table, TRUNCATE included — 36 tables each. TRUNCATE is the one verb that
-- row-level security does NOT constrain: RLS filters rows, and TRUNCATE does not
-- operate on rows. So on every one of those tables, RLS was not actually the
-- last line of defence. Verified at the SQL level as `authenticated`: a TRUNCATE
-- of a real table succeeded, while the equivalent DELETE was correctly reduced
-- to zero rows by RLS.
--
-- Scope of the real risk, stated honestly: PostgREST — the only thing the
-- publishable key can reach — issues SELECT/INSERT/UPDATE/DELETE and RPC calls,
-- and has no way to emit TRUNCATE. So this is a defence-in-depth gap rather than
-- a live remote exploit. It matters because it is the exact posture M7 already
-- rejected for `orders` and `store_hours`, and because any future SECURITY
-- DEFINER function that builds dynamic SQL would turn it into a live one.
--
-- Nothing in the application truncates anything: table resets happen through
-- migrations, which run as the owner. Revoking is therefore behaviour-neutral.
--
-- DELETE is deliberately left alone. It IS row-level-security controlled, every
-- probe confirmed it returns zero rows for a customer, and revoking it wholesale
-- would risk breaking legitimate owner-scoped deletes.
do $do$
declare r record; n int := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke truncate on public.%I from anon, authenticated', r.relname);
    n := n + 1;
  end loop;
  raise notice 'TRUNCATE revoked on % tables', n;
end
$do$;

-- Future tables must not silently inherit it again. Supabase's default
-- privileges are what handed it out in the first place.
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
