import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { centsToDecimalString, centsToDisplay } from "./money";

// ── FOUR BOOKINGS, EVERY FIGURE A HUNDREDTH OF THE TRUTH (M165) ─────────────
//
// /orders is the signed-in "Your activity" page. It showed:
//
//   AVENIS 125cc          Rs 5.24     (Rs 524)
//   AVENIS 125cc          Rs 3.50     (Rs 350)
//   Suzuki Swift          Rs 16.99    (Rs 1,699)
//   Suzuki Swift          Rs 129.42   (Rs 12,942)
//
// The same fault /track carried: bookings store whole RUPEES, shop orders
// store CENTS, and both were run through centsToDecimalString.
//
// And tapping one sent the customer to a lookup form — asking for a reference
// printed on the card they had just tapped, and an email their session already
// knows. The owner: "it is stupid, the references can be seen".

const ROOT = join(__dirname, "..");
const ORDERS = readFileSync(join(ROOT, "app", "orders", "page.tsx"), "utf8");
const MANAGE = readFileSync(join(ROOT, "app", "manage-booking", "page.tsx"), "utf8");
const CODE = MANAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the activity page shows the amount that was actually paid", () => {
  // ── REPLACED DELIBERATELY ────────────────────────────────────────────────
  //
  // This required `a.kind === "order"` and a rupee branch beside it — the M165
  // fix, pinned as a requirement. It was right for what it fixed and wrong as
  // an invariant: the set of cents kinds is not {order}. ride_requests
  // .quoted_price is cents too, so the same branch printed a Rs 1,800 transfer
  // as "Rs 180,000" on this page.
  //
  // Activity now carries amountCents, converted at the edge, so there is
  // nothing to branch on. Asserting the ABSENCE of the branch is the stronger
  // statement: it cannot silently start being wrong for a sixth kind.
  it("runs every kind through one formatter, with no branch", () => {
    expect(ORDERS).toContain("centsToDisplay(a.amountCents)");
    expect(ORDERS).not.toMatch(/a\.kind === "order"/);
    expect(ORDERS).not.toMatch(/Math\.round\(a\.amount/);
  });

  it("no longer runs every activity through the cents formatter", () => {
    expect(ORDERS).not.toMatch(/Rs \{centsToDecimalString\(a\.amount\w*\)\}/);
  });

  it("prints a rupee figure with no decimal point, as asked", () => {
    // Rs 12,942 is 1294200 cents once converted at the edge.
    expect(centsToDisplay(1294200)).toBe("12,942");
    expect(centsToDisplay(1294200)).not.toContain(".");
    // What the page showed before M165, for the same booking.
    expect(centsToDecimalString(12942)).toBe("129.42");
  });

  it("leaves shop orders alone — those really are cents", () => {
    expect(ORDERS).toContain("centsToDecimalString(o.total)");
  });
});

describe("a signed-in customer is not asked to type what we already know", () => {
  it("runs the lookup itself when there is a session", () => {
    expect(CODE).toContain('await import("@/lib/supabase/client")');
    expect(CODE).toContain("createClient().auth.getUser()");
    expect(CODE).toContain("void lookup(cleaned, sessionEmail)");
  });

  it("takes the email from the session, never from the link", () => {
    // An address in a query string is personal data in browser history, in
    // proxy logs, and in the referrer of every asset the page loads.
    expect(CODE).toContain("data.user?.email");
    expect(CODE).not.toMatch(/get\("email"\)/);
  });

  it("still leaves the form working for a guest", () => {
    // Most bookings are made with no account at all; the form is their only
    // way in and must survive this.
    expect(CODE).toContain("emailRef.current?.focus({ preventScroll: true })");
    expect(CODE).toContain("function submit(e: React.FormEvent)");
  });

  it("does not fall over when auth is unavailable", () => {
    expect(CODE).toMatch(/catch \{[\s\S]{0,120}\}/);
  });

  it("cancels cleanly if the customer leaves mid-lookup", () => {
    expect(CODE).toContain("let cancelled = false");
    expect(CODE).toContain("cancelled = true");
  });
});
