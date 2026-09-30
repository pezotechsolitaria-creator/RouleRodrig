import { describe, it, expect } from "vitest";
import {
  rideUnassignedAlert,
  rideUnreachedAlert,
  dedupeKeyFor,
  unreachedKeyFor,
  RIDE_NO_DRIVER_TYPE,
  RIDE_NO_DRIVER_REMINDER_TYPE,
  RIDE_UNREACHED_TYPE,
  type RideUnassignedFacts,
  type RideUnreachedFacts,
} from "./no-driver-copy";
import { formatWhatsAppMessage } from "@/lib/notifications/queue";

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
    expect(a.lines[1]).toBe("Dofof's number: +230 5836 3401");
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
    expect(text(facts({ customerPhone: null }))).toContain("Dofof's number is on the rides page.");
    expect(text(facts({ customerPhone: null, customerName: null }))).toContain("The customer's number is on the rides page.");
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

// ── RR-0E90AD, 29 Sep 2026 ──────────────────────────────────────────────────
// An airport pickup booked four days ahead. The only driver who takes airport
// runs had no WhatsApp and no phone alerts, was "offered" it in four rounds,
// and the owner was told he "was asked and did not accept" — while the
// message also said the customer had "been waiting 89 hours 42 minutes".

describe("asked is not the same as told", () => {
  const sam = { driversAsked: 1, unreachable: ["Mr Sam"], unreachableNoAlerts: ["Mr Sam"] };

  it("says the only driver was never alerted, instead of blaming him for not accepting", () => {
    const t = text(facts(sam));
    expect(t).toContain("Mr Sam was offered it but was never alerted to it.");
    expect(t).toContain("Mr Sam has no WhatsApp or phone alerts set up.");
    expect(t).not.toContain("did not accept");
    expect(t).toContain("Drivers → Send link");
  });

  it("claims only what is known: alerted or not, never 'saw'", () => {
    // A driver with no alerts can still open his own page and see a live offer.
    expect(text(facts(sam))).not.toMatch(/saw it|never seen/);
  });

  it("says none of several was alerted when none was", () => {
    const t = text(facts({ driversAsked: 2, unreachable: ["Mr Sam", "Ravi"], unreachableNoAlerts: ["Mr Sam", "Ravi"] }));
    expect(t).toContain("2 drivers were offered it, and none of them was alerted to it.");
    expect(t).toContain("Mr Sam and Ravi have no WhatsApp or phone alerts set up.");
    expect(t).not.toContain("None accepted");
  });

  it("keeps the refusal and names only the ones who were never alerted", () => {
    const t = text(facts({ driversAsked: 3, unreachable: ["Mr Sam"], unreachableNoAlerts: ["Mr Sam"] }));
    expect(t).toContain("3 drivers were asked. None accepted, and Mr Sam was never alerted to it.");
    expect(text(facts({ driversAsked: 3, unreachable: ["Mr Sam", "Ravi"] })))
      .toContain("and Mr Sam and Ravi were never alerted to it.");
  });

  it("tells a code that does not work from alerts that were never set up", () => {
    // A typo'd WhatsApp code reads as "set up" and fails every send.
    const t = text(facts({ driversAsked: 1, unreachable: ["Ravi"], unreachableFailed: ["Ravi"] }));
    expect(t).toContain("The alert to Ravi did not go through: check the WhatsApp code saved on the rides page, under Drivers.");
    expect(t).not.toContain("no WhatsApp or phone alerts set up");
    expect(t).not.toContain("Send link");
  });

  it("counts a driver asked in four rounds once", () => {
    const t = text(facts({ driversAsked: 1, unreachable: ["Mr Sam", "Mr Sam", " "] }));
    expect(t).toContain("Mr Sam was offered it but was never alerted to it.");
  });

  it("is unchanged when everyone asked was alerted, or when we could not tell", () => {
    expect(text(facts({ driversAsked: 1, unreachable: [] }))).toContain("One driver was asked and did not accept.");
    expect(text(facts({ driversAsked: 4, unreachable: null }))).toContain("4 drivers were asked. None accepted.");
    expect(text(facts({ driversAsked: 4, unreachable: null }))).not.toContain("Send link");
  });
});

