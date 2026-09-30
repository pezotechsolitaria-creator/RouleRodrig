import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  AIRPORT_DISPATCH_LEAD_MS,
  OTHER_DISPATCH_LEAD_MS,
  dispatchLeadMs,
  searchStartsAt,
} from "./dispatch-timing";

const NOW = Date.parse("2026-09-30T18:00:00Z");

describe("when the search for a driver starts", () => {
  it("is the day before for an airport pickup booked two weeks ahead", () => {
    // RR-C53A01: booked 20 Sep for Mon 5 Oct 19:00 in Rodrigues (15:00 UTC).
    const start = searchStartsAt(
      { service: "airport", whenKind: "scheduled", scheduledAt: "2026-10-05T15:00:00Z" },
      NOW,
    );
    expect(start?.toISOString()).toBe("2026-10-04T15:00:00.000Z");
  });

  it("is three hours before for any other booked ride", () => {
    const start = searchStartsAt(
      { service: "taxi", whenKind: "scheduled", scheduledAt: "2026-10-01T12:00:00Z" },
      NOW,
    );
    expect(start?.toISOString()).toBe("2026-10-01T09:00:00.000Z");
  });

  it("has already started for a ride asked for now, or inside its lead", () => {
    expect(searchStartsAt({ service: "taxi", whenKind: "now", scheduledAt: null }, NOW)).toBeNull();
    expect(searchStartsAt(
      { service: "airport", whenKind: "scheduled", scheduledAt: "2026-10-01T10:00:00Z" },
      NOW,
    )).toBeNull();
    expect(searchStartsAt({ service: "taxi", whenKind: "scheduled", scheduledAt: "not a date" }, NOW)).toBeNull();
  });

  it("reads 'about to start' as started, not as a promise for later", () => {
    const inThirtySeconds = new Date(NOW + OTHER_DISPATCH_LEAD_MS + 30_000).toISOString();
    expect(searchStartsAt({ service: "taxi", whenKind: "scheduled", scheduledAt: inThirtySeconds }, NOW)).toBeNull();
  });

  it("uses the airport lead only for airport rides", () => {
    expect(dispatchLeadMs("airport")).toBe(AIRPORT_DISPATCH_LEAD_MS);
    for (const s of ["taxi", "hotel", "ferry", "private", null]) {
      expect(dispatchLeadMs(s)).toBe(OTHER_DISPATCH_LEAD_MS);
    }
  });
});

// The two numbers are copies of SQL. If a migration changes them, this fails,
// and the customer is not quietly told the old timing.
describe("the leads match the latest auto_dispatch_rides", () => {
  const dir = "supabase/migrations";
  const latest = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /create or replace function public\.auto_dispatch_rides/i.test(readFileSync(`${dir}/${f}`, "utf8")))
    .pop()!;
  const sql = readFileSync(`${dir}/${latest}`, "utf8");

  it("airport rides start 24 hours ahead", () => {
    expect(sql).toMatch(/when service = 'airport' then interval '24 hours'/);
    expect(AIRPORT_DISPATCH_LEAD_MS).toBe(24 * 3600_000);
  });

  it("other rides start at least 3 hours ahead", () => {
    expect(sql).toMatch(/greatest\(interval '3 hours', v_ladder \+ interval '15 minutes'\)/);
    expect(OTHER_DISPATCH_LEAD_MS).toBe(3 * 3600_000);
  });
});
