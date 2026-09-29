import {
  amountPaidRupees,
  bookingTotalRupees,
  cashToCollect,
  isPayInPerson,
  type BookingKind,
  type MoneyRow,
} from "./in-person";

// ── WHAT THE CUSTOMER'S OWN PAGE SAYS ABOUT MONEY (M220) ────────────────────
//
// /manage-booking reads lookup_booking(), which since M220 also says whether
// the owner confirmed the booking as paid in person. Before that, a cash
// booking confirmed with the status pill read "Confirmed" directly beside
// "Deposit to confirm Rs X" — a deposit nobody asked for, on a booking that was
// already confirmed — and its timeline ticked a "Deposit" step that never
// happened.
//
// The page decides nothing about money itself: it maps the lookup onto the
// same MoneyRow the admin desk and the reminders read, and asks
// lib/bookings/in-person.ts. Pure, so the mapping is testable without a
// browser.

/** The fields of lookup_booking() this file reads. */
export type LookedUpBooking = {
  kind: BookingKind;
  status: string;
  /** Vehicles: total_amount. Places: always null (the RPC sends the price as `deposit`). */
  total: number | null;
  /** Vehicles: the online part-payment. Places: the WHOLE price (M210). */
  deposit: number | null;
  amountPaid?: number | null;
  depositPaid: boolean;
  payInPerson?: boolean | null;
  paymentPreference?: "online" | "in_person" | null;
  noShow?: boolean | null;
  start?: string | null;
};

/**
 * The lookup, as the row shape every money helper takes. The two kinds carry
 * their price in different fields (M210), and this is the one place that knows.
 */
export function lookupMoneyRow(b: LookedUpBooking): MoneyRow {
  return b.kind === "vehicle"
    ? {
        status: b.status,
        pay_in_person: b.payInPerson ?? false,
        total_amount: b.total,
        deposit_amount: b.deposit,
        amount_paid: b.amountPaid ?? null,
        start_date: b.start ?? null,
      }
    : {
        status: b.status,
        pay_in_person: b.payInPerson ?? false,
        deposit_amount: b.deposit,
        amount_paid: b.amountPaid ?? null,
        start_date: b.start ?? null,
      };
}

export type InPersonMoney = {
  /** What the booking costs; null when the row carries no figure. */
  total: number | null;
  /** What has been recorded as received. */
  paid: number;
  /** Still to hand over in person; null when the total is unknown. */
  toPay: number | null;
  paidInFull: boolean;
};

/**
 * The money on a booking the OWNER confirmed as paid in person, while it is
 * still on. Null for anything else — an online booking, a request the owner has
 * not answered, and a cancelled or no-show booking, which owe nothing.
 */
export function inPersonMoney(b: LookedUpBooking): InPersonMoney | null {
  const row = lookupMoneyRow(b);
  // The same two live statuses cashToCollect() owes cash on. A cancelled or
  // no-show booking owes nothing, so it gets no "pay at pickup" line at all.
  if (!isPayInPerson(row) || (b.status !== "confirmed" && b.status !== "completed")) return null;
  const total = bookingTotalRupees(b.kind, row);
  const toPay = cashToCollect(b.kind, row);
  return { total, paid: amountPaidRupees(row), toPay, paidInFull: total !== null && toPay === 0 };
}

/**
 * How far along the in-person timeline the booking is:
 * Request sent → Confirmed → Pay in person → Pick-up / Arrival.
 *
 * The pay step is ticked only once the money is RECORDED in full — never on
 * the promise. A part payment leaves it open, because the customer still has
 * cash to bring.
 */
export function inPersonTimelineCompleted(money: InPersonMoney, status: string): number {
  if (!money.paidInFull) return 2;
  return status === "completed" ? 4 : 3;
}

/**
 * The customer asked to pay in person and the owner has not answered yet.
 * Used only to choose words: it never hides a way to pay the owner has
 * actually offered (an approved booking still shows its pay buttons).
 */
export function askedToPayInPerson(b: LookedUpBooking): boolean {
  return b.paymentPreference === "in_person" && !b.payInPerson && b.status === "pending";
}

/** A no-show is a cancellation the customer caused: never a refund owed. */
export function isNoShow(b: LookedUpBooking): boolean {
  return b.status === "cancelled" && b.noShow === true;
}
