import { toCents } from "@/lib/money";
import { money } from "./register";
import type { Invoice } from "./types";

// ── THE DIALOG THAT TAKES MONEY ─────────────────────────────────────────────
//
// The admin types RUPEES, because that is what is written on a bank slip and
// what somebody counts into a hand. The database stores CENTS. That conversion
// is the single most dangerous line in the whole invoicing system, so it lives
// here, once, pure and tested — and the dialog SHOWS the converted figure back
// before anything is sent.
//
// This platform has shipped a rupee/cent confusion four times. None of them was
// caught by a person reading code; the one that would have caught them all is a
// screen that says "you are recording Rs 2,999" before the button is pressed.

export type PaymentProjection =
  | { ok: false; reason: string }
  | {
      ok: true;
      amountCents: number;
      /** What the admin is about to record, in words. */
      amountLabel: string;
      alreadyPaidCents: number;
      /** After this payment lands. Negative means the customer has overpaid. */
      remainingCents: number;
      settles: boolean;
      overpays: boolean;
      overpayByCents: number;
    };

/**
 * What will happen if this payment is recorded — computed before it is.
 *
 * Returns a refusal rather than a zero for anything unparseable, so the dialog
 * can stay disabled and say why. "0" and "not a number" are different answers
 * and a form that treats them alike will one day record nothing and report
 * success.
 */
export function projectPayment(inv: Invoice, typed: string): PaymentProjection {
  const raw = typed.trim();
  if (raw === "") return { ok: false, reason: "How much was received?" };

  const amountCents = toCents(raw);
  if (amountCents === null) {
    return { ok: false, reason: "That is not an amount. Try 2999 or 2999.50." };
  }
  if (amountCents <= 0) {
    return { ok: false, reason: "A payment has to be more than nothing." };
  }

  const alreadyPaidCents = inv.paidCents;
  const after = alreadyPaidCents + amountCents;
  const remainingCents = inv.totalCents - after;

  return {
    ok: true,
    amountCents,
    amountLabel: money(amountCents),
    alreadyPaidCents,
    remainingCents,
    settles: remainingCents === 0,
    overpays: remainingCents < 0,
    overpayByCents: remainingCents < 0 ? -remainingCents : 0,
  };
}

/**
 * The amount that settles the invoice exactly, as a typed string.
 *
 * Offered as a one-tap default because the commonest payment by far is "the
 * rest of it", and retyping 2998.00 from a balance shown as Rs 2,998 is how a
 * digit gets dropped.
 */
export function settlementAmount(inv: Invoice): string {
  const owed = Math.max(0, inv.balanceCents);
  return (owed / 100).toFixed(2);
}

/** Can this invoice take a payment at all, and if not, why not? */
export function paymentBlockedReason(inv: Invoice): string | null {
  if (inv.state === "void") {
    // The database refuses this too. Saying so before the request is sent
    // spares the owner a red error for something that was never possible.
    return "This invoice was cancelled. Reissue it, or record the money against another one.";
  }
  if (inv.state === "draft") return "This invoice has not been issued yet.";
  if (inv.state === "written_off") return "This invoice was written off.";
  return null;
}
