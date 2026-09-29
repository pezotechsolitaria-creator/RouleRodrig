import {
  amountPaidRupees,
  balanceRupees,
  bookingTotalRupees,
  cashToCollect,
  isPayInPerson,
  rupees,
  type BookingKind,
  type MoneyRow,
} from "./in-person";

// ── WHAT A BOOKING'S MONEY LINES SAY, IN EVERY EMAIL (M220) ─────────────────
//
// summaryRows() in lib/email.ts printed the same two lines on every rental —
// "Deposit to confirm" and "Balance at pickup = total − deposit" — whether or
// not a deposit had been paid. For a booking confirmed as paid in person that
// is simply false: RR-329D81's pickup reminder told the customer Rs 3,864 when
// Rs 5,152 was owed, and the owner read the same wrong figure at the door
// (M220, supabase/migrations/20260928213059_m220_a_booking_paid_in_person.sql).
//
// So the lines now come from what actually happened, asked of
// lib/bookings/in-person.ts and never re-derived here:
//
//   · paid in person   → what is still to pay, in cash, at pickup / on arrival
//                        ("Still to pay (cash)" once that day has come)
//   · paid online      → "Deposit paid" and the TRUE balance
//   · nothing paid yet → the request's plan ("Deposit to confirm"), and only
//                        while it is still a request — never as if it were paid
//                        — and no plan at all for a customer who asked to pay
//                        in person
//
// Pure, and outside lib/email/ on purpose: rows in, [label, value] pairs out,
// so every branch is checked in a test rather than in somebody's inbox. Labels
// are "English · Français" like every other row on the bilingual detail card.
//
// WHOLE RUPEES throughout, like both booking tables.

export type LinePair = [string, string];

/** What the vehicle rows need beyond MoneyRow. */
export type VehicleMoneyRow = MoneyRow & {
  deposit_pct?: number | null;
  /** Stamped by PayPal, and by the first ledger payment (M220). */
  deposit_paid_at?: string | null;
  /** The customer declared a bank transfer (M83). */
  payment_reported_at?: string | null;
  /** What the customer asked for when booking: 'online' | 'in_person' (M220). */
  payment_preference?: string | null;
};

const PAID_IN_FULL: LinePair = ["Balance · Solde", "Paid in full · Payé intégralement"];

const positive = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

/**
 * The pickup / arrival day has come (`today` is the island's YYYY-MM-DD, the
 * caller's clock). The same `start_date <= today` rule cashOverdue() uses.
 *
 * From that day on "to pay AT PICKUP" is a sentence about the past: the return
 * reminder, the owner's collect reminder and a receipt recorded at the counter
 * all say "Still to pay (cash)" instead, and a receipt stops asking the
 * customer to bring things to a pickup that has happened (M220 review).
 * Without a `today` nothing has started, which is what every caller that
 * predates this rule meant.
 */
export function hasStarted(
  row: { start_date?: string | null },
  today?: string | null,
): boolean {
  if (!today || !row.start_date) return false;
  return row.start_date.slice(0, 10) <= today.slice(0, 10);
}

const STILL_TO_PAY_CASH = "Still to pay (cash) · Reste à payer (espèces)";

/**
 * Money received online that the row can show.
 *
 * amount_paid when it was written (PayPal, the M220 ledger); otherwise the
 * deposit — but ONLY with evidence that it arrived: deposit_paid_at, or a
 * declared transfer on a booking the owner has since confirmed. That is the
 * same rule lib/receipts/payment-receipt.ts uses before it will print a
 * receipt. (A legacy confirmed row with no evidence at all is read as the old
 * pill's "deposit in" further down — see vehicleMoneyLines.)
 */
function receivedOnline(row: VehicleMoneyRow): number {
  const paid = amountPaidRupees(row);
  if (paid > 0) return paid;
  const confirmed = row.status === "confirmed" || row.status === "completed";
  const evidenced = !!row.deposit_paid_at || (confirmed && !!row.payment_reported_at);
  return evidenced ? positive(row.deposit_amount) ?? 0 : 0;
}

/**
 * The payment lines under "Total" on a rental's detail card. Empty when the
 * total is unknown (the caller prints its own fallback) or the booking is
 * cancelled (nothing is owed on a booking that is not happening).
 *
 * `today` (the island's YYYY-MM-DD) lets the lines know the pickup has come;
 * see hasStarted().
 */
