import type { RecommendedPlace } from "@/lib/defaults";

// ── WHICH FIELDS BELONG TO A BOOKABLE SERVICE, AND NOWHERE ELSE ─────────────
//
// The owner, with a screenshot of a guesthouse: "there is a problem for
// accommodations in the admin dashboard as it mixes up with activities like i
// could not delete the up to people which is illogical."
//
// He was looking at "Lakaze Mama" — category hotel — announcing "🕐 4h · 👥 up
// to 10". Both numbers were real data: the listing had been an activity at some
// point and kept durationMinutes=240 and maxGuests=10 when its category changed.
// They sat there harmlessly for as long as nothing rendered them, and the moment
// the detail view started showing service facts they became visible nonsense on
// a place to sleep.
//
// The deeper bug is the one he named: he could not DELETE them. These fields are
// only editable in the massage/fishing/boat editor, and that editor lists only
// rows that still carry a service tag — so the instant the tag went, the fields
// became unreachable. Data you can write and never erase is a trap.
//
// So the rule lives here, in one place, used by three: the category switch that
// strips them, the clean-up button that offers to, and the detail view that
// refuses to render them without a service tag. A hotel has no duration, and its
// capacity means ROOMS, not people per trip.

/**
 * Every service-only field, set to undefined.
 *
 * Spread over a place to strip it back to a plain listing. Kept as one object so
 * the category switch and the clean-up button can never disagree about which
 * fields count.
 */
export const SERVICE_ONLY_CLEARED: Partial<RecommendedPlace> = {
  serviceType: undefined,
  durationMinutes: undefined,
  maxGuests: undefined,
  providerName: undefined,
  meetingPoint: undefined,
  included: undefined,
};

/** Does this listing still carry service details it has no use for? */
export function hasServiceLeftovers(p: RecommendedPlace): boolean {
  return !!(
    p.durationMinutes ||
    p.maxGuests ||
    p.providerName ||
    p.meetingPoint ||
    p.included?.length
  );
}

/**
 * Name them, so "Remove them" is not a leap of faith.
 *
 * An operator about to delete something is owed a list of what is going.
 */
export function describeLeftovers(p: RecommendedPlace): string {
  const bits: string[] = [];
  if (p.durationMinutes) bits.push(`${p.durationMinutes} min`);
  if (p.maxGuests) bits.push(`up to ${p.maxGuests} people`);
  if (p.providerName) bits.push(p.providerName);
  if (p.meetingPoint) bits.push("a meeting point");
  if (p.included?.length) {
    bits.push(`${p.included.length} inclusion${p.included.length === 1 ? "" : "s"}`);
  }
  return bits.join(", ");
}

/**
 * Should the public detail view show duration / guests / provider / meeting point?
 *
 * Only for the three verticals they describe. Nothing is inferred from the
 * category: an ordinary activity is not a bookable service until the owner has
 * said which kind it is.
 */
export function showsServiceFacts(p: RecommendedPlace): boolean {
  return !!p.serviceType;
}
