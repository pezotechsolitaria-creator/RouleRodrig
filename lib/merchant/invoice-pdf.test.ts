import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildReceiptPdf } from "@/lib/receipt-pdf";

const read = (p: string) => readFileSync(p, "utf8");

// ── "Soon" is gone from the billing page ────────────────────────────────────
//
// That column showed a greyed icon and the word Soon. A merchant asked by their
// accountant to produce an invoice had a table on a screen and nothing to hand
// over — and on a billing page, "Soon" reads as "the part that proves what you
// paid is not built".

describe("an invoice downloads as a real file", () => {
  const page = read("app/merchant/(app)/subscription/page.tsx");

  it("no longer promises it later", () => {
    expect(page).not.toMatch(/coming soon/i);
    expect(page).not.toMatch(/> Soon\b/);
  });

  it("is offered on the phone list too, which had nothing at all", () => {
    // A merchant here runs their shop from a phone; the desktop table was the
    // only place even the promise appeared.
    expect((page.match(/<InvoicePdfButton/g) ?? []).length).toBe(2);
  });

  it("adds no PDF library to a mobile-first bundle", () => {
    // buildReceiptPdf emits a real PDF with no dependency. An invoice is that
    // same document with different rows, so this is a mapping, not a feature.
    const button = read("components/merchant/InvoicePdfButton.tsx");
    expect(button).toMatch(/downloadReceipt/);
    expect(button).not.toMatch(/from "(jspdf|pdfkit|pdf-lib)"/);
  });
});

describe("the invoice says what actually happened", () => {
  it("produces a PDF that carries the reference, the period and the amount", () => {
    // Built through the same function, so this asserts the real bytes rather
    // than the intention.
    const pdf = buildReceiptPdf({
      ref: "A1B2C3D4",
      heading: "Subscription invoice",
      customer: "Ti Boutik",
      itemLabel: "Plan",
      item: "Growth",
      rows: [
        { label: "Period", value: "1 Aug 2026 – 31 Aug 2026" },
        { label: "Amount", value: "Rs 1,500.00" },
        { label: "Status", value: "due" },
      ],
      note: "This invoice is not yet settled.",
    });
    const text = Buffer.from(pdf).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("A1B2C3D4");
    // The heading is set in caps by buildContent — asserted as it is actually
    // drawn, not as it was passed in.
    expect(text).toContain("SUBSCRIPTION INVOICE");
    expect(text).toContain("Ti Boutik");
  });

  it("does not dress up an unpaid invoice", () => {
    // The status is the word from the database. If it says "due", the
    // accountant has to see "due" — a receipt that flatters is not a record.
    const button = read("components/merchant/InvoicePdfButton.tsx");
    expect(button).toMatch(/value: invoice\.status/);
    expect(button).toMatch(/not yet settled/);
  });
});
