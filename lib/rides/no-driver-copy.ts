// ── The words the owner reads when a ride ends up with nobody ───────────────
//
// ── WHY THIS IS A SEPARATE, PURE FILE ──────────────────────────────────────
// The old message was six hardcoded lines inside a function that also did the
// database read and the sending:
//
//     "No driver accepted a ride."   <pickup> → <dropoff>   "Assign someone…"
//
// Three things were wrong with it. It named no customer, so the one person
// who is actually waiting could not be phoned. It asserted a cause it had not
// measured — ride RR-26A506 ran four rounds that asked ZERO drivers, so "no
// driver accepted" was false and pointed at the wrong remedy. And a private
// day hire has no destination by design (create_ride_request stores NULL on
// purpose), so it would have rendered "Mont Lubin → null" to the one reader
// who must be able to act on it.
//
// The words ARE the product here, so they get a pure function and a test:
// give it facts, it gives you a message. No clock, no database, no network.
// Same shape as lib/delivery/escalation-copy.ts (M117), for the same reason.

import { rideReference } from "./model";
// Reused rather than re-written: "1 hour 5 minutes" must read identically in a
// delivery alert and a ride alert, and two copies of that arithmetic is how the
// two start disagreeing. It is pure and already tested.
import { plainDuration } from "@/lib/delivery/escalation-copy";

export type RideUnassignedFacts = {
  rideId: string;
  /**
   * ride_requests.updated_at, as an ISO string.
   *
   * The ONE thing separating two legitimate alerts about the same ride. Do not
   * substitute offer_rounds: nothing in the database ever resets it, so a
   * reopened ride exhausts again at the identical value. See dedupeKeyFor.
   */
  stampedAt: string | null | undefined;
  customerName?: string | null;
  customerPhone?: string | null;
  pickup?: string | null;
  /**
   * NULL means a private day hire — there is genuinely nowhere to go, and that
   * is a fact worth printing. UNDEFINED means we do not know, and prints
   * nothing. The distinction is deliberate; M98 stores NULL for exactly this.
   */
  dropoff?: string | null;
  /** Whole minutes since the customer asked. The clock lives in the caller. */
  minutesWaiting?: number | null;
  /**
   * How many drivers were ever asked, across every round.
   *
   * 0 and 4 need opposite responses from the owner — an empty roster versus
   * four people who said no — and the old copy called both of them "no driver
   * accepted". null means we could not count, and prints nothing rather than
   * guessing.
   */
  driversAsked?: number | null;
  /**
   * One present-tense sentence saying WHY nobody was free, from
   * rosterCauseSentence() in ./roster-copy.
   *
   * "No driver was free to ask" was true and useless: an empty driver list, a
   * man marked not working, and a van set to four seats are three different
   * problems with three different remedies, and the line below named none of
   * them. Passed in rather than derived here, because deriving it means reading
   * the driver list and this file has no database.
   */
  whyNobodyWasAsked?: string | null;
};

export type RideUnassignedAlert = {
  /** notification_jobs.type — free text, so a new one needs no migration. */
  type: string;
  /** null means "send it without a key". See dedupeKeyFor. */
  dedupeKey: string | null;
  title: string;
  lines: string[];
};

/** Hardcoded, like the delivery board: this is read on a phone and must land on
 *  the real site. SITE_URL falls back to the old vercel.app host when
 *  NEXT_PUBLIC_SITE_URL is unset, and a dead link is worse than no link. */
export const RIDES_BOARD = "https://roulerodrig.com/admin/rides";

export const RIDE_NO_DRIVER_TYPE = "ride_no_driver";

/**
 * The key that decides whether a message is sent or silently swallowed.
 *
 * notification_jobs_dedupe_key is `UNIQUE (dedupe_key) WHERE dedupe_key IS NOT
 * NULL` — permanent, no time window, no status predicate — and a collision is
 * turned into `suppressed_count = suppressed_count + 1` on the row that already
 * owns the key. Nobody is messaged. A key is therefore claimed for ever.
 *
 * The discriminator is ride_requests.updated_at, because the statement that
 * creates this situation writes it in the same breath:
 *
 *     update ride_requests set status = 'no_driver', updated_at = now()
 *
 * and the only way back to a second occurrence — admin_set_ride_status
 * reopening the ride to 'new' — writes `updated_at = now()` too. Two
 * transactions cannot share a now(), so two occurrences cannot share a key.
 *
 * Returns null when the timestamp is unusable. That sends the message WITHOUT
 * a key — a possible duplicate — on purpose: silence is the failure this whole
 * change exists to remove, and the owner would rather be told twice than not
 * at all.
 */
export function dedupeKeyFor(
  rideId: string,
  stampedAt: string | null | undefined,
): string | null {
  const id = (rideId ?? "").trim();
  if (!id) return null;
  const t = Date.parse(stampedAt ?? "");
  if (Number.isNaN(t)) return null;
  return `ride:no-driver:${id}:${t}`;
}

/**
 * Leads with the phone call, because the platform has already promised it.
 *
 * A customer on this ride is looking at /taxi/track, which says "We're
 * arranging this for you by hand… We'll call you." That promise is kept by one
 * person with a phone, and this message is the only thing that tells him.
 * Everything else — where, how long, who was asked — is context for that call.
 *
 * Internal vocabulary is banned outright. The reader runs a scooter business on
 * a small island, not a database.
 */
export function rideUnassignedAlert(f: RideUnassignedFacts): RideUnassignedAlert {
  const name = (f.customerName ?? "").trim();
  const who = name || "The customer";

  const waited =
    f.minutesWaiting && f.minutesWaiting > 0
      ? `${who} has been waiting ${plainDuration(f.minutesWaiting)} and still has no driver.`
      : `${who} is waiting for a ride and still has no driver.`;

  // The fact the old message got wrong. Zero asked and four asked are different
  // problems: one is "nobody is working", the other is "everybody said no".
  const asked =
    f.driversAsked == null
      ? null
      : f.driversAsked <= 0
        ? "No driver was free to ask, so nobody has even seen it yet."
        : f.driversAsked === 1
          ? "One driver was asked and did not accept."
          : `${f.driversAsked} drivers were asked. None accepted.`;

  const pickup = (f.pickup ?? "").trim();

  return {
    type: RIDE_NO_DRIVER_TYPE,
    dedupeKey: dedupeKeyFor(f.rideId, f.stampedAt),
    title: name ? `Call ${name} — nobody took their ride` : "Call the customer — nobody took this ride",
    lines: [
      waited,
      f.customerPhone
        ? `Call them now: ${f.customerPhone}`
        : "Call them now — their number is on the rides page.",
      asked,
      // Only when nobody was asked. Once drivers HAVE been asked and refused,
      // the driver list read back a minute later describes a different moment
      // and would contradict the line above it.
      f.driversAsked == null || f.driversAsked <= 0
        ? (f.whyNobodyWasAsked ?? "").trim() || null
        : null,
      pickup ? `Pickup: ${pickup}` : null,
      // Same sentence the driver's own message uses (lib/rides/model.ts), so a
      // day hire never reads as a broken field on either screen.
      f.dropoff === undefined
        ? null
        : f.dropoff
          ? `Drop-off: ${f.dropoff}`
          : "Drop-off: day hire — no fixed destination",
      `Ride ${rideReference(f.rideId)}`,
      "Give it to a driver yourself on the rides page, or call one you trust.",
      RIDES_BOARD,
    ].filter((l): l is string => Boolean(l)),
  };
}
