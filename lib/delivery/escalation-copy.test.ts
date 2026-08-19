import { describe, it, expect } from "vitest";
import {
  deliveryStallAlert,
  dedupeKeyFor,
  plainDuration,
  stallBoardLine,
  type DeliveryStallFacts,
  type DeliveryStallKind,
} from "./escalation-copy";

// One array in the sweep carried two opposite facts, so one sentence had to
// serve both: "No driver found. The customer is waiting. Assign someone or call
// them." For a delivery already in a driver's bag that sentence instructs the
// owner to do the one thing the database then refuses (RR091). These assertions
// are the guard on the words themselves.

const ALL: DeliveryStallKind[] = ["no_driver", "not_collected", "package_with_driver"];

const facts = (over: Partial<DeliveryStallFacts> = {}): DeliveryStallFacts => ({
  kind: "no_driver",
  deliveryId: "9cffbc6a-6902-4d83-826e-469327e9dc2d",
  reassignments: 0,
  orderNumber: "RR260812-B6C5A5",
  shop: "Ti Kitchen",
  shopPhone: "+230 5471 2233",
  driverName: "Marc Perrine",
  driverPhone: "+230 5999 1234",
  minutesOverdue: 26,
  minutesWaiting: 52,
  ...over,
});

const text = (f: DeliveryStallFacts) => {
  const a = deliveryStallAlert(f);
  return [a.title, ...a.lines].join("\n");
};

describe("the message leads with where the package is", () => {
  it("says the shop when nobody ever accepted", () => {
    const a = deliveryStallAlert(facts({ kind: "no_driver" }));
    expect(a.title).toBe("Still at the shop — nobody took it");
    expect(a.lines[0]).toBe("Order RR260812-B6C5A5 is waiting at Ti Kitchen. No driver accepted it.");
  });

  it("says the shop when a driver accepted and never came", () => {
    const a = deliveryStallAlert(facts({ kind: "not_collected" }));
    expect(a.title).toBe("Still at the shop — the driver never came");
    expect(a.lines[0]).toContain("never collected it from Ti Kitchen");
  });

  it("names the driver holding it when he has it", () => {
    const a = deliveryStallAlert(facts({ kind: "package_with_driver" }));
    expect(a.title).toBe("Marc Perrine has the package");
    expect(a.lines[0]).toContain("Marc Perrine collected");
    expect(text(facts({ kind: "package_with_driver" }))).toContain("with him, not at the shop");
  });

  it("STOPS the wrong action rather than merely omitting it", () => {
    // The whole point. Without this sentence the owner reads "a driver has it"
    // and still reaches for Reassign, which sends a second rider to an empty
    // counter.
    expect(text(facts({ kind: "package_with_driver" }))).toContain(
      "Do not send another driver to the shop",
    );
    // ...and the two shop-side messages must NOT carry it, or it reads as
    // boilerplate and stops being noticed.
    expect(text(facts({ kind: "no_driver" }))).not.toContain("Do not send another driver");
    expect(text(facts({ kind: "not_collected" }))).not.toContain("Do not send another driver");
  });

  it("never tells the owner to assign someone to a package in a bag", () => {
    const t = text(facts({ kind: "package_with_driver" })).toLowerCase();
    expect(t).not.toContain("assign");
    expect(t).not.toContain("no driver found");
  });

  it("gives the driver's number where the driver is the next action", () => {
    expect(text(facts({ kind: "package_with_driver" }))).toContain("+230 5999 1234");
    expect(text(facts({ kind: "not_collected" }))).toContain("+230 5999 1234");
    // Nobody accepted it, so there is no driver to call — the shop is the lead.
    expect(text(facts({ kind: "no_driver" }))).not.toContain("+230 5999 1234");
    expect(text(facts({ kind: "no_driver" }))).toContain("+230 5471 2233");
  });
});

