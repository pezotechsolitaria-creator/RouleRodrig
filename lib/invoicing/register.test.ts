import { describe, expect, it } from "vitest";
import {
  STATE_TONE, STATE_LABEL, isOutstanding, matchesFilters, summarise, csvRows, money,
} from "./register";
import type { Invoice, InvoiceState } from "./types";
import { INVOICE_SUBJECTS } from "./types";

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "i", number: "RR-INV-2026-000001", docKind: "invoice",
  subjectType: "booking", subjectId: "s", reference: "RR-87E663",
  billToName: "Tony Constance", billToEmail: "tony@example.com", billToPhone: null,
  sellerName: "Roule Rodrigues", sellerAddress: "Rodrigues Island",
  currency: "MUR",
  subtotalCents: 599700, discountCents: 0, taxCents: 0, deliveryCents: 0,
  totalCents: 599700, paidCents: 0, balanceCents: 599700,
  sourceAmountUnit: "rupees", sourceAmountRaw: 5997, sourceTotalCents: 599700,
  state: "issued", issuedAt: "2026-09-17T09:00:00Z", dueAt: null, paidAt: null,
  sentAt: null, sentTo: null, sendCount: 0,
  notes: null, createdAt: "2026-09-17T09:00:00Z", ...over,
});

// ── THE CARDS THE OWNER JUDGES THE BUSINESS BY ─────────────────────────────
describe("the summary", () => {
  it("never counts a cancelled invoice as money", () => {
    // A cancelled invoice was never owed. Summing it would overstate a year's
    // takings on the screen used to decide whether the business is working.
    const s = summarise([
      inv({ totalCents: 100000, paidCents: 100000, balanceCents: 0, state: "paid" }),
      inv({ id: "v", totalCents: 500000, state: "void", balanceCents: 500000 }),
    ]);
    expect(s.invoicedCents).toBe(100000);
    expect(s.collectedCents).toBe(100000);
    expect(s.cancelledCount).toBe(1);
    // Still visible as a row, just not as money.
    expect(s.count).toBe(2);
  });

  it("excludes a written-off debt from the money too", () => {
    const s = summarise([inv({ state: "written_off", totalCents: 999900 })]);
    expect(s.invoicedCents).toBe(0);
  });

  it("counts only what is genuinely still owed as outstanding", () => {
    const s = summarise([
      inv({ paidCents: 299900, balanceCents: 299800, state: "part_paid" }),
      inv({ id: "b", paidCents: 599700, balanceCents: 0, state: "paid" }),
    ]);
    expect(s.outstandingCents).toBe(299800);
    expect(s.outstandingCount).toBe(1);
  });

  it("keeps a credit apart from a debt instead of netting them", () => {
    // Opposite directions. Adding them would hide both: Rs 1,000 owed to us
    // and Rs 1,000 held for somebody else is not a balanced book.
    const s = summarise([
      inv({ paidCents: 0, balanceCents: 599700, state: "issued" }),
      inv({ id: "o", totalCents: 75000, paidCents: 100000, balanceCents: -25000, state: "paid" }),
    ]);
    expect(s.outstandingCents).toBe(599700);
    expect(s.creditCents).toBe(25000);
  });

  it("breaks revenue down by service, biggest first", () => {
    const s = summarise([
      inv({ subjectType: "order", totalCents: 75000 }),
      inv({ id: "b", subjectType: "booking", totalCents: 599700 }),
      inv({ id: "c", subjectType: "order", totalCents: 25000 }),
    ]);
    expect(s.byService[0]).toMatchObject({ subjectType: "booking", totalCents: 599700, count: 1 });
    expect(s.byService[1]).toMatchObject({ subjectType: "order", totalCents: 100000, count: 2 });
  });

  it("survives an empty register", () => {
    const s = summarise([]);
    expect(s).toMatchObject({ count: 0, invoicedCents: 0, outstandingCents: 0 });
    expect(s.byService).toEqual([]);
  });
});

