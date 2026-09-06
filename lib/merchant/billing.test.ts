import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getBilling } from "./billing";

// ── THE CONSOLE MUST STATE ONE FEE ARRANGEMENT, NOT THREE ──────────────────
//
// The merchant home read "Plan premium · cancelled · renews 11 Sept": a tier, a
// status denying it, and a renewal date for a cancelled thing. Under M171 the
// platform charges per sale, so none of it was even relevant.

function fake(row: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.maybeSingle = () => Promise.resolve({ data: row, error });
  return { from: () => chain } as never;
}

describe("getBilling", () => {
  it("reports commission-only for the platform's current setting", async () => {
    const b = await getBilling(
      fake({ monetization_model: "commission", default_commission_rate: 0.1 }),
    );
    expect(b).toEqual({
      model: "commission",
      chargesSubscription: false,
      chargesCommission: true,
      defaultRate: 0.1,
    });
  });

  it("reports both for hybrid", async () => {
    const b = await getBilling(fake({ monetization_model: "hybrid", default_commission_rate: 0.1 }));
    expect(b.chargesSubscription).toBe(true);
    expect(b.chargesCommission).toBe(true);
  });

  it("reports neither for free", async () => {
    const b = await getBilling(fake({ monetization_model: "free", default_commission_rate: 0 }));
    expect(b.chargesSubscription).toBe(false);
    expect(b.chargesCommission).toBe(false);
  });

  // FAILS TOWARDS THE TRUTH, NOT TOWARDS BILLING.
  it("falls back to the platform's own default when the read fails", async () => {
    // 'subscription' is what merchant_subscription_active() and
    // resolve_commission_rate() both coalesce to, so a transient error can
    // never make a screen invent a fee nobody agreed to.
    const b = await getBilling(fake(null, { message: "denied" }));
    expect(b.model).toBe("subscription");
    expect(b.chargesCommission).toBe(false);
  });

  it("never turns a missing rate into NaN", async () => {
    const b = await getBilling(fake({ monetization_model: "commission", default_commission_rate: null }));
    expect(b.defaultRate).toBe(0);
  });

  it("reads a numeric rate arriving as a string", async () => {
    const b = await getBilling(
      fake({ monetization_model: "commission", default_commission_rate: "0.10000" }),
    );
    expect(b.defaultRate).toBe(0.1);
  });
});

describe("the console stops contradicting itself", () => {
  const home = readFileSync(
    join(process.cwd(), "app", "merchant", "(app)", "page.tsx"),
    "utf8",
  );
  const nav = readFileSync(
    join(process.cwd(), "components", "merchant", "MerchantNav.tsx"),
    "utf8",
  );

  it("shows the plan line only where a plan is actually charged", () => {
    expect(home).toContain("billing.chargesCommission && !billing.chargesSubscription");
  });

  it("drops the Plan tab entirely when nothing is subscribed", () => {
    // Not shown-and-empty. A Plan tab on a platform that charges no
    // subscription is a standing invitation to worry about a bill that does
    // not exist.
    expect(nav).toContain('out.filter((l) => l.href !== "/merchant/subscription")');
  });

  it("still keeps the Menu tab for kitchens", () => {
    // The splice moved when the filter was added; this is the regression that
    // would be silent.
    expect(nav).toContain('href: "/merchant/menu"');
    expect(nav).toContain("if (isKitchen) out.splice(3, 0,");
  });

  it("states the rate from data, never as a typed constant", () => {
    expect(home).toContain("billing.defaultRate * 100");
    expect(home).not.toMatch(/keeps\s+10%/);
  });
});
