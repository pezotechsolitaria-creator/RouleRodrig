// ── Why a taxi ride found nobody, in words the owner can act on ─────────────
//
// ── THE HOLE THIS FILLS ────────────────────────────────────────────────────
// ride_candidates() already computes the diagnosis. It does not filter drivers
// out — it hands back EVERY switched-on driver with a `reason_skipped` saying
// why the engine passed over them. offer_ride() throws that column away:
//
//     from ride_candidates(p_request_id, v_stage, 3) c where c.reason_skipped is null
//
// and logs a bare count. Ride RR-26A506 ran four rounds on 2026-08-14, asked
// zero drivers, and recorded {"stage":1..4,"drivers":0} four times: the answer
// was computed four times and discarded four times. Nobody was told anything
// for 4 minutes 36 seconds, and the message that finally arrived named no cause.
//
// This module turns that column into two things — the DECISION "can a later,
// wider round still succeed?" and the SENTENCE the owner reads. Pure: facts in,
// words out, no clock, no database, no network. Same contract, and the same
// reason, as no-driver-copy.ts.

import { RIDES_BOARD } from "./no-driver-copy";

/** notification_jobs.type — free text, so a new one needs no migration. */
export const RIDE_ROSTER_TYPE = "ride_roster_blocked";

/**
 * Ordered by WHAT THE OWNER CAN DO ABOUT IT, not by how many drivers carry it.
 *
 * One driver he can switch back on outranks three who are legitimately out on
 * jobs, so a mixed roster leads with the fixable half. "blocked" is last on
 * purpose: it is the catch-all for a reason this file does not recognise, and
 * an unrecognised reason must still raise an alarm — degrading to a vaguer
 * sentence is survivable, degrading to silence is the defect being fixed.
 */
const CAUSE_ORDER = ["no_roster", "off", "busy", "seats", "service", "on_ride", "blocked"] as const;
export type RosterCause = (typeof CAUSE_ORDER)[number];

/** What one driver's reason_skipped means. "distance" is the only stage-
 *  dependent one, and it is the only one that is never a cause. */
export type RosterSkipCode = Exclude<RosterCause, "no_roster"> | "distance";

/**
 * The reason strings are display prose built by the database — three of them
 * with format() — and nothing else in the repo parses them. That is a real
 * coupling and it is deliberately kept OFF the decision path: assessRoster()
 * decides alarm-or-wait purely from whether reason_skipped is null, so a
 * reworded string costs a sharper sentence and never an alarm.
 *
 * Verbatim from production pg_get_functiondef('ride_candidates'):
 *   'not working today' · 'marked busy' · 'already on a ride'
 *   format('seats %s < %s passengers', coalesce(m.seats,4), v_r.passengers)
 *   'no airport runs' · 'no transfers' · 'no town taxi'
 *   format('%s km away, outside this round', round(m.road_km, 1))
 */
export function classifyRosterSkip(reason: string | null | undefined): RosterSkipCode | null {
  const r = (reason ?? "").trim().toLowerCase();
  if (!r) return null;
  if (r === "not working today") return "off";
  if (r === "marked busy") return "busy";
  if (r === "already on a ride") return "on_ride";
  if (/^seats \d+ < \d+ passengers$/.test(r)) return "seats";
  if (r === "no airport runs" || r === "no transfers" || r === "no town taxi") return "service";
  if (/outside this round$/.test(r)) return "distance";
  return "blocked";
}

/** The three columns of ride_candidates this decision needs. */
export type RosterCandidate = {
  driver_id: string;
  name?: string | null;
  reason_skipped: string | null;
};

export type RosterAssessment =
  | { alarm: false; why: "wider_search" | "already_asked" }
  | {
      alarm: true;
      cause: RosterCause;
      /** How many drivers carry the leading cause. */
      blocked: number;
      /** Named only when exactly ONE driver carries it — "Sam is not working"
       *  is a phone call, "everybody is not working" is a shrug. */
      blockedName: string | null;
      /** True when the drivers are not all held back by the same thing. */
      mixed: boolean;
      /** Raw reasons, for the payload — never for the message. */
      reasons: string[];
    };

