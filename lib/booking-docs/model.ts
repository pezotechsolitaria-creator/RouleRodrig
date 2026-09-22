// ── THE DOCUMENT THE OWNER MAKES BY HAND ────────────────────────────────────
//
// He already produces this: a booking confirmation for an excursion, with the
// guest, the meeting point, a priced line, a deposit split and a payment
// status. The reference on the one he showed — RR-COCOS-SB — is typed, not
// generated. This module is that document's arithmetic, kept pure so every
// figure on a page a customer keeps can be checked without a database.
//
// IT IS NOT THE PLATFORM'S BOOKING MODEL, and must not pretend to be:
//
//   - place_bookings prices FLAT per reservation. "2 x Rs 1,800" has no source
//     column; the owner types the unit price and the quantity.
//   - the deposit-and-balance model was REMOVED from experiences on
//     2026-08-13 ("paid in full at the point of booking"). A deposit on this
//     document is the owner's arrangement with one customer, not a site rule.
//   - the reference is free text. It does NOT resolve on /track or
//     /manage-booking, whose lookups validate the RR-XXXXXX six-hex shape and
//     would reject RR-COCOS-SB.
//
// So this document is composed, not derived. What it may be PREFILLED from is
// a real reservation; what it says is whatever the owner confirms.

/** Every money field ends in Cents. The rule this platform has broken four times. */
export type BookingDocLine = {
  description: string;
  /** Whole units — people, boats, nights. Never fractional on this document. */
  qty: number;
  unitPriceCents: number;
};

export type BookingDocInput = {
  lines: BookingDocLine[];
  /** null means no deposit: the whole amount is due. 0..100. */
  depositPct: number | null;
  receivedCents: number;
};

export type BookingDocMoney = {
  lineTotals: number[];
  totalCents: number;
  depositCents: number;
  /** What is left once the deposit is paid — the picture's "Balance after deposit". */
  balanceAfterDepositCents: number;
  receivedCents: number;
  /** What is still owed against the WHOLE price, which is a different question. */
  outstandingCents: number;
};

/**
 * ONE PAGE, AND NO MORE.
 *
 * The renderer walks y downward from the top margin with no overflow check and
 * draws the footer at a fixed height regardless. A document with too many rows
 * would draw off the bottom of the page and then print the footer through
 * whatever was left. Capping the rows is the honest fix: a booking
 * confirmation for an excursion has one line, occasionally three.
 */
export const MAX_LINES = 8;

/** round() not floor(): a half-cent belongs to whoever the rounding favours, consistently. */
export function lineTotalCents(l: BookingDocLine): number {
  return Math.round(l.qty * l.unitPriceCents);
}

export function bookingDocMoney(input: BookingDocInput): BookingDocMoney {
  const lineTotals = input.lines.map(lineTotalCents);
  const totalCents = lineTotals.reduce((a, b) => a + b, 0);

  // A percentage of the total, computed once, here. The document prints the
  // percentage AND the figure, so a customer can check the arithmetic that
  // decided what they owe today.
  const depositCents =
    input.depositPct == null ? 0 : Math.round((totalCents * input.depositPct) / 100);

  return {
    lineTotals,
    totalCents,
    depositCents,
    balanceAfterDepositCents: totalCents - depositCents,
    receivedCents: input.receivedCents,
    outstandingCents: totalCents - input.receivedCents,
  };
}

export type BookingDocStatus = {
  /** The owner's own words, from the document he showed. */
  label: string;
  tone: "pending" | "part" | "paid";
  /** The sentence under the status. Empty when there is nothing to add. */
  detail: string;
};

/**
 * What the payment box says.
 *
 * The words are the owner's, taken from the document he already sends:
 * "PENDING — NO PAYMENT RECEIVED" and "Reservation is not locked until the
 * required deposit is received." Inventing a different vocabulary for the same
 * document would make the generated one read as a different business.
 */
export function bookingDocStatus(m: BookingDocMoney, hasDeposit: boolean): BookingDocStatus {
  if (m.totalCents > 0 && m.receivedCents >= m.totalCents) {
    return {
      label: "PAID IN FULL",
      tone: "paid",
      detail: "Nothing further to settle.",
    };
  }

  if (m.receivedCents <= 0) {
    return {
      label: "PENDING — NO PAYMENT RECEIVED",
      tone: "pending",
      detail: hasDeposit
        ? "Reservation is not locked until the required deposit is received."
        : "Reservation is not locked until payment is received.",
    };
  }

  // Something has arrived, but not all of it. Whether it COVERS the deposit is
  // the question the customer actually has, so the box answers that one.
  if (hasDeposit && m.receivedCents >= m.depositCents) {
    return {
      label: "DEPOSIT RECEIVED — BALANCE DUE",
      tone: "part",
      detail: "The reservation is locked. The balance is payable as arranged.",
    };
  }

  return {
    label: "PART PAID — BALANCE DUE",
    tone: "part",
    detail: hasDeposit
      ? "Reservation is not locked until the required deposit is received in full."
      : "Reservation is not locked until payment is received in full.",
  };
}

/**
 * The heading. A document with nothing outstanding is a receipt; one that is
 * still waiting for money is a confirmation of what was booked.
 */
export function bookingDocHeading(m: BookingDocMoney): string {
  return m.totalCents > 0 && m.receivedCents >= m.totalCents
    ? "RECEIPT"
    : "BOOKING CONFIRMATION";
}

/**
 * The note at the foot, built from the figures rather than typed again.
 *
 * The owner's version reads: "This document records the requested excursion
 * details. The booking remains pending until the Rs 1,800 deposit is received.
 * The remaining Rs 1,800 is payable according to the agreed payment
 * arrangement." Retyping those numbers by hand is how a note ends up
 * disagreeing with the table above it.
 */
export function bookingDocNote(
  m: BookingDocMoney,
  hasDeposit: boolean,
  money: (cents: number) => string,
): string {
  if (m.totalCents > 0 && m.receivedCents >= m.totalCents) {
    return `This document records the excursion details and confirms payment of ${money(
      m.totalCents,
    )} in full. Nothing further is owed.`;
  }
  if (hasDeposit) {
    return (
      `This document records the requested excursion details. The booking remains pending ` +
      `until the ${money(m.depositCents)} deposit is received. The remaining ` +
      `${money(m.balanceAfterDepositCents)} is payable according to the agreed payment arrangement.`
    );
  }
  return (
    `This document records the requested excursion details. The booking remains pending ` +
    `until ${money(m.totalCents)} is received.`
  );
}
