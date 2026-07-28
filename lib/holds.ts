// Hold-expiry policy for unconfirmed booking requests.
//
// A booking starts life as "pending" (a hold) and reserves its dates so nobody
// else can grab them. If the owner never confirms it, the hold expires after a
// window (default 48h) so abandoned/fake requests don't block the calendar
// forever. We enforce this in two ways:
//   1. Read-time: anything that *counts* a hold ignores expired pending rows,
//      so the dates free up the moment the window passes (no wait for the cron).
//   2. The daily cron flips expired pending rows to "cancelled" for tidiness.

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
}): boolean {
  if (row.status === "confirmed") return true;
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
