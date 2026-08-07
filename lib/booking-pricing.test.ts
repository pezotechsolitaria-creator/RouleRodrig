import { describe, expect, it } from "vitest";
import {
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

describe("rentalDays", () => {
  it("counts whole days and treats same-day as 1", () => {
    expect(rentalDays("2026-09-01", "2026-09-03")).toBe(2);
    expect(rentalDays("2026-09-01", "2026-09-01")).toBe(1);
  });
  it("rejects reversed or malformed dates as 0", () => {
    expect(rentalDays("2026-09-03", "2026-09-01")).toBe(0);
    expect(rentalDays("garbage", "2026-09-01")).toBe(0);
    expect(rentalDays("2026-9-1", "2026-09-03")).toBe(0);
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
