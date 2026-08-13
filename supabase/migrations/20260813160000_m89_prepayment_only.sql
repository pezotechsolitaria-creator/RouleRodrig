-- ── M89 — money arrives BEFORE the goods do ────────────────────────────────
--
-- The owner: "remove the cash option completely so as to remove the risk of
-- unpayment for all services, and force bank transfer and proof of payment."
--
-- Cash on collection is the only place this platform can lose money it has
-- already committed. A kitchen cooks the food, a shop packs the box, a driver
-- rides to the door — and the customer does not come, or comes with nothing.
-- Every other method is settled before anything is given away.
--
-- WHY A SWITCH RATHER THAN DELETING CASH.
-- The provider stays in the enum and in history: there are paid cash orders in
-- this database and every screen that renders them must keep working. Deleting
-- the concept would rewrite the past. So `prepayment_only` is a platform
-- setting, defaulting ON, and it changes what can be OFFERED and CREATED, never
-- what has already happened. It is also one UPDATE to reverse, which matters
-- because this is a commercial decision and Rodrigues runs on cash:
--
--     update marketplace_settings set prepayment_only = false where id = 'main';
--
-- WHY A TRIGGER RATHER THAN AN EDIT TO create_order().
-- create_order() is ~250 lines and would have to be retyped in full to change
-- four of them; M88 is a fresh reminder of what retyping a body from memory
-- costs. A BEFORE INSERT trigger on `payments` is smaller, auditable, and
-- STRICTLY STRONGER: it also covers kitchen_confirm_payment's split-balance row,
-- any merchant or admin path, and anything written later. The rule lives on the
-- table the rule is about.
--
-- THE COST, STATED PLAINLY. On the day this shipped, 8 of 11 stores were
-- cash-only with no bank account on file — 4 of them live. Every one of them
-- stops being able to take an order until they publish bank details. That is
-- the intended trade, and payment_blocked_store_count() below exists so the
-- owner can watch it shrink instead of wondering why nobody is buying.
--
-- Verified after applying, as a real caller rather than from the fact that the
-- migration succeeded (M88's lesson): the trigger raises RR017 on an INSERT of
-- a cash payment, a bank_transfer INSERT still succeeds, an existing cash row
-- is still UPDATE-able so pre-switch orders stay finishable, and
-- store_payment_options() reports cash off / receipt required for all 5 live
-- stores.

alter table public.marketplace_settings
  add column if not exists prepayment_only boolean not null default true;

comment on column public.marketplace_settings.prepayment_only is
  'When true, cash payments cannot be created and no checkout offers cash. History is unaffected. Set false to allow cash on collection again.';

-- One source of truth for the rule, so the three gates cannot drift apart.
-- Defaults to TRUE on a missing settings row: the safe direction here is
-- refusing money-later, not silently allowing it.
create or replace function public.prepayment_only()
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select coalesce((select s.prepayment_only from marketplace_settings s where s.id = 'main'), true);
$function$;

revoke all on function public.prepayment_only() from public;
grant execute on function public.prepayment_only() to anon, authenticated, service_role;

-- ── Gate 1: nothing can create a cash payment ──────────────────────────────
create or replace function public.refuse_cash_when_prepayment_only()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  -- Only NEW cash money is refused. An UPDATE that leaves an existing cash row
  -- as cash (confirming or cancelling one taken before the switch) must still
  -- work, or the old orders become unfinishable.
  if new.provider = 'cash'
     and (tg_op = 'INSERT' or old.provider is distinct from 'cash')
     and prepayment_only() then
    raise exception using errcode = 'RR017',
      message = 'Orders are paid in advance by bank transfer. Cash on collection is not available.';
  end if;
  return new;
end;
$function$;

drop trigger if exists payments_refuse_cash on public.payments;
create trigger payments_refuse_cash
  before insert or update of provider on public.payments
  for each row execute function public.refuse_cash_when_prepayment_only();

-- ── Gate 2: no checkout OFFERS cash ────────────────────────────────────────
--
-- Every checkout on the site reads this one function, which is why the whole
-- change lands here rather than in three separate UIs.
--
-- Three fixes in one:
--   · cash is off while prepayment_only, whatever the store row says
--   · require_receipt is forced ON — "forced bank transfer AND proof of
--     payment" is the owner's instruction, and a transfer with no proof is
--     exactly the unverifiable case this is meant to end
--   · the old `coalesce(sps.accepts_cash, true)` is now `false`. A store with
--     no settings row was being offered as cash-accepting on a guess. A shop
--     that has configured nothing can receive nothing, and saying so out loud
--     is better than a confident wrong answer.
create or replace function public.store_payment_options(p_store_id uuid)
returns table(accepts_cash boolean, accepts_bank_transfer boolean, require_receipt boolean)
language sql stable security definer set search_path to 'public'
as $function$
  select
    case when prepayment_only() then false else coalesce(sps.accepts_cash, false) end,
    coalesce(sps.accepts_bank_transfer, false),
    case when prepayment_only() then true else coalesce(sps.require_receipt, false) end
  from stores s
  left join store_payment_settings sps on sps.store_id = s.id
  where s.id = p_store_id
    and (store_is_visible(s.id) or is_store_staff(s.id) or is_platform_admin());
$function$;

-- ── M89b — the other half of "forced bank transfer AND proof of payment" ───
--
-- store_payment_options() forces require_receipt at CHECKOUT, but the pay
-- screen reads store_bank_details(), which returned the raw column. So the
-- receipt uploader would still have rendered as optional on the one screen
-- where the customer actually uploads it — the switch would have been half on
-- and looked whole. Same rule, same place, so the two cannot disagree.
create or replace function public.store_bank_details(p_store_id uuid)
returns table(bank_name text, account_holder text, account_number text, payment_instructions text, require_receipt boolean)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if p_store_id is null then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;

  -- Staff and platform admins always. A customer only once they have placed an
  -- order there — which is also the only moment the UI needs to show them.
  if not (
    is_store_staff(p_store_id)
    or is_platform_admin()
    or exists (
      select 1 from orders o
      where o.store_id = p_store_id and o.customer_id = auth.uid()
    )
  ) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;

  return query
    select sp.bank_name, sp.account_holder, sp.account_number,
           sp.payment_instructions,
           case when prepayment_only() then true else sp.require_receipt end
    from store_payment_settings sp
    where sp.store_id = p_store_id;
end;
$function$;

-- ── The consequence, counted so it cannot be missed ────────────────────────
--
-- Feeds an attention item exactly like the empty-kitchen count in M87. Reads 4
-- on the day M89 shipped, and falls to 0 as merchants publish accounts.
create or replace function public.payment_blocked_store_count()
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int
    from stores s
    left join store_payment_settings sps on sps.store_id = s.id
   where store_is_visible(s.id)
     and prepayment_only()
     and not coalesce(sps.accepts_bank_transfer, false);
$function$;

revoke all on function public.payment_blocked_store_count() from public;
grant execute on function public.payment_blocked_store_count() to service_role;
