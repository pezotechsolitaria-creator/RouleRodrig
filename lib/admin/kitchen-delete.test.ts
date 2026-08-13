import { describe, it, expect } from "vitest";
import {
  formatMoney,
  deleteConsequences,
  hideConsequences,
  recommendedChoice,
  confirmMatches,
  deleteButtonLabel,
  whyBlocked,
  type KitchenDeletePreview,
} from "./kitchen-delete";

// A real preview, taken from production: Riri Resto, one collected order of
// Rs 144.00. Every test bends this rather than inventing a new shape.
const RIRI: KitchenDeletePreview = {
  id: "fbf7f289-d55a-4e8d-8081-f94398cb4669",
  name: "Riri Resto",
  status: "closed",
  hidden: true,
  dishes: 1,
  orders: 1,
  orders_in_flight: 0,
  orders_finished: 1,
  active_deliveries: 0,
  reviews: 1,
  money_minor: 14400,
  currency: "MUR",
  files: [],
  can_delete: true,
  blockers: [],
};

const at = (over: Partial<KitchenDeletePreview>) => ({ ...RIRI, ...over });

describe("formatMoney", () => {
  it("reads minor units as rupees and cents", () => {
    expect(formatMoney(14400)).toBe("Rs 144.00");
    expect(formatMoney(337000)).toBe("Rs 3,370.00");
    expect(formatMoney(45000)).toBe("Rs 450.00");
  });

  it("does not swallow the cents", () => {
    expect(formatMoney(1)).toBe("Rs 0.01");
    expect(formatMoney(105)).toBe("Rs 1.05");
    expect(formatMoney(0)).toBe("Rs 0.00");
  });

  it("falls back to the currency code it was given", () => {
    expect(formatMoney(1000, "EUR")).toBe("EUR 10.00");
  });
});

describe("confirmMatches", () => {
  it("accepts the name however it was typed", () => {
    expect(confirmMatches("Riri Resto", "Riri Resto")).toBe(true);
    expect(confirmMatches("  riri resto  ", "Riri Resto")).toBe(true);
    expect(confirmMatches("RIRI RESTO", "Riri Resto")).toBe(true);
  });

  it("refuses anything that is not the name", () => {
    expect(confirmMatches("riri", "Riri Resto")).toBe(false);
    expect(confirmMatches("", "Riri Resto")).toBe(false);
    expect(confirmMatches("delete", "Riri Resto")).toBe(false);
  });

  // A kitchen with a blank name must not become a one-click delete.
  it("never matches an empty name", () => {
    expect(confirmMatches("", "")).toBe(false);
    expect(confirmMatches("   ", "  ")).toBe(false);
  });

  // The database does the same comparison. If these two ever disagree, the
  // button lies about what will happen.
  it("agrees with the SQL rule: lower(btrim(typed)) = lower(btrim(name))", () => {
    const sql = (typed: string, name: string) =>
      typed.trim().toLowerCase() === name.trim().toLowerCase();
    for (const [t, n] of [
      ["Riri Resto", "Riri Resto"],
      [" riri RESTO ", "Riri Resto"],
      ["riri", "Riri Resto"],
      ["Ti Kitchen (DEMO)", "Ti Kitchen (DEMO)"],
    ] as const) {
      expect(confirmMatches(t, n)).toBe(sql(t, n) && n.trim() !== "");
    }
  });
});

describe("deleteConsequences", () => {
  it("leads with the orders and names the money", () => {
    const lines = deleteConsequences(RIRI);
    expect(lines[0]).toContain("1 past order");
    expect(lines[0]).toContain("Rs 144.00");
  });

  it("counts in plain plurals", () => {
    const lines = deleteConsequences(at({ orders: 3, money_minor: 860000, dishes: 7, reviews: 0 }));
    expect(lines[0]).toContain("3 past orders");
    expect(lines[0]).toContain("Rs 8,600.00");
    expect(lines[1]).toBe("7 dishes on its menu");
  });

  it("says nothing about orders when there are none", () => {
    const lines = deleteConsequences(at({ orders: 0, money_minor: 0, reviews: 0 }));
    expect(lines.some((l) => l.includes("past order"))).toBe(false);
  });

  it("mentions uploaded files, because SQL alone does not remove them", () => {
    const lines = deleteConsequences(at({ files: ["a/receipt.jpg", "b/logo.png"] }));
    expect(lines.some((l) => l.includes("2 uploaded photos or receipts"))).toBe(true);
  });

  // Whatever else is true, the operator is always told the kitchen goes.
  it("always ends with the kitchen itself", () => {
    for (const p of [RIRI, at({ orders: 0, dishes: 0, reviews: 0 })]) {
      expect(deleteConsequences(p).at(-1)).toContain("the kitchen itself");
    }
  });
});

describe("hideConsequences", () => {
  it("promises the record survives and the change is reversible", () => {
    const lines = hideConsequences(RIRI).join(" | ");
    expect(lines).toContain("stay exactly as they are");
    expect(lines).toContain("bring it back at any time");
  });

  it("never claims orders survive when there were none to begin with", () => {
    expect(hideConsequences(at({ orders: 0 })).join(" | ")).toContain("nothing is lost");
  });
});

describe("recommendedChoice", () => {
  it("recommends hiding once there is a record to lose", () => {
    expect(recommendedChoice(RIRI)).toBe("hide");
    expect(recommendedChoice(at({ orders: 0, reviews: 2 }))).toBe("hide");
  });

  it("recommends deleting a kitchen nobody ever used", () => {
    expect(recommendedChoice(at({ orders: 0, reviews: 0 }))).toBe("delete");
  });
});

describe("deleteButtonLabel", () => {
  it("never says just Delete — it says what goes with it", () => {
    expect(deleteButtonLabel(RIRI)).toBe("Delete Riri Resto and its 1 order permanently");
    expect(deleteButtonLabel(at({ orders: 3 }))).toBe("Delete Riri Resto and its 3 orders permanently");
    expect(deleteButtonLabel(at({ orders: 0 }))).toBe("Delete Riri Resto permanently");
  });
});

describe("whyBlocked", () => {
  it("is empty when the delete is available", () => {
    expect(whyBlocked(RIRI)).toEqual([]);
  });

  it("passes the server's own wording through, so both agree", () => {
    const blocked = at({
      can_delete: false,
      orders_in_flight: 1,
      blockers: ["1 order still in progress — a customer is waiting. Mark them collected or cancelled first."],
    });
    expect(whyBlocked(blocked)).toHaveLength(1);
    expect(whyBlocked(blocked)[0]).toContain("a customer is waiting");
  });
});
