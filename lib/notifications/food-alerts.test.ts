import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE OWNER'S PHONE, FOR FOOD AND FOR MONEY (M132) ────────────────────────
//
// "CallMeBot for resto and admin when food is completed or payment is
// confirmed too."
//
// Three things were wrong, and the first explains why configuring food routing
// had never worked:
//
//   1. The only food WhatsApp on the platform was filed under category
//      "system". A notification slot subscribed to `food` — the restaurant's
//      own phone, or a second number for the kitchen — therefore never
//      received it. It reached the owner only because a slot with NO
//      categories set receives everything.
//
//   2. It fired only from /admin/food. Restaurants do not work there: M81 put
//      them on the merchant dashboard. So the one message that has to
//      interrupt whatever anyone is doing — food cooked and going cold — was
//      silent in the normal case, where the kitchen marks it themselves.
//
//   3. Payment confirmed sent nothing at all. The customer was reassured, the
//      ledger was written, and the owner's phone stayed quiet about money
//      arriving.

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("food alerts are filed under food", () => {
  it("the admin route no longer files food under system", () => {
    const src = stripComments(read("app/api/admin/food/orders/route.ts"));
    const i = src.indexOf('type: "food_ready"');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, i + 200);
    expect(block).toMatch(/category: "food"/);
    expect(block).not.toMatch(/category: "system"/);
  });

  it("the merchant dashboard sends one too", () => {
    // The screen restaurants actually use (M81).
    const src = stripComments(read("app/api/merchant/orders/[id]/route.ts"));
    expect(src).toMatch(/enqueueNotification/);
    expect(src).toMatch(/type: "food_ready"/);
    expect(src).toMatch(/category: "food"/);
  });

  it("both use the same dedupe key, so one order pings once", () => {
    // A status toggled back and forth, or marked ready from both screens,
    // must not ping twice.
    for (const rel of [
      "app/api/admin/food/orders/route.ts",
      "app/api/merchant/orders/[id]/route.ts",
    ]) {
      expect(stripComments(read(rel)), rel).toMatch(/food:ready:\$\{/);
    }
  });

  it("an alert failure never rolls back a status the kitchen acted on", () => {
    const src = stripComments(read("app/api/merchant/orders/[id]/route.ts"));
    const i = src.indexOf('type: "food_ready"');
    expect(src.slice(Math.max(0, i - 400), i)).toMatch(/try \{/);
  });
});

describe("money arriving reaches the owner", () => {
  const src = stripComments(read("app/api/merchant/orders/[id]/confirm-payment/route.ts"));

  it("sends a WhatsApp on payment confirmed", () => {
    expect(src).toMatch(/enqueueNotification/);
    expect(src).toMatch(/type: "payment_confirmed"/);
  });

  it("files it under payments, not food", () => {
    // The person watching the money is not the person standing at the pass, so
    // it must be routable to a different phone.
    expect(src).toMatch(/category: "payments"/);
  });

  it("reads the order number from the ORDER, not the RPC result", () => {
    // confirm_order_payment() returns only (order_id, status). Reading
    // order_number off it would have produced a truncated UUID and no amount
    // on every alert — the kind of bug that looks fine in review.
    expect(src).toMatch(/from\("orders"\)/);
    expect(src).toMatch(/select\("order_number, total"\)/);
  });

  it("cannot ping twice when a merchant presses confirm again", () => {
    expect(src).toMatch(/payment:confirmed:\$\{id\}/);
  });

  it("never fails the confirmation itself", () => {
    // The money is confirmed either way; a CallMeBot outage must not make a
    // merchant press the button a second time.
    const i = src.indexOf('type: "payment_confirmed"');
    expect(src.slice(Math.max(0, i - 600), i)).toMatch(/try \{/);
    expect(src.slice(i, i + 900)).toMatch(/catch \(err\)/);
  });
});
