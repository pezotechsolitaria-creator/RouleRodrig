import { describe, it, expect } from "vitest";
import { TEMPLATES, templateFor, mutableCategories, type NotificationTemplate } from "./registry";
import { NOTIFICATION_CATEGORIES } from "./categories";

// These tests encode the notification POLICY, not the copy. They are the reason
// a future change that quietly starts emailing every status update, or that
// leaks an amount onto a lock screen, fails in CI instead of in production.

const all = Object.entries(TEMPLATES) as [string, NotificationTemplate][];
const ctx = {
  ref: "RR260812-ABC",
  storeName: "Chez Marie",
  driverName: "Jean",
  amount: "Rs 1,250",
  when: "9:00",
  id: "abc-123",
  extra: "Sega Night",
};

describe("registry shape", () => {
  it("every template renders a non-empty title, body and link", () => {
    for (const [type, t] of all) {
      expect(t.title(ctx), `${type} title`).toBeTruthy();
      expect(t.body(ctx), `${type} body`).toBeTruthy();
      expect(t.link(ctx), `${type} link`).toMatch(/^\//);
    }
  });

  it("every category is one the queue and preferences already know", () => {
    for (const [type, t] of all) {
      expect(NOTIFICATION_CATEGORIES, `${type} category`).toContain(t.category);
    }
  });

  it("every template allows at least one channel", () => {
    for (const [type, t] of all) {
      expect(t.channels.length, `${type} channels`).toBeGreaterThan(0);
    }
  });

  it("renders safely when the context is empty", () => {
    // Callers pass what they have. A missing store name must not produce
    // "Pick up from undefined".
    for (const [type, t] of all) {
      const title = t.title({});
      const body = t.body({});
      expect(`${title} ${body}`, `${type} with empty context`).not.toMatch(/undefined|null|NaN/);
    }
  });
});

describe("email policy", () => {
  // The free tier is ~400 messages/day across Brevo and Resend, shared with
  // Supabase's own auth mail. Emailing progress updates exhausts it and takes
  // password resets down with it.
  it("never emails routine progress updates", () => {
    const mustNotEmail = [
      "order.preparing",
      "delivery.driver_assigned",
      "delivery.out_for_delivery",
      "delivery.completed",
      "booking.reminder",
      "event.reminder",
      "merchant.order_new",
      "merchant.payment_received",
      "merchant.low_stock",
    ] as const;
    for (const type of mustNotEmail) {
      expect(templateFor(type).channels, `${type} must not email`).not.toContain("email");
    }
  });

  it("never emails a driver", () => {
    // A driver on a scooter does not read email, and every driver event is
    // worthless within the hour.
    for (const [type, t] of all) {
      if (t.audience !== "driver") continue;
      if (type === "driver.account_approved") continue; // onboarding, not operations
      expect(t.channels, `${type} must not email`).not.toContain("email");
    }
  });

  it("always emails the events that are a record", () => {
    const mustEmail = [
      "order.placed",
      "order.payment_confirmed",
      "booking.confirmed",
      "booking.cancelled",
      "ticket.issued",
      "event.cancelled",
      "refund.issued",
      "account.security",
    ] as const;
    for (const type of mustEmail) {
      expect(templateFor(type).channels, `${type} must email`).toContain("email");
    }
  });
});

describe("push safety", () => {
  it("money and failure events say less on a lock screen than in the app", () => {
    // A push renders where anyone holding the phone can read it. Amounts,
    // failures and identities belong behind authentication.
    const mustRedact = [
      "order.payment_confirmed",
      "order.payment_rejected",
      "refund.issued",
      "delivery.problem",
      "admin.payment_issue",
      "admin.security",
    ] as const;
    for (const type of mustRedact) {
      const t = templateFor(type);
      expect(t.pushBody, `${type} needs a redacted push body`).toBeTruthy();
      expect(t.pushBody!(ctx), `${type} push body`).not.toContain(ctx.amount);
    }
  });

  it("no push body leaks the amount", () => {
    for (const [type, t] of all) {
      if (!t.pushBody) continue;
      expect(t.pushBody(ctx), `${type} push body`).not.toMatch(/Rs\s?[\d,]+/);
    }
  });
});

describe("priority policy", () => {
  it("money and safety events are critical", () => {
    const mustBeCritical = [
      "order.payment_rejected",
      "refund.issued",
      "delivery.problem",
      "event.cancelled",
      "account.security",
      "admin.security",
      "admin.delivery_stranded",
    ] as const;
    for (const type of mustBeCritical) {
      expect(templateFor(type).priority, `${type} priority`).toBe("critical");
    }
  });

  it("a driver's job offer is critical — a missed one costs them money", () => {
    expect(templateFor("driver.delivery_offered").priority).toBe("critical");
    expect(templateFor("driver.delivery_reassigned").priority).toBe("critical");
  });

  it("critical categories are never offered as mutable", () => {
    // The preferences screen is generated from this list, so it is structurally
    // impossible to build a toggle that hides a failed payment.
    const mutable = mutableCategories();
    const criticalOnly = new Set(
      all.filter(([, t]) => t.priority === "critical").map(([, t]) => t.category),
    );
    for (const c of mutable) {
      const hasNonCritical = all.some(([, t]) => t.category === c && t.priority !== "critical");
      expect(hasNonCritical, `${c} appears mutable but has only critical events`).toBe(true);
    }
    expect(criticalOnly.size).toBeGreaterThan(0);
  });
});

describe("deep links", () => {
  it("routes each audience to a page it can actually open", () => {
    const prefixByAudience: Record<string, string[]> = {
      driver: ["/driver"],
      merchant: ["/merchant"],
      admin: ["/admin"],
    };
    for (const [type, t] of all) {
      const expected = prefixByAudience[t.audience];
      if (!expected) continue;
      const link = t.link(ctx);
      expect(expected.some((p) => link.startsWith(p)), `${type} -> ${link}`).toBe(true);
    }
  });

  it("falls back to a real page when there is no id", () => {
    for (const [type, t] of all) {
      const link = t.link({});
      expect(link, `${type} link without id`).not.toMatch(/\/(undefined|null)\b/);
      expect(link.endsWith("/"), `${type} link without id`).toBe(false);
    }
  });
});
