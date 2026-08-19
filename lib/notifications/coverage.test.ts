import { describe, expect, it } from "vitest";
import { uncoveredCategories } from "./coverage";
import { NOTIFICATION_CATEGORIES } from "./categories";

// The off-by-one this pins: "one owner click away from silence" is WRONG.
// Narrowing ONE slot leaves the other catch-all, so the fan-out drops 2 -> 1
// and nothing is lost. A category only goes silent when the UNION across slots
// has a gap. Getting that backwards produces a banner that cries wolf — and per
// slot-match.ts, a dashboard that lies in the alarming direction is worse than
// one that lies in the safe direction, because the owner stops trusting it.

describe("uncoveredCategories", () => {
  it("reports nothing for production's two catch-all slots", () => {
    expect(uncoveredCategories([
      { is_active: true, categories: [] },
      { is_active: true, categories: [] },
    ])).toEqual([]);
  });

  it("narrowing ONE slot changes nothing — the other still takes everything", () => {
    expect(uncoveredCategories([
      { is_active: true, categories: ["food"] },
      { is_active: true, categories: [] },
    ])).toEqual([]);
  });

  it("finds the gap in the union once every slot is narrowed", () => {
    const gaps = uncoveredCategories([
      { is_active: true, categories: ["food", "rides"] },
      { is_active: true, categories: ["payments"] },
    ]);
    // 'deliveries' is the M117 category — a driver vanishing with the goods.
    // Its absence here is precisely the silent outage.
    expect(gaps).toContain("deliveries");
    expect(gaps).not.toContain("food");
    expect(gaps).not.toContain("rides");
    expect(gaps).not.toContain("payments");
  });

  it("an inactive slot covers nothing, however it is subscribed", () => {
    expect(uncoveredCategories([
      { is_active: false, categories: [] },
      { is_active: false, categories: ["admin"] },
    ])).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it("no slots at all is total silence, not silent success", () => {
    // The real 2026-08-09 state: the quota alert was raised into this.
    expect(uncoveredCategories([])).toHaveLength(NOTIFICATION_CATEGORIES.length);
    expect(uncoveredCategories([])).toContain("system");
  });

  it("treats a missing is_active as active, matching slotReceives and the RPC", () => {
    expect(uncoveredCategories([{ categories: [] }])).toEqual([]);
  });

  it("ignores an unknown category string rather than counting it as cover", () => {
    const gaps = uncoveredCategories([{ is_active: true, categories: ["not_a_category"] }]);
    expect(gaps).toEqual([...NOTIFICATION_CATEGORIES]);
  });
});
