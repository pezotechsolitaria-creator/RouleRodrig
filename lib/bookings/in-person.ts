// ── A BOOKING PAID IN PERSON (M220) ─────────────────────────────────────────
//
// The owner, 29 Sept 2026: "accept a booking directly without paying on the
// website as people tend to pay on cash by hand". Two facts, never one:
//
//   · CONFIRMED, PAYS IN PERSON — `pay_in_person`. A promise. It holds the
//     vehicle or slot (status 'confirmed') and says nothing about money.
//   · PAYMENT RECEIVED — a `booking_payments` row; `amount_paid` is the running
//     total and `deposit_paid_at` marks the first payment.
//
// Every screen that shows what is owed, collected or due asks THIS file, so
// the admin card, the Money desk, the reminders and the customer's own page
// cannot disagree. Pure: rows in, numbers out.
//
// MONEY IS WHOLE RUPEES here — both booking tables store rupees (see the
// rupees-vs-cents memory: the same word has carried both units twice).

export type BookingKind = "vehicle" | "place";

export const PAYMENT_METHODS = ["cash", "mcb_juice", "bank_transfer", "card", "paypal"] as const;
export type BookingPaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The owner's words for each method (the admin desk is English). */
export const METHOD_LABEL: Record<BookingPaymentMethod, string> = {
  cash: "Cash",
  mcb_juice: "MCB Juice",
  bank_transfer: "Bank transfer",
  card: "Card",
  paypal: "PayPal",
};

export type MoneyRow = {
  status?: string | null;
  pay_in_person?: boolean | null;
  /** vehicles: the whole rental, rupees */
  total_amount?: number | null;
  /** places: the WHOLE price (M210); vehicles: the online part-payment */
  deposit_amount?: number | null;
  amount_paid?: number | null;
  start_date?: string | null;
  no_show_at?: string | null;
};

/**
 * What the booking costs, in rupees. A vehicle's total is total_amount; a
 * place booking's deposit_amount IS its whole price (M210). Null when the row
 * carries no figure (request-only listings, very old rentals).
 */
export function bookingTotalRupees(kind: BookingKind, row: MoneyRow): number | null {
  const v = kind === "vehicle" ? row.total_amount : row.deposit_amount;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** What has actually been received, in rupees. */
export function amountPaidRupees(row: MoneyRow): number {
  const v = row.amount_paid;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/** Still owed, in rupees; null when the total is unknown. Never negative. */
export function balanceRupees(kind: BookingKind, row: MoneyRow): number | null {
  const total = bookingTotalRupees(kind, row);
  if (total === null) return null;
  return Math.max(total - amountPaidRupees(row), 0);
}

export function isPayInPerson(row: MoneyRow): boolean {
  return row.pay_in_person === true;
}

const LIVE = new Set(["confirmed", "completed"]);

/**
 * The cash the owner (or partner) still has to collect in person: only for a
 * booking confirmed as paid in person that is still on, and only what is left.
 * Zero when nothing is owed; null when it is not an in-person booking or the
 * total is unknown.
 */
export function cashToCollect(kind: BookingKind, row: MoneyRow): number | null {
  if (!isPayInPerson(row) || !LIVE.has(String(row.status ?? ""))) return null;
  return balanceRupees(kind, row);
}

/**
 * The pickup / arrival has come and gone and the money is still not recorded:
 * the owner either forgot to press "Cash received" or the customer never came.
 * `today` is the island's YYYY-MM-DD (the caller decides the clock).
 */
export function cashOverdue(kind: BookingKind, row: MoneyRow, today: string): boolean {
  const due = cashToCollect(kind, row);
  if (!due) return false;
  return !!row.start_date && row.start_date.slice(0, 10) <= today;
}

/** "Rs 5,997" — the one money format for these amounts. */
export function rupees(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-US")}`;
}
