-- ═══════════════════════════════════════════════════════════════════════════
-- M224b · A PLAN THE OWNER TAKES OFF SALE STAYS OFF
-- ═══════════════════════════════════════════════════════════════════════════
--
-- M224 lets lib/esim/curate.ts stock every destination automatically, which
-- means switching plans ON. Without this flag, a plan the owner deliberately
-- switched off would be switched back on by the next catalogue sync.

alter table public.esim_plans add column if not exists hidden boolean not null default false;
comment on column public.esim_plans.hidden is
  'Set when the owner switches a plan off in /admin/esim. lib/esim/curate.ts never re-activates a hidden plan.';
