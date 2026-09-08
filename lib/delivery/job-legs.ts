import { isPoint, navigateUrl, searchUrl } from "@/lib/maps/nav";

// ── BOTH ENDS OF THE JOB, ALWAYS ────────────────────────────────────────────
//
// The driver card carried ONE Navigate button whose destination swapped with
// the job's stage. That was already an improvement on pointing at the drop-off
// forever, but it still decides FOR the driver, and the decision is not always
// right:
//
//   · A driver on `going_to_pickup` who wants to check how far the customer is
//     before committing to the order they run their jobs in has no way to look.
//   · A driver who has collected but forgot something at the shop is offered
//     no route back to it.
//   · Anyone holding two jobs is planning a round trip, and a button that only
//     ever shows one end of one job cannot help with that.
//
// So both ends are offered, always, and the STAGE decides which is emphasised
// rather than which exists. One obvious next action is preserved — it is the
// gold one — without hiding the other.
//
// ── AND A PLACE NAME IS STILL A PLACE ───────────────────────────────────────
// The owner's example was a pickup reading "kot pive": a real Rodriguan
// direction, no coordinates behind it. The old card printed that as dead text
// with no map at all, because the code asked for a lat/lng and gave up. A text
// search is worse than a pin and far better than nothing, so a named place
// gets one — labelled as a search, not passed off as a pin, because a driver
// who trusts an approximate result as exact ends up in the wrong village.

export type LegTarget = {
  href: string;
  /** True when this came from real coordinates. False for a name search. */
  precise: boolean;
  /** What to show under the button when it is not a pin. */
  label: string;
};

/**
 * A one-tap map link for one end of a job, or null if we know nothing at all.
 *
 * Coordinates win. A place name is the fallback and is marked as such.
 */
export function legTarget(
  lat: number | null | undefined,
  lng: number | null | undefined,
  place: string | null | undefined,
): LegTarget | null {
  if (isPoint(lat, lng)) {
    return {
      href: navigateUrl(lat as number, lng as number),
      precise: true,
      label: "Turn-by-turn",
    };
  }
  const named = (place ?? "").trim();
  if (named.length > 0) {
    // Rodrigues, so a bare village name resolves on the right island rather
    // than to the first match on earth. "Port Mathurin" alone finds a street
    // in three other countries first.
    return {
      href: searchUrl(`${named}, Rodrigues`),
      precise: false,
      label: "Search — no exact pin",
    };
  }
  return null;
}
