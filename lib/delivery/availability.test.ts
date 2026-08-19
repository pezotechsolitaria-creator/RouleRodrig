import { describe, it, expect } from "vitest";
import {
  driverDutyState,
  fleetDutyLabel,
  fleetFilterKey,
  DEFAULT_MAX_ACTIVE_DELIVERIES,
} from "./availability";

// These tests exist because the SQL half of M116 cannot be unit-tested from
// here, and the two halves have to agree. Every assertion about `offerable`
// mirrors a predicate in dispatch_candidates; if that function changes, these
// should fail.

describe("availability is duty, capacity is a count", () => {
  it("keeps a driver holding 1 of 2 jobs offerable — the bug that started this", () => {
    const s = driverDutyState("busy", 1, 2);
    expect(s.state).toBe("working");
    expect(s.onDuty).toBe(true);
    expect(s.offerable).toBe(true);
  });

  it("stops at the owner's limit, not at the value of the column", () => {
    expect(driverDutyState("busy", 2, 2).offerable).toBe(false);
    // Still on duty at capacity — they have not signed off, they are just full.
    expect(driverDutyState("busy", 2, 2).onDuty).toBe(true);
    // The counterfactual: with a limit of 1, 'busy' really DOES mean full.
    // Proves this tracks delivery_settings rather than a hardcoded 2.
    expect(driverDutyState("busy", 1, 1).offerable).toBe(false);
  });

  it("mirrors dispatch_candidates for every (availability, jobs) pair", () => {
    for (const a of ["offline", "available", "busy"]) {
      for (const jobs of [0, 1, 2, 3]) {
        expect(driverDutyState(a, jobs, 2).offerable).toBe(a !== "offline" && jobs < 2);
      }
    }
  });

  it("reads a stale 'busy' as on duty and free, not as a job in hand", () => {
    // Exactly what sweep_delivery_escalations used to leave behind: availability
    // 'busy' with the delivery moved to a status outside the active set.
    const s = driverDutyState("busy", 0, 2);
    expect(s.state).toBe("idle");
    expect(s.offerable).toBe(true);
    expect(s.label).not.toContain("On a delivery");
  });

  it("never promises work that cannot come", () => {
    expect(driverDutyState("busy", 2, 2).detail).toContain("No new jobs");
    expect(driverDutyState("busy", 2, 2).detail).not.toContain("moment one comes in");
    // ...and still does promise it when it genuinely can.
    expect(driverDutyState("available", 0, 2).detail).toContain("moment one comes in");
  });

  it("treats offline as offline whatever is in hand, and says what happens to it", () => {
    expect(driverDutyState("offline", 0, 2).onDuty).toBe(false);
    expect(driverDutyState("offline", 1, 2).onDuty).toBe(false);
    expect(driverDutyState("offline", 1, 2).offerable).toBe(false);
    expect(driverDutyState("offline", 1, 2).detail).toContain("only stops new ones");
  });

  it("pluralises the jobs in hand (the old copy said 'deliveryies')", () => {
    expect(driverDutyState("offline", 1, 2).detail).toContain("1 delivery ");
    expect(driverDutyState("offline", 2, 2).detail).toContain("2 deliveries");
  });

  it("treats an unknown or missing value as off duty, never as offerable", () => {
    for (const a of [undefined, null, "", "sleeping", "OFFLINE"]) {
      const s = driverDutyState(a, 0, 2);
      expect(s.offerable).toBe(false);
      expect(s.onDuty).toBe(false);
    }
  });

  it("offers two intents and only two — there is no 'go busy' button", () => {
    expect(driverDutyState("offline", 0, 2).toggleLabel).toBe("Go online");
    for (const [a, jobs] of [["available", 0], ["busy", 1], ["busy", 2]] as const) {
      expect(driverDutyState(a, jobs, 2).toggleLabel).toBe("Go offline");
    }
  });

  it("survives nonsense counts and limits rather than freezing the fleet", () => {
    expect(driverDutyState("available", -3, 2).state).toBe("idle");
    expect(driverDutyState("available", Number.NaN, 2).state).toBe("idle");
    // A limit of 0 would mean nobody may ever work. Fall back, do not obey.
    expect(driverDutyState("available", 0, 0).offerable).toBe(true);
    expect(driverDutyState("available", 0).offerable).toBe(true);
    expect(DEFAULT_MAX_ACTIVE_DELIVERIES).toBeGreaterThanOrEqual(1);
  });

  it("tells a driver how much room is left, so 'why another job?' never surprises", () => {
    expect(driverDutyState("busy", 1, 3).label).toContain("2 more");
    expect(driverDutyState("busy", 2, 3).label).toContain("1 more");
  });
});

describe("the admin board speaks both fleets' vocabularies", () => {
  it("knows the delivery word and the taxi word for not working", () => {
    expect(fleetDutyLabel("offline", false).working).toBe(false);
    expect(fleetDutyLabel("off", false).working).toBe(false);
    expect(fleetDutyLabel(undefined, false).working).toBe(false);
    expect(fleetDutyLabel("", false).working).toBe(false);
  });

  it("does not call an office-marked-busy taxi driver 'Off'", () => {
    // set_taxi_availability_by_token: 'busy' is the OWNER's word, set from the
    // desk, and the driver cannot clear it. Labelling that "Off" is how an
    // operator stops phoning somebody who is on duty.
    const l = fleetDutyLabel("busy", false);
    expect(l.short).toBe("Busy");
    expect(l.working).toBe(true);
    expect(l.long).not.toBe("Not working right now.");
  });

  it("puts a driver on a job in the busy bucket whatever their column says", () => {
    for (const a of ["available", "busy", "off", "offline"]) {
      const onJob = fleetFilterKey(a, true);
      expect(onJob).toBe(a === "off" || a === "offline" ? "offline" : "busy");
    }
  });

  it("puts every wire value in exactly one bucket, so the chips partition the fleet", () => {
    const seen = new Set<string>();
    for (const a of ["available", "busy", "off", "offline", "", "weird"]) {
      for (const hasJob of [true, false]) {
        const k = fleetFilterKey(a, hasJob);
        expect(["available", "busy", "offline"]).toContain(k);
        seen.add(k);
      }
    }
    expect(seen.size).toBe(3);
  });

  it("leaves nobody matching no filter at all — the old fall-through", () => {
    // Under the previous three predicates a driver with availability 'busy' and
    // no live job matched Available (no), On a job (no) and Offline (no), so
    // they appeared only under "All".
    expect(fleetFilterKey("busy", false)).toBe("busy");
  });
});
