import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  REQUEST_KINDS,
  ERRAND_KINDS,
  ERRAND_LABEL,
  errandToColumns,
  isErrandKind,
  BUDGET_RULE,
  KIND_LABEL,
  KIND_BLURB,
  LEG_LABEL,
  isRequestKind,
  toRequestKind,
  mayLayOutMoney,
} from "./kind";
import { payAtDoor } from "./request-status";
import {
  newRequestTitle,
  newRequestLines,
  quoteAcceptedLines,
  type RequestFacts,
} from "./request-copy";

// ── The third kind of request, and the ways it could have shipped broken ────
//
// "Do It For Me" is a third value in a column that had two. Nothing about that
// throws, so every real risk here is SILENT, and each one is pinned below.

describe("the kinds themselves", () => {
  it("has the three the database accepts, and no others", () => {
    // delivery_requests_kind_check is the authority. If somebody adds a kind to
    // one and not the other, a customer meets a card that always fails to post,
    // or a row exists that no screen can render.
    expect([...REQUEST_KINDS]).toEqual(["package", "shop_and_deliver", "errand"]);
  });

  it("gives every kind its own words", () => {
    // A Record makes the compiler demand a key. It cannot make the value
    // DIFFERENT, and a copy-paste that leaves two kinds sharing a label is the
    // same bug this module exists to prevent, just spelled by hand.
    for (const [name, map] of [
      ["KIND_LABEL", KIND_LABEL],
      ["KIND_BLURB", KIND_BLURB],
    ] as const) {
      const values = REQUEST_KINDS.map((k) => map[k]);
      expect(
        new Set(values).size,
        `${name} repeats itself: ${values.join(" | ")}`,
      ).toBe(REQUEST_KINDS.length);
      for (const v of values) expect(v.trim().length).toBeGreaterThan(3);
    }
  });

  it("does not call an errand's first leg a collection", () => {
    // The whole point of LEG_LABEL. "Collect" sends a driver looking for a
    // parcel; an errand has nothing to collect until they have done the thing.
    expect(LEG_LABEL.errand.pickup).not.toMatch(/collect/i);
    expect(LEG_LABEL.errand.dropoff).not.toBe(LEG_LABEL.package.dropoff);
  });
});

describe("an unknown kind never invents a promise", () => {
  it("degrades to the least-promising kind", () => {
    // The column is `text`. A row written by a later migration, or by hand at
    // the SQL prompt, can hold anything. Falling back to `package` is chosen
    // rather than incidental: the fallback must never be a kind that says
    // somebody will spend the customer's money.
    expect(toRequestKind("who knows")).toBe("package");
    expect(toRequestKind(null)).toBe("package");
    expect(toRequestKind(undefined)).toBe("package");
    expect(BUDGET_RULE[toRequestKind("who knows")]).toBe("forbidden");
  });

  it("recognises exactly the real ones", () => {
    for (const k of REQUEST_KINDS) expect(isRequestKind(k)).toBe(true);
    for (const junk of ["", "Package", "shop", 3, null, {}]) {
      expect(isRequestKind(junk)).toBe(false);
    }
  });
});

// ── The budget rule, which is why this was not a one-line change ────────────
describe("the budget rule mirrors the table CHECK", () => {
  it("is required for shopping, forbidden for a collection, optional for an errand", () => {
    // delivery_requests_budget_shape used to be an EQUIVALENCE:
    //     (kind = 'shop_and_deliver') = (max_budget IS NOT NULL)
    // which forces a third kind to have NO budget, forever, with no way to say
    // otherwise. Adding 'errand' without rewriting it would have shipped a
    // "Do It For Me" that structurally could not pay a bill.
    expect(BUDGET_RULE.shop_and_deliver).toBe("required");
    expect(BUDGET_RULE.package).toBe("forbidden");
    expect(BUDGET_RULE.errand).toBe("optional");
  });

  it("lets an errand carry money, or not, and a collection never", () => {
    expect(mayLayOutMoney("errand", 250_000)).toBe(true);
    expect(mayLayOutMoney("errand", null)).toBe(false);
    expect(mayLayOutMoney("errand", 0)).toBe(false);
    // Even if a stale number somehow reached a collection, it buys nothing.
    expect(mayLayOutMoney("package", 250_000)).toBe(false);
  });
});