/**
 * Can a later, wider round still find somebody?
 *
 * `atWidest` is ride_candidates(ride, 99, 40) — 99 is past the last width, so
 * v_radius is null and the distance branch cannot fire. Anything skipped there
 * is skipped at EVERY width.
 * `atStage` is the same call at the round that just asked nobody.
 *
 * Diffing them isolates distance without matching a word of the reason text.
 * p_limit must stay above the number of switched-on drivers: skipped rows sort
 * LAST (`order by (j.skip is not null), …`), so a small limit hides exactly the
 * rows this is looking at.
 */
export function assessRoster(input: {
  atStage: RosterCandidate[];
  atWidest: RosterCandidate[];
}): RosterAssessment {
  const widest = input.atWidest ?? [];

  // Zero rows is not "no reason" — it is the loudest reason there is. The base
  // read is `from taxi_drivers t … where t.active`, so an empty or entirely
  // switched-off list produces no rows and therefore no reason_skipped at all.
  // The ride provably exists (the dispatcher just processed it and
  // ride_candidates returns early only when the ride is missing), so an empty
  // set can mean one thing: nobody is switched on.
  if (widest.length === 0) {
    return { alarm: true, cause: "no_roster", blocked: 0, blockedName: null, mixed: false, reasons: [] };
  }

  const freeAtAnyWidth = widest.filter((c) => !c.reason_skipped);

  if (freeAtAnyWidth.length === 0) {
    const reasons = widest.map((c) => (c.reason_skipped ?? "").trim()).filter(Boolean);
    const codes = widest
      .map((c) => classifyRosterSkip(c.reason_skipped))
      .filter((c): c is RosterSkipCode => c !== null && c !== "distance");
    const cause: RosterCause = CAUSE_ORDER.find((k) => codes.includes(k as RosterSkipCode)) ?? "blocked";
    const carriers = widest.filter((c) => classifyRosterSkip(c.reason_skipped) === cause);
    const only = carriers.length === 1 ? (carriers[0].name ?? "").trim() : "";
    return {
      alarm: true,
      cause,
      blocked: carriers.length,
      blockedName: only || null,
      mixed: new Set(codes).size > 1,
      reasons,
    };
  }

  // Somebody is free once distance stops mattering. If this round skipped him,
  // distance is the only thing that could have done it, and the ladder's last
  // round applies no distance filter at all — so a later round reaches him.
  // This is the ONE case where four more minutes of silence buys something.
  const skippedNow = new Set(
    (input.atStage ?? []).filter((c) => c.reason_skipped).map((c) => c.driver_id),
  );
  if (freeAtAnyWidth.some((c) => skippedNow.has(c.driver_id))) {
    return { alarm: false, why: "wider_search" };
  }

  // Free now, free at every width, and still nobody was asked. The only filter
  // left lives in offer_ride and not in ride_candidates —
  //   and not exists (select 1 from ride_offers o … o.status in ('declined','withdrawn'))
  // — so this is not a roster fault, and the give-up message already words it
  // correctly ("N drivers were asked. None accepted."). Staying quiet here is
  // also the safe landing for a failed atStage read: it degrades to exactly
  // today's behaviour rather than inventing an alarm.
  return { alarm: false, why: "already_asked" };
}

export type RosterAlert = { type: string; dedupeKey: string; title: string; lines: string[] };

export type RosterAlertFacts = {
  cause: RosterCause;
  /** How many people are waiting on this right now. */
  ridesWaiting?: number | null;
  blockedName?: string | null;
  mixed?: boolean;
};

/**
 * The key that decides whether three stranded customers cost one message or six.
 *
 * It carries the CAUSE and the CLOCK HOUR and no ride anywhere. A roster fault
 * is one fact however many people it strands, and notification_jobs_dedupe_key
 * is `UNIQUE (dedupe_key) WHERE dedupe_key IS NOT NULL` with no time window —
 * so the hour is not decoration, it is the only thing stopping the key being
 * claimed for ever and next week's outage being swallowed into suppressed_count.
 *
 * `bucket` is passed in rather than read from a clock, which is what keeps this
 * module pure. The caller supplies hourBucket() from lib/notifications/
 * escalation.ts — the same bucket admin.stale_work has used since M93, rather
 * than a second scheme that drifts from it.
 */
export function rosterDedupeKey(cause: RosterCause, bucket: string): string {
  return `ride:roster:${cause}:${bucket}`;
}

