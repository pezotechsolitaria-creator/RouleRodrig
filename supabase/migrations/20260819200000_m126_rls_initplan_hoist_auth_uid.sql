-- ── auth.uid() ONCE PER QUERY, NOT ONCE PER ROW (M126) ─────────────────────
--
-- Supabase's advisor flagged 28 policies with auth_rls_initplan. In each, a
-- bare auth.uid() (or auth.jwt()) sits inside the policy expression, so
-- Postgres re-evaluates it FOR EVERY ROW it tests. On a table with ten rows
-- nobody notices. On orders, order_items or payments under real traffic it
-- multiplies the work by the row count, and slow queries hold connections
-- open — the resource that runs out first on this plan.
--
-- The fix is Supabase's own: wrap the call in a scalar subquery so the planner
-- hoists it into an InitPlan and evaluates it exactly once. auth.uid() and
-- auth.jwt() are STABLE and take no arguments, so the value is identical; only
-- the number of evaluations changes.
--
-- ── WHY THIS REWRITES FROM pg_policies RATHER THAN LISTING 28 STATEMENTS ────
--
-- Because the alternative is transcribing 28 security expressions by hand, and
-- a typo in one of them is a data breach rather than a bug. This reads each
-- policy's CURRENT text out of the catalogue, applies one regex, and writes it
-- back. The expression cannot drift from what is actually deployed, and the
-- transformation is mechanically identical for every policy.
--
-- The same rewrite was independently derived twice beforehand — once by a
-- deterministic transformation of the live text, once by a fan-out of agents
-- each attacked by three skeptics — and both reduce, when the wrap is
-- reversed, to text byte-identical to the original.
--
-- Proof after the fact, not just before: the md5 of every policy expression
-- with the wrap reversed matched the md5 captured before this ran, and so did
-- the md5 of every (command, roles, permissive) triple.
--
-- ── WHAT IS DELIBERATELY NOT TOUCHED ───────────────────────────────────────
--
-- is_store_staff(store_id) and is_merchant_staff(merchant_id) take an argument
-- drawn from the row, so they genuinely must run per row.
--
-- is_platform_admin() does NOT — it is STABLE, takes no arguments, and its body
-- is a lookup on platform_admins. It appears in 17 of these policies and in 7
-- more the advisor never flagged (their text contains no literal "auth."), and
-- being a table lookup it costs MORE per row than auth.uid() does. Wrapping it
-- is a real further win and a SEPARATE migration, because it deserves its own
-- review rather than being smuggled in behind a mechanical change.
--
-- Three more policies live on storage.objects (order_receipts_customer_insert,
-- order_receipts_customer_update, order_receipts_read) with the same bare
-- call. The advisor does not report them because they are outside `public`.
-- They are owned by supabase_storage_admin, so they need a migration that runs
-- as a role able to alter them — also separate, deliberately.
--
-- Clause shape is preserved exactly. merchants_update has USING and no WITH
-- CHECK; Postgres reuses USING as the check when WITH CHECK is omitted, so
-- adding one would be a silent behaviour change. Each branch below only ever
-- re-emits the clauses the policy already had.
--
-- ALTER, never DROP and CREATE: dropping a policy leaves a window with no
-- protection and can lose the role list.

do $$
declare
  r record;
  new_qual text;
  new_check text;
  n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ 'auth\.(uid|jwt|role)\(\)'
         or coalesce(with_check, '') ~ 'auth\.(uid|jwt|role)\(\)')
     order by tablename, policyname
  loop
    -- One substitution, applied to the catalogue's own rendering of the
    -- expression. Nothing else in the text is touched.
    new_qual  := regexp_replace(r.qual,       'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    new_check := regexp_replace(r.with_check, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');

    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
                     r.policyname, r.schemaname, r.tablename, new_qual, new_check);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
                     r.policyname, r.schemaname, r.tablename, new_qual);
    elsif r.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)',
                     r.policyname, r.schemaname, r.tablename, new_check);
    end if;
    n := n + 1;
  end loop;

  raise notice 'rewrote % policies', n;
  -- Idempotent by construction: re-running finds nothing left to rewrite, so
  -- this guard only applies on the first pass.
  if n <> 28 and n <> 0 then
    raise exception 'expected 28 policies to rewrite, found %', n;
  end if;
end $$;

-- ── PROVE IT, RATHER THAN ASSUME IT ────────────────────────────────────────
--
-- If any policy still holds a bare call, the rewrite silently did not take and
-- the advisor warning would come back. Fail loudly here instead.
do $$
declare leftover text;
begin
  select string_agg(tablename || '.' || policyname, ', ')
    into leftover
    from pg_policies
   where schemaname = 'public'
     and (
       regexp_replace(coalesce(qual, ''), '\( SELECT auth\.(uid|jwt|role)\(\) AS \w+\)', '', 'g') ~ 'auth\.(uid|jwt|role)\(\)'
       or
       regexp_replace(coalesce(with_check, ''), '\( SELECT auth\.(uid|jwt|role)\(\) AS \w+\)', '', 'g') ~ 'auth\.(uid|jwt|role)\(\)'
     );
  if leftover is not null then
    raise exception 'policies still evaluating auth.* per row: %', leftover;
  end if;
end $$;
