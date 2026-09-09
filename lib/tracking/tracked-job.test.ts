import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── A DRIVER WITH TWO DELIVERIES WENT DARK FOR BOTH ─────────────────────────
//
// Two functions pick "the driver's current delivery", and they picked opposite
// ends of the same list:
//
//   driver_dashboard()           order by d.assigned_at        → OLDEST first
//   delivery_tracking_context()  order by assigned_at desc     → NEWEST
//
// The dashboard passed `active[0]` — the oldest — as the job being tracked.
// Everything that consumes the tracking context takes the newest. With ONE
// active delivery the two agree, which is why this shipped and stayed shipped.
//
// With two, the equality in DeliveryTracking failed, so no channel key; and in
// app/api/tracking/ping/route.ts `body.tripId === allowedTripId` failed too,
// which nulls the trip and DOWNGRADES the stage to "online" — throwing away
// en_route_pickup, at_pickup and on_trip.
//
// So the symptom was not "the wrong job is tracked". It was neither job
// tracked, for as long as the driver held two, resolving by itself the moment
// they finished one. That is close to the worst possible shape for a bug: it
// only appears on the busiest drivers and cannot be reproduced by testing with
// one job.
//
// These are source assertions rather than unit tests because the bug lives in
// the AGREEMENT between a client component and two SQL functions — there is no
// single function whose return value is wrong.

const read = (p: string) => readFileSync(p, "utf8");

describe("the client does not guess which job is tracked", () => {
  it("DeliveryTracking takes every active job, not one", () => {
    const src = read("components/tracking/DeliveryTracking.tsx");
    expect(src).toMatch(/jobs:\s*TrackableJob\[\]/);
    // The old prop pair. Their return would be the bug's return.
    expect(src).not.toMatch(/activeId\s*:/);
    expect(src).not.toMatch(/activeStatus\s*:/);
  });

  it("it broadcasts against the id the SERVER gave it", () => {
    const src = read("components/tracking/DeliveryTracking.tsx");
    // The trip handed to useDriverTracking must come from the context read,
    // never from the props.
    expect(src).toMatch(/trip:\s*trip\s*\?\s*\{\s*kind:\s*"delivery"\s*as\s*const,\s*id:\s*trip\.id\s*\}/);
    // The equality that silently disabled tracking.
    expect(src).not.toMatch(/ctx\?\.trip\?\.id === activeId/);
  });

  it("the dashboard hands over the whole list", () => {
    const src = read("app/driver/DriverDashboard.tsx");
    expect(src).toMatch(/jobs=\{allActive\.map/);
    expect(src).not.toMatch(/activeId=\{active\[0\]/);
  });
});

describe("the two orderings still disagree, and that is now fine", () => {
  it("driver_dashboard still lists oldest first", () => {
    // Deliberately NOT changed to desc. Oldest-first is right for the screen —
    // finish what you started before taking more — and flipping it to make the
    // client's guess correct would have fixed the symptom by breaking the UI.
    const sql = read(
      "supabase/migrations/20260827170000_m159_both_sides_can_see_the_identity_document.sql",
    );
    expect(sql).toMatch(/order by d\.assigned_at\)/);
    expect(sql).not.toMatch(/order by d\.assigned_at desc\)/);
  });

  it("the tracking context still takes the newest", () => {
    const sql = read("supabase/migrations/20260818120000_m109_live_trip_tracking.sql");
    expect(sql).toMatch(/order by assigned_at desc\s+limit 1/);
  });
});