export function vehicleMoneyLines(row: VehicleMoneyRow, today?: string | null): LinePair[] {
  const total = bookingTotalRupees("vehicle", row);
  if (total === null) return [];
  if (row.status === "cancelled") return [];

  // ── Paid in person: what to bring, and nothing about a deposit ─────────
  if (isPayInPerson(row)) {
    const paid = amountPaidRupees(row);
    const balance = balanceRupees("vehicle", row) ?? 0;
    const out: LinePair[] = [];
    if (paid > 0) out.push(["Paid · Payé", rupees(paid)]);
    out.push(
      balance > 0
        ? [
            hasStarted(row, today)
              ? STILL_TO_PAY_CASH
              : "To pay at pickup (cash) · À régler au retrait (espèces)",
            rupees(balance),
          ]
        : PAID_IN_FULL,
    );
    return out;
  }

  // ── Paid online: the deposit that ARRIVED, and the true balance ────────
  const received = receivedOnline(row);
  if (received > 0) {
    const balance = balanceRupees("vehicle", { ...row, amount_paid: received }) ?? 0;
    if (balance === 0) return [["Paid · Payé", rupees(received)], PAID_IN_FULL];
    return [
      ["Deposit paid · Acompte payé", rupees(received)],
      ["Balance at pickup · Solde au retrait", rupees(balance)],
    ];
  }

  // ── Nothing received ────────────────────────────────────────────────────
  // A request (pending) or a held vehicle (approved) quotes the plan exactly as
  // the request email always has: it is a figure to EXPECT, not a claim that
  // anything was paid. A row with no status is the request email itself.
  const deposit = positive(row.deposit_amount);
  const status = row.status ?? "pending";
  // M220 review: a customer who asked to pay in person is not quoted an online
  // deposit on their own request. The owner decides; the card says so.
  if (status === "pending" && prefersInPerson(row)) {
    return [["Payment · Paiement", "In person, to be confirmed · En personne, à confirmer"]];
  }
  if (deposit !== null && (status === "pending" || status === "approved")) {
    return [
      [`Deposit to confirm · Acompte (${row.deposit_pct ?? 0}%)`, rupees(deposit)],
      ["Balance at pickup · Solde au retrait", rupees(Math.max(total - deposit, 0))],
    ];
  }
  // Confirmed with no money recorded and not marked in person: the old
  // 'Confirmed' pill, which the owner pressed once the deposit transfer had
  // reached his statement — confirmed MEANT the deposit was in (M91). This
  // printed "Still to pay <total>" here, which told those customers their
  // deposit had vanished (M220 review). The pill now records the deposit, so
  // new rows take the evidenced path above; for the legacy ones the deposit
  // is read as received, and with no deposit figure only the Total stands.
  if (status === "confirmed" || status === "completed") {
    if (deposit === null) return [];
    const balance = Math.max(total - deposit, 0);
    if (balance === 0) return [["Paid · Payé", rupees(deposit)], PAID_IN_FULL];
    return [
      ["Deposit paid · Acompte payé", rupees(deposit)],
      ["Balance at pickup · Solde au retrait", rupees(balance)],
    ];
  }
  return [];
}

/**
 * The payment lines on a reservation's detail card. Only a booking paid in
 * person gets them: placeRows() has never printed a price, and an online
 * reservation is paid in full before it is confirmed (M210).
 */
export function placeMoneyLines(row: MoneyRow, today?: string | null): LinePair[] {
  if (!isPayInPerson(row) || row.status === "cancelled") return [];
  if (bookingTotalRupees("place", row) === null) return [];
  const paid = amountPaidRupees(row);
  const balance = balanceRupees("place", row) ?? 0;
  const out: LinePair[] = [];
  if (paid > 0) out.push(["Paid · Payé", rupees(paid)]);
  out.push(
    balance > 0
      ? [
          hasStarted(row, today)
            ? STILL_TO_PAY_CASH
            : "To pay on arrival (cash) · À régler à l'arrivée (espèces)",
          rupees(balance),
        ]
      : PAID_IN_FULL,
  );
  return out;
}

/**
 * The sentence a reminder adds for a customer who pays in person, or null
 * when there is nothing to bring. Plain text — the caller escapes nothing
 * because nothing here was typed by a person.
 */
export function cashDueSentence(
  kind: BookingKind,
  row: MoneyRow,
): { en: string; fr: string } | null {
  if (!isPayInPerson(row)) return null;
  const due = balanceRupees(kind, row);
  if (!due) return null;
  const amount = rupees(due);
  return kind === "vehicle"
    ? {
        en: `Please bring ${amount} in cash: you pay it when you pick up the vehicle. Nothing to pay online.`,
        fr: `Merci de prévoir ${amount} en espèces, à régler au retrait du véhicule. Rien à payer en ligne.`,
      }
    : {
        en: `Pay ${amount} in cash on arrival. Nothing to pay online.`,
        fr: `Réglez ${amount} en espèces à votre arrivée. Rien à payer en ligne.`,
      };
}

/**
 * The owner's line: "💵 Collect Rs 5,152 in cash", or null. Uses
 * cashToCollect(), so a cancelled or fully paid booking asks for nothing.
 */
export function collectLine(kind: BookingKind, row: MoneyRow): string | null {
  const due = cashToCollect(kind, row);
  return due ? `💵 Collect ${rupees(due)} in cash` : null;
}

/** The payment_preference a customer stated when booking (M220). */
export function prefersInPerson(row: { payment_preference?: string | null }): boolean {
  return row.payment_preference === "in_person";
}