// ── THE MONEY BUG THIS CAUGHT ───────────────────────────────────────────────
describe("what the customer is told to have at the door", () => {
  const errandWithABill = { fee: 30_000, kind: "errand", spendCap: 200_000 };

  it("adds the money laid out on an ERRAND, not just on a shopping run", () => {
    // payAtDoor asked `kind !== "shop_and_deliver"` and returned the fee alone
    // for anything else. Somebody who asked for their CEB bill to be paid would
    // have read "Rs 300" on their tracker and met the driver holding Rs 300
    // against Rs 2,300 owed — with the driver Rs 2,000 out of pocket.
    const v = payAtDoor(errandWithABill, "en");
    expect(v.lines).toHaveLength(2);
    // Rs 300 fee + Rs 2,000 laid out. The separator is whatever
    // centsToShortString does; the SUM is the thing under test.
    expect(v.total.replace(/,/g, "")).toContain("2300");
  });

  it("still shows the fee alone when nothing was bought", () => {
    const v = payAtDoor({ fee: 30_000, kind: "errand", spendCap: null }, "en");
    expect(v.lines).toHaveLength(1);
    expect(v.note).toBeNull();
  });

  it("says the same in all three languages", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(payAtDoor(errandWithABill, lang).lines).toHaveLength(2);
    }
  });
});

describe("what the driver is told", () => {
  const facts = (over: Partial<RequestFacts> = {}): RequestFacts => ({
    id: "r1",
    kind: "errand",
    what: "Pay my CEB bill",
    sizeClass: "standard",
    pickupText: "CEB office, Port Mathurin",
    dropoffText: "Baie du Nord",
    ...over,
  });

  it("does not call an errand a delivery on the lock screen", () => {
    // Three kinds, three titles. A driver told "New delivery" who finds a task
    // has been misled by the only line most of them ever read.
    const titles = REQUEST_KINDS.map((k) => newRequestTitle(facts({ kind: k })));
    expect(new Set(titles).size).toBe(3);
    expect(newRequestTitle(facts())).not.toMatch(/delivery/i);
  });

  it("does not tell a driver to COLLECT something that does not exist yet", () => {
    const lines = newRequestLines(facts()).join("\n");
    expect(lines).toContain("Go to: CEB office, Port Mathurin");
    expect(lines).not.toMatch(/^Collect:/m);
  });

  it("warns that an errand needs money up front", () => {
    // Without this the driver reaches the counter with nothing of their own and
    // the job cannot be done at all.
    const lines = newRequestLines(facts({ spendCap: 200_000 })).join("\n");
    expect(lines.replace(/,/g, "")).toMatch(/up to Rs\s?2000/);
    expect(lines).toMatch(/fee is separate/i);
  });

  it("tells the WINNING driver they get their money back", () => {
    // The same shop-only gate as payAtDoor, on the other side of the
    // transaction: here the driver is the one out of pocket.
    const lines = quoteAcceptedLines({
      fee: 30_000,
      request: facts({ spendCap: 200_000 }),
    }).join("\n");
    expect(lines).toMatch(/keep the receipt/i);
    expect(lines).toMatch(/plus what you spent/i);
    // And it must not tell somebody paying a bill to "buy it first".
    expect(lines).not.toMatch(/buy it first/i);
  });

  it("never leaks the handover PIN", () => {
    // Unchanged by this work, and re-pinned because the errand branch edits the
    // same function: a driver who knows the code can close a job they never did.
    const lines = quoteAcceptedLines({
      fee: 30_000,
      request: facts({ spendCap: 200_000 }),
      pin: "4821",
    }).join("\n");
    expect(lines).not.toContain("4821");
  });
});

