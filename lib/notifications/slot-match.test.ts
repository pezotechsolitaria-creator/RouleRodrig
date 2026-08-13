import { describe, expect, it } from "vitest";
import { slotReceives } from "./slot-match";

// The bug this pins: /admin re-implemented enqueue_notification()'s recipient
// rule and dropped the `cardinality(categories) = 0` half, so a slot subscribed
// to EVERYTHING was reported as subscribed to nothing. The Command Centre said
// "nobody will be phoned" while the database was queueing to two live numbers.
//
// Found by reading the SQL, not the UI — which is the only way to find it.

describe("slotReceives — mirrors enqueue_notification()", () => {
  it("an EMPTY category list means every category, not none", () => {
    // This is how both of the owner's real slots are configured.
    expect(slotReceives({ is_active: true, categories: [] }, "admin")).toBe(true);
    expect(slotReceives({ is_active: true, categories: [] }, "payments")).toBe(true);
  });

  it("treats a missing list the same way", () => {
    expect(slotReceives({ is_active: true }, "admin")).toBe(true);
    expect(slotReceives({ is_active: true, categories: null }, "admin")).toBe(true);
  });

  it("an explicit list subscribes to exactly those categories", () => {
    const slot = { is_active: true, categories: ["payments", "deliveries"] };
    expect(slotReceives(slot, "payments")).toBe(true);
    expect(slotReceives(slot, "admin")).toBe(false);
  });

  it("an inactive slot receives nothing, however it is subscribed", () => {
    expect(slotReceives({ is_active: false, categories: [] }, "admin")).toBe(false);
    expect(slotReceives({ is_active: false, categories: ["admin"] }, "admin")).toBe(false);
  });
});
