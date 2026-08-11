-- M48 — a test store can never reach the public site.
--
-- WHY THIS EXISTS. While verifying M47 I found "Summer Fest Rodrigues" — a
-- fixture I created myself for M33–M47 — listed and purchasable on the live
-- domain: /events showed it and /events/summer-fest-rodrigues returned 200.
-- The only thing standing between a test fixture and a real visitor was my
-- remembering to set status='draft'. That is not a control, it is a habit.
--
-- M33 already added orders.is_test for the same class of problem on the money
-- side. This is the storefront half of that idea, and it belongs in the
-- predicate every public surface already funnels through rather than in each
-- page's own filter — a page-level filter only protects the page that
-- remembers to write it.
--
-- SAFETY: default false, so no existing store changes behaviour. The DO block
-- below proves that by counting visible stores before and after.

alter table stores add column if not exists is_test boolean not null default false;

comment on column stores.is_test is
  'Fixture store. Excluded from every public surface via store_is_visible(). Set this instead of relying on status=draft to hide test data.';

do $$
declare v_before int; v_after int; v_fixture_visible boolean;
begin
  select count(*) into v_before from stores s where store_is_visible(s.id);

  -- The single-line change: an is_test store is never visible, whatever its status.
  create or replace function public.store_is_visible(_store uuid)
  returns boolean language sql stable security definer set search_path to 'public'
  as $fn$
    select exists (
      select 1 from stores s join merchants m on m.id = s.merchant_id
      where s.id = _store and s.status = 'active' and m.status = 'approved'
        and not s.is_test
    );
  $fn$;

  update stores set is_test = true where slug = 'summer-fest-rodrigues';

  select count(*) into v_after from stores s where store_is_visible(s.id);
  if v_after <> v_before then
    raise exception 'M48: visible store count changed % -> %. A real store lost visibility.', v_before, v_after;
  end if;

  -- Prove the guard bites independently of status, so flipping the fixture back
  -- to 'active' for testing cannot republish it by accident.
  update stores set status = 'active' where slug = 'summer-fest-rodrigues';
  select store_is_visible(s.id) into v_fixture_visible from stores s where s.slug = 'summer-fest-rodrigues';
  if v_fixture_visible then
    raise exception 'M48: the fixture is still public with is_test set';
  end if;
  update stores set status = 'draft' where slug = 'summer-fest-rodrigues';

  raise notice 'M48 ok: % real stores visible, unchanged', v_after;
end;
$$;
