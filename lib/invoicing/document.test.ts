import { describe, expect, it } from "vitest";
import { money, moneyRows, stateWords, invoiceToReceipt } from "./document";
import { SUBJECTS, supportedSubjects, isInvoiceSubject } from "./subjects";
import { INVOICE_SUBJECTS, type Invoice, type InvoiceLine } from "./types";

// The two documents actually issued against production in phase 1.
const BOOKING: Invoice = {
  id: "i1", number: "RR-INV-2026-000001", docKind: "invoice",
  subjectType: "booking", subjectId: "87e6633b-904d-4466-921e-f42f0d59de6f",
  reference: "RR-87E663",
  billToName: "Tony Constance", billToEmail: "t@example.com", billToPhone: null,
  sellerName: "Roule Rodrigues", sellerAddress: "Rodrigues Island",
  currency: "MUR",
  subtotalCents: 599700, discountCents: 0, taxCents: 0, deliveryCents: 0,
  totalCents: 599700, paidCents: 0, balanceCents: 599700,
  sourceAmountUnit: "rupees", sourceAmountRaw: 5997, sourceTotalCents: 599700,
  state: "issued", issuedAt: "2026-09-17T09:00:00Z", dueAt: null, paidAt: null,
  notes: null, createdAt: "2026-09-17T09:00:00Z",
};

const ORDER: Invoice = {
  ...BOOKING,
  id: "i2", number: "RR-INV-2026-000002", subjectType: "order",
  reference: "RR260907-C92312",
  subtotalCents: 75000, totalCents: 75000, balanceCents: 75000,
  sourceAmountUnit: "cents", sourceAmountRaw: 75000, sourceTotalCents: 75000,
};

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
  id: "l1", position: 1, kind: "charge", description: "Vehicle rental - 3 days",
  qty: 1, unitPriceCents: 599700, lineTotalCents: 599700, ...over,
});

// ── THE ONLY THING THAT REALLY MATTERS HERE ────────────────────────────────
//
// A rupee source and a cents source have to print the same scale. This platform
// has failed that four times, most recently showing a customer "Rs 180,000"
// for a Rs 1,800 transfer.
describe("a rupee source and a cents source print at the same scale", () => {
  it("prints the booking as the rupees it really is", () => {
    // bookings.total_amount held 5997. Rs 1,999/day x 3 days.
    expect(money(BOOKING.totalCents)).toBe("Rs 5,997");
  });

  it("prints the order as the cents it really is", () => {
    // orders.total held 75000.
    expect(money(ORDER.totalCents)).toBe("Rs 750");
  });

  it("never prints a hundred times the truth", () => {
    // The exact failure shape: a cents figure rendered as whole rupees.
    expect(money(180000)).toBe("Rs 1,800");
    expect(money(180000)).not.toBe("Rs 180,000");
  });

  it("keeps real cents when there are any", () => {
    expect(money(97880)).toBe("Rs 978.80");
  });
});

describe("the money rows say only what is true", () => {
  it("shows a bare total when there is nothing else to say", () => {
    // A zero discount is not a fact worth a row on a document somebody is
    // checking against a bank statement.
    const rows = moneyRows(BOOKING);
    expect(rows.map((r) => r.label)).toEqual(["Total"]);
  });

  it("shows the breakdown once a part of it is non-zero", () => {
    const rows = moneyRows({ ...BOOKING, deliveryCents: 20000, subtotalCents: 579700 });
    expect(rows.map((r) => r.label)).toEqual(["Subtotal", "Delivery", "Total"]);
  });

  it("does not print 'Paid Rs 0' on a new invoice", () => {
    // It reads as a failed payment.
    expect(moneyRows(BOOKING).some((r) => r.label === "Paid")).toBe(false);
  });

  it("shows paid and balance once money has moved", () => {
    const rows = moneyRows({ ...BOOKING, paidCents: 299900, balanceCents: 299800 });
    expect(rows.map((r) => r.label)).toContain("Paid");
    expect(rows.find((r) => r.label === "Balance due")?.value).toBe("Rs 2,998");
  });

  it("calls an overpayment what it is, without a minus sign", () => {
    const rows = moneyRows({ ...BOOKING, paidCents: 699700, balanceCents: -100000 });
    const over = rows.find((r) => r.label === "Overpaid");
    expect(over?.value).toBe("Rs 1,000");
  });
});

describe("the document a customer receives", () => {
  it("is keyed on the reference they already hold", () => {
    // An invoice nobody can tie to their own booking generates an email rather
    // than settling one.
    expect(invoiceToReceipt(BOOKING, [line()]).item).toBe("RR-87E663");
    expect(invoiceToReceipt(ORDER, [line()]).item).toBe("RR260907-C92312");
  });

  it("lists what is being charged for, above the totals", () => {
    const d = invoiceToReceipt(BOOKING, [
      line({ position: 2, description: "Helmet", lineTotalCents: 0 }),
      line({ position: 1 }),
    ]);
    const labels = d.rows.map((r) => r.label);
    // Sorted by position, not by the order they arrived.
    expect(labels.indexOf("Vehicle rental - 3 days")).toBeLessThan(labels.indexOf("Helmet"));
    expect(labels.indexOf("Helmet")).toBeLessThan(labels.indexOf("Total"));
  });

  it("says the state in words, never the enum value", () => {
    expect(stateWords(BOOKING)).toBe("Awaiting payment");
    expect(stateWords({ ...BOOKING, state: "part_paid" })).toBe("Part paid");
    expect(stateWords({ ...BOOKING, state: "void" })).toBe("Cancelled");
  });

  it("names the service in the customer's language, not the table's", () => {
    expect(invoiceToReceipt(BOOKING, []).itemLabel).toBe("Vehicle rental");
    expect(invoiceToReceipt(ORDER, []).itemLabel).toBe("Order");
  });
});

// ── THE REGISTRY IS THE GUARD ──────────────────────────────────────────────
describe("every subject is accounted for", () => {
  it("has an adapter for every member of the enum", () => {
    // Record<InvoiceSubjectType, …> makes this a tsc error too; this asserts it
    // at runtime for anyone reading the test instead of the type.
    for (const s of INVOICE_SUBJECTS) expect(SUBJECTS[s]).toBeTruthy();
    expect(Object.keys(SUBJECTS).sort()).toEqual([...INVOICE_SUBJECTS].sort());
  });

  it("records the unit of every money column, checked against live rows", () => {
    expect(SUBJECTS.booking.unit).toBe("rupees");
    expect(SUBJECTS.place_booking.unit).toBe("rupees");
    expect(SUBJECTS.order.unit).toBe("cents");
    expect(SUBJECTS.ride_request.unit).toBe("cents");
  });

  it("says why an unsupported subject is unsupported", () => {
    for (const s of INVOICE_SUBJECTS) {
      if (!SUBJECTS[s].supported) {
        expect(SUBJECTS[s].pending, `${s} needs a reason`).toBeTruthy();
      }
    }
  });

  it("ships exactly the two phase 1 subjects — one of each unit", () => {
    // The whole point of phase 1: prove a rupee source and a cents source can
    // share one document type without a 100x error.
    expect(supportedSubjects().sort()).toEqual(["booking", "order"]);
    expect(SUBJECTS.booking.unit).not.toBe(SUBJECTS.order.unit);
  });

  it("refuses anything that is not a subject", () => {
    expect(isInvoiceSubject("booking")).toBe(true);
    expect(isInvoiceSubject("invoice")).toBe(false);
    expect(isInvoiceSubject(null)).toBe(false);
  });
});