describe("a booked ride says when it is, not how long ago it was booked", () => {
  const booked = facts({
    minutesWaiting: 89 * 60 + 42,
    pickupAt: "2026-09-30T07:00:00.000Z", // 11:00 in Rodrigues
    minutesToPickup: 1396,
  });

  it("leads with the pickup time in island time and how far away it is", () => {
    const a = rideUnassignedAlert(booked);
    expect(a.lines[0]).toMatch(/^Dofof's pickup is Wed 30 Sept?, 11:00 \(in 23 hours 16 minutes\) and there is still no driver\.$/);
    expect(a.lines.join("\n")).not.toContain("89 hours");
  });

  it("falls back to the wait for a ride booked for now", () => {
    expect(text(facts({ minutesWaiting: 12, pickupAt: null, minutesToPickup: null })))
      .toContain("has been waiting 12 minutes");
  });

  it("does not say a pickup that has already passed is still to come", () => {
    const t = text(facts({ minutesWaiting: 30, pickupAt: "2026-09-30T07:00:00.000Z", minutesToPickup: null }));
    expect(t).not.toContain("pickup is");
    expect(t).toContain("has been waiting 30 minutes");
  });

  it("never writes The customer's's", () => {
    const t = text(facts({ customerName: null, pickupAt: "2026-09-30T07:00:00.000Z", minutesToPickup: 90 }));
    expect(t).toContain("The customer's pickup is");
    expect(t).not.toContain("'s's");
  });
});

describe("the reminder before pickup", () => {
  const f = facts({ pickupAt: "2026-09-30T07:00:00.000Z", minutesToPickup: 300, reminder: true });

  it("is its own message, so the first alert's key cannot swallow it", () => {
    const first = rideUnassignedAlert({ ...f, reminder: false });
    const again = rideUnassignedAlert(f);
    expect(again.type).toBe(RIDE_NO_DRIVER_REMINDER_TYPE);
    expect(again.dedupeKey).not.toBe(first.dedupeKey);
    expect(again.dedupeKey).toMatch(/^ride:no-driver-reminder:[^:]+:\d+$/);
  });

  it("says it is still unassigned and when the pickup is", () => {
    const a = rideUnassignedAlert(f);
    expect(a.title).toBe("Still no driver for Dofof");
    expect(a.lines[0]).toContain("(in 5 hours)");
  });
});

describe("the round that reached nobody", () => {
  const u = (over: Partial<RideUnreachedFacts> = {}): RideUnreachedFacts => ({
    rideId: RIDE,
    ladderStartedAt: "2026-09-29T07:00:47.632686+00:00",
    customerName: "Dofof",
    customerPhone: "+230 5836 3401",
    pickup: "Plaine Corail Airport",
    dropoff: "Le tekoma",
    pickupAt: "2026-09-30T07:00:00.000Z",
    minutesToPickup: 1439,
    noAlerts: ["Mr Sam"],
    noNumber: [],
    failed: [],
    ...over,
  });
  const all = (f: RideUnreachedFacts) => {
    const a = rideUnreachedAlert(f);
    return [a.title, ...a.lines].join("\n");
  };

  it("says who was never alerted, and why, while the ladder is still running", () => {
    const a = rideUnreachedAlert(u());
    expect(a.type).toBe(RIDE_UNREACHED_TYPE);
    expect(a.title).toBe("No driver was told about Dofof's ride");
    const t = all(u());
    expect(t).toContain("The offer went to Mr Sam, but no WhatsApp or phone alerts are set up, so no alert went out.");
    expect(t).toContain("Ring a driver yourself and give them the ride on the rides page.");
    expect(t).toContain("Drivers → Send link");
  });

  it("says whose number it is, so a customer's number never reads as a driver's", () => {
    // It sits under "Ring a driver yourself…", where every nearby "them" is a driver.
    expect(all(u())).toContain("Dofof's number: +230 5836 3401");
    expect(all(u())).not.toMatch(/^Their number/m);
  });

  it("tells a now-ride from a booking", () => {
    expect(all(u({ pickupAt: null, minutesToPickup: null }))).toContain("Dofof wants a ride now.");
    expect(all(u())).toContain("Dofof's pickup is");
  });

  it("names a missing number and a failed send for what they are", () => {
    const t = all(u({ noAlerts: [], noNumber: ["Anil"], failed: ["Ravi"] }));
    expect(t).toContain("Anil has no phone number saved");
    expect(t).toContain("The alert to Ravi did not go through: check the WhatsApp code saved on the rides page");
    expect(t).not.toContain("Send link");
  });

  it("agrees has/have with the number of names", () => {
    expect(all(u({ noAlerts: [], noNumber: ["Anil", "Ravi"] }))).toContain("Anil and Ravi have no phone number saved");
  });

  it("is one message per run of the ladder, and a new run alerts again", () => {
    const k1 = unreachedKeyFor(RIDE, "2026-09-29T07:00:47.632686+00:00");
    const k2 = unreachedKeyFor(RIDE, "2026-09-30T02:10:00.000+00:00");
    expect(rideUnreachedAlert(u()).dedupeKey).toBe(k1);
    expect(k1).not.toBe(k2);
    expect(k1).toMatch(/^ride:unreached:[^:]+:\d+$/);
    expect(unreachedKeyFor(RIDE, null)).toBeNull();
  });

  it("uses none of our internal vocabulary", () => {
    const t = all(u({ noNumber: ["Anil"], failed: ["Ravi"] })).toLowerCase();
    for (const word of ["no_driver", "dispatch", "ride_offers", "queue", "cron", "status", "payload", "slot", "undefined", "null"]) {
      expect(t, word).not.toContain(word);
    }
  });
});

// ── WHAT CALLMEBOT WILL NOT CARRY ──────────────────────────────────────────
// Twelve of twelve of these alerts queued for WhatsApp died with "CallMeBot
// 403: Forbidden" — the provider's firewall refusing the text. Reproduced on
// 29 Sep 2026 with a dummy key: the smallest refused text was a line break
// followed by "Call them". This pins the WhatsApp body, as actually formatted,
// against the one shape that is known to be refused.
describe("the WhatsApp body never carries the shape CallMeBot refuses", () => {
  const BLOCKED = /\n\s*call (them|him|her)\b/i;
  const bodies = [
    ...[
      {},
      { customerPhone: null },
      { driversAsked: 1, unreachable: ["Mr Sam"] },
      { driversAsked: 3, unreachable: ["Mr Sam"] },
      { pickupAt: "2026-09-30T07:00:00.000Z", minutesToPickup: 300, reminder: true },
      { customerName: null, customerPhone: null, minutesWaiting: null },
    ].map((over) => rideUnassignedAlert(facts(over as Partial<RideUnassignedFacts>))),
    rideUnreachedAlert({
      rideId: RIDE, ladderStartedAt: null, customerPhone: "+230 5836 3401",
      noAlerts: ["Mr Sam"], noNumber: ["Anil"], failed: ["Ravi"],
    }),
  ].map((a) => formatWhatsAppMessage({ title: a.title, lines: a.lines }));

  it("has no line opening with 'Call them' or 'Call him'", () => {
    for (const body of bodies) expect(body).not.toMatch(BLOCKED);
  });

  it("still carries the customer's number", () => {
    expect(bodies[0]).toContain("+230 5836 3401");
  });
});
