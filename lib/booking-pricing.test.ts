import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deliveryFee,
  depositPct,
  extractDailyPrice,
  priceBreakdown,
  rentalDays,
  todayInRodrigues,
  validateRentalWindow,
} from "./booking-pricing";

const SCOOTER = { price: "Rs 1,200/day", category: "scooter" };
const CAR = { price: "Rs 2,500 / day", category: "car" };

describe("extractDailyPrice", () => {
  it("parses formatted display prices", () => {
    expect(extractDailyPrice("Rs 1,200/day")).toBe(1200);
    expect(extractDailyPrice("Rs 950")).toBe(950);
  });
  it("returns 0 for garbage — the caller must not price the unpriceable", () => {
    expect(extractDailyPrice("call us")).toBe(0);
  });

  // These are the inputs that made the site CHARGE Rs 21 for a Rs 21,475
  // vehicle. A French-locale keyboard groups thousands with a space, and this
  // is a trilingual product, so the owner typing "Rs 21 475" in /admin is
  // ordinary — not an edge case. The old /[\d,]+/ regex stopped at the space.
  it("handles space-grouped thousands (French locale) — was read as 21", () => {
    expect(extractDailyPrice("Rs 21 475")).toBe(21475);
  });
  it("handles a non-breaking space, which is what Intl actually emits", () => {
    expect(extractDailyPrice("Rs 21 475")).toBe(21475);
    expect(extractDailyPrice("Rs 21 475")).toBe(21475);
  });
  it('handles a "From " prefix — was read as 1', () => {
    expect(extractDailyPrice("From Rs 1 200/day")).toBe(1200);
  });
  it("ignores a trailing unit and any text after the number", () => {
    expect(extractDailyPrice("Rs 1,200 / day incl. helmet")).toBe(1200);
  });

  it("agrees with priceNumber for every realistic owner input", async () => {
    // The display parser and the charge parser MUST be the same function now;
    // they disagreed on two of these five before 2026-08-08.
    //
    // The import is dynamic because lib/site-data pulls in a wide dependency
    // graph that the rest of this file has no use for. Under full-suite load
    // that import alone crossed vitest's 5s default and failed this test four
    // separate times while passing on its own — which reads as a pricing
    // regression and is not one. The budget is the fix; the assertion is
    // untouched.
    const { priceNumber } = await import("./site-data");
    for (const p of ["Rs 1,200/day", "Rs 21 475", "From Rs 1 200/day", "Rs 599", "Rs 2 000"]) {
      expect(priceNumber(p)).toBe(extractDailyPrice(p));
    }
  }, 30_000);
});

describe("priceBreakdown", () => {
  it("scooter, 1 day: full rate + Rs 400 delivery, 25% deposit", () => {
    const b = priceBreakdown(SCOOTER, 1)!;
    expect(b).toMatchObject({ rental: 1200, delivery: 400, total: 1600, pct: 25 });
    expect(b.deposit).toBe(400);
    expect(b.balance).toBe(1200);
  });

  it("3+ days earns the 10% tier", () => {
    const b = priceBreakdown(SCOOTER, 3)!;
    expect(b.rental).toBe(Math.round(1200 * 0.9) * 3);
  });

  it("7+ days earns the 15% tier", () => {
    const b = priceBreakdown(SCOOTER, 7)!;
    expect(b.rental).toBe(Math.round(1200 * 0.85) * 7);
  });

  it("car: free delivery and a 50% deposit", () => {
    const b = priceBreakdown(CAR, 2)!;
    expect(b.delivery).toBe(0);
    expect(b.pct).toBe(50);
    expect(b.deposit).toBe(Math.round(b.total / 2));
  });

  it("deposit + balance always reconstruct the total exactly", () => {
    for (const days of [1, 2, 3, 6, 7, 14, 30]) {
      const b = priceBreakdown(SCOOTER, days)!;
      expect(b.deposit + b.balance).toBe(b.total);
    }
  });

  it("refuses to price zero days or an unpriceable vehicle", () => {
    expect(priceBreakdown(SCOOTER, 0)).toBeNull();
    expect(priceBreakdown({ price: "on request" }, 2)).toBeNull();
    expect(priceBreakdown(undefined, 2)).toBeNull();
  });
});