describe("filtering", () => {
  it("searches the number, the customer and the reference the customer holds", () => {
    const i = inv();
    for (const q of ["000001", "tony", "RR-87E663", "TONY@EXAMPLE"]) {
      expect(matchesFilters(i, { q }), q).toBe(true);
    }
    expect(matchesFilters(i, { q: "nobody" })).toBe(false);
  });

  it("has one word for everything still owed", () => {
    expect(matchesFilters(inv({ state: "issued" }), { state: "outstanding" })).toBe(true);
    expect(matchesFilters(inv({ state: "part_paid" }), { state: "outstanding" })).toBe(true);
    expect(matchesFilters(inv({ state: "paid" }), { state: "outstanding" })).toBe(false);
  });

  it("does not hide a draft behind a date range it cannot answer", () => {
    // A draft has no issue date. Excluding it would make drafts vanish the
    // moment anybody filters, which is how an unsent invoice gets forgotten.
    const draft = inv({ state: "draft", issuedAt: null });
    expect(matchesFilters(draft, { from: "2026-01-01", to: "2026-01-31" })).toBe(true);
  });

  it("includes the whole of the closing day", () => {
    const i = inv({ issuedAt: "2026-09-17T18:30:00Z" });
    expect(matchesFilters(i, { to: "2026-09-17" })).toBe(true);
    expect(matchesFilters(i, { to: "2026-09-16" })).toBe(false);
  });
});

// ── THE EXPORT HAS TO ADD UP IN A SPREADSHEET ──────────────────────────────
describe("the CSV", () => {
  const rows = csvRows([inv({ paidCents: 299900, balanceCents: 299800, state: "part_paid" })]);

  it("writes money as a plain decimal, never as a formatted string", () => {
    // "Rs 5,997" turns the column into text and the total into zero.
    //
    // Asserted on the MONEY CELLS, not on the joined row: joining with commas
    // manufactures "1,2026" out of the invoice number and the date, which is
    // what my first version of this test tripped on.
    const [head, body] = rows;
    const moneyAt = ["Total", "Paid", "Balance"].map((h) => head.indexOf(h));
    for (const i of moneyAt) {
      const cell = String(body[i]);
      expect(cell, head[i] as string).toMatch(/^-?\d+\.\d{2}$/);
    }
    expect(body).toContain("5997.00");
  });

  it("carries a negative balance through for an overpayment", () => {
    const [, body] = csvRows([inv({ totalCents: 75000, paidCents: 100000, balanceCents: -25000 })]);
    expect(body).toContain("-250.00");
  });

  it("has a header for every column it writes", () => {
    const [head, body] = rows;
    expect(head.length).toBe(body.length);
  });
});

describe("the badges", () => {
  it("colours by whose move it is, not by progress", () => {
    // The rule PeopleDesk set. Amber is "we are waiting on them".
    expect(STATE_TONE.issued).toContain("amber");
    expect(STATE_TONE.part_paid).toContain("amber");
  });

  it("leaves a settled invoice quiet", () => {
    // A register exists to show what is still owed. Forty green badges would
    // hide the three amber ones.
    for (const s of ["paid", "void", "written_off"] as InvoiceState[]) {
      expect(STATE_TONE[s]).not.toMatch(/green|amber|sky/);
    }
  });

  it("has a tone and a word for every state", () => {
    const states: InvoiceState[] =
      ["draft", "issued", "part_paid", "paid", "void", "written_off"];
    for (const s of states) {
      expect(STATE_TONE[s]).toBeTruthy();
      expect(STATE_LABEL[s]).toBeTruthy();
    }
  });

  it("says Cancelled, not void", () => {
    expect(STATE_LABEL.void).toBe("Cancelled");
  });
});

describe("money on screen", () => {
  it("keeps the thousands separator", () => {
    expect(money(599700)).toBe("Rs 5,997");
    expect(money(180000)).toBe("Rs 1,800");
  });
});

describe("the register covers every service", () => {
  it("can summarise an invoice of any subject", () => {
    // A subject with no entry in SUBJECTS would throw on .label here.
    for (const subjectType of INVOICE_SUBJECTS) {
      const s = summarise([inv({ subjectType })]);
      expect(s.byService[0].label).toBeTruthy();
    }
  });
});
