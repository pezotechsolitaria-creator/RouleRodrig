-- ── M240 (1/2): THE RESERVATION ENGINE — TABLES ──────────────────────────────
--
-- One request-to-book engine any product can attach to: experiences first
-- (Île aux Cocos), then vehicles and stays — the same table, no fork per type.
-- Product-specific fields live in `slot` and `product_snapshot` json.
--
-- Why a new table and not place_bookings/bookings: both carry ONE status
-- column that mixes the lifecycle with money ("approved" = held and unpaid),
-- and the engine's first rule is that those are two axes. Existing rows stay
-- where they are and keep their flows; new requests come here.
--
--   reservation_status  draft → requested → under_review → confirmed → ready
--                       → in_progress → completed; needs_information,
--                       declined, expired, cancelled.
--   payment_status      not_required | unpaid | payment_pending |
--                       partially_paid | paid | pay_in_person | failed |
--                       refunded | waived.
-- "confirmed" never means paid. Transitions are enforced in SQL (M240 2/2)
-- and mirrored in lib/reservations/status.ts; a test keeps them identical.
--
-- Money: WHOLE RUPEES, every money column ends in `_mur`.
-- Secrets: only the SHA-256 of the guest's access token is stored.
-- Access: RLS on, NO grants. Guests reach rows only through SECURITY DEFINER
-- functions that take their token; the admin through the service role.