// ── Delivery is the owner's number now, not a constant ─────────────────────
//
// The rule it replaces (cars free, everything else Rs 400) was unreachable from
// /admin. These lock in the two things that could go wrong in the swap: an
// untouched category must keep charging yesterday's figure, and an explicit
// Rs 0 must mean FREE rather than "unset" — the classic falsy-number bug, and
// the one that would have silently charged Rs 400 for free scooter delivery.
describe("deliveryFee — owner-set, per category", () => {
  const CATS = [
    { id: "scooter", deliveryFee: 250 },
    { id: "car", deliveryFee: 600 },
    { id: "kayak" }, // never opened in admin
    { id: "ebike", deliveryFee: 0 }, // deliberately free
  ];

  it("charges what the owner typed for that category", () => {
    expect(deliveryFee(SCOOTER, CATS)).toBe(250);
    expect(deliveryFee(CAR, CATS)).toBe(600);
  });

  it("treats an explicit 0 as free, not as unset", () => {
    expect(deliveryFee({ price: "Rs 500", category: "ebike" }, CATS)).toBe(0);
  });

  it("falls back to the pre-2026-08-13 rule for a category with no fee set", () => {
    expect(deliveryFee({ price: "Rs 500", category: "kayak" }, CATS)).toBe(400);
  });

  it("falls back for a vehicle whose category is not in the list at all", () => {
    expect(deliveryFee({ price: "Rs 500", category: "jetski" }, CATS)).toBe(400);
    expect(deliveryFee(CAR, CATS.filter((c) => c.id !== "car"))).toBe(0);
  });

  it("keeps the old behaviour when no categories are passed", () => {
    expect(deliveryFee(SCOOTER)).toBe(400);
    expect(deliveryFee(CAR)).toBe(0);
  });

  it("refuses a negative or fractional fee rather than charging it", () => {
    expect(deliveryFee(SCOOTER, [{ id: "scooter", deliveryFee: -500 }])).toBe(0);
    expect(deliveryFee(SCOOTER, [{ id: "scooter", deliveryFee: 249.6 }])).toBe(250);
    expect(deliveryFee(SCOOTER, [{ id: "scooter", deliveryFee: NaN }])).toBe(400);
  });

  it("flows through priceBreakdown into the total and the deposit", () => {
    const b = priceBreakdown(CAR, 2, [{ id: "car", deliveryFee: 600 }])!;
    expect(b.delivery).toBe(600);
    expect(b.total).toBe(b.rental + 600);
    expect(b.deposit).toBe(Math.round(b.total / 2));
    expect(b.deposit + b.balance).toBe(b.total);
  });

  // The customer's summary and the server's charge call the same function, so
  // the only way they can disagree is by being handed different categories.
  it("gives the same answer for the same category list — the quote IS the charge", () => {
    const cats = [{ id: "scooter", deliveryFee: 275 }];
    const shown = priceBreakdown(SCOOTER, 4, cats)!;
    const charged = priceBreakdown(SCOOTER, 4, cats)!;
    expect(charged.total).toBe(shown.total);
    expect(charged.deposit).toBe(shown.deposit);
  });
});

// ── The deposit is the owner's number too ──────────────────────────────────
//
// Same shape as the delivery fee, same two rules: a category he never opened
// behaves exactly as it did before, and one he did set is honoured. The extra
// care here is the clamp — this percentage decides how much money reserves a
// vehicle, and a typo in an admin box must not be able to reserve one for
// nothing or charge more than the rental costs.
describe("depositPct — owner-set, per category", () => {
  const CATS = [
    { id: "scooter", depositPct: 40 },
    { id: "car", depositPct: 100 },
    { id: "kayak" }, // never opened in admin
  ];

  it("uses the percentage the owner typed", () => {
    expect(depositPct(SCOOTER, CATS)).toBe(40);
  });

  it("allows 100 — pay in full to confirm is a real choice", () => {
    const b = priceBreakdown(CAR, 2, CATS)!;
    expect(b.pct).toBe(100);
    expect(b.deposit).toBe(b.total);
    expect(b.balance).toBe(0);
  });

  it("keeps the old rule for a category with nothing set", () => {
    expect(depositPct({ price: "Rs 500", category: "kayak" }, CATS)).toBe(25);
    expect(depositPct({ price: "Rs 500", category: "jetski" }, CATS)).toBe(25);
  });

  it("keeps the old rule when no categories are passed at all", () => {
    expect(depositPct(SCOOTER)).toBe(25);
    expect(depositPct(CAR)).toBe(50);
  });

  it("refuses a percentage that would break the arithmetic", () => {
    // 0 would reserve a vehicle for nothing; >100 would charge more than the
    // rental. Both are typos, and neither may reach a customer.
    expect(depositPct(SCOOTER, [{ id: "scooter", depositPct: 0 }])).toBe(1);
    expect(depositPct(SCOOTER, [{ id: "scooter", depositPct: -20 }])).toBe(1);
    expect(depositPct(SCOOTER, [{ id: "scooter", depositPct: 250 }])).toBe(100);
    expect(depositPct(SCOOTER, [{ id: "scooter", depositPct: NaN }])).toBe(25);
  });

  it("still reconstructs the total exactly at any percentage", () => {
    for (const pct of [1, 10, 25, 33, 50, 75, 99, 100]) {
      const b = priceBreakdown(SCOOTER, 3, [{ id: "scooter", depositPct: pct }])!;
      expect(b.deposit + b.balance).toBe(b.total);
      expect(b.deposit).toBeGreaterThan(0);
    }
  });
});

