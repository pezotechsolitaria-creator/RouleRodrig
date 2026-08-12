-- ════════════════════════════════════════════════════════════════════════════
-- M72 — a taxi driver can show more than one photo
--
-- The owner: "I WANT TO BE ABLE TO ADD MORE THAN ONE PHOTO IN ALL SECTIONS THAT
-- ALLOW THE ADDITION OF PHOTO."
--
-- Everywhere else that fix was UI-only, because the content type already carried
-- an images[] field that nothing in the admin was writing. taxi_drivers.photo is
-- a scalar text column, so this one needs a column.
--
-- `photo` stays, and stays authoritative as the cover — exactly as `image` does
-- on every content type. Existing rows keep working untouched, every current
-- read path is unaffected, and the array is purely additive.
alter table taxi_drivers
  add column if not exists photos text[] not null default '{}';

comment on column taxi_drivers.photos is
  'Extra photos beyond `photo` (the cover) — the vehicle, the boot, the driver. M72.';
