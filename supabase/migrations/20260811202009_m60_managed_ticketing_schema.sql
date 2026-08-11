-- M60 — Managed Ticketing, as a commercial agreement that never touches ticket money.
--
-- ── THE ONE ARCHITECTURAL RULE ──────────────────────────────────────────────
-- The service fee is what the ORGANISER owes ROULÉ RODRIGUES. Ticket money is
-- what the BUYER owes the ORGANISER, and it never passes through this platform
-- at all. They are two different debts between three different parties, and the
-- only safe way to keep them from contaminating each other is for the fee to
-- live somewhere ticket revenue cannot reach.
--
-- So: a separate table, with NO foreign key into orders, order_items,
-- order_financials or payments, and nothing in the revenue path that reads it.
-- The separation is structural rather than disciplined — there is no code path
-- where a fee could be added to a ticket price, because no revenue query knows
-- this table exists. A refund therefore cannot turn a fee into revenue: the
-- refund touches orders, and the fee is not there.
--
-- ── WHY 'not_requested' IS NOT A ROW ────────────────────────────────────────
-- The state list includes not_requested. That state is the ABSENCE of an
-- agreement, and storing it as a row would create a second way to represent
-- "nothing has happened" — one of which could then drift (a not_requested row
-- carrying a fee somebody typed). The read functions synthesise 'not_requested'
-- when no row exists, so the API still speaks the full vocabulary while the
-- table has exactly one representation of each fact.
--
-- ── NO PRICING IS INVENTED HERE ─────────────────────────────────────────────
-- fee_type, fee_amount and what the service includes are all NULL until the
-- platform sets them per agreement. There is no default fee, no default rate,
-- and no default service description anywhere in this migration.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'managed_ticketing_status') then
    create type managed_ticketing_status as enum
      ('requested', 'approved', 'active', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'managed_fee_type') then
    create type managed_fee_type as enum ('fixed', 'percentage');
  end if;
  if not exists (select 1 from pg_type where typname = 'managed_payment_status') then
    create type managed_payment_status as enum ('unpaid', 'invoiced', 'paid', 'waived');
  end if;
end;
$$;

create table if not exists managed_ticketing_agreements (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  status          managed_ticketing_status not null default 'requested',

  -- ── Platform-controlled. An organiser can never write these. ──────────────
  fee_type        managed_fee_type,
  /** Minor units, for fee_type='fixed'. Integer only — no float ever touches money. */
  fee_amount_cents int,
  /** For fee_type='percentage', scaled by 1000 so 10% = 10000. Same convention
   *  as the marketplace commission rate, deliberately: one money-maths idiom in
   *  this codebase, not two. */
  fee_rate_e5     int,
  fee_currency    text not null default 'MUR',
  /** Free text: what the business decides the service includes. Not enumerated,
   *  because the commercial package is the owner's to define and change. */
  service_includes text,
  fee_set_by      uuid references auth.users(id) on delete set null,
  fee_set_at      timestamptz,

  -- ── Organiser-controlled ─────────────────────────────────────────────────
  requested_by    uuid references auth.users(id) on delete set null,
  requested_at    timestamptz not null default now(),
  organiser_note  text,
  accepted_by     uuid references auth.users(id) on delete set null,
  accepted_at     timestamptz,

  -- ── Platform lifecycle ───────────────────────────────────────────────────
  approved_by     uuid references auth.users(id) on delete set null,
  approved_at     timestamptz,
  activated_at    timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users(id) on delete set null,
  cancelled_reason text,

  -- ── Settlement of the FEE. Nothing here is ticket money. ─────────────────
  payment_status  managed_payment_status not null default 'unpaid',
  payment_status_at timestamptz,
  payment_note    text,
  /** Frozen at invoicing. A percentage fee computed live would keep moving as
   *  refunds land, so the invoice would disagree with itself week to week. Once
   *  invoiced, the number is a fact and later ticket refunds do not alter it. */
  invoiced_basis_cents int,
  invoiced_fee_cents   int,
  invoiced_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A fee is either fixed or a percentage, never both, never a half-set mixture
  -- that a display would have to guess about.
  constraint managed_fee_shape check (
    (fee_type is null and fee_amount_cents is null and fee_rate_e5 is null)
    or (fee_type = 'fixed'      and fee_amount_cents is not null and fee_amount_cents >= 0 and fee_rate_e5 is null)
    or (fee_type = 'percentage' and fee_rate_e5 is not null and fee_rate_e5 between 0 and 50000 and fee_amount_cents is null)
  ),
  constraint managed_cancel_has_reason check (status <> 'cancelled' or cancelled_reason is not null),
  -- An agreement cannot be live without a fee agreed by both sides.
  constraint managed_active_has_fee check (
    status not in ('active', 'completed') or (fee_type is not null and accepted_at is not null)
  ),
  constraint managed_invoiced_amounts check (
    (invoiced_fee_cents is null and invoiced_at is null)
    or (invoiced_fee_cents is not null and invoiced_fee_cents >= 0 and invoiced_at is not null)
  )
);

