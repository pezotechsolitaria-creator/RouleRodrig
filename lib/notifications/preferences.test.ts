import { describe, it, expect } from "vitest";
import { mutableCategories, TEMPLATES, type NotificationTemplate } from "./registry";

// The preferences screen is GENERATED from mutableCategories(). These tests are
// what make "you cannot mute a failed payment" a structural property rather
// than a promise in a comment — the API rejects any category not on this list,
// and emit_notification() ignores mutes at critical priority regardless.

const all = Object.values(TEMPLATES) as NotificationTemplate[];

describe("what a user may switch off", () => {
  it("offers at least one real category", () => {
    expect(mutableCategories().length).toBeGreaterThan(0);
  });

  it("never offers a category whose events are all critical", () => {
    for (const category of mutableCategories()) {
      const hasNonCritical = all.some((t) => t.category === category && t.priority !== "critical");
      expect(hasNonCritical, `${category} is offered but carries only critical events`).toBe(true);
    }
  });

  it("has critical events that no toggle can reach", () => {
    // If this ever hits zero, something has quietly downgraded the events that
    // must always be delivered.
    const critical = all.filter((t) => t.priority === "critical");
    expect(critical.length).toBeGreaterThan(0);
  });

  it("keeps money and safety events at critical, so muting cannot hide them", () => {
    const byType = Object.entries(TEMPLATES) as [string, NotificationTemplate][];
    const mustSurvive = [
      "order.payment_rejected",
      "refund.issued",
      "event.cancelled",
      "account.security",
      "delivery.problem",
    ];
    for (const type of mustSurvive) {
      const t = byType.find(([k]) => k === type)?.[1];
      expect(t, type).toBeTruthy();
      expect(t!.priority, `${type} must stay critical`).toBe("critical");
    }
  });

  it("returns each category once", () => {
    const list = mutableCategories();
    expect(new Set(list).size).toBe(list.length);
  });
});
