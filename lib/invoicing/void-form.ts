import { money } from "./register";
import type { Invoice, InvoiceDocKind } from "./types";

// ── WHEN A DOCUMENT CAN STILL BE CANCELLED ──────────────────────────────────
//
// These are not new rules. Every one of them is already enforced by
// invoice_void() and the row trigger, on a locked row, which is where it has to
// be — an application cannot arbitrate a void racing a payment. This exists so
// the admin is told BEFORE pressing a button, in the same words.

/** What to call each kind in a sentence. */
export const DOC_KIND_WORD: Record<InvoiceDocKind, string> = {
  invoice: "invoice",
  receipt: "receipt",
  credit_note: "credit note",
};

export function voidBlockedReason(inv: Invoice): string | null {
  if (inv.state === "void") return "This one is already cancelled.";
  if (inv.state === "draft") {
    return "This has not been issued, so there is nothing to cancel.";
  }
  if (inv.state === "written_off") {
    return "This was written off. It is already out of the outstanding figure.";
  }
  if (inv.state === "paid") {
    // The trigger's transition table has no paid -> void edge at all, whatever
    // the figures say. Checking paid_cents alone would let a zero-total invoice
    // through — total_cents >= 0 is legal — and offer a button the database
    // would refuse.
    return `${inv.number} is settled. Raise a credit note instead.`;
  }
  if (inv.paidCents > 0) {
    // MONEY WINS. The trigger refuses this and names the remedy; so does this.
    return `${money(inv.paidCents)} has been received against ${inv.number}, so it cannot be cancelled. Raise a credit note instead.`;
  }
  return null;
}

/** Should the button be offered at all? */
export function canVoid(inv: Invoice): boolean {
  return voidBlockedReason(inv) === null;
}
