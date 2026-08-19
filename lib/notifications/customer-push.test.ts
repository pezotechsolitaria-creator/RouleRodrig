import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE CUSTOMER'S PHONE IS TOLD TOO (M124) ─────────────────────────────────
//
// "when order confirms, the client should receive a web push … customers
// should receive web push also when it is ready."
//
// The machinery all existed: pushToCustomer(), the customer_push_targets view,
// the subscribe route. What was missing was the CALL. On a status change the
// driver was pushed and the owner was WhatsApped, while the one person waiting
// for the food got email only — the slowest channel on the platform, and the
// one with a ~400/day ceiling shared with Supabase auth mail.
//
// Both status routes matter: /api/admin/food is the owner's screen, and
// /api/merchant/orders/[id] is the one restaurants actually use (M81).

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ROUTES = [
  "app/api/admin/food/orders/route.ts",
  "app/api/merchant/orders/[id]/route.ts",
];

describe("a status change reaches the customer's own device", () => {
  it.each(ROUTES)("%s pushes the customer", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/pushToCustomer\(/);
    expect(src).toMatch(/from "@\/lib\/push\/send"/);
  });

  it.each(ROUTES)("%s identifies guests by email, not only by account", (rel) => {
    // A guest checkout has no auth user. Requiring customer_id is exactly how
    // the default path silently got nothing (the M28 bug, one channel over).
    expect(read(rel)).toMatch(/customer_email/);
  });

  it.each(ROUTES)("%s still sends the email as well", (rel) => {
    // Push and email are not alternatives: permission may never have been
    // granted, and a sleeping desktop delivers nothing.
    expect(read(rel)).toMatch(/sendOrderStatus|email/i);
  });

  it.each(ROUTES)("%s never lets a failed push undo the status", (rel) => {
    // The kitchen has already acted on it. A notification that throws must not
    // roll the order back.
    const src = read(rel);
    const i = src.indexOf("pushToCustomer(");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 400), i)).toMatch(/try \{/);
    expect(src.slice(i, i + 1600)).toMatch(/catch \(err\)/);
  });

  it.each(ROUTES)("%s keeps the pickup code OFF the lock screen", (rel) => {
    // A push notification is readable by anyone holding the phone. The code
    // belongs in the email and on the order page, not in a banner.
    // Only the push CALL is judged. The email a few lines below legitimately
    // carries the code, and the comments explain why it does not belong here.
    const src = read(rel);
    const i = src.indexOf("pushToCustomer(");
    const end = src.indexOf("} catch (err)", i);
    const block = src
      .slice(i, end > i ? end : i + 1400)
      .replace(/^\s*\/\/.*$/gm, "");
    expect(block).toMatch(/ready to collect/);
    expect(block).not.toMatch(/formatPickupCode/);
  });

  it.each(ROUTES)("%s says something different when the food is ready", (rel) => {
    // "Order update" for the one moment that matters would waste it.
    const src = read(rel);
    const block = src.slice(src.indexOf("pushToCustomer("));
    expect(block).toMatch(/ready_for_pickup/);
    expect(block).toMatch(/is ready/);
  });

  it.each(ROUTES)("%s links to where the order can be seen", (rel) => {
    expect(read(rel)).toMatch(/\/orders\/track\?ref=/);
  });
});
