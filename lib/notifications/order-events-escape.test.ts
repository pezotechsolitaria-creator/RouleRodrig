import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { compose, escapeHtml } from "./order-events";
import { parseSlotRange } from "@/lib/orders/slot";

// A store name is typed by store staff and lands in the <h1> and a paragraph
// of every lifecycle email. M216 added the booked-slot emails, which put it in
// more places; the review of that change found none of them escaped it.

const NAME = "Tom & <Jerry>";
const SLOT = parseSlotRange('["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")')!;

describe("the store name is escaped for the email, and only there", () => {
  it("escapes &, < and >", () => {
    expect(escapeHtml(NAME)).toBe("Tom &amp; &lt;Jerry&gt;");
  });

  it("the caller composes the email copy from the escaped name", () => {
    const src = readFileSync("lib/notifications/order-events.ts", "utf8");
    expect(src).toContain("compose(event, row.order_number, escapeHtml(storeName), slot)");
    // …and push/in-app keep the raw name, as plain text.
    expect(src).toMatch(/\{ ref: row\.order_number, storeName, id: orderId/);
  });

  for (const event of ["accepted", "payment_due", "payment_confirmed", "expired"] as const) {
    it(`${event}: a booked order's email carries no raw markup`, () => {
      const copy = compose(event, "RR1", escapeHtml(NAME), {
        window: SLOT,
        fulfillment: "pickup",
        provider: "cash",
      });
      expect(`${copy.title} ${copy.body}`).not.toContain("<Jerry>");
    });
  }
});
