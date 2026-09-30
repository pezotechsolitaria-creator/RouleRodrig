// ── Which of a customer's requests they may clear from their own list ───────
//
// "Clear" hides a request from the customer's list and nowhere else (M227): the
// admin board, the tracker link and every record keep the untouched row. The
// one thing it must refuse is a job that is GOING TO HAPPEN — a delivery that
// exists, is being re-matched to a new driver, or has a driver on it. Hiding
// that would take the tracker and the driver's call button away from the
// person waiting at the door.
//
// set_delivery_request_hidden() enforces the same list in SQL; the UI reads it
// from here only to avoid offering a button the server would refuse.
// lib/delivery/clear.test.ts keeps the two lists identical.

export const IN_PROGRESS_LEGS = [
  "created",
  "searching_driver",
  "assigned",
  "going_to_pickup",
  "arrived_at_pickup",
  "picked_up",
  "out_for_delivery",
  "arrived",
] as const;

/** A row the list knows the live state of, or a device-only hint (no state). */
export function canClear(live: { status: string; deliveryStatus: string | null } | undefined): boolean {
  // A device-only row has no known state: clearing it only forgets it on this
  // device, and the server refuses anything in progress anyway.
  if (!live) return true;
  if (live.status !== "accepted") return true;
  return !(IN_PROGRESS_LEGS as readonly string[]).includes(live.deliveryStatus ?? "");
}
