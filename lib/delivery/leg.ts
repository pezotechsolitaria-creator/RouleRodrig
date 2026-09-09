// ── WHICH END OF THE JOB THE DRIVER IS AT ───────────────────────────────────
//
// The delivery status machine is:
//
//   assigned → going_to_pickup → arrived_at_pickup
//            → picked_up → out_for_delivery → arrived → delivered
//
// Everything before `picked_up` happens at the COLLECTION point. Everything
// from `picked_up` on happens on the way to, or at, the customer's door.
//
// That boundary was already written out by hand twice inside
// DriverDashboard.tsx — once to pick which deadline to show, once to label it
// "Pickup" or "Delivery" — as a literal string array both times. It is here so
// the third caller (which way does Navigate point) cannot disagree with the
// first two, and so adding a status to the machine breaks one place instead of
// silently taking the wrong branch in three.

/** Statuses at which the driver has not yet collected. */
export const BEFORE_COLLECTION = [
  "assigned",
  "going_to_pickup",
  "arrived_at_pickup",
] as const;

export type Leg = "pickup" | "dropoff";

/**
 * Where this driver is headed right now.
 *
 * Unknown statuses answer "dropoff". That is the safe end to be wrong about:
 * an unrecognised status is almost certainly a late one, and sending a driver
 * who already has the package back to the shop is the worse mistake.
 */
export function legFor(status: string): Leg {
  return (BEFORE_COLLECTION as readonly string[]).includes(status)
    ? "pickup"
    : "dropoff";
}
