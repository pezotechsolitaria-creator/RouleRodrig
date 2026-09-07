import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { paymentAmountLine } from "./email";

// ── "SOMEBODY SAYS THEY HAVE PAID Rs 32,000" ────────────────────────────────
//
// Caught in production on 2026-09-07 by declaring a transfer against a real
// Rs 320.00 food order and reading the alert that arrived on the owner's
// phone. It said Rs 32,000.
//
// sendPaymentReportedAlert() takes ONE `amount` field that carries TWO units,
// because its three callers hand over the raw database column:
//
//   app/api/bookings/report-payment  -> deposit_amount   whole RUPEES
//   app/api/orders/report-payment    -> orders.total     CENTS
//   app/api/orders/[id]/receipt      -> orders.total     CENTS
//
// Both were printed through the same toLocaleString(), so every ORDER was
// overstated by exactly 100x -- in the phone alert AND in the "Amount they
// owe" row of the owner's email, which had been wrong far longer than the
// alert had existed.
//
// This is the platform's third shipped rupees-vs-cents bug. See lib/money.ts.
describe("paymentAmountLine", () => {
  it("prints an ORDER amount as rupees and cents, not raw cents", () => {
    // The exact failure: Rs 320.00 announced as Rs 32,000.
    expect(paymentAmountLine("order", 32000)).toBe("Rs 320.00");
  });

  it("keeps the cents on an order rather than rounding them away", () => {
    // The owner is about to match this against a bank statement line.
    expect(paymentAmountLine("order", 32050)).toBe("Rs 320.50");
    expect(paymentAmountLine("order", 5)).toBe("Rs 0.05");
  });

  it("groups thousands on an order", () => {
    expect(paymentAmountLine("order", 2588300)).toBe("Rs 25,883.00");
  });

  it("prints a BOOKING amount as whole rupees, because that is the unit stored", () => {
    // bookings.deposit_amount = 350 means Rs 350, not Rs 3.50.
    expect(paymentAmountLine("vehicle", 350)).toBe("Rs 350");
    expect(paymentAmountLine("activity", 700)).toBe("Rs 700");
    expect(paymentAmountLine("vehicle", 12942)).toBe("Rs 12,942");
  });

  it("never renders an order and a booking of the same magnitude identically", () => {
    // The regression this file exists to prevent: if these two ever agree, the
    // unit has been dropped again.
    expect(paymentAmountLine("order", 70000)).not.toBe(paymentAmountLine("vehicle", 70000));
  });

  it("handles a negative amount without mangling the sign", () => {
    expect(paymentAmountLine("order", -32000)).toBe("Rs -320.00");
  });
});

// ── ONE DECLARATION, ONE ALERT ──────────────────────────────────────────────
//
// Two `payment.reported` enqueue blocks were added to this function the same
// day from two directions. They were identical but for the admin link, and one
// of them pointed at /admin/money -- a route that does not exist.
//
// Nothing caught it: both carried the same dedupeKey, so the queue collapsed
// them and exactly one alert arrived, which is what a test of the delivered
// message would have asserted. The duplicate was only visible in the source.
describe("sendPaymentReportedAlert wiring", () => {
  const SRC = readFileSync(join(process.cwd(), "lib/email.ts"), "utf8");

  it("queues payment.reported exactly once", () => {
    const blocks = SRC.match(/type: "payment\.reported"/g) ?? [];
    expect(blocks).toHaveLength(1);
  });

  it("does not link the owner at a route that does not exist", () => {
    // The LINK, not the prose: the comment above the surviving block names
    // /admin/money to explain why it went, and a bare substring check would
    // fail on that explanation.
    expect(SRC).not.toMatch(/\$\{SITE_URL\}\/admin\/money/);
  });

  it("formats every amount through the unit-aware helper", () => {
    // The raw call is what shipped the bug. If it comes back, so does the bug.
    expect(SRC).not.toMatch(/input\.amount\.toLocaleString/);
    const uses = SRC.match(/paymentAmountLine\(input\.kind, input\.amount\)/g) ?? [];
    // Both the email body and the queued phone alert.
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});