create table if not exists public.reservations (
  id                    uuid primary key default gen_random_uuid(),
  booking_reference     text not null unique check (booking_reference ~ '^RR-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$'),
  access_token_hash     text not null unique check (access_token_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key       text not null unique check (length(idempotency_key) between 8 and 100),

  customer_name         text not null check (length(btrim(customer_name)) between 1 and 120),
  customer_phone        text not null check (length(customer_phone) between 5 and 40),
  customer_email        text check (customer_email is null or length(customer_email) <= 254),
  customer_locale       text not null default 'en' check (customer_locale in ('en', 'fr', 'cr')),
  customer_id           uuid references auth.users(id) on delete set null,

  product_id            text not null check (length(product_id) between 1 and 120),
  product_type          text not null check (product_type in ('scooter', 'car', 'stay', 'experience', 'activity', 'boat', 'other')),
  -- title, provider, image, unit_price_mur, per_person, child_price_mur,
  -- baby_price_mur, currency, meeting_point, capacity — frozen at request time.
  product_snapshot      jsonb not null,
  -- date, start_time, end_time, units, pickup, notes.
  slot                  jsonb not null,
  party                 jsonb not null default '{"adults": 1, "children": 0, "babies": 0}'::jsonb,
  -- Capacity units this reservation consumes: people for an experience,
  -- 1 for a vehicle or a room.
  seats                 int not null default 1 check (seats between 1 and 500),
  slot_date             date not null,
  slot_end_date         date check (slot_end_date is null or slot_end_date >= slot_date),
  -- What capacity is counted per: a date, or a date + time ("2026-10-05@09:00").
  slot_key              text not null check (length(slot_key) between 10 and 40),

  amount_mur            int check (amount_mur is null or amount_mur >= 0),
  deposit_due_mur       int check (deposit_due_mur is null or deposit_due_mur >= 0),
  balance_due_mur       int check (balance_due_mur is null or balance_due_mur >= 0),
  amount_paid_mur       int not null default 0 check (amount_paid_mur >= 0),

  reservation_status    text not null default 'requested' check (reservation_status in
                          ('draft', 'requested', 'under_review', 'needs_information', 'confirmed', 'ready',
                           'in_progress', 'completed', 'declined', 'expired', 'cancelled')),
  payment_status        text not null default 'unpaid' check (payment_status in
                          ('not_required', 'unpaid', 'payment_pending', 'partially_paid', 'paid',
                           'pay_in_person', 'failed', 'refunded', 'waived')),
  payment_method        text check (payment_method is null or payment_method in ('mcb_juice', 'paypal', 'bank_transfer', 'cash_in_person', 'card')),
  -- The guest tapped "I've paid": a REPORT for the admin to check, never paid.
  payment_reported_at   timestamptz,
  payment_reported_method text check (payment_reported_method is null or payment_reported_method in ('mcb_juice', 'paypal', 'bank_transfer', 'cash_in_person', 'card')),
  payment_policy_snapshot jsonb not null,
  payment_deadline_at   timestamptz,

  requested_at          timestamptz not null default now(),
  reviewed_at           timestamptz,
  confirmed_at          timestamptz,
  paid_at               timestamptz,
  ready_at              timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  declined_at           timestamptz,
  cancelled_at          timestamptz,
  expired_at            timestamptz,
  reminder_sent_at      timestamptz,

  decline_reason        text check (decline_reason is null or length(decline_reason) <= 500),
  customer_notes        text check (customer_notes is null or length(customer_notes) <= 1000),
  admin_notes           text check (admin_notes is null or length(admin_notes) <= 2000),
  source                text not null default 'web' check (source in ('web', 'admin', 'whatsapp', 'phone')),
  -- Hook for a later event pass / QR. Not a second ticket system.
  pass_ref              text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists reservations_queue_idx on public.reservations (reservation_status, requested_at desc);
create index if not exists reservations_capacity_idx on public.reservations (product_id, slot_date)
  where reservation_status in ('confirmed', 'ready', 'in_progress');
create index if not exists reservations_deadline_idx on public.reservations (payment_deadline_at)
  where reservation_status = 'confirmed';

alter table public.reservations enable row level security;
revoke all on table public.reservations from public, anon, authenticated;

-- ── Audit: append-only ──────────────────────────────────────────────────────
create table if not exists public.reservation_events (
  id              bigint generated always as identity primary key,
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  at              timestamptz not null default now(),
  actor           text not null check (actor in ('customer', 'admin', 'system')),
  actor_label     text,
  type            text not null check (type in ('submitted', 'viewed', 'review_started', 'info_requested', 'info_received',
                    'confirmed', 'declined', 'payment_link_ready', 'payment_reported', 'payment_recorded', 'pay_in_person',
                    'ready', 'started', 'completed', 'expired', 'cancelled', 'message_opened', 'reminder_sent', 'note')),
  payload         jsonb not null default '{}'::jsonb
);
create index if not exists reservation_events_res_idx on public.reservation_events (reservation_id, at);
alter table public.reservation_events enable row level security;
revoke all on table public.reservation_events from public, anon, authenticated;

create or replace function public.reservation_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'reservation_events is append-only';
end $$;
drop trigger if exists reservation_events_no_rewrite on public.reservation_events;
create trigger reservation_events_no_rewrite before update or delete on public.reservation_events
  for each row execute function public.reservation_events_append_only();

-- ── Information requests ────────────────────────────────────────────────────
create table if not exists public.reservation_info_requests (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  fields          text[] not null check (cardinality(fields) between 1 and 8),
  note            text check (note is null or length(note) <= 500),
  asked_at        timestamptz not null default now(),
  answered_at     timestamptz,
  answer          jsonb
);
create index if not exists reservation_info_open_idx on public.reservation_info_requests (reservation_id) where answered_at is null;
alter table public.reservation_info_requests enable row level security;
revoke all on table public.reservation_info_requests from public, anon, authenticated;

-- ── Notification outbox ─────────────────────────────────────────────────────
-- A status change never waits on delivery: the row is written in the same
-- transaction, and the minute job delivers it (or marks it skipped when no
-- channel exists — the guest still sees it on their booking page).
create table if not exists public.reservation_outbox (
  id              bigint generated always as identity primary key,
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  audience        text not null check (audience in ('guest', 'admin')),
  channel         text not null check (channel in ('email', 'whatsapp_link', 'in_app')),
  template        text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  error           text
);
create index if not exists reservation_outbox_pending_idx on public.reservation_outbox (created_at) where status = 'pending';
alter table public.reservation_outbox enable row level security;
revoke all on table public.reservation_outbox from public, anon, authenticated;

-- ── Payment methods: the owner's switchboard, not code ──────────────────────
create table if not exists public.reservation_payment_methods (
  id                text primary key check (id in ('mcb_juice', 'paypal', 'bank_transfer', 'cash_in_person', 'card')),
  enabled           boolean not null default true,
  channel           text not null check (channel in ('online', 'in_person')),
  label_i18n        jsonb not null,
  instructions_i18n jsonb not null default '{}'::jsonb,
  sort              int not null default 0,
  updated_at        timestamptz not null default now()
);
alter table public.reservation_payment_methods enable row level security;
revoke all on table public.reservation_payment_methods from public, anon, authenticated;

-- Seeded from lib/payment-details.ts — the MCB account the site already
-- publishes for Juice and transfers. Editable in admin from here on.
-- `card` stays OFF: there is no card gateway (MIPS is the Mauritius norm) and
-- the engine must never pretend to charge one.
insert into public.reservation_payment_methods (id, enabled, channel, label_i18n, instructions_i18n, sort) values
  ('mcb_juice', true, 'online',
    '{"en": "MCB Juice", "fr": "MCB Juice", "cr": "MCB Juice"}',
    '{"en": "In MCB Juice, send the amount to MCB account 000456593438 (Roulé Rodrigues). Put your reference in the description.", "fr": "Dans MCB Juice, envoyez le montant au compte MCB 000456593438 (Roulé Rodrigues). Indiquez votre référence dans la description.", "cr": "Dan MCB Juice, avoy montan la lor kont MCB 000456593438 (Roulé Rodrigues). Met ou referans dan deskripsion."}', 10),
  ('bank_transfer', true, 'online',
    '{"en": "Bank transfer", "fr": "Virement bancaire", "cr": "Virman labank"}',
    '{"en": "Transfer the amount to MCB (Mauritius Commercial Bank), account 000456593438, Roulé Rodrigues. Use your reference as the payment description.", "fr": "Virez le montant à la MCB (Mauritius Commercial Bank), compte 000456593438, Roulé Rodrigues. Indiquez votre référence en libellé.", "cr": "Fer virman la ar MCB (Mauritius Commercial Bank), kont 000456593438, Roulé Rodrigues. Met ou referans kouma deskripsion."}', 20),
  ('paypal', true, 'online',
    '{"en": "PayPal or card", "fr": "PayPal ou carte", "cr": "PayPal ouswa kart"}',
    '{"en": "Pay securely with PayPal — a card works without a PayPal account.", "fr": "Payez avec PayPal — une carte suffit, sans compte PayPal.", "cr": "Pey avek PayPal — enn kart ase, pa bizin kont PayPal."}', 30),
  ('cash_in_person', true, 'in_person',
    '{"en": "Cash on the day", "fr": "Espèces le jour même", "cr": "Kas lor plas"}',
    '{"en": "Pay Roulé in cash on the day.", "fr": "Payez Roulé en espèces le jour même.", "cr": "Pey Roulé kas lor plas."}', 40),
  ('card', false, 'online',
    '{"en": "Card", "fr": "Carte", "cr": "Kart"}',
    '{}', 50)
on conflict (id) do nothing;

-- ── Payment policies: per product type, or per product ──────────────────────
create table if not exists public.reservation_policies (
  scope_type  text not null check (scope_type in ('product_type', 'product')),
  scope_id    text not null check (length(scope_id) between 1 and 120),
  policy      jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (scope_type, scope_id)
);
alter table public.reservation_policies enable row level security;
revoke all on table public.reservation_policies from public, anon, authenticated;

-- ── The existing money ledger records reservation payments too ──────────────
alter table public.booking_payments drop constraint if exists booking_payments_booking_kind_check;
alter table public.booking_payments add constraint booking_payments_booking_kind_check
  check (booking_kind = any (array['vehicle'::text, 'place'::text, 'reservation'::text]));
