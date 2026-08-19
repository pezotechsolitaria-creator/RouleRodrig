import { describe, it, expect } from "vitest";
import {
  rideUnassignedAlert,
  dedupeKeyFor,
  RIDE_NO_DRIVER_TYPE,
  type RideUnassignedFacts,
} from "./no-driver-copy";

// The message this replaces was "No driver accepted a ride." followed by
// "<pickup> → <dropoff>". Ride RR-26A506 (26a506b6-63a6-4a30-9521-6f22796dd075)
// is the production row that shows why that is not good enough: four rounds
// that asked ZERO drivers, a real customer on a real number, and an alert that
// named neither and diagnosed the wrong problem.

const RIDE = "26a506b6-63a6-4a30-9521-6f22796dd075";

const facts = (over: Partial<RideUnassignedFacts> = {}): RideUnassignedFacts => ({
  rideId: RIDE,
  stampedAt: "2026-08-14T12:17:10.786799+00:00",
  customerName: "Dofof",
  customerPhone: "+230 5836 3401",
  pickup: "Mont Lubin",
  dropoff: "Plaine Corail Airport",
  minutesWaiting: 5,
  driversAsked: 0,
  ...over,
});

const text = (f: RideUnassignedFacts) => {
  const a = rideUnassignedAlert(f);
  return [a.title, ...a.lines].join("\n");
};

describe("the message leads with the call the platform already promised", () => {
  it("puts the customer's name in the first thing that reaches the lock screen", () => {
    // /taxi/track tells this customer "We're arranging this for you by hand.
    // We'll call you." Nobody can keep that promise from a message that does
    // not say who to call.
    expect(rideUnassignedAlert(facts()).title).toBe("Call Dofof — nobody took their ride");
  });

  it("gives the number to dial, above the details", () => {
    const a = rideUnassignedAlert(facts());
    expect(a.lines[1]).toBe("Call them now: +230 5836 3401");
    expect(a.lines.indexOf("Pickup: Mont Lubin")).toBeGreaterThan(1);
  });

  it("says how long the customer has been waiting", () => {
    expect(text(facts({ minutesWaiting: 5 }))).toContain("has been waiting 5 minutes");
    expect(text(facts({ minutesWaiting: 65 }))).toContain("waiting 1 hour 5 minutes");
  });

  it("omits the wait rather than guessing at it", () => {
    const t = text(facts({ minutesWaiting: null }));
    expect(t).toContain("is waiting for a ride and still has no driver");
    expect(t).not.toContain("has been waiting");
  });

  it("still names a person to call when the name is missing", () => {
    const a = rideUnassignedAlert(facts({ customerName: null }));
    expect(a.title).toBe("Call the customer — nobody took this ride");
    expect(a.lines[0]).toBe("The customer has been waiting 5 minutes and still has no driver.");
  });

  it("points at the page, not at nothing, when the number is missing", () => {
    expect(text(facts({ customerPhone: null }))).toContain("their number is on the rides page");
  });

  it("carries the reference the owner can find the ride by", () => {
    expect(text(facts())).toContain("Ride RR-26A506");
  });

  it("ends on the page that can fix it", () => {
    const a = rideUnassignedAlert(facts());
    expect(a.lines[a.lines.length - 1]).toBe("https://roulerodrig.com/admin/rides");
  });
});

describe("it never claims a cause it has not measured", () => {
  it("says nobody was available when zero drivers were asked", () => {
    // RR-26A506: four rounds, drivers:0 every time. "No driver accepted" was
    // simply false, and it sent the owner looking for drivers to chase.
    const t = text(facts({ driversAsked: 0 }));
    expect(t).toContain("No driver was free to ask, so nobody has even seen it yet.");
    expect(t).not.toContain("None accepted");
  });

  it("says they were asked and refused when drivers really were asked", () => {
    expect(text(facts({ driversAsked: 4 }))).toContain("4 drivers were asked. None accepted.");
    expect(text(facts({ driversAsked: 1 }))).toContain("One driver was asked and did not accept.");
  });

  it("says nothing at all when the count is unknown", () => {
    const t = text(facts({ driversAsked: null }));
    expect(t).not.toContain("were asked");
    expect(t).not.toContain("free to ask");
  });

  it("distinguishes an empty roster from a refusal, in words", () => {
    const empty = text(facts({ driversAsked: 0 }));
    const refused = text(facts({ driversAsked: 3 }));
    expect(empty).not.toBe(refused);
  });
});

describe("a private day hire", () => {
  it("never renders the word null as a destination", () => {
    // create_ride_request stores NULL for private hire on purpose, and
    // /taxi/book does not even show the field. The old template interpolated it
    // straight into `${pickup} → ${dropoff}`.
    const t = text(facts({ dropoff: null }));
    expect(t).toContain("Drop-off: day hire — no fixed destination");
    expect(t.toLowerCase()).not.toContain("null");
  });

  it("says nothing about a destination it was never told about", () => {
    const t = text(facts({ dropoff: undefined }));
    expect(t).not.toContain("Drop-off");
  });
});