describe("rentalDays", () => {
  // ── THE OFF-BY-ONE THAT GAVE AWAY A DAY ON EVERY RENTAL ──────────────────
  //
  // Reported from a real WhatsApp alert: "01/AUG/2026 -> 08/AUG/2026 (7 days)".
  // Someone who collects on the 1st and returns on the 8th has the bike on the
  // 1st, 2nd, 3rd, 4th, 5th, 6th, 7th AND 8th. Seven is the number of NIGHTS,
  // and a scooter is not a hotel room.
  it("counts BOTH ends — the day you collect and the day you bring it back", () => {
    expect(rentalDays("2026-08-01", "2026-08-08")).toBe(8);
    expect(rentalDays("2026-09-01", "2026-09-03")).toBe(3);
    expect(rentalDays("2026-09-01", "2026-09-02")).toBe(2);
  });

  it("still treats a same-day rental as one day", () => {
    // This was the one case the old code got right, and only by accident:
    // Math.max(1, 0) papered over the missing day.
    expect(rentalDays("2026-09-01", "2026-09-01")).toBe(1);
  });

  it("never gives a day away across a month or a year boundary", () => {
    expect(rentalDays("2026-08-30", "2026-09-02")).toBe(4);
    expect(rentalDays("2026-12-30", "2027-01-02")).toBe(4);
  });

  it("rejects reversed or malformed dates as 0", () => {
    // 0 is what validateRentalWindow() reads as "the return is before pickup",
    // so this must NOT become 1 now that the arithmetic adds a day.
    expect(rentalDays("2026-09-03", "2026-09-01")).toBe(0);
    expect(rentalDays("garbage", "2026-09-01")).toBe(0);
    expect(rentalDays("2026-9-1", "2026-09-03")).toBe(0);
    expect(rentalDays("", "")).toBe(0);
  });
});

describe("the whole platform agrees on how long a rental is", () => {
  // Three separate implementations of "how many days" existed: this one, a
  // daysBetween() inside BookingSection.tsx that returned 0 for a same-day
  // booking where this returned 1, and a bookedDays() in the bookings route
  // that fed the owner's WhatsApp alert. The quote on screen, the amount
  // charged and the number on his phone could all disagree.
  const src = (rel: string) =>
    readFileSync(join(__dirname, "..", rel), "utf8");

  it("the booking form prices with rentalDays, not a local copy", () => {
    const form = src("components/BookingSection.tsx");
    expect(form).toMatch(/rentalDays\(/);
    expect(form).not.toMatch(/function daysBetween/);
  });

  it("the owner's WhatsApp alert counts the same days it charges for", () => {
    const route = src("app/api/bookings/route.ts");
    expect(route).not.toMatch(/function bookedDays/);
    expect(route).toMatch(/rentalDays\(record\.start_date, record\.end_date\)/);
  });

  it("a single tap still means one day, not two", () => {
    // effectiveEnd used to default to start+1, which was 1 day under the old
    // exclusive maths. Left alone it would now silently charge for 2.
    const form = src("components/BookingSection.tsx");
    expect(form).toMatch(/const effectiveEnd = form\.end_date \|\| form\.start_date;/);
  });

  it("the trip planner asks for the number of days it promised", () => {
    // "3 days" must set end = start + 2, not start + 3.
    const form = src("components/BookingSection.tsx");
    expect(form).toMatch(/isoAddDays\(start, Math\.max\(0, n - 1\)\)/);
  });
});

describe("validateRentalWindow", () => {
  // Fixed "now": 2026-08-08 10:00 UTC = 14:00 in Rodrigues → today is 2026-08-08.
  const NOW = new Date("2026-08-08T10:00:00Z");

  it("accepts a normal future rental", () => {
    expect(validateRentalWindow("2026-08-10", "2026-08-14", NOW)).toBeNull();
  });
  it("accepts a booking starting today (Rodrigues time)", () => {
    expect(validateRentalWindow("2026-08-08", "2026-08-09", NOW)).toBeNull();
  });
  it("rejects the past", () => {
    expect(validateRentalWindow("2026-08-07", "2026-08-09", NOW)).toMatch(/already passed/);
  });
  it("rejects return before pickup", () => {
    expect(validateRentalWindow("2026-08-14", "2026-08-10", NOW)).toMatch(/on or after/);
  });
  it("rejects malformed dates", () => {
    expect(validateRentalWindow("08/14/2026", "2026-08-15", NOW)).toMatch(/don't look right/);
  });
  it("rejects a hold longer than 60 days", () => {
    expect(validateRentalWindow("2026-08-10", "2026-10-20", NOW)).toMatch(/60 days/);
  });
  it("rejects a start more than a year out", () => {
    expect(validateRentalWindow("2027-09-01", "2027-09-05", NOW)).toMatch(/year ahead/);
  });

  it("Rodrigues midnight edge: 21:00 UTC is already TOMORROW in Rodrigues (UTC+4)", () => {
    const lateUtc = new Date("2026-08-08T21:00:00Z"); // 01:00 Aug 9 in Rodrigues
    expect(todayInRodrigues(lateUtc)).toBe("2026-08-09");
    // Aug 8 is now the past on the island even though UTC still says Aug 8.
    expect(validateRentalWindow("2026-08-08", "2026-08-10", lateUtc)).toMatch(/already passed/);
  });
});
