// ── Admin keeps everything: which bookings the desk may still delete ────────
// (architecture review 2026-09-30, item 3)
//
// The rentals and reservations desks could hard-delete any row — confirmed,
// paid, completed — behind one confirm(). The owner's rule, quoted in M227, is
// "Admin must keep 100% of all records forever", and a deleted booking takes
// the customer's /orders history with it while its booking_payments rows and
// invoices keep pointing at an id that no longer exists (neither has a
// foreign key to it).
//
// An archive needs a migration, so until then a delete is REFUSED once a
// booking carries money or a commitment, and the desk offers Cancel instead:
// the row stays, marked cancelled. What is left deletable is what the button
// was ever for — a test request, or a duplicate nobody paid for.
//
// Pure — no database, no React — so the desk (choosing its button) and the
// route (refusing with a 409) read ONE rule and cannot drift apart.

import { rupees } from "@/lib/bookings/in-person";

export type DeletableKind = "vehicle" | "place";

/** The columns the rule reads. Both tables carry all five (M19, M220). */
export type DeleteFacts = {
  status?: string | null;
  /** WHOLE RUPEES received so far. */
  amount_paid?: number | null;
  /** When the first money arrived, online or recorded by hand. */
  deposit_paid_at?: string | null;
  paypal_capture_id?: string | null;
  /** M220: they never came. Status is 'cancelled'; this says why. */
  no_show_at?: string | null;
  /**
   * M83: the customer says they sent a bank transfer (and usually uploaded the
   * receipt). Not money yet — but the only record of money they say they sent.
   */
  payment_reported_at?: string | null;
};

export type DeleteRefusalReason =
  | "ledger"
  | "paid"
  | "money_received"
  | "transfer_declared"
  | "no_show"
  | "confirmed"
  | "completed";

export type DeleteRefusal = {
  reason: DeleteRefusalReason;
  /** One sentence for the owner, shown on the card as it is. */
  message: string;
  /** Whether "Cancel instead" means anything for this row right now. */
  canCancel: boolean;
};

// A cancel is only an answer while the booking is still going to happen.
// Completed happened; cancelled and unavailable are already an ending.
const CANCELLABLE = new Set(["pending", "approved", "confirmed"]);

export function canCancelInstead(status: string | null | undefined): boolean {
  return CANCELLABLE.has(status ?? "");
}

// The words each desk already uses for its rows.
const NOUN: Record<DeletableKind, string> = { vehicle: "booking", place: "reservation" };

/**
 * Why this row must be kept, or null when it may be deleted.
 *
 * `ledgerRows` is the count of booking_payments rows for it. The route always
 * knows it; the desk does not (the list is read with `select *` from the
 * booking table alone) and passes null, so the server stays the authority and
 * the desk only avoids offering a button the server would refuse.
 */
export function deleteRefusal(
  kind: DeletableKind,
  row: DeleteFacts,
  ledgerRows?: number | null,
): DeleteRefusal | null {
  let reason: DeleteRefusalReason | null = null;
  // Money first: it is the reason that matters most if several apply.
  if ((ledgerRows ?? 0) > 0) reason = "ledger";
  else if ((row.amount_paid ?? 0) > 0) reason = "paid";
  else if (row.deposit_paid_at || row.paypal_capture_id) reason = "money_received";
  // A declared transfer must be CHECKED, not removed (the M222 rule): deleting
  // it destroys the one record of money the customer says they sent, and the
  // receipt they uploaded with it. Not "Cancel instead" either — a cancelled
  // row leaves the Money desk queue, which is the same hole. Reconcile first.
  else if (row.payment_reported_at) reason = "transfer_declared";
  else if (row.no_show_at) reason = "no_show";
  else if (row.status === "confirmed") reason = "confirmed";
  else if (row.status === "completed") reason = "completed";
  if (!reason) return null;

  const noun = NOUN[kind];
  const why: Record<DeleteRefusalReason, string> = {
    ledger: `Money is recorded against this ${noun} in the payments ledger`,
    paid: `A payment is recorded on this ${noun}`,
    money_received: `Money was received for this ${noun}`,
    transfer_declared: `The customer says they sent a transfer for this ${noun}`,
    no_show: `This ${noun} is recorded as a no-show`,
    confirmed: `This ${noun} is confirmed`,
    completed: `This ${noun} is completed`,
  };
  const canCancel = reason !== "transfer_declared" && canCancelInstead(row.status);
  const next =
    reason === "transfer_declared"
      ? " Check your statement on the Money desk first."
      : canCancel
        ? " Cancel it instead: it stays on file, marked cancelled."
        : " It stays on file as it is.";
  return { reason, message: `${why[reason]}, so it can't be deleted.${next}`, canCancel };
}