describe("the owner is never shown our internal vocabulary", () => {
  const BANNED = [
    "requires_admin", "driver_unresponsive", "searching_driver", "stranded",
    "sweep", "escalation", "loop", "null", "undefined", "RR091", "dedupe",
    "delivery_status", "enum", "array",
  ];

  it("uses none of it, in any kind, with or without data", () => {
    for (const kind of ALL) {
      for (const f of [facts({ kind }), { kind, deliveryId: "x", reassignments: 0 }]) {
        const t = text(f).toLowerCase();
        for (const word of BANNED) {
          expect(t, `${kind} leaked "${word}"`).not.toContain(word.toLowerCase());
        }
      }
    }
  });

  it("degrades to a readable sentence when every optional fact is missing", () => {
    for (const kind of ALL) {
      const a = deliveryStallAlert({ kind, deliveryId: "d", reassignments: 0 });
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.lines.length).toBeGreaterThanOrEqual(3);
      // No dangling "from " or double spaces from an absent shop name.
      expect(a.lines.join(" ")).not.toMatch(/\s{2,}|from\s*$|at\s*\./);
    }
  });
});

describe("dedupe keys, because a collision is silently swallowed", () => {
  it("gives the three situations three prefixes", () => {
    const keys = ALL.map((k) => dedupeKeyFor(k, "d", 0));
    expect(new Set(keys).size).toBe(3);
  });

  it("lets a delivery that strands twice alert twice — the swallowed case", () => {
    // Before this: loop 1 and loop 3 both built `delivery:no-driver:<id>`, so
    // the second INSERT hit the permanent UNIQUE, enqueue_notification
    // swallowed unique_violation, and the alert saying a driver had vanished
    // with the goods was never sent at all.
    const first = dedupeKeyFor("no_driver", "abc", 0);
    const afterReassign = dedupeKeyFor("package_with_driver", "abc", 1);
    expect(first).not.toBe(afterReassign);
  });

  it("separates repeats of the same kind by the hand-on count", () => {
    expect(dedupeKeyFor("no_driver", "abc", 0)).not.toBe(dedupeKeyFor("no_driver", "abc", 1));
  });

  it("never emits a key that could collide by accident", () => {
    // enqueue_notification appends ':' || slot_id, so a key that already ends
    // in a variable-length segment must still be unambiguous.
    for (const k of ALL) {
      const key = dedupeKeyFor(k, "9cffbc6a-6902-4d83-826e-469327e9dc2d", 3);
      expect(key.endsWith(":3")).toBe(true);
      expect(key.split(":").length).toBe(4);
    }
  });

  it("survives a nonsense count rather than producing 'NaN'", () => {
    expect(dedupeKeyFor("no_driver", "d", Number.NaN)).toBe("delivery:no-driver:d:0");
    expect(dedupeKeyFor("no_driver", "d", -5)).toBe("delivery:no-driver:d:0");
  });

  it("matches the alert it is attached to", () => {
    for (const kind of ALL) {
      const a = deliveryStallAlert(facts({ kind, reassignments: 2 }));
      expect(a.dedupeKey).toBe(dedupeKeyFor(kind, facts().deliveryId, 2));
    }
  });

  it("gives each situation its own notification type", () => {
    expect(new Set(ALL.map((k) => deliveryStallAlert(facts({ kind: k })).type)).size).toBe(3);
  });
});

describe("how long it has been", () => {
  it("reads as a person would say it", () => {
    expect(plainDuration(1)).toBe("1 minute");
    expect(plainDuration(26)).toBe("26 minutes");
    expect(plainDuration(60)).toBe("1 hour");
    expect(plainDuration(65)).toBe("1 hour 5 minutes");
    expect(plainDuration(121)).toBe("2 hours 1 minute");
  });

  it("never says '0 minutes' or a negative", () => {
    expect(plainDuration(0)).toBe("1 minute");
    expect(plainDuration(-3)).toBe("1 minute");
  });

  it("is simply omitted when unknown, not guessed", () => {
    const a = deliveryStallAlert(facts({ kind: "package_with_driver", minutesOverdue: null }));
    expect(a.lines.join("\n")).not.toContain("past the time");
  });
});

