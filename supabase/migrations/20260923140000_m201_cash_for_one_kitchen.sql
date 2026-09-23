-- ── M201 · CASH FOR ONE KITCHEN, NOT FOR THE PLATFORM ─────────────────────
--
-- M89 turned cash off everywhere, on the owner's own instruction: "remove the
-- cash option completely so as to remove the risk of unpayment for all
-- services". On 23 Sept 2026 the owner reversed that for ONE store: "allow
-- cash for chez banane".
--
-- Chez Banane had cash switched on in its own settings all along, and no bank
-- account; the platform switch masked the cash, so it could take no order at
-- all, at any hour — the only kitchen on /food, with nothing buyable.
--
-- ── WHY AN EXEMPTION AND NOT THE SWITCH ───────────────────────────────────
-- Flipping marketplace_settings.prepayment_only would open cash for EVERY shop
-- that ticks "accept cash" — today and every future shop. The owner asked for
-- one kitchen. So the switch stays on and a store can be exempted from it.
--
-- ── WHY A TABLE NOBODY CAN READ ───────────────────────────────────────────
-- The exemption is the OWNER'S decision, not a merchant's. A column on stores
-- or store_payment_settings would sit in rows a merchant can edit, and a shop
-- could grant itself cash. So it lives in its own table with RLS on, no
-- policies, and no grants: only the SECURITY DEFINER functions below read it,
-- and only an admin (or SQL) can write it.
--
-- ── ONE QUESTION, EVERYWHERE ──────────────────────────────────────────────
-- prepayment_only_for(store) = the platform switch, unless that store is
-- exempt. Every reader that asked the global prepayment_only() about a
-- SPECIFIC store now asks this instead — store_payment_options (what checkout
-- offers), the payments trigger (what can actually be written), the bank
-- details' receipt rule, and the blocked-shops count. They are rewritten by
-- anchored substitution: read the live definition, replace the exact call,
-- refuse if the count is not what was measured, so a body changed since
-- cannot be clobbered. The trigger falls back to the platform answer when a
-- payment has no order, so nothing is loosened by accident.
--
-- REVERSE for this kitchen:
--   delete from store_cash_exemptions where store_id = 'd522e765-78c3-43da-ab4e-db2b7977acaa';

begin;

create table if not exists public.store_cash_exemptions (
  store_id   uuid primary key references public.stores(id) on delete cascade,
  reason     text not null check (btrim(reason) <> ''),
  granted_at timestamptz not null default now(),
  granted_by text not null default 'owner'
);
alter table public.store_cash_exemptions enable row level security;
revoke all on table public.store_cash_exemptions from public, anon, authenticated;

