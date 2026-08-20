-- ══════════════════════════════════════════════════════════════════════════
-- M133 — undo a probe that charged a real driver
-- ══════════════════════════════════════════════════════════════════════════
--
-- M129's verification block created a probe RIDE and a probe DRIVER, then
-- called offer_ride on it. offer_ride fans out to every eligible driver, not
-- only the one the probe made — so it also offered the probe ride to Mr Sam,
-- the platform's real driver, and incremented his rides_offered.
--
-- Evidence: taxi_drivers.last_offered_at is 2026-08-20T07:15:03Z, which is the
-- M129 apply, and the only statement that writes it is the same one that
-- increments rides_offered. ride_offers is empty platform-wide, and no
-- ride.offered event has ever recorded him being reached.
--
-- rides_offered is the DENOMINATOR of the accept rate that ride_candidates
-- ranks on. Leaving a fabricated offer there is precisely the defect M129 was
-- written to remove, so it is subtracted here rather than left because it is
-- currently harmless — he is still under the `rides_offered < 3` newcomer
-- floor, and that is not a reason to keep wrong data.
--
-- Exactly one is removed: the one that probe added. This does not assume what
-- the value was before.
--
-- last_offered_at is deliberately NOT restored. Its prior value is unknowable,
-- it only feeds an idle bonus, and inventing a timestamp to tidy a record is a
-- worse lie than the stale one.
--
-- ── THE LESSON IS IN THE PROBE, NOT THE DATA ──────────────────────────────
-- A verification block that calls a FAN-OUT function touches every row that
-- function can reach, not just the rows the probe created. M132's probe was
-- written the other way round — a ride for 60 passengers, so no driver on earth
-- qualifies and the sweep provably cannot reach a real one. That is the shape
-- every future dispatch probe should take.

update public.taxi_drivers
   set rides_offered = greatest(rides_offered - 1, 0)
 where last_offered_at is not null
   and last_offered_at >= timestamptz '2026-08-20 07:00:00+00'
   and last_offered_at <  timestamptz '2026-08-20 08:00:00+00'
   and rides_offered > 0;

do $$
declare v_offered int; v_accepted int; v_offers int;
begin
  select rides_offered, rides_accepted into v_offered, v_accepted
    from public.taxi_drivers where name = 'Mr Sam';

  if v_offered is null then
    raise notice 'M133: no driver named Mr Sam — nothing to correct.';
    return;
  end if;

  -- He has never actually been offered a ride: ride_offers is empty and every
  -- ride.offered event from his era recorded zero drivers reached.
  if v_offered <> 0 then
    raise exception 'M133: rides_offered is % after the correction, expected 0', v_offered;
  end if;
  if v_accepted <> 0 then
    raise exception 'M133: rides_accepted is %, which this migration never touches', v_accepted;
  end if;

  select count(*) into v_offers from public.ride_offers;
  if v_offers <> 0 then
    raise exception 'M133: ride_offers is not empty (%) — re-check the assumption before correcting counters', v_offers;
  end if;

  raise notice 'M133 verified: the fabricated offer is gone.';
end $$;