-- One live conversation per event. History is kept — terminal rows stay — but
-- two open requests for the same event would make "the fee" ambiguous.
create unique index if not exists managed_ticketing_one_open_per_store
  on managed_ticketing_agreements (store_id)
  where status in ('requested', 'approved', 'active');

create index if not exists managed_ticketing_store_idx
  on managed_ticketing_agreements (store_id, status);

comment on table managed_ticketing_agreements is
  'Roulé Rodrigues managed-ticketing service fee: what the ORGANISER owes the PLATFORM. Deliberately has no FK into orders/order_financials — ticket money is a separate debt between buyer and organiser and must never mix with this.';

-- ── Audit trail ─────────────────────────────────────────────────────────────
-- Append-only. Every state and fee change, who did it, and when. A fee is a
-- commercial claim on somebody, so "who set this to Rs X and when" must be
-- answerable months later without reading application logs.
create table if not exists managed_ticketing_events (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references managed_ticketing_agreements(id) on delete cascade,
  at           timestamptz not null default now(),
  actor_id     uuid references auth.users(id) on delete set null,
  /** 'organizer' | 'platform_admin' | 'system' — who, in role terms. */
  actor_role   text not null,
  action       text not null,
  from_status  managed_ticketing_status,
  to_status    managed_ticketing_status,
  detail       jsonb not null default '{}'::jsonb
);

create index if not exists managed_ticketing_events_agreement_idx
  on managed_ticketing_events (agreement_id, at desc);

-- NOTE: the trigger this migration originally installed fired BEFORE INSERT and
-- so wrote an audit row for an agreement that did not exist yet, violating the
-- foreign key. M60d splits it into BEFORE UPDATE (stamp updated_at) and AFTER
-- INSERT OR UPDATE (write history). The corrected version lives there.

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- READ for the organiser of that event and for platform admins. NO write policy
-- of any kind: every mutation goes through a SECURITY DEFINER RPC, which is how
-- platform-controlled columns stay platform-controlled. Column REVOKEs would
-- not help here — under a table-level grant they are a no-op, and RLS cannot
-- restrict columns at all.
alter table managed_ticketing_agreements enable row level security;
alter table managed_ticketing_events     enable row level security;

drop policy if exists managed_ticketing_read on managed_ticketing_agreements;
create policy managed_ticketing_read on managed_ticketing_agreements
  for select to authenticated
  using (can_manage_event(store_id));

drop policy if exists managed_ticketing_events_read on managed_ticketing_events;
create policy managed_ticketing_events_read on managed_ticketing_events
  for select to authenticated
  using (exists (
    select 1 from managed_ticketing_agreements g
     where g.id = managed_ticketing_events.agreement_id
       and can_manage_event(g.store_id)));

revoke all on managed_ticketing_agreements from anon, authenticated;
revoke all on managed_ticketing_events     from anon, authenticated;
grant select on managed_ticketing_agreements to authenticated;
grant select on managed_ticketing_events     to authenticated;
grant all    on managed_ticketing_agreements to service_role;
grant all    on managed_ticketing_events     to service_role;

do $$
begin
  -- The separation rule, asserted rather than assumed: no FK from this table
  -- into anything that carries ticket money.
  if exists (
    select 1 from pg_constraint c
     where c.conrelid = 'managed_ticketing_agreements'::regclass
       and c.contype = 'f'
       and c.confrelid in ('orders'::regclass, 'order_items'::regclass, 'payments'::regclass)
  ) then
    raise exception 'M60: the fee table references ticket money — the separation is broken.';
  end if;
  if not exists (select 1 from pg_policies where tablename='managed_ticketing_agreements' and cmd='SELECT') then
    raise exception 'M60: no read policy.'; end if;
  if exists (select 1 from pg_policies where tablename='managed_ticketing_agreements' and cmd <> 'SELECT') then
    raise exception 'M60: a write policy exists — writes must be RPC-only.'; end if;
end;
$$;