create or replace function public.prepayment_only_for(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  -- A null store (a payment with no order) gets the PLATFORM answer: the
  -- exemption can only ever loosen the rule for a store it names.
  select prepayment_only()
     and not exists (select 1 from store_cash_exemptions e where e.store_id = p_store_id);
$fn$;
revoke all on function public.prepayment_only_for(uuid) from public;
grant execute on function public.prepayment_only_for(uuid) to anon, authenticated;

-- ── Anchored rewrites: every per-store reader asks the per-store question ──
--
-- Each substitution is anchored on the CODE AROUND the call, never on the bare
-- "prepayment_only()". pg_get_functiondef() includes the function's own header,
-- and the trigger is named refuse_cash_when_prepayment_only() — so a bare
-- replace also matched the NAME and would have renamed the function to
-- garbage while leaving the real check untouched. A rehearsal of this very
-- migration (run, then rolled back on purpose) caught it: the count guard saw
-- 2 matches where 1 was expected, and refused.
do $rw$
declare
  r      record;
  v_src  text;
  v_new  text;
  v_n    int;
begin
  for r in
    select * from (values
      ('store_payment_options',
         'case when prepayment_only() then',
         'case when prepayment_only_for(s.id) then', 2),
      ('store_bank_details',
         'case when prepayment_only() then',
         'case when prepayment_only_for(p_store_id) then', 1),
      -- These two break the line straight after the call ("and prepayment_only()"
      -- then a newline, then "and not ..."), so the anchor stops at the paren.
      ('payment_blocked_stores',
         'and prepayment_only()',
         'and prepayment_only_for(s.id)', 1),
      ('payment_blocked_store_count',
         'and prepayment_only()',
         'and prepayment_only_for(s.id)', 1),
      ('refuse_cash_when_prepayment_only',
         'if not prepayment_only() then',
         'if not prepayment_only_for((select o.store_id from orders o where o.id = new.order_id)) then', 1)
    ) as t(fn, needle, repl, expected)
  loop
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if v_src is null then
      raise exception 'M201: % not found', r.fn;
    end if;

    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    if v_n = 0 and position(r.repl in v_src) > 0 then
      raise notice 'M201: % already rewritten', r.fn;
      continue;
    end if;
    if v_n <> r.expected then
      raise exception 'M201: % has % × "%", expected % — shape changed, refusing',
        r.fn, v_n, r.needle, r.expected;
    end if;

    v_new := replace(v_src, r.needle, r.repl);
    execute v_new;
  end loop;
end
$rw$;

-- ── The owner's decision, recorded with its reason ─────────────────────────
insert into public.store_cash_exemptions (store_id, reason)
values ('d522e765-78c3-43da-ab4e-db2b7977acaa',
        'Owner, 23 Sept 2026: "allow cash for chez banane". Kitchen has no bank account; cash on collection.')
on conflict (store_id) do nothing;

-- ── Proof ──────────────────────────────────────────────────────────────────
do $assert$
declare v_cash boolean; v_other boolean;
begin
  -- The switch is still on: nothing else was loosened.
  if not prepayment_only() then
    raise exception 'M201: the platform switch is off — this migration must not change it';
  end if;

  -- Chez Banane now offers cash at checkout.
  select accepts_cash into v_cash from store_payment_options('d522e765-78c3-43da-ab4e-db2b7977acaa');
  if v_cash is distinct from true then
    raise exception 'M201: Chez Banane still offers no cash (got %)', v_cash;
  end if;

  -- A store that is NOT exempt is still bound by the platform rule. Asked of
  -- prepayment_only_for directly: store_payment_options answers only for
  -- VISIBLE stores, and the only visible store is the exempt one — so reading
  -- a hidden shop through it would return no row and prove nothing.
  -- M4 Test Shop (accepts_cash = true in its own settings, not exempt):
  v_other := prepayment_only_for('5a92bdf0-17c8-4181-886b-aa7cd5d1c353');
  if v_other is distinct from true then
    raise exception 'M201: a non-exempt store escaped the platform rule (got %)', v_other;
  end if;
  if prepayment_only_for('d522e765-78c3-43da-ab4e-db2b7977acaa') is distinct from false then
    raise exception 'M201: Chez Banane is not exempt';
  end if;

  if prepayment_only_for(null) is distinct from true then
    raise exception 'M201: a payment with no store is no longer bound by the platform rule';
  end if;

  if has_table_privilege('anon', 'public.store_cash_exemptions', 'select')
     or has_table_privilege('authenticated', 'public.store_cash_exemptions', 'insert') then
    raise exception 'M201: store_cash_exemptions is readable or writable by a client role';
  end if;

  -- Every reader now asks the per-store question. Checked on the anchored
  -- phrases, not on a bare "prepayment_only()": the trigger's own NAME contains
  -- that text, so a bare check could never pass.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('store_payment_options','store_bank_details','payment_blocked_stores','payment_blocked_store_count','refuse_cash_when_prepayment_only')
         and (position('when prepayment_only() then' in pg_get_functiondef(p.oid)) > 0
           or position('and prepayment_only()' in pg_get_functiondef(p.oid)) > 0
           or position('if not prepayment_only() then' in pg_get_functiondef(p.oid)) > 0)) <> 0 then
    raise exception 'M201: a per-store reader still asks the global question';
  end if;
  -- And the trigger still has its real name.
  if not exists (select 1 from pg_proc where proname = 'refuse_cash_when_prepayment_only') then
    raise exception 'M201: the payments trigger function was renamed';
  end if;
end
$assert$;

commit;