// ── An errand asks its own question ─────────────────────────────────────────
describe("an errand does not answer the parcel question", () => {
  // The owner: "do it for me should not have things like parcel, hot food,
  // fragile, heavy, bigger than cars — because it is not delivering something,
  // it should have its own stuffs."
  //
  // It is not only wrong-sounding, it is wrong. cargo_kind and size_class
  // decide WHICH VEHICLES MAY TAKE THE JOB, and they describe an object being
  // carried. "Pay my CEB bill" carries nothing, so every answer on that grid
  // was a fiction the fleet filter then acted on.

  it("offers its own five choices", () => {
    expect([...ERRAND_KINDS]).toEqual([
      "pay_bill",
      "queue",
      "collect",
      "gas",
      "other",
    ]);
  });

  it("gives each of them its own words", () => {
    const labels = ERRAND_KINDS.map((k) => ERRAND_LABEL[k]);
    expect(new Set(labels).size).toBe(ERRAND_KINDS.length);
    for (const l of labels) expect(l.trim().length).toBeGreaterThan(3);
  });

  it("recognises exactly the real ones", () => {
    for (const k of ERRAND_KINDS) expect(isErrandKind(k)).toBe(true);
    // Crucially NOT the parcel choices — the two vocabularies must never be
    // interchangeable, in either direction.
    for (const junk of ["general", "food", "fragile", "heavy", "large", "", null, 7]) {
      expect(isErrandKind(junk)).toBe(false);
    }
  });

  it("never asks a driver for a vehicle it does not need", () => {
    // Almost every errand should be open to the widest possible fleet: nothing
    // is carried, so nothing may be excluded. Narrowing here means fewer
    // quotes on a board that already struggles to get them.
    for (const k of ERRAND_KINDS) {
      const c = errandToColumns(k);
      expect(c.sizeClass, `${k} must not demand a large vehicle`).toBe("standard");
      if (k !== "gas") {
        expect(c.cargoKind, `${k} should not restrict the fleet`).toBe("general");
      }
    }
  });

  it("treats a gas bottle the same way the parcel side already does", () => {
    // The one genuine exception. A gas bottle is `heavy` for an ordinary
    // delivery on this platform; classing it differently here would give one
    // object two fleet rules depending on which card somebody tapped first.
    expect(errandToColumns("gas").cargoKind).toBe("heavy");
  });
});

describe("the form asks the right question for the kind", () => {
  it("does not render the parcel chips for an errand", () => {
    const src = readFileSync("app/deliver/DeliverForm.tsx", "utf8");
    // The grid is chosen by kind before ITEM_CHOICES is ever mapped. Without
    // this, an errand shows "Hot food / Fragile / Bigger than a car" — the
    // regression the owner reported.
    expect(src).toMatch(/kind === "errand" \? errandKind === null : item === null/);
    expect(src).toMatch(/c\.what\.errandQuestion/);
    expect(src).toMatch(/ERRAND_KINDS\.map/);
  });

  it("derives the fleet columns from the errand's own answer", () => {
    const src = readFileSync("app/deliver/DeliverForm.tsx", "utf8");
    // itemToColumns("general") as a stand-in would have quietly worked and
    // been wrong for gas — the one case where an errand DOES need a vehicle.
    expect(src).toMatch(/errandToColumns\(errandKind \?\? "other"\)/);
  });
});

// ── The regression that would not have failed any of the above ──────────────
describe("no screen decides the kind with a two-way ternary", () => {
  // Every one of these files rendered `kind === "shop_and_deliver" ? a : b`.
  // That is correct for two kinds and quietly WRONG for three — an errand fell
  // into the `else` and was labelled a parcel collection on the driver board,
  // the admin desk, the customer's tracker and the push. No test failed,
  // because nothing threw.
  const SCREENS = [
    "app/driver/QuoteBoard.tsx",
    "app/deliver/MyRequests.tsx",
    "app/deliver/[id]/RequestTracker.tsx",
    "app/admin/deliveries/DeliveryBoard.tsx",
    "lib/delivery/request-copy.ts",
    "lib/delivery/request-status.ts",
  ];

  it.each(SCREENS)("%s reads the kind through a map, not a ternary", (file) => {
    const src = readFileSync(file, "utf8");
    // A `? … :` hanging off a shop-kind comparison is the shape that broke.
    const ternary = /kind\s*[!=]==\s*"shop_and_deliver"[\s\S]{0,80}\?/.exec(src);
    expect(
      ternary?.[0],
      `${file} still branches on shop_and_deliver with a ternary — an errand ` +
        `would take the else and be mislabelled.`,
    ).toBeUndefined();
  });
});
