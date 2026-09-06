-- ── What the platform takes on a ride ──────────────────────────────────────
--
-- The owner asked for "Commission for taxi in admin" some time ago and it has
-- been carried as open since. `ride_pricing` set every fare component — base,
-- per km, minimum, night surcharge, flat — and had nowhere to record what
-- Roulé Rodrigues earns for arranging the ride.
--
-- PER SERVICE, not one platform-wide number, because ride_pricing is already
-- per service and the economics differ: an airport transfer is a booked job
-- worth a real cut, a short town taxi is not, and forcing one rate on both
-- guarantees the wrong answer for one of them.
--
-- A PERCENT, not an amount. Fares here are computed from distance and
-- passengers, so a fixed cut would be most of a short fare and a rounding error
-- on a long one.
--
-- ── DEFAULT ZERO, DELIBERATELY ─────────────────────────────────────────────
-- /taxi says, in the admin's own words: "tourists tap WhatsApp or call
-- directly. No commission, no app." Defaulting to any positive rate would
-- silently start claiming a cut of every ride already in the table, and the
-- first anybody would know is a driver being told they owe money. Zero is the
-- truth until the owner types a number.
alter table ride_pricing
  add column if not exists commission_percent numeric(5,2) not null default 0;

alter table ride_pricing
  add constraint ride_pricing_commission_range
    check (commission_percent >= 0 and commission_percent <= 100);

comment on column ride_pricing.commission_percent is
  'What the platform takes of the quoted fare, as a percent, per service. 0 = the listing is free, which is what /taxi promises today.';
