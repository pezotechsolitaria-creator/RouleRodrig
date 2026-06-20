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
 * True when a booking row still reserves its dates: confirmed bookings always
 * count; a pending hold only counts until its expiry window passes.
 */
export function isActiveHold(row: { status: string; created_at?: string | null }): boolean {
  if (row.status === "confirmed") return true;
  if (row.status !== "pending") return false;
  if (!row.created_at) return true;
  return new Date(row.created_at).getTime() >= holdCutoffMs();
}
