import { describe, it, expect } from "vitest";
import { deleteVerdict, confirmationMatches, type MerchantFootprint } from "./merchant-delete";

// The rule these tests defend: the database's three RESTRICT foreign keys are
// protecting money, not being awkward. A "delete" that quietly leaves orders
// pointing at a vanished shop, or that silently archives when the operator
// asked to delete, are both worse than refusing.

const empty: MerchantFootprint = { orders: 0, deliveries: 0, organizerAssignments: 0, paidInvoices: 0 };

describe("deleteVerdict", () => {
  it("allows deleting a merchant that never traded — the actual 'clear test' case", () => {
    const v = deleteVerdict(empty);
    expect(v.canDelete).toBe(true);
    expect(v.blockers).toEqual([]);
    expect(v.suggestion).toBe("delete");
  });

  it("refuses when a single order exists — the FK would refuse anyway", () => {
    const v = deleteVerdict({ ...empty, orders: 1 });
    expect(v.canDelete).toBe(false);
    expect(v.suggestion).toBe("archive");
    expect(v.blockers[0]).toBe("1 order");
  });

  it("names every blocker, not just the first", () => {
    const v = deleteVerdict({ orders: 3, deliveries: 2, organizerAssignments: 1, paidInvoices: 4 });
    expect(v.blockers).toEqual(["3 orders", "2 deliveries", "1 event organiser link", "4 paid invoices"]);
  });

  it("pluralises 'delivery' correctly — an operator reading 'deliverys' stops trusting the screen", () => {
    expect(deleteVerdict({ ...empty, deliveries: 1 }).blockers).toEqual(["1 delivery"]);
    expect(deleteVerdict({ ...empty, deliveries: 2 }).blockers).toEqual(["2 deliveries"]);
  });

  it("blocks on paid invoices even though no foreign key would", () => {
    // Subscription invoices CASCADE, so the delete would succeed and destroy
    // the billing record. The FK is not the whole safety rule.
    const v = deleteVerdict({ ...empty, paidInvoices: 1 });
    expect(v.canDelete).toBe(false);
  });

  it("never says 'can delete' while listing blockers", () => {
    for (const f of [
      { ...empty, orders: 1 },
      { ...empty, deliveries: 1 },
      { ...empty, organizerAssignments: 1 },
      { ...empty, paidInvoices: 1 },
    ]) {
      const v = deleteVerdict(f);
      expect(v.canDelete).toBe(v.blockers.length === 0);
    }
  });

  it("explains itself in words an operator can act on", () => {
    expect(deleteVerdict({ ...empty, orders: 2 }).message).toContain("archive");
    expect(deleteVerdict(empty).message).toContain("never traded");
  });
});

describe("confirmationMatches", () => {
  it("accepts the exact name", () => {
    expect(confirmationMatches("Chez Marie", "Chez Marie")).toBe(true);
  });

  it("forgives case and stray spacing, because typing is not the test", () => {
    expect(confirmationMatches("  chez   marie ", "Chez Marie")).toBe(true);
  });

  it("rejects a near miss — the point is proving you meant THIS row", () => {
    expect(confirmationMatches("Chez Mari", "Chez Marie")).toBe(false);
    expect(confirmationMatches("delete", "Chez Marie")).toBe(false);
  });

  it("rejects empty input even against an empty name", () => {
    expect(confirmationMatches("", "")).toBe(false);
    expect(confirmationMatches("   ", "Chez Marie")).toBe(false);
  });
});
