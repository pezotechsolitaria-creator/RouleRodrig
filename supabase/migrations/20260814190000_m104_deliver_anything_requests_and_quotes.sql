-- ── M104 · DELIVER ANYTHING — the foundation ────────────────────────────────
--
-- Until now a delivery could only be born from an ORDER: deliveries.order_id
-- was NOT NULL and store_id was NOT NULL, so every job had to start at a shop
-- on this platform. A package from someone's family, or "buy me this from that
-- shop", had nowhere to exist.
--
-- ── WHY THIS IS A QUOTE MODEL AND NOT THE EXISTING DISPATCH ─────────────────
-- The owner's rule, in his words: "it is decided by the delivermen not me — I
-- created the demand, they create the supply, I charge only commission, I do
-- not make the price."
--
-- That is a different market from marketplace delivery, where the platform sets
-- a zone fee and pays the driver a share. Here the DRIVER names the price and
-- the platform takes a cut. Offer/accept cannot express that: it assumes the
-- fee is already known when the offer goes out. So requests are posted, drivers
-- QUOTE, and the customer picks one.
--
-- Everything else is reused rather than rebuilt: the same deliveries table, the
-- same PIN completion, the same append-only event audit, the same driver
-- identity and metrics, and the M103 vehicle gate — a scooter cannot quote on a
-- fridge.
--
-- APPLIED AND VERIFIED against the live database, in a transaction aborted by
-- RAISE so nothing survived: driver-set fee 30000 split 24000/6000 at the
-- existing driver_share_percent, size inherited from the request, the losing
-- quote auto-declined, a double tap returning the same delivery, exactly one
-- delivery row, and a shop-and-deliver with no budget refused by CHECK.
-- See M104b and M104c for the two bugs that verification caught.

create table if not exists public.delivery_requests (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'package'
                 check (kind in ('package', 'shop_and_deliver')),
  what           text not null check (btrim(what) <> ''),
  photo_url      text,
  pickup_text    text not null check (btrim(pickup_text) <> ''),
  pickup_lat     double precision check (pickup_lat between -90 and 90),
  pickup_lng     double precision check (pickup_lng between -180 and 180),
  pickup_note    text,
  dropoff_text   text not null check (btrim(dropoff_text) <> ''),
  dropoff_lat    double precision check (dropoff_lat between -90 and 90),
  dropoff_lng    double precision check (dropoff_lng between -180 and 180),
  dropoff_note   text,
  size_class     text not null default 'standard'
                 check (size_class in ('standard', 'large')),
  max_budget     integer check (max_budget is null or max_budget >= 0),
  customer_id    uuid references auth.users(id) on delete set null,
  guest_email    text,
  contact_name   text not null check (btrim(contact_name) <> ''),
  contact_phone  text not null check (contact_phone ~ '^\+[1-9][0-9]{6,15}$'),
  status         text not null default 'open'
                 check (status in ('open','accepted','cancelled','expired')),
  cancel_reason  text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A budget is meaningless on a job where nothing is bought, and a shopping
  -- run without one is an open cheque.
  constraint delivery_requests_budget_shape
    check ((kind = 'shop_and_deliver') = (max_budget is not null)),
  constraint delivery_requests_identity
    check (customer_id is not null or btrim(coalesce(guest_email,'')) <> '')
);
create index if not exists delivery_requests_open_idx
  on public.delivery_requests (status, created_at desc) where status = 'open';
create index if not exists delivery_requests_customer_idx
  on public.delivery_requests (customer_id, created_at desc);

drop trigger if exists t_delivery_requests_updated on public.delivery_requests;
create trigger t_delivery_requests_updated before update on public.delivery_requests
  for each row execute function set_updated_at();

create table if not exists public.delivery_quotes (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.delivery_requests(id) on delete cascade,
  driver_id    uuid not null references public.delivery_drivers(id) on delete cascade,
  -- The DELIVERY FEE only. Never the cost of the goods: on a shop-and-deliver
  -- run the customer also repays what was spent, and mixing the two into one
  -- number is how a driver ends up funding somebody's groceries.
  fee          integer not null check (fee >= 0),
  note         text,
  status       text not null default 'offered'
               check (status in ('offered','accepted','declined','withdrawn','expired')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  unique (request_id, driver_id)
);
create index if not exists delivery_quotes_request_idx on public.delivery_quotes (request_id, status);
create index if not exists delivery_quotes_driver_idx  on public.delivery_quotes (driver_id, status);

alter table public.deliveries alter column order_id drop not null;
alter table public.deliveries alter column store_id drop not null;
alter table public.deliveries
  add column if not exists request_id uuid references public.delivery_requests(id) on delete restrict;

alter table public.deliveries drop constraint if exists deliveries_one_origin;
alter table public.deliveries add constraint deliveries_one_origin
  check ((order_id is not null) <> (request_id is not null));

create unique index if not exists deliveries_request_uniq
  on public.deliveries (request_id) where request_id is not null;

-- RLS with NO policies, on purpose — the driver_contact_channels decision
-- (M54). Every read and write goes through a SECURITY DEFINER RPC that can
-- enforce what RLS cannot express here, above all PRIVACY: a driver sees enough
-- to price a job and NOT the customer's phone or exact address until chosen.
alter table public.delivery_requests enable row level security;
alter table public.delivery_quotes   enable row level security;
revoke all on public.delivery_requests from anon, authenticated;
revoke all on public.delivery_quotes   from anon, authenticated;

-- accept_delivery_quote lives in M104c, which supersedes the original body.
