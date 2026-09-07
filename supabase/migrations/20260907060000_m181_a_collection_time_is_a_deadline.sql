-- ── M181a · AN ORDER NOBODY ACCEPTED DIES WHEN ITS COLLECTION TIME PASSES ──
--
-- Applied to production 2026-09-07 (recorded there as m180_a; M180 was taken
-- in the repo by a concurrent session, so the files carry M181 and the numbers
-- disagree by one. The content is what shipped).
--
-- A customer orders lunch at 14:00 for a 15:00 collection. The kitchen never
-- touches it. At 15:00 the customer turns up to nothing — and the order stays
-- LIVE on both screens for up to two more days.
--
-- Two reasons, both real:
--
--   1. expire_order() only fires on auto_release_at, which is the PAYMENT hold
--      (marketplace_settings.order_hold_hours, 48h). A lunch ordered at 14:00
--      is not due for expiry until 14:00 two days later.
--   2. The only sweep runs once a day, at 06:00 (vercel.json). So even a
--      genuinely lapsed order waits until the next morning.
--
-- The collection window is a promise with a time on it. When it passes and
-- nobody ever accepted the order, that promise is broken and the order should
-- say so instead of sitting there looking alive.
--
-- ── GRACE, AND WHY IT IS MEASURED FROM THE END ─────────────────────────────
-- Not from the START of the slot: a kitchen five minutes late on a 12:30-13:00
-- window is a normal Tuesday, not a failure. The window already expresses the
-- promise; the grace is how long after it we keep hoping. Default 30 minutes,
-- so a slot ending 15:00 expires at 15:30.
--
-- Configurable rather than hardcoded because it is a judgement about this
-- island's pace, not a fact, and the owner should be able to move it without a
-- deploy.

alter table marketplace_settings
  add column if not exists pickup_grace_minutes integer not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketplace_settings_pickup_grace_sane'
  ) then
    alter table marketplace_settings
      add constraint marketplace_settings_pickup_grace_sane
      check (pickup_grace_minutes between 0 and 240);
  end if;
end $$;

comment on column marketplace_settings.pickup_grace_minutes is
  'Minutes after a pickup slot ENDS before an unaccepted order is auto-cancelled (M181). 0-240; default 30.';
