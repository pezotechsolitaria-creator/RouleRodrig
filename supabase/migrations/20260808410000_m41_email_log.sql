-- M41 — The email delivery log. The prerequisite for everything else.
--
-- ── WHY THIS TABLE EXISTS ───────────────────────────────────────────────────
-- Before this migration the platform could not answer "was this customer
-- emailed?" — not for support, not for reconciliation, not for a quota
-- counter. lib/email.ts send() returned a boolean that most callers discarded,
-- provider message IDs were returned by both Resend and Brevo and thrown away
-- unread, and failures went to console.error where Vercel retains them for
-- about a day.
--
-- Two things depend on this table, and neither can be built without it:
--
--   1. QUOTA AWARENESS. Provider usage is DERIVED from this log
--      (count where provider = ? and sent_at >= window_start), never stored as
--      a mutable counter. A counter column drifts the first time a process
--      dies between the send and the increment; a derived count cannot.
--
--   2. IDEMPOTENCY. `idempotency_key` is UNIQUE, so exactly-once is enforced
--      by Postgres rather than by application code that checks-then-inserts
--      (which races under concurrency — two requests both read "not sent" and
--      both send). The insert IS the lock.
--
-- ── WHAT IS DELIBERATELY NOT STORED ─────────────────────────────────────────
-- No HTML body, no rendered text. A support question is answered by "which
-- email, to whom, when, did it land" — never by replaying the content. Storing
-- bodies would turn this table into a copy of every booking, address and order
-- the platform has ever emailed, with none of the access controls those tables
-- have earned. Subject is kept because it is the one human-readable handle
-- that makes a log row identifiable, and it contains no more than the email
-- type already implies.
--
-- ── NULLABLE idempotency_key ────────────────────────────────────────────────
-- Postgres permits many NULLs in a unique index, which is exactly the
-- behaviour wanted: a send with no natural once-only identity (an admin test
-- send, an ad-hoc owner alert) logs freely, while a send that HAS one can only
-- ever land once.

create table if not exists public.email_log (
  id                   uuid primary key default gen_random_uuid(),

  -- The routing key. A stable identifier like 'marketplace_order_confirmation'
  -- — text rather than an enum so adding a ticketing email type later is a
  -- code change, not a migration that must be coordinated with a deploy.
  email_type           text not null,
  -- Denormalised from the type registry so a dashboard can group by business
  -- domain ("what is consuming Brevo today?") without the reader needing the
  -- application's type table.
  category             text not null,
  priority             text not null default 'normal',

  recipient            text not null,
  subject              text,

  -- NULL until a provider has actually been chosen: a send suppressed by an
  -- exhausted quota never reaches one, and recording a provider that did no
  -- work would corrupt the very counts this table exists to produce.
  provider             text,

  -- What the email is ABOUT, for support lookup: ('order', <uuid>),
  -- ('booking', <uuid>), ('event', <uuid>). Deliberately loose text rather
  -- than a set of nullable FKs — this table must be able to log an email about
  -- a row that was later deleted without either cascading the log away or
  -- blocking the delete.
  related_type         text,
  related_id           text,

  idempotency_key      text unique,
  -- Returned by Resend ('id') and Brevo ('messageId'). The only handle that
  -- can answer "did the provider really accept this?" when a network error
  -- leaves acceptance unknown, so it is captured even on ambiguous outcomes.
  provider_message_id  text,

  --  queued     — row claimed, send in flight
  --  sent       — provider accepted
  --  failed     — provider rejected, or transport failed BEFORE acceptance
  --  unknown    — request died mid-flight; acceptance genuinely unknown.
  --               NEVER auto-retried: a blind retry here is the one action that
  --               can duplicate a real delivery.
  --  suppressed — deliberately not sent (no quota, no provider configured).
  --               Recorded, never silently dropped.
  status               text not null default 'queued',
  attempt_count        integer not null default 0,
  failure_reason       text,

  created_at           timestamptz not null default now(),
  sent_at              timestamptz,
  failed_at            timestamptz,

  constraint email_log_status_check check (
    status in ('queued', 'sent', 'failed', 'unknown', 'suppressed')
  ),
  constraint email_log_priority_check check (
    priority in ('critical', 'high', 'normal', 'low')
  )
);

-- The quota query. Every send consults it, so it is the one index that must
-- exist: partial on sent_at is not null because usage only ever counts
-- accepted sends, which keeps the index off queued/failed/suppressed rows.
create index if not exists email_log_provider_sent_at_idx
  on public.email_log (provider, sent_at desc)
  where sent_at is not null;

-- "What is eating today's quota?" — the actionable dashboard breakdown.
create index if not exists email_log_type_sent_at_idx
  on public.email_log (email_type, sent_at desc)
  where sent_at is not null;

-- Support lookup: "show me every email about order X".
create index if not exists email_log_related_idx
  on public.email_log (related_type, related_id)
  where related_type is not null;

-- The recent-activity table and failure panel, newest first.
create index if not exists email_log_created_at_idx
  on public.email_log (created_at desc);

-- Reconciliation sweep: rows left mid-flight, and failures worth surfacing.
create index if not exists email_log_unresolved_idx
  on public.email_log (status, created_at desc)
  where status in ('queued', 'unknown', 'failed');

alter table public.email_log enable row level security;

-- Service-role only, same posture as app_secrets / partners /
-- site_content_history (M22). Written by the email router, read by admin
-- routes through getPrivileged(). RLS enabled with NO policies denies anon and
-- authenticated outright — that is the intent, not a missing policy. Stated in
-- a comment so a future maintainer resolves the linter warning by reading this
-- rather than by adding a policy that exposes every customer address the
-- platform has ever emailed.
comment on table public.email_log is
  'Service-role only by design. Written by the central email router (lib/email/send.ts), read by admin routes via getPrivileged(); RLS enabled with no policies denies all client roles (M41). Provider usage is DERIVED from this table, never stored as a counter.';

comment on column public.email_log.idempotency_key is
  'Stable per-event key, e.g. marketplace_order_confirmation:<order_id>. UNIQUE, so Postgres enforces exactly-once and the application never has to check-then-insert. NULL is allowed and unconstrained for sends with no natural once-only identity.';

comment on column public.email_log.status is
  'queued | sent | failed | unknown | suppressed. "unknown" means provider acceptance could not be determined and the send must NOT be automatically retried — see lib/email/send.ts.';
