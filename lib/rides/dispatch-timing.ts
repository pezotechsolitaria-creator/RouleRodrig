// ── WHEN DOES THE SEARCH FOR A DRIVER ACTUALLY START? ──────────────────────
//
// Not when the customer books. auto_dispatch_rides (M199, kept by M222) only
// picks a scheduled ride up once its pickup is close:
//
//     airport rides           24 hours before scheduled_at
//     every other scheduled   greatest(3 hours, the ladder + 15 minutes)
//     "now"                   at once
//
// The customer was told otherwise. The booking email said "we're offering it
// to drivers now, and one of them usually accepts within a few minutes", and
// the tracking page said "Checking drivers near you…" — for an airport pickup
// booked on 20 Sep for 5 Oct, fifteen days of a search that had not started.
//
// Pure and client-safe, so the email and the tracking page ask one question
// and get one answer. The two numbers are pinned against the SQL by
// dispatch-timing.test.ts, so a change there fails a test here.

/** Airport pickups: the whole day before, so a person can ring round. */
export const AIRPORT_DISPATCH_LEAD_MS = 24 * 60 * 60_000;

/**
 * Every other booked ride. The SQL takes the larger of this and the ladder's
 * own length plus a quarter of an hour; with today's four ten-minute rounds
 * that is 55 minutes, so three hours is what applies.
 */
export const OTHER_DISPATCH_LEAD_MS = 3 * 60 * 60_000;

export function dispatchLeadMs(service: string | null | undefined): number {
  return service === "airport" ? AIRPORT_DISPATCH_LEAD_MS : OTHER_DISPATCH_LEAD_MS;
}

/**
 * When the search for this ride begins, or null when it already has (a "now"
 * ride, a missing or unusable time, or a pickup already inside its lead).
 */
export function searchStartsAt(
  ride: { service?: string | null; whenKind?: string | null; scheduledAt?: string | null },
  now: number = Date.now(),
): Date | null {
  if (ride.whenKind !== "scheduled" || !ride.scheduledAt) return null;
  const pickup = Date.parse(ride.scheduledAt);
  if (Number.isNaN(pickup)) return null;
  const start = pickup - dispatchLeadMs(ride.service);
  // A minute of slack: the worker runs every minute, so "starts in 20
  // seconds" is "has started" to anybody reading it.
  return start > now + 60_000 ? new Date(start) : null;
}