/**
 * What the owner reads before "Cancel instead" goes through.
 *
 * architecture review 2026-09-30, item 3 (fix). The button sits where Delete
 * was, on rows kept BECAUSE they carry money or a commitment, and its confirm
 * read only "It stays on file, marked cancelled" — record-keeping words for an
 * action the customer may hear about and that moves no money back. So it says
 * both, from the row's own facts:
 *   · rentals: the PATCH pushes "Your booking RR-… has been cancelled"
 *     (lib/notifications/booking-status.ts), but only to a customer whose
 *     phone has notifications on;
 *   · reservations: the PATCH sends nothing on a cancel (it emails only on
 *     approved / unavailable), so the owner is told to tell them, as the
 *     no-show action already does;
 *   · money: amount_paid is WHOLE RUPEES on both tables. With no amount but a
 *     deposit_paid_at or PayPal capture, no figure is given (none is known).
 *
 * `serverReason` is why the DELETE route refused, when it refused a row the
 * desk's loaded copy did not show money on: a payment that landed after the
 * list was read (the ledger, and the amount_paid the same RPC writes, are
 * newer than the screen). The desk re-reads the list on a refusal, but Cancel
 * is live before that read lands, and the prompt must not drop the "no
 * refund" line in that window. Again no figure: the screen does not have one.
 */
export function cancelInsteadPrompt(
  kind: DeletableKind,
  row: DeleteFacts,
  serverReason?: DeleteRefusalReason | null,
): string {
  const noun = NOUN[kind];
  const told =
    kind === "vehicle"
      ? "The customer gets a \"booking cancelled\" notification if they have notifications on."
      : "The customer is not emailed — tell them yourself.";
  const paid = row.amount_paid ?? 0;
  const money =
    paid > 0
      ? ` ${rupees(paid)} is recorded as received on it — cancelling does not refund it.`
      : row.deposit_paid_at || row.paypal_capture_id || (serverReason && MONEY_REASONS.has(serverReason))
        ? " Money was received on it — cancelling does not refund it."
        : "";
  return `Cancel this ${noun} instead? It stays on file, marked cancelled.\n\n${told}${money}`;
}

// The refusals that mean money came in. The others are a commitment or an
// ending, which a cancel does not have to warn about refunding.
const MONEY_REASONS: ReadonlySet<DeleteRefusalReason> = new Set(["ledger", "paid", "money_received"]);

const REASONS: ReadonlySet<string> = new Set<DeleteRefusalReason>([
  "ledger", "paid", "money_received", "transfer_declared", "no_show", "confirmed", "completed",
]);

/** A refused DELETE as the desk keeps it: the route's sentence, and why. */
export type ServerRefusal = { refused: string; canCancel: boolean; reason: DeleteRefusalReason | null };

/**
 * Read the DELETE route's 409 body, or null when it is not a refusal the card
 * can show. `reason` is null when the route gave none, as on "changed while
 * you were looking": the desk then knows the row moved, but not how.
 */
export function serverRefusal(body: unknown): ServerRefusal | null {
  const b = (body && typeof body === "object" ? body : {}) as {
    error?: unknown;
    refused?: { canCancel?: unknown; reason?: unknown } | null;
  };
  if (typeof b.error !== "string" || !b.error) return null;
  const reason = b.refused?.reason;
  return {
    refused: b.error,
    canCancel: b.refused?.canCancel === true,
    reason: typeof reason === "string" && REASONS.has(reason) ? (reason as DeleteRefusalReason) : null,
  };
}
