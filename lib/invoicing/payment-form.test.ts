import { describe, expect, it } from "vitest";
import { projectPayment, settlementAmount, paymentBlockedReason } from "./payment-form";
import type { Invoice } from "./types";

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "i", number: "RR-INV-2026-000001", docKind: "invoice",
  subjectType: "booking", subjectId: "s", reference: "RR-87E663",
  billToName: "Tony Constance", billToEmail: null, billToPhone: null,
  sellerName: "Roule Rodrigues", sellerAddress: "Rodrigues Island",
  currency: "MUR",
  subtotalCents: 599700, discountCents: 0, taxCents: 0, deliveryCents: 0,
  totalCents: 599700, paidCents: 0, balanceCents: 599700,
  sourceAmountUnit: "rupees", sourceAmountRaw: 5997, sourceTotalCents: 599700,
  state: "issued", issuedAt: "2026-09-17T09:00:00Z", dueAt: null, paidAt: null,
  sentAt: null, sentTo: null, sendCount: 0,
  notes: null, createdAt: "2026-09-17T09:00:00Z", ...over,
});

// ── THE MOST DANGEROUS LINE IN THE SYSTEM ──────────────────────────────────
//
// The admin types rupees; the database stores cents. Four live 100x bugs on
// this platform came from that boundary. None was caught by anybody reading
// code — the thing that catches it is a screen showing the converted figure
// before the button is pressed.
describe("what the admin types becomes cents, once", () => {
  it("reads a whole-rupee amount the way somebody counts cash", () => {
    const p = projectPayment(inv(), "2999");
    expect(p.ok && p.amountCents).toBe(299900);
    expect(p.ok && p.amountLabel).toBe("Rs 2,999");
  });

  it("reads rupees and cents", () => {
    const p = projectPayment(inv(), "2999.50");
    expect(p.ok && p.amountCents).toBe(299950);
  });

  it("refuses rather than guessing at nonsense", () => {
    for (const bad of ["", "   ", "abc", "-50", "Rs 2999", "2999,,", "2999,50", "1 500"]) {
      const p = projectPayment(inv(), bad);
      expect(p.ok, `"${bad}" must not parse`).toBe(false);
    }
  });

  it("tells zero apart from unparseable", () => {
    // A form that treats them alike records nothing and reports success.
    const zero = projectPayment(inv(), "0");
    const junk = projectPayment(inv(), "zzz");
    expect(zero.ok).toBe(false);
    expect(junk.ok).toBe(false);
    if (!zero.ok) expect(zero.reason).toContain("more than nothing");
    if (!junk.ok) expect(junk.reason).toContain("not an amount");
  });

  // ── A COMMA IS NOT ALWAYS A THOUSANDS SEPARATOR ──────────────────────────
  //
  // Mauritius writes decimals with a comma and the owner writes in French.
  // toCents() used to strip every comma, so "2999,50" — meaning Rs 2,999.50 —
  // became Rs 299,950. Now it is refused and the person retypes.
  it("refuses French decimal notation instead of multiplying it by a hundred", () => {
    const p = projectPayment(inv(), "2999,50");
    expect(p.ok).toBe(false);
  });

  it("still accepts a comma that really is grouping thousands", () => {
    const p = projectPayment(inv(), "5,997");
    expect(p.ok && p.amountCents).toBe(599700);
    const q = projectPayment(inv(), "12,345.67");
    expect(q.ok && q.amountCents).toBe(1234567);
  });
});

// ── THE LIVE CALCULATION THE OWNER ASKED FOR ───────────────────────────────
describe("what will happen, before it happens", () => {
  it("shows the remainder after a deposit", () => {
    const p = projectPayment(inv(), "2999");
    expect(p).toMatchObject({
      alreadyPaidCents: 0,
      remainingCents: 299800,
      settles: false,
      overpays: false,
    });
  });

  it("counts what was already paid", () => {
    const p = projectPayment(inv({ paidCents: 299900, balanceCents: 299800 }), "2998");
    expect(p).toMatchObject({ alreadyPaidCents: 299900, remainingCents: 0, settles: true });
  });

  it("says plainly when a payment overpays, and by how much", () => {
    // People round up in cash. The dialog must say so rather than refuse.
    const p = projectPayment(inv({ totalCents: 75000, balanceCents: 75000 }), "1000");
    expect(p).toMatchObject({ overpays: true, overpayByCents: 25000, settles: false });
  });
});

describe("the one-tap settlement amount", () => {
  it("offers exactly what is owed", () => {
    expect(settlementAmount(inv({ paidCents: 299900, balanceCents: 299800 }))).toBe("2998.00");
  });

  it("round-trips through the parser without drifting", () => {
    // Retyping 2998 from a balance shown as "Rs 2,998" is how a digit gets
    // dropped, so the default has to be exactly right.
    const i = inv({ paidCents: 123456, balanceCents: 476244 });
    const p = projectPayment(i, settlementAmount(i));
    expect(p.ok && p.remainingCents).toBe(0);
  });

  it("offers nothing on an invoice already settled", () => {
    expect(settlementAmount(inv({ paidCents: 599700, balanceCents: 0 }))).toBe("0.00");
  });

  it("does not offer a negative on an overpaid invoice", () => {
    expect(settlementAmount(inv({ paidCents: 700000, balanceCents: -100300 }))).toBe("0.00");
  });
});

describe("invoices that cannot take a payment say so first", () => {
  it("refuses a cancelled invoice before the request is sent", () => {
    // The database refuses it too; saying so here spares a red error for
    // something that was never possible.
    expect(paymentBlockedReason(inv({ state: "void" }))).toContain("cancelled");
  });

  it("refuses a draft and a written-off debt", () => {
    expect(paymentBlockedReason(inv({ state: "draft" }))).toBeTruthy();
    expect(paymentBlockedReason(inv({ state: "written_off" }))).toBeTruthy();
  });

  it("allows the two states that can take money", () => {
    expect(paymentBlockedReason(inv({ state: "issued" }))).toBeNull();
    expect(paymentBlockedReason(inv({ state: "part_paid" }))).toBeNull();
  });

  it("allows a further payment on a paid invoice", () => {
    // Deepening a credit is legitimate — the database accepts it — and the
    // dialog warns rather than blocks.
    expect(paymentBlockedReason(inv({ state: "paid" }))).toBeNull();
  });
});
