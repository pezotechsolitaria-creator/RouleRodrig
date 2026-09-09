import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRACKING_OVER, isTrackingOver, TRACKING_CUSTOMER_STATUS } from "./model";

// ── A FINISHED TRIP HAS NO SIGNAL TO LOSE ───────────────────────────────────
//
// From a real screen: a booking whose chip read "Complete", with the line
// underneath saying
//
//   "Last seen 52 h 16 min ago — we've lost their signal. They're most likely
//    still on the way."
//
// Two sentences contradicting each other on one screen, and the reassuring one
// is the wrong one — it tells somebody whose delivery already arrived to keep
// waiting for it. The freshness block ran regardless of status.

describe("the terminal-status record", () => {
  it("classifies every tracking status", () => {
    // The point of the Record: a new status fails to compile until someone
    // decides whether it ends the trip. This asserts the runtime shape matches
    // the status list the customer copy is keyed on.
    expect(Object.keys(TRACKING_OVER).sort()).toEqual(
      Object.keys(TRACKING_CUSTOMER_STATUS).sort(),
    );
  });

  it("treats only `ended` as over", () => {
    expect(isTrackingOver("ended")).toBe(true);
    for (const s of ["pending", "en_route_pickup", "at_pickup", "on_trip"]) {
      expect(isTrackingOver(s), `${s} is still in progress`).toBe(false);
    }
  });

  it("does not call an unknown status finished", () => {
    // Fail-open here would hide the freshness line on a live trip, which is the
    // failure that line exists to prevent.
    expect(isTrackingOver("")).toBe(false);
    expect(isTrackingOver("something_new")).toBe(false);
  });
});

describe("the customer screen", () => {
  const SRC = readFileSync(
    join(process.cwd(), "components/tracking/LiveTripView.tsx"),
    "utf8",
  );

  it("hides the freshness line once the trip is over", () => {
    expect(SRC).toMatch(/const tripOver = isTrackingOver\(status\)/);
    expect(SRC).toMatch(/\{!tripOver && \(/);
  });

  it("still carries the lost-signal wording for trips that are live", () => {
    // The fix must not have deleted the warning — only stopped it running on a
    // finished trip.
    expect(SRC).toContain("we've lost their signal");
  });

  it("derives that from the same status the badge uses", () => {
    // The chip and the line under the map disagreeing is the whole bug.
    expect(SRC).toMatch(/TRACKING_CUSTOMER_STATUS\[status/);
    expect(SRC).toMatch(/isTrackingOver\(status\)/);
  });
});
