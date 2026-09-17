import { toCents } from "@/lib/money";
import { money } from "./register";
import type { Invoice } from "./types";

// ── THE DIALOG THAT REVERSES MONEY ──────────────────────────────────────────
//
// Same rule as the payment dialog and for the same reason: the admin types
// RUPEES, the database stores CENTS, and the converted figure is shown back
// before anything is sent. A credit note is a document a customer keeps, so a
// 100x error here is as public as one on an invoice.
//
// The empty field is not an error. Crediting the WHOLE invoice is the common
// case — a cancelled booking, an order that was never shipped — so leaving the
// amount blank means all of it, and the dialog says so in words rather than
// making somebody retype a figure that is already on the screen.

export type CreditProjection =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** Null when the whole invoice is being credited; the API then sends none. */
      amountCents: number | null;
      /** What will actually be credited, always a real figure. */
      effectiveCents: number;
      amountLabel: string;
      full: boolean;
      /** What the customer still owes once this lands. Never below zero here. */
      remainingCents: number;
    };

export function projectCredit(inv: Invoice, typed: string): CreditProjection {
  const raw = typed.trim();

  if (raw === "") {
    return {
      ok: true,
      amountCents: null,
      effectiveCents: inv.totalCents,
      amountLabel: money(inv.totalCents),
      full: true,
      remainingCents: 0,
    };
  }

  const amountCents = toCents(raw);
  if (amountCents === null) {
    return { ok: false, reason: "That is not an amount. Try 2999 or 2999.50." };
  }
  if (amountCents <= 0) {
    return { ok: false, reason: "A credit has to be more than nothing." };
  }
  if (amountCents > inv.totalCents) {
    // The database refuses this too. Saying it here means the admin sees the
    // problem next to the figure they typed rather than after a round trip.
    return {
      ok: false,
      reason: `That is more than the invoice. ${inv.number} is ${money(inv.totalCents)}.`,
    };
  }

  return {
    ok: true,
    amountCents,
    effectiveCents: amountCents,
    amountLabel: money(amountCents),
    full: amountCents === inv.totalCents,
    remainingCents: inv.totalCents - amountCents,
  };
}

/**
 * Can this invoice be credited at all, and if not, why not?
 *
 * Mirrors invoice_credit_note()'s own refusals so the admin is told before the
 * request rather than by a red error afterwards.
 */
export function creditBlockedReason(inv: Invoice): string | null {
  if (inv.docKind !== "invoice") {
    return `Only an invoice can be credited. ${inv.number} is a ${
      inv.docKind === "receipt" ? "receipt" : "credit note"
    }.`;
  }
  if (inv.state === "draft") return "This invoice has not been issued yet.";
  if (inv.state === "void") return "This invoice was cancelled. There is nothing left to credit.";
  return null;
}

/**
 * What a full credit will do to the invoice, in the words the admin needs.
 *
 * The rule is invoice_credit_note()'s: a fully credited invoice that never
 * took a payment is written off, because leaving it outstanding for ever makes
 * the register lie. One that HAS been paid is left alone — money going back to
 * a customer is a refund somebody decides on, not a state change made quietly.
 */
export function creditConsequence(inv: Invoice, full: boolean): string {
  if (!full) return "The rest of the invoice stays owed.";
  if (inv.paidCents > 0) {
    return `${inv.number} has ${money(inv.paidCents)} paid against it. It stays as it is, and the refund is arranged separately.`;
  }
  return `${inv.number} will be written off — it will stop counting as owed.`;
}
