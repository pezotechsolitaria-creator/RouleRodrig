import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── A LADDER THAT FINISHED AFTER THE PICKUP ─────────────────────────────────
//
// Three scheduled rides, three identical failures, each about twelve minutes
// late:
//
//   Laurence          pickup 10:00  →  no_driver 10:12:13
//   (owner's test)    pickup 13:07  →  no_driver 13:19:11
//   Estelle HANNHART  pickup 10:30  →  no_driver 10:42:14   ← at the airport
//
// Not bad luck. Arithmetic: the gate started the ladder 30 minutes before
// pickup and the ladder takes (stages + 1) × accept_window = 4 × 10 = 40.
// Forty minutes of asking cannot fit inside thirty minutes of notice, so every
// scheduled ride that was not taken in the first three rounds was declared
// dead after its own pickup time, by construction.
//
// These assertions are about the arithmetic, because the arithmetic is what
// broke. A future change that widens the accept window past the lead time
// re-creates the bug in silence otherwise.

const MIG = readFileSync(
  "supabase/migrations/20260916100000_m199_a_scheduled_ride_is_dispatched_in_time.sql",
  "utf8",
);

/** The FUNCTION BODY alone.
 *
 *  Not the whole file, and not everything after the create: the header quotes
 *  the old gate to explain it, and the proof block at the foot searches the
 *  deployed definition for that same string. Both would satisfy a naive
 *  "does it still say 30 minutes" grep and hide a gate that was never removed. */
const SQL = MIG.slice(
  MIG.indexOf("create or replace function"),
  MIG.indexOf("revoke all on function"),
);

describe("the lead time has to clear the whole ladder", () => {
  it("no longer starts a 40-minute ladder 30 minutes before pickup", () => {
    expect(SQL).not.toContain("30 minutes");
  });

  it("derives the lead from the settings instead of assuming it", () => {
    // Read from dispatch_settings, so adding a radius stage cannot silently
    // push the last round past the pickup again.
    expect(SQL).toContain("v_ladder := make_interval(mins => v_max * v_window)");
    expect(SQL).toContain("greatest(interval '3 hours', v_ladder + interval '15 minutes')");
  });

  it("gives an airport transfer a full day", () => {
    // A flight has a fixed time. If nobody takes it, the owner needs a day to
    // ring round — not twelve minutes after the aircraft is on the ground.
    expect(SQL).toContain("when service = 'airport' then interval '24 hours'");
  });

  it("still dispatches somebody standing by a road immediately", () => {
    expect(SQL).toContain("when_kind = 'now'");
    // And a booking for Thursday never outranks them.
    expect(SQL).toContain("(when_kind = 'now') desc, created_at asc");
  });

  it("records how much warning the giving-up gave", () => {
    // Negative means we gave up after the pickup. Nothing measured this
    // before, which is why three rides did it unnoticed.
    expect(SQL).toContain("minutesBeforePickup");
    expect(SQL).toContain("v_r.scheduled_at - now()");
  });
});

describe("the arithmetic itself", () => {
  // The real settings: radius_stages_km {3,8,18} → 4 rounds, 10-minute window.
  const ROUNDS = 4;
  const WINDOW = 10;
  const ladder = ROUNDS * WINDOW;

  it("the old gate could not have worked", () => {
    expect(ladder).toBeGreaterThan(30);
  });

  it("the new lead clears it with room for a person to act", () => {
    const lead = Math.max(180, ladder + 15);
    expect(lead).toBeGreaterThan(ladder);
    // Laurence's 10:00 pickup: the ladder would now run 07:00 → 07:40, leaving
    // 2h20 to ring somebody rather than 12 minutes of hindsight.
    expect(lead - ladder).toBeGreaterThanOrEqual(60);
  });

  it("an airport transfer finishes a day early", () => {
    const lead = 24 * 60;
    expect(lead - ladder).toBeGreaterThan(20 * 60);
  });
});

describe("the migration refuses to apply into a shape it does not know", () => {
  it("fails loudly if somebody widens the window past the lead", () => {
    expect(MIG).toContain("lead time no longer clears the ladder");
  });

  it("guards the overload trap", () => {
    // A second function of this name makes PostgREST refuse the endpoint with
    // PGRST203 and every dispatch stops silently.
    expect(MIG).toContain("auto_dispatch_rides is overloaded");
  });
});
