-- ── "Everyone can do it, but the admin confirms first" ─────────────────────
--
-- The owner on Do It For Me: "it can be everything and everyone can do it but
-- first should be confirmed by the admin ofc."
--
-- Most of that already existed and was invisible. `delivery_drivers` has had an
-- approval gate since the beginning — status starts 'pending', an admin moves
-- it to 'approved', and driver_open_requests returns an empty board to anybody
-- else. And `foot` has been a registerable vehicle type all along, so a person
-- with no vehicle could already be approved and already qualified for every
-- standard/general job, which is what almost every errand is.
--
-- What was missing is the DISTINCTION. Signing up said "Deliver with Roulé
-- Rodrigues — pick up orders from local shops", so somebody willing to queue at
-- a bank for a neighbour would never have recognised themselves in it. And once
-- approved there was no way to say "I will run errands but I do not want parcel
-- runs", or the reverse.
--
-- Two booleans rather than one enum, because the honest answer for most people
-- on a small island is BOTH, and an enum would have forced a false choice.
alter table delivery_drivers
  add column if not exists can_deliver boolean not null default true,
  add column if not exists can_run_errands boolean not null default false;

-- EVERY EXISTING DRIVER KEEPS SEEING ERRANDS. They can already see them today —
-- errands go to the ordinary board — so defaulting them to false would silently
-- empty a board that is working, and the only symptom would be drivers quietly
-- getting less work. A new applicant is asked the question instead.
update delivery_drivers set can_run_errands = true;

-- A row that can do neither is a person who was approved to do nothing, which
-- is never what anybody meant.
alter table delivery_drivers
  add constraint delivery_drivers_does_something
    check (can_deliver or can_run_errands);

comment on column delivery_drivers.can_run_errands is
  'Signed up to run "do it for me" errands. Independent of can_deliver — most people do both.';
comment on column delivery_drivers.can_deliver is
  'Signed up for parcel and shopping runs. Independent of can_run_errands.';