describe("the owner is never shown our internal vocabulary", () => {
  const BANNED = [
    "no_driver", "dispatch", "dispatching", "stage", "radius", "offer_rounds",
    "ride_offers", "ride_requests", "notification_slots", "enum", "rpc",
    "queue", "cron", "sweep", "escalation", "dedupe", "uuid", "status",
    "candidate", "payload", "slot",
  ];

  const CASES: Partial<RideUnassignedFacts>[] = [
    {},
    { driversAsked: 0 },
    { driversAsked: 1 },
    { driversAsked: 9 },
    { dropoff: null },
    { customerName: null, customerPhone: null, minutesWaiting: null },
  ];

  it("uses none of it, with or without data", () => {
    for (const over of CASES) {
      const t = text(facts(over)).toLowerCase();
      for (const word of BANNED) {
        expect(t, `leaked "${word}" for ${JSON.stringify(over)}`).not.toContain(word);
      }
    }
  });

  it("never leaks a placeholder value into a sentence", () => {
    for (const over of CASES) {
      expect(text(facts(over))).not.toMatch(/\b(null|undefined|NaN)\b/i);
    }
    // The bare-minimum call, where every optional fact is absent.
    expect(text({ rideId: RIDE, stampedAt: null })).not.toMatch(/\b(null|undefined|NaN)\b/i);
  });

  it("degrades to a readable message when every optional fact is missing", () => {
    const a = rideUnassignedAlert({ rideId: RIDE, stampedAt: null });
    expect(a.title.length).toBeGreaterThan(0);
    expect(a.lines.length).toBeGreaterThanOrEqual(4);
    // No dangling connectives or doubled spaces from an absent name or place.
    expect(a.lines.join(" ")).not.toMatch(/\s{2,}|:\s*$|at\s*\./);
  });
});

describe("dedupe keys, because a collision is a message nobody receives", () => {
  it("lets a ride that strands twice alert twice — the swallowed case", () => {
    // The trap this avoids: offer_rounds is the obvious M117 port and it is
    // WRONG here. Nothing in the database ever resets it, so a ride reopened
    // from 'no_driver' exhausts again at the identical count, produces the
    // identical key, and the second alert is silently swallowed for ever.
    // updated_at is stamped by both the give-up UPDATE and the reopen.
    const first = dedupeKeyFor(RIDE, "2026-08-14T12:17:10.786799+00:00");
    const second = dedupeKeyFor(RIDE, "2026-08-19T09:02:41.114000+00:00");
    expect(first).not.toBe(second);
  });

  it("gives the same occurrence the same key, so one event is one message", () => {
    expect(dedupeKeyFor(RIDE, "2026-08-14T12:17:10.786799+00:00"))
      .toBe(dedupeKeyFor(RIDE, "2026-08-14T12:17:10.786+00:00"));
  });

  it("keeps two rides apart at the same instant", () => {
    const stamp = "2026-08-14T12:17:10.786799+00:00";
    expect(dedupeKeyFor("a", stamp)).not.toBe(dedupeKeyFor("b", stamp));
  });

  it("sends WITHOUT a key rather than risk silence on an unusable timestamp", () => {
    // A duplicate WhatsApp is a nuisance. A swallowed one is the defect.
    expect(dedupeKeyFor(RIDE, null)).toBeNull();
    expect(dedupeKeyFor(RIDE, "not a date")).toBeNull();
    expect(dedupeKeyFor("", "2026-08-14T12:17:10Z")).toBeNull();
    expect(rideUnassignedAlert(facts({ stampedAt: undefined })).dedupeKey).toBeNull();
  });

  it("never emits a key that could collide by accident", () => {
    // enqueue_notification appends ':' || slot_id, so the last segment must be
    // fixed-shape. Digits only — an ISO timestamp would add its own colons.
    const key = dedupeKeyFor(RIDE, "2026-08-14T12:17:10.786799+00:00")!;
    expect(key.split(":").length).toBe(4);
    expect(key.startsWith("ride:no-driver:")).toBe(true);
    expect(key.split(":")[3]).toMatch(/^\d+$/);
  });

  it("matches the alert it is attached to", () => {
    const f = facts();
    expect(rideUnassignedAlert(f).dedupeKey).toBe(dedupeKeyFor(RIDE, f.stampedAt));
  });

  it("cannot be confused with a delivery alert", () => {
    expect(dedupeKeyFor(RIDE, "2026-08-14T12:17:10Z")).not.toContain("delivery");
    expect(RIDE_NO_DRIVER_TYPE).toBe("ride_no_driver");
  });
});
