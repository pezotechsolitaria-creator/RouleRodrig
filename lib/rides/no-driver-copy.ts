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
  /**
   * The drivers who were ASKED but never alerted to it — no round reached them
   * by WhatsApp or push, and they never answered. From what each round
   * recorded at the time (lib/rides/notify.ts, recordOfferReach).
   *
   * Ride RR-0E90AD (29 Sep 2026) is why. Mr Sam was offered it four times and
   * has neither channel, so the offer never left the building — and this
   * message told the owner "One driver was asked and did not accept", which
   * sent him looking for a refusal that never happened. null means we could
   * not tell, and changes nothing.
   */
  unreachable?: string[] | null;
  /** …of those, the ones with no WhatsApp and no phone alerts set up. */
  unreachableNoAlerts?: string[] | null;
  /** …of those, the ones whose alert was tried and did not go through. */
  unreachableFailed?: string[] | null;
  /** scheduled_at, as ISO, when the customer booked a time rather than "now". */
  pickupAt?: string | null;
  /**
   * Whole minutes until pickup; positive means still to come. The clock lives
   * in the caller.
   *
   * "Has been waiting 89 hours 42 minutes" is what an airport booking made
   * four days ahead printed: true of the booking, false of the customer, who
   * was not waiting anywhere. For a ride that has not happened yet, the fact
   * that decides how urgent the call is, is when it is.
   */
  minutesToPickup?: number | null;
  /**
   * The second message about the same stranding, sent as pickup nears. Its
   * own type and key, so it is never swallowed by the first one's dedupe.
   */
  reminder?: boolean;
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
export const RIDE_NO_DRIVER_REMINDER_TYPE = "ride_no_driver_reminder";

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
 * The reminder's key: the same stranding, a different message. Exported so
 * the worker can see a reminder already went out without re-reading the ride.
 */
