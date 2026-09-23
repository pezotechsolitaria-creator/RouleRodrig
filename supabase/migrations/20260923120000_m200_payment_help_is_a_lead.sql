-- ── M200 · A TAP ON "NEED HELP WITH PAYMENT?" IS COUNTED ───────────────────
--
-- The payment-help card now sits on every screen where somebody pays, and each
-- tap on it opens WhatsApp to the owner. Counting those taps is what turns the
-- card from a support button into a map of where payment confuses people:
-- target_name is the SECTION (checkout, delivery, rental…) and category is the
-- PROBLEM the customer picked (receipt won't upload, amount looks wrong…).
--
-- lead_events admits a kind through THREE gates that must agree (see M58):
--   1. the kind list in app/api/leads/route.ts
--   2. the lead_events_kind_check constraint
--   3. the lead_events_anon_insert RLS policy
-- Miss one and the insert fails at runtime with no error the customer sees —
-- the tap still reaches WhatsApp, the count silently stays at zero. So both
-- database gates are rebuilt here from one list, in one transaction.
--
-- No PII is stored: section and problem are fixed vocabularies, and `ref` is
-- a SHORT reference (RR-XXXXXX) — lib/payment-help.ts safeReference() drops
-- anything token-shaped before it is ever sent.

begin;

alter table public.lead_events drop constraint if exists lead_events_kind_check;
alter table public.lead_events
  add constraint lead_events_kind_check
  check (kind = any (array[
    'stay_eat_do', 'taxi', 'food_concierge', 'tiroule_miss', 'transfer',
    'payment_help'
  ]::text[]));

drop policy if exists lead_events_anon_insert on public.lead_events;
create policy lead_events_anon_insert on public.lead_events
  for insert to anon, authenticated
  with check (kind = any (array[
    'stay_eat_do', 'taxi', 'food_concierge', 'tiroule_miss', 'transfer',
    'payment_help'
  ]::text[]));

-- Proof: both gates admit the new kind AND still admit every old one.
do $assert$
declare v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.lead_events'::regclass and c.conname = 'lead_events_kind_check';
  if v_def is null or position('payment_help' in v_def) = 0 or position('food_concierge' in v_def) = 0 then
    raise exception 'M200: kind check does not carry the full list: %', v_def;
  end if;

  select with_check into v_def from pg_policies
   where schemaname = 'public' and tablename = 'lead_events' and policyname = 'lead_events_anon_insert';
  if v_def is null or position('payment_help' in v_def) = 0 or position('transfer' in v_def) = 0 then
    raise exception 'M200: insert policy does not carry the full list: %', v_def;
  end if;
end
$assert$;

commit;
