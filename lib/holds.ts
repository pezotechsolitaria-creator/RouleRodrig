// Hold-expiry policy for unconfirmed booking requests.
//
// A booking starts life as "pending" (a hold) and reserves its dates so nobody
// else can grab them. If the owner never confirms it, the hold expires after a
// window (default 48h) so abandoned/fake requests don't block the calendar
// forever. We enforce this in two ways:
//   1. Read-time: anything that *counts* a hold ignores expired pending rows,
//      so the dates free up the moment the window passes (no wait for the cron).
//   2. The daily cron flips expired pending rows to "cancelled" for tidiness.

/**
 * Every status that CAN hold dates, for the `.in("status", …)` filters that
 * feed isActiveHold().
 *
 * Exported as one constant because M91 added "approved" and there are four
 * separate queries deciding vehicle availability. Four copies of a literal list
 * is four chances to forget one — and forgetting one does not throw, it just
 * quietly stops an approved booking from reserving its scooter, which surfaces
 * as two customers turning up for the same bike.
 *
 * A status listed here is a CANDIDATE, not a hold: isActiveHold() still decides.
 */
/**
 * How long an approved-but-unpaid booking reserves the vehicle, in hours.
 *
 * A real number with a real trade-off: too short and a customer in another
 * timezone wakes up to an expired reservation; too long and one person who
 * never intended to pay takes a scooter out of the fleet for a day of the high
 * season. 24h gives everyone a full waking cycle to see the email and pay.
 *
 * The owner can shorten or extend it per booking when he approves.
 */
export const PAYMENT_WINDOW_HOURS = 24;

export const HOLDING_STATUSES = ["pending", "approved", "confirmed"] as const;

export function holdExpiryHours(): number {
  const n = Number(process.env.HOLD_EXPIRY_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 48;
}

export function holdCutoffMs(): number {
  return Date.now() - holdExpiryHours() * 3600 * 1000;
}

/**
 * True when a booking row still reserves its dates.
 *
 * Payment-gated rows (a deposit is due): ONLY a paid deposit or a confirmed
 * status holds. An unpaid pending request never blocks others — whoever pays the
 * deposit first secures the vehicle, and any other pending request for the same
 * dates is released (and its customer notified) at capture time. This covers ALL
 * vehicle bookings and any place booking whose listing has a deposit set.
 *
 * Request-only rows (no deposit — the owner confirms manually): a pending hold
 * counts until the 48h window passes.
 *
 * APPROVED rows (M91) hold until their payment_due_by and then stop, which is
 * the one case where an unpaid booking reserves anything. See the block below.
 *
 * The distinction is additive & backwards-compatible: vehicle selects carry
 * `deposit_paid_at` but NOT `deposit_amount`, so they're payment-gated. Place
 * selects carry both, so a deposit >0 gates them the same way while a 0/absent
 * deposit keeps the 48h manual window.
 */
export function isActiveHold(row: {
  status: string;
  created_at?: string | null;
  deposit_paid_at?: string | null;
  deposit_amount?: number | null;
  payment_due_by?: string | null;
}): boolean {
  if (row.status === "confirmed") return true;

  // ── M91: an APPROVED booking reserves the vehicle, unpaid ────────────────
  //
  // This is the one exception to "only money holds a bike", and it exists
  // because the owner now checks with the partner BEFORE the customer pays.
  // Once he has told a customer "yes, it's available", that scooter must stop
  // being offered to anyone else — otherwise approving three people for one
  // bike produces exactly the involuntary refunds the check was added to
  // prevent.
  //
  // It is bounded, because an unpaid reservation now blocks real customers: the
  // hold dies at payment_due_by and the vehicle returns to the pool, with no
  // wait for the cron. A row approved before that column existed, or approved
  // with no deadline set, is treated as NOT holding — failing open here would
  // let one ancient row block a bike forever, and the owner would have no idea
  // which one.
  if (row.status === "approved") {
    if (!row.payment_due_by) return false;
    const due = new Date(row.payment_due_by).getTime();
    return Number.isFinite(due) && due > Date.now();
  }

  if (row.status !== "pending") return false;

  const paymentGated =
    "deposit_paid_at" in row &&
    (!("deposit_amount" in row) || Number(row.deposit_amount ?? 0) > 0);

  // Payment-gated: only a paid deposit holds. Unpaid pending never blocks.
  if (paymentGated) return !!row.deposit_paid_at;

  // Request-only place booking — longer manual-confirmation window.
  if (!row.created_at) return true;
  return new Date(row.created_at).getTime() >= holdCutoffMs();
}
