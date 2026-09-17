import type { ReceiptData, ReceiptRow } from "@/lib/receipt";
import { centsToDisplay } from "@/lib/money";
import type { Invoice, InvoiceLine } from "./types";
import { SUBJECTS } from "./subjects";

// ── AN INVOICE, AS THE EXISTING PDF UNDERSTANDS IT ──────────────────────────
//
// lib/receipt-pdf.ts already builds a branded PDF with NO library — no jsPDF,
// no pdfkit, no headless browser — and lib/merchant/invoice-pdf.test.ts asserts
// that none gets imported. On a serverless free tier that is not a compromise,
// it is the right answer: a headless browser would cost tens of megabytes of
// function bundle and a cold start on every download.
//
// So this module does not render anything. It maps an invoice onto ReceiptData
// and lets the existing renderer do its job.
//
// PURE on purpose — no database, no React, no fetch — so every money figure on
// a customer's document is testable without standing anything up.

/** Rs, with a thin space, as the owner writes it. */
export function money(cents: number): string {
  return `Rs ${centsToDisplay(cents)}`;
}

/**
 * The money rows on the document, in the order somebody reads them.
 *
 * Only lines that carry information appear. A zero discount is not a fact worth
 * a row — it is noise on a document somebody is checking against their bank
 * statement.
 */
export function moneyRows(inv: Invoice): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  if (inv.discountCents > 0 || inv.deliveryCents > 0 || inv.taxCents > 0) {
    rows.push({ label: "Subtotal", value: money(inv.subtotalCents) });
  }
  if (inv.discountCents > 0) {
    rows.push({ label: "Discount", value: `- ${money(inv.discountCents)}` });
  }
  if (inv.deliveryCents > 0) {
    rows.push({ label: "Delivery", value: money(inv.deliveryCents) });
  }
  if (inv.taxCents > 0) {
    rows.push({ label: "Tax", value: money(inv.taxCents) });
  }

  rows.push({ label: "Total", value: money(inv.totalCents), strong: true });

  // Paid and balance only once money has actually moved. Printing "Paid Rs 0"
  // on a brand-new invoice reads as a failed payment.
  if (inv.paidCents > 0) {
    rows.push({ label: "Paid", value: money(inv.paidCents) });
    rows.push({
      label: inv.balanceCents < 0 ? "Overpaid" : "Balance due",
      value: money(Math.abs(inv.balanceCents)),
      strong: true,
    });
  }
  return rows;
}

/** "Issued" / "Part paid" / "Paid in full" — words, not enum values. */
export function stateWords(inv: Invoice): string {
  switch (inv.state) {
    case "draft":
      return "Draft";
    case "issued":
      return "Awaiting payment";
    case "part_paid":
      return "Part paid";
    case "paid":
      return "Paid in full";
    case "void":
      return "Cancelled";
    case "written_off":
      return "Written off";
  }
}

/**
 * The whole document.
 *
 * `lines` are the invoice's own rows and appear above the totals, so a customer
 * can see what they are being charged for rather than one lump figure.
 */
export function invoiceToReceipt(inv: Invoice, lines: InvoiceLine[]): ReceiptData {
  const subject = SUBJECTS[inv.subjectType];
  const detail: ReceiptRow[] = lines
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      label: l.description,
      value: money(l.lineTotalCents),
    }));

  return {
    ref: inv.number,
    heading:
      inv.docKind === "credit_note" ? "Credit note"
      : inv.docKind === "receipt" ? "Receipt"
      : "Invoice",
    customer: inv.billToName,
    itemLabel: subject.label,
    // What the customer already holds — their order number or booking
    // reference. An invoice nobody can tie to their own booking is a document
    // that generates an email rather than settling one.
    item: inv.reference,
    rows: [
      { label: "Status", value: stateWords(inv) },
      ...detail,
      ...moneyRows(inv),
    ],
    note: inv.notes ?? undefined,
  };
}