describe("the owner is told where it is going", () => {
  const PIN = { dropoffLat: -19.7024, dropoffLng: 63.4105 };
  const line = (over: Partial<DeliveryStallFacts>) =>
    deliveryStallAlert(facts(over)).lines.join("\n");

  it("carries the note and the map in every stall kind", () => {
    for (const kind of ALL) {
      const t = line({ kind, dropoffNote: "Jean tac", ...PIN });
      expect(t, kind).toContain("Drop-off: Jean tac");
      expect(t, kind).toContain("Map: https://www.google.com/maps/search/");
    }
  });

  it("still gives a map when the customer typed no note", () => {
    // The note is optional; the pin is guaranteed on an order-sourced
    // delivery, which is why the map is the line that can be relied on.
    const t = line({ kind: "no_driver", dropoffNote: null, ...PIN });
    expect(t).not.toContain("Drop-off:");
    expect(t).toContain("Map: ");
  });

  it("never leaves a dangling label", () => {
    for (const note of [null, undefined, "", "   "]) {
      expect(line({ kind: "no_driver", dropoffNote: note, ...PIN })).not.toContain("Drop-off:");
    }
    const noPin = line({ kind: "no_driver", dropoffNote: "Jean tac", dropoffLat: null, dropoffLng: null });
    expect(noPin).not.toContain("Map:");
    expect(noPin).toContain("Drop-off: Jean tac");
  });

  it("refuses 0,0 — the field-defaulted-to-zero artefact", () => {
    // The Gulf of Guinea. Sending the owner there is worse than sending him
    // nowhere.
    const t = line({ kind: "no_driver", dropoffNote: null, dropoffLat: 0, dropoffLng: 0 });
    expect(t).not.toContain("Map:");
  });

  it("puts the location before the action, not after it", () => {
    const lines = deliveryStallAlert(facts({ kind: "package_with_driver", dropoffNote: "Jean tac", ...PIN })).lines;
    const where = lines.findIndex((l) => l.startsWith("Drop-off:"));
    const stop = lines.findIndex((l) => l.startsWith("Do not send another driver"));
    expect(where).toBeGreaterThan(-1);
    expect(where).toBeLessThan(stop);
  });

  it("does not call a free-text note an address", () => {
    expect(line({ kind: "no_driver", dropoffNote: "Jean tac", ...PIN }).toLowerCase())
      .not.toContain("address");
  });
});

describe("the board says the same thing as the message that links to it", () => {
  const row = (over: Partial<Parameters<typeof stallBoardLine>[0]> = {}) => ({
    status: "requires_admin",
    driverId: null as string | null,
    driverName: null as string | null,
    storeName: "Ti Kitchen",
    lateBy: 0,
    unclaimedFor: 0,
    offersOut: 0,
    ...over,
  });

  it("no longer claims a driver has a package nobody collected", () => {
    // The exact production row that exposed this: requires_admin, driver_id
    // null, event log ending at 'delivery.no_driver_found'.
    const line = stallBoardLine(row());
    expect(line).toBe("Nobody took it. It is still at Ti Kitchen.");
    expect(line).not.toContain("has the package");
  });

  it("does say it when a driver really does have it", () => {
    const line = stallBoardLine(row({ driverId: "d1", driverName: "Marc Perrine" }));
    expect(line).toContain("Marc Perrine has the package");
    expect(line).toContain("Don't send anyone to the shop");
  });

  it("can never contradict the 'No driver yet' line beside it", () => {
    // Both are driven by the same fact now. When driverName is null the board
    // prints "No driver yet"; this line must agree.
    const noDriver = stallBoardLine(row({ driverId: null, driverName: null }));
    expect(noDriver).not.toContain("driver has");
    expect(noDriver).not.toContain("A driver");
  });

  it("describes the never-collected status instead of '0 minutes, 0 offers'", () => {
    // driver_unresponsive rows come back with lateBy 0 and unclaimedFor 0, so
    // the old fallback read "No driver has taken it for 0 minutes (0 offers
    // out)" about the one status meaning a driver DID take it.
    const line = stallBoardLine(row({ status: "driver_unresponsive", driverId: "d1", driverName: "Marc" }));
    expect(line).toBe("Marc took it but never collected it. It is still at Ti Kitchen.");
  });

  it("keeps the ordinary late and unclaimed lines", () => {
    expect(stallBoardLine(row({ status: "out_for_delivery", lateBy: 12 }))).toBe("12 minutes past due.");
    expect(stallBoardLine(row({ status: "searching_driver", unclaimedFor: 9, offersOut: 3 })))
      .toBe("No driver has taken it for 9 minutes (3 offers out).");
  });
});
