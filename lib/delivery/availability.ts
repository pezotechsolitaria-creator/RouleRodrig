// ── What a delivery driver's availability actually means ────────────────────
//
// The AUTHORITY is SQL. This is the mirror the SCREENS use, for the same reason
// vehicle.ts mirrors vehicle_can_carry(): four surfaces were each deciding it
// with their own inline ternary, and they did not agree with each other or with
// dispatch.
//
// ── ONE COLUMN, ONE QUESTION ───────────────────────────────────────────────
// delivery_drivers.availability answers exactly one thing:
//
//     HAS THIS DRIVER ASKED FOR WORK?
//
//   offline    no.
//   available  yes, holding nothing.
//   busy       yes, holding something.
//
// 'busy' is DERIVED and never chosen — set_driver_availability takes a boolean,
// because a driver has two intents. So 'busy' is not a second kind of "off"; it
// is "on duty, with a job in hand".
//
// CAPACITY IS A SEPARATE, COUNTABLE THING: activeCount < maxActive, where
// maxActive is delivery_settings.max_active_deliveries (2 in production).
// Conflating the two is what made a driver holding 1 of 2 permitted jobs
// invisible to dispatch while their own phone said "Online — taking
// deliveries". See M116.
//
// ── NOT SHARED WITH TAXI ───────────────────────────────────────────────────
// taxi_drivers.availability uses the same word for the OPPOSITE meaning: there
// 'busy' is a lockout the office sets by hand, which the driver cannot clear
// and dispatch must obey. It is also a different Postgres type with a different
// word for off ('off', never 'offline'). Only fleetDutyLabel below spans both,
// and only because the admin board shows the two fleets in one list.

/** Mirrors delivery_settings.max_active_deliveries' column default. Anything
 *  with the live value in hand should pass it — the point of that setting is
 *  that the owner can change it without a deploy. */
export const DEFAULT_MAX_ACTIVE_DELIVERIES = 2;

export type DriverDuty = "offline" | "idle" | "working" | "at_capacity";

export type DutyState = {
  state: DriverDuty;
  /** Has the driver asked to receive work? Drives the toggle and aria-pressed. */
  onDuty: boolean;
  /** Will dispatch consider them right now? Mirrors dispatch_candidates. */
  offerable: boolean;
  label: string;
  /** The line underneath. Never promises work that cannot come. */
  detail: string;
  toggleLabel: string;
  tone: "off" | "good" | "full";
};

/**
 * What to show the driver, and whether dispatch can reach them.
 *
 * Mirrors dispatch_candidates' two gates exactly:
 *     availability <> 'offline'          -- duty
 *     active jobs < max_active_deliveries -- capacity
 */
export function driverDutyState(
  availability: string | null | undefined,
  activeCount: number,
  maxActive: number = DEFAULT_MAX_ACTIVE_DELIVERIES,
): DutyState {
  const jobs = Math.max(0, Math.trunc(activeCount) || 0);
  // A limit below 1 would mean "nobody may work", which is never what the owner
  // meant and would silently freeze the whole fleet.
  const cap = Math.max(1, Math.trunc(maxActive) || DEFAULT_MAX_ACTIVE_DELIVERIES);

  // 'available' and 'busy' are the two on-duty values. Anything else — 'offline',
  // null, or a value this build has never heard of — reads as off duty: never
  // promise a driver work on the strength of a guess.
  const onDuty = availability === "available" || availability === "busy";

  if (!onDuty) {
    return {
      state: "offline",
      onDuty: false,
      offerable: false,
      label: "Offline",
      detail:
        jobs > 0
          ? `You still have ${jobs} ${jobs === 1 ? "delivery" : "deliveries"} to finish — going offline only stops new ones.`
          : "Go online to start receiving deliveries.",
      toggleLabel: "Go online",
      tone: "off",
    };
  }

  if (jobs === 0) {
    return {
      state: "idle",
      onDuty: true,
      offerable: true,
      label: "Online — taking deliveries",
      detail: "We'll show a job here the moment one comes in.",
      toggleLabel: "Go offline",
      tone: "good",
    };
  }

  if (jobs < cap) {
    const room = cap - jobs;
    return {
      state: "working",
      onDuty: true,
      offerable: true,
      label: `On a delivery — you can take ${room} more`,
      detail: "Finish what you're holding. We'll keep offering you jobs nearby.",
      toggleLabel: "Go offline",
      tone: "good",
    };
  }

  return {
    state: "at_capacity",
    onDuty: true,
    offerable: false,
    label: jobs === 1 ? "On a delivery" : `On ${jobs} deliveries`,
    // The honest version of the old empty state, which told a driver at their
    // limit that a job would appear "the moment one comes in". It could not.
    detail: "No new jobs until you finish one — you're carrying your limit.",
    toggleLabel: "Go offline",
    tone: "full",
  };
}

// ── THE ADMIN BOARD, WHERE BOTH FLEETS ARE SHOWN IN ONE LIST ───────────────
//
// This is the ONE place the taxi and delivery vocabularies meet, so it is the
// one place that has to speak both. It is deliberately a different question
// from driverDutyState: an operator scanning the board is asking "can I hand
// this run to somebody right now", not "will dispatch offer them a second job".

export type FleetDutyState = "off" | "free" | "busy";

export type FleetDuty = {
  state: FleetDutyState;
  /** For the list row. */
  short: string;
  /** For the driver card. */
  long: string;
  /** Working at all — i.e. worth phoning. */
  working: boolean;
};

export function fleetDutyLabel(
  availability: string | null | undefined,
  hasJob: boolean,
): FleetDuty {
  const a = (availability ?? "").trim().toLowerCase();

  // Delivery says 'offline', taxi says 'off'. An unknown value reads as not
  // working: telling an operator somebody is reachable on a guess wastes a
  // phone call and a customer's time.
  if (a === "" || a === "off" || a === "offline") {
    return { state: "off", short: "Off", long: "Not working right now.", working: false };
  }

  if (hasJob) {
    return { state: "busy", short: "On a job", long: "On a job right now.", working: true };
  }

  // Reachable for TAXI by design: the office marks a driver busy with no ride
  // attached, and the driver cannot clear it. Under the old three predicates
  // this person matched NO filter — not Available, not On a job, not Offline —
  // so they appeared only under "All" and quietly stopped being phoned.
  if (a === "busy") {
    return {
      state: "busy",
      short: "Busy",
      long: "Marked busy — on duty, but not on a job we can see.",
      working: true,
    };
  }

  return { state: "free", short: "Free", long: "Free — can be offered a job.", working: true };
}

/** Exactly one bucket per driver, so the filter chips partition the fleet. */
export function fleetFilterKey(
  availability: string | null | undefined,
  hasJob: boolean,
): "available" | "busy" | "offline" {
  const { state } = fleetDutyLabel(availability, hasJob);
  return state === "off" ? "offline" : state === "free" ? "available" : "busy";
}