export function reminderKeyFor(
  rideId: string,
  stampedAt: string | null | undefined,
): string | null {
  const key = dedupeKeyFor(rideId, stampedAt);
  return key ? key.replace("ride:no-driver:", "ride:no-driver-reminder:") : null;
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

  const upcoming = pickupStillToCome(f);
  const waited = upcoming
    ? `${possessive(who)} pickup is ${upcoming} and there is still no driver.`
    : f.minutesWaiting && f.minutesWaiting > 0
      ? `${who} has been waiting ${plainDuration(f.minutesWaiting)} and still has no driver.`
      : `${who} is waiting for a ride and still has no driver.`;

  // Only the names that are real, once each. A driver asked in four rounds is
  // one person, and an empty name is not a person at all.
  const unseen = uniqueNames(f.unreachable);
  const noAlerts = uniqueNames(f.unreachableNoAlerts).filter((n) => unseen.includes(n));
  const failedTo = uniqueNames(f.unreachableFailed).filter((n) => unseen.includes(n));

  // The fact the old message got wrong. Zero asked and four asked are different
  // problems: one is "nobody is working", the other is "everybody said no".
  // And asked-but-never-alerted is a third, with a third remedy: nobody
  // refused, so there is nobody to chase and a phone to set up instead.
  //
  // "Never alerted", not "never saw it": a driver with no alerts can still
  // open his own page and see a live offer. What we know is that no alert
  // reached him and he did not answer — so that is what it says.
  const asked =
    f.driversAsked == null
      ? null
      : f.driversAsked <= 0
        ? "No driver was free to ask, so nobody has even seen it yet."
        : unseen.length >= f.driversAsked
          ? f.driversAsked === 1
            ? `${unseen[0]} was offered it but was never alerted to it.`
            : `${f.driversAsked} drivers were offered it, and none of them was alerted to it.`
          : unseen.length > 0
            ? `${f.driversAsked} drivers were asked. None accepted, and ${listNames(unseen)} ${unseen.length === 1 ? "was" : "were"} never alerted to it.`
            : f.driversAsked === 1
              ? "One driver was asked and did not accept."
              : `${f.driversAsked} drivers were asked. None accepted.`;
  const asking = f.driversAsked != null && f.driversAsked > 0;

  const pickup = (f.pickup ?? "").trim();

  return {
    type: f.reminder ? RIDE_NO_DRIVER_REMINDER_TYPE : RIDE_NO_DRIVER_TYPE,
    // Same occurrence, same stamp — but a different message, so a different
    // key. The reminder must never be deduped against the alert it follows.
    dedupeKey: f.reminder ? reminderKeyFor(f.rideId, f.stampedAt) : dedupeKeyFor(f.rideId, f.stampedAt),
    title: f.reminder
      ? name ? `Still no driver for ${name}` : "Still no driver for a booked ride"
      : name ? `Call ${name} — nobody took their ride` : "Call the customer — nobody took this ride",
    lines: [
      waited,
      phoneLine(who, f.customerPhone),
      asked,
      // Only when nobody was asked. Once drivers HAVE been asked and refused,
      // the driver list read back a minute later describes a different moment
      // and would contradict the line above it.
      f.driversAsked == null || f.driversAsked <= 0
        ? (f.whyNobodyWasAsked ?? "").trim() || null
        : null,
      asking ? noAlertsLine(noAlerts) : null,
      asking ? failedLine(failedTo) : null,
      asking ? setUpLine(noAlerts) : null,
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

// ── THE LINE CALLMEBOT WILL NOT CARRY ───────────────────────────────────────
//
// Every one of these alerts ever queued for WhatsApp — twelve, from 4 Sep to
// 29 Sep 2026 — failed with "CallMeBot 403: Forbidden", on both owner numbers,
// while the same numbers received every other kind of alert. It is not the
// key and not an outage: it is CallMeBot's own firewall refusing the TEXT.
// Reproduced on 29 Sep with a dummy key (so nothing could be delivered): the
// full message is refused, every line on its own passes, and the smallest
// refused text is a line break followed by "Call them". The delivery alert
// that said "Call him now:" on its own line died the same way, twice.
//
// So the number goes on a line that does not open with that verb. The owner
// still reads the instruction — the title says "Call …" — and the email and
// phone-app copies, which never had the problem, read the same.
//
// It says WHOSE number. A line that just said "Their number:" sat under
// "Ring a driver yourself…" in the early alert, where every nearby "them" is a
// driver, and on a lock screen the customer's number read as a driver's.
function phoneLine(who: string, phone: string | null | undefined): string {
  const p = (phone ?? "").trim();
  return p ? `${possessive(who)} number: ${p}` : `${possessive(who)} number is on the rides page.`;
}

function uniqueNames(xs: string[] | null | undefined): string[] {
  return [...new Set((xs ?? []).map((n) => n.trim()).filter(Boolean))];
}

/** "Mr Sam has…", "Mr Sam and Ravi have…". */
function noAlertsLine(names: string[]): string | null {
  if (names.length === 0) return null;
  return `${listNames(names)} ${names.length === 1 ? "has" : "have"} no WhatsApp or phone alerts set up.`;
}

/** A code saved with a typo reads as "set up" and fails every send. */
function failedLine(names: string[]): string | null {
  if (names.length === 0) return null;
  return `The alert to ${listNames(names)} did not go through: check the WhatsApp code saved on the rides page, under Drivers.`;
}

/**
 * The remedy for "never alerted", which is not a phone call to the customer
 * but one to the driver. The link and the "Turn on" button are the whole
 * setup: no account, no app store — see app/d/[token]/DriverHome.tsx.
 */
function setUpLine(unseen: string[]): string | null {
  if (unseen.length === 0) return null;
  return unseen.length === 1
    ? `So it reaches ${unseen[0]} next time: on the rides page, Drivers → Send link, and ask them to press Turn on.`
    : `So it reaches them next time: on the rides page, Drivers → Send link to each, and ask them to press Turn on.`;
}

/** "Mr Sam", "Mr Sam and Ravi", "Mr Sam, Ravi and Anil". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Julien's", "Thomas'" — and never "The customer's's". */
function possessive(who: string): string {
  return /s$/i.test(who) ? `${who}'` : `${who}'s`;
}

/**
 * "Wed 30 Sept, 11:00 (in 23 hours 16 minutes)", or null when the ride is not
 * a future booking. Island time, whatever the server's clock is set to — the
 * owner reads this in Rodrigues.
 */
function pickupStillToCome(f: { pickupAt?: string | null; minutesToPickup?: number | null }): string | null {
  if (!f.pickupAt || f.minutesToPickup == null || f.minutesToPickup <= 0) return null;
  const t = Date.parse(f.pickupAt);
  if (Number.isNaN(t)) return null;
  const when = new Date(t).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Indian/Mauritius",
  });
  return `${when} (in ${plainDuration(f.minutesToPickup)})`;
}

// ── WHEN THE OFFER REACHED NOBODY, SAY SO THEN ──────────────────────────────
//
// The ladder is four rounds of ten minutes. A round whose only drivers cannot
// be told — no WhatsApp alerts, no phone alerts — still counts as "offered 1",
// so the roster alarm (which only fires on "offered 0") stays quiet, and the
// owner used to hear nothing until the ride gave up forty minutes later. For a
// customer standing at Plaine Corail that is forty minutes of nobody knowing.
//
// This is the message for the FIRST such round. The give-up message still
// follows if nobody takes it; this one exists so the owner can act while the
// ladder is still running, and so he learns the cause is a phone to set up,
// not a driver to chase.

export const RIDE_UNREACHED_TYPE = "ride_unreached";

export type RideUnreachedFacts = {
  rideId: string;
  /**
   * When this run of the ladder began (its first round), as ISO. One run is
   * one message however many of its rounds reach nobody; a reopened ride is a
   * new run and alerts again. See unreachedKeyFor.
   */
  ladderStartedAt: string | null | undefined;
  customerName?: string | null;
  customerPhone?: string | null;
  pickup?: string | null;
  dropoff?: string | null;
  pickupAt?: string | null;
  minutesToPickup?: number | null;
  /** Drivers holding the offer who have neither WhatsApp nor phone alerts. */
  noAlerts: string[];
  /** Drivers holding the offer with no phone number saved at all. */
  noNumber: string[];
  /** Drivers whose WhatsApp was tried and did not go through. */
  failed: string[];
};

/** Same shape and the same reasoning as dedupeKeyFor: digits only at the end. */
export function unreachedKeyFor(rideId: string, ladderStartedAt: string | null | undefined): string | null {
  const id = (rideId ?? "").trim();
  if (!id) return null;
  const t = Date.parse(ladderStartedAt ?? "");
  if (Number.isNaN(t)) return null;
  return `ride:unreached:${id}:${t}`;
}

export function rideUnreachedAlert(f: RideUnreachedFacts): RideUnassignedAlert {
  const name = (f.customerName ?? "").trim();
  const who = name || "The customer";
  const noAlerts = uniqueNames(f.noAlerts);
  const noNumber = uniqueNames(f.noNumber);
  const failed = uniqueNames(f.failed);

  const upcoming = pickupStillToCome(f);
  const pickup = (f.pickup ?? "").trim();

  return {
    type: RIDE_UNREACHED_TYPE,
    dedupeKey: unreachedKeyFor(f.rideId, f.ladderStartedAt),
    title: name ? `No driver was told about ${possessive(name)} ride` : "No driver was told about a new ride",
    lines: [
      upcoming
        ? `${possessive(who)} pickup is ${upcoming}.`
        : `${who} wants a ride now.`,
      noAlerts.length
        ? `The offer went to ${listNames(noAlerts)}, but no WhatsApp or phone alerts are set up, so no alert went out.`
        : null,
      noNumber.length
        ? `${listNames(noNumber)} ${noNumber.length === 1 ? "has" : "have"} no phone number saved, so the offer could not be sent.`
        : null,
      failedLine(failed),
      "Ring a driver yourself and give them the ride on the rides page.",
      phoneLine(who, f.customerPhone),
      noAlerts.length ? setUpLine(noAlerts) : null,
      pickup ? `Pickup: ${pickup}` : null,
      f.dropoff === undefined
        ? null
        : f.dropoff
          ? `Drop-off: ${f.dropoff}`
          : "Drop-off: day hire — no fixed destination",
      `Ride ${rideReference(f.rideId)}`,
      RIDES_BOARD,
    ].filter((l): l is string => Boolean(l)),
  };
}