function waitingLine(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return n === 1 ? "1 person is waiting right now." : `${n} people are waiting right now.`;
}

/**
 * The roster alarm. About the DRIVER LIST, never about one customer.
 *
 * It cannot name a customer, because one message may stand for three of them —
 * and the message that names a customer already exists and is not deduped
 * against this one. This one says what is wrong and what to do about it.
 *
 * Internal vocabulary is banned outright: the reader runs a scooter business on
 * a small island and is reading this on a lock screen.
 */
export function rosterBlockedAlert(f: RosterAlertFacts, bucket: string): RosterAlert {
  const who = (f.blockedName ?? "").trim();
  const each: Record<RosterCause, { title: string; head: string; todo: string }> = {
    no_roster: {
      title: "Nobody on the driver list to send",
      head: "Somebody asked for a taxi and there is not one driver switched on to send it to.",
      todo: "Add a driver, or switch one back on.",
    },
    off: {
      title: who ? `${who} is not working — no taxi can go out` : "Nobody is working — no taxi can go out",
      head: who
        ? `${who} is marked as not working today, so nobody has been asked.`
        : "Every driver is marked as not working today, so nobody has been asked.",
      todo: "Phone them, or set somebody to working.",
    },
    busy: {
      title: who ? `${who} is marked busy — no taxi can go out` : "Every driver is marked busy",
      head: who
        ? `${who} is marked busy, so nobody has been asked.`
        : "Every driver is marked busy, so nobody has been asked.",
      todo: "Phone them, or clear the busy mark for whoever is free.",
    },
    seats: {
      title: "The drivers are set too small for what was booked",
      head: "Every driver is set to carry fewer people than the booking asks for, so nobody has been asked.",
      // seats is NULL on the only driver on the list and the engine reads a
      // blank as four. This is far more often an unfilled box than a real van.
      todo: "Check the seat count on each driver — a blank one counts as four.",
    },
    service: {
      title: "No driver does this kind of trip",
      head: "Nobody on the driver list is set up for that sort of trip, so nobody has been asked.",
      todo: "Tick airport runs, transfers or town taxi on a driver who does them.",
    },
    on_ride: {
      title: "Every driver is already out on a ride",
      head: "Nothing is broken — there is genuinely nobody free to take another one.",
      todo: "Nothing to fix. Ring the person waiting if they need to know.",
    },
    blocked: {
      title: "Nobody can take a taxi ride right now",
      head: "Every driver is held back by something, so nobody has been asked.",
      todo: "Open the rides page to see who is held back and why.",
    },
  };

  const c = each[f.cause] ?? each.blocked;
  return {
    type: RIDE_ROSTER_TYPE,
    dedupeKey: rosterDedupeKey(f.cause, bucket),
    title: c.title,
    lines: [
      c.head,
      waitingLine(f.ridesWaiting),
      f.mixed ? "The others cannot take it either, for different reasons." : null,
      c.todo,
      RIDES_BOARD,
    ].filter((l): l is string => Boolean(l)),
  };
}

/**
 * The same fact, shrunk to one sentence, for the per-customer message.
 *
 * PRESENT TENSE, always. It is read back from the driver list seconds after the
 * fact — ride_candidates is STABLE and every predicate it tests is now()-shaped
 * (availability, live jobs, location freshness) — so "Sam is marked busy" is
 * defensible and "Sam was marked busy" is a claim the database cannot support.
 *
 * Returns null for "blocked": the give-up message already says nobody was free
 * to ask, and a vaguer restatement of that is worse than nothing.
 */
export function rosterCauseSentence(cause: RosterCause, blockedName?: string | null): string | null {
  const who = (blockedName ?? "").trim();
  switch (cause) {
    case "no_roster": return "There is not one driver switched on to send it to.";
    case "off":       return who ? `${who} is marked as not working today.` : "Every driver is marked as not working today.";
    case "busy":      return who ? `${who} is marked busy.` : "Every driver is marked busy.";
    case "on_ride":   return "Every driver is already out on another ride.";
    case "seats":     return "Every driver is set to carry fewer people than this booking asks for.";
    case "service":   return "Nobody on the driver list is set up for this sort of trip.";
    default:          return null;
  }
}
