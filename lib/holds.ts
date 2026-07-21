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

// Vehicle bookings are gated on payment. An unpaid pending request holds its
// dates only for a short PAYMENT WINDOW (default 30 min) — long enough to
// complete a PayPal deposit and to stop two people paying for the same scooter
// at once, short enough that an abandoned/unpaid request frees the scooter fast
// instead of blocking it for hours. A paid deposit (or an owner-confirmed
// booking) holds permanently.
export function pendingPaymentMinutes(): number {
  const n = Number(process.env.PENDING_PAYMENT_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 30;
}
function pendingPaymentCutoffMs(): number {
  return Date.now() - pendingPaymentMinutes() * 60 * 1000;
}

/**
 * True when a booking row still reserves its dates.
 *
 * Vehicle bookings (rows that carry `deposit_paid_at`): a paid deposit or a
 * confirmed status always holds; an unpaid pending request holds only within
 * the short payment window. This fixes unpaid bookings blocking scooters.
 *
 * Place bookings (no `deposit_paid_at`, no online payment): unchanged — a
 * pending hold counts until the longer 48h window passes, since the owner
 * confirms those manually.
 */
export function isActiveHold(row: {
  status: string;
  created_at?: string | null;
  deposit_paid_at?: string | null;
}): boolean {
  if (row.status === "confirmed") return true;
  if (row.status !== "pending") return false;

  // Payment-gated vehicle booking.
  if ("deposit_paid_at" in row) {
    if (row.deposit_paid_at) return true; // deposit paid → held
    if (!row.created_at) return false; // no timestamp → don't block an unpaid row
    return new Date(row.created_at).getTime() >= pendingPaymentCutoffMs();
  }

  // Place booking — longer manual-confirmation window.
  if (!row.created_at) return true;
  return new Date(row.created_at).getTime() >= holdCutoffMs();
}
