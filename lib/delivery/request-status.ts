import { centsToShortString } from "@/lib/money";

// ── What is happening to my request, in words ───────────────────────────────
//
// A quote marketplace has a state nobody has ever met before: POSTED, PRICED,
// BUT NOT YET BOOKED. Every other order on this site is committed the moment it
// is placed, so a customer arriving here carries the wrong mental model — they
// expect somebody to already be on the way.
//
// The single job of this module is to make the current state, and the fact that
// the NEXT MOVE IS THEIRS, unmissable. It is pure so the wording can be pinned
// by tests: this is the copy that decides whether a customer sits waiting for a
// driver they never chose.

export type RequestStatus = "open" | "accepted" | "cancelled" | "expired";

/** The delivery_status enum, verbatim. Getting a label wrong here is silent:
 *  legCopy() falls through to "In progress" and the screen simply lies. That
 *  is exactly what "failed" did -- the real label is "failed_delivery", so a
 *  delivery that had genuinely failed rendered as still on its way. */
export type DeliveryLeg =
  | "created"
  | "searching_driver"
  | "assigned"
  | "going_to_pickup"
  | "arrived_at_pickup"
  | "picked_up"
  | "out_for_delivery"
  | "arrived"
  | "delivered"
  | "cancelled"
  | "driver_unavailable"
  | "driver_unresponsive"
  | "failed_delivery"
  | "returned_to_merchant"
  | "requires_admin";

/** States where the job is over, whatever the request row still says. Used to
 *  stop the tracking poll, so it must not miss one -- a missed label means a
 *  screen polling a finished delivery for ever. */
export const TERMINAL_LEGS: readonly DeliveryLeg[] = [
  "delivered",
  "cancelled",
  "failed_delivery",
  "returned_to_merchant",
];

/** A delivery a driver is currently holding. The same set the database uses in
 *  driver_dashboard(), accept_delivery() and the capacity check -- written once
 *  here so the TypeScript side stops hand-copying it and getting it wrong.
 *
 *  app/api/admin/people/route.ts had ["assigned","picked_up","en_route"].
 *  `en_route` is not a delivery_status label at all, so PostgREST failed the
 *  enum cast, 400d the whole query, and the owner's driver panel reported zero
 *  active assignments for a driver who was mid-delivery -- the exact question
 *  they had opened it to answer. It also silently dropped four real states. */
export const ACTIVE_LEGS: readonly DeliveryLeg[] = [
  "assigned",
  "going_to_pickup",
  "arrived_at_pickup",
  "picked_up",
  "out_for_delivery",
  "arrived",
];

/** States where the driver is gone or the job needs a human. The customer must
 *  never be shown "your driver is booked" in any of these. */
export const BROKEN_LEGS: readonly DeliveryLeg[] = [
  "searching_driver",
  "driver_unavailable",
  "driver_unresponsive",
  "requires_admin",
];

export type StatusTone = "waiting" | "action" | "moving" | "done" | "dead";

export type StatusCopy = {
  /** The state, as a badge. Three words at most. */
  label: string;
  /** The headline on the tracking screen. */
  headline: string;
  /** What is true now, and what happens next. */
  detail: string;
  tone: StatusTone;
  /** Whether the customer is the one being waited on. */
  needsCustomer: boolean;
};

/**
 * The customer-facing state of a request.
 *
 * `quoteCount` matters more than it looks: "no prices yet" and "3 prices
 * waiting for you" are the same database status and completely different
 * situations for the person reading the screen.
 */
export function requestStatusCopy(input: {
  status: RequestStatus | string;
  quoteCount: number;
  expiresAt?: string | null;
  /**
   * The DELIVERY's status, once one exists.
   *
   * Load-bearing, and its absence was a real defect. `delivery_requests.status`
   * goes to 'accepted' and NOTHING EVER MOVES IT BACK: driver_cannot_complete()
   * and admin_reassign_delivery() change only the deliveries row. So a request
   * whose driver walked away at 10:20 still read 'accepted' at midnight, and
   * this function cheerfully returned "Your driver is booked" beside a working
   * call button for somebody who was not coming.
   *
   * The delivery is the truth about the journey. The request is only the truth
   * about whether a choice has been made.
   */
  deliveryStatus?: string | null;
  now?: Date;
}): StatusCopy {
  const now = input.now ?? new Date();
  const expired =
    input.status === "open" &&
    Boolean(input.expiresAt) &&
    new Date(input.expiresAt as string).getTime() <= now.getTime();

  if (input.status === "cancelled") {
    return {
      label: "Cancelled",
      headline: "You cancelled this request",
      detail: "No driver was booked and nothing was charged.",
      tone: "dead",
      needsCustomer: false,
    };
  }

  if (expired || input.status === "expired") {
    return {
      label: "Expired",
      headline: "This request has expired",
      // Says what to DO, not only what went wrong. An expired request with no
      // route forward is a dead end the customer has to work out alone.
      detail:
        "Requests stay open for 48 hours so nobody quotes on something you no longer need. Post it again and drivers will see it fresh.",
      tone: "dead",
      needsCustomer: false,
    };
  }

  if (input.status === "accepted") {
    const leg = (input.deliveryStatus ?? "") as DeliveryLeg;

    if (leg === "delivered") {
      return {
        label: "Delivered",
        headline: "Delivered",
        detail: "Handed over and confirmed with your code.",
        tone: "done",
        needsCustomer: false,
      };
    }

    if (leg === "cancelled") {
      return {
        label: "Cancelled",
        headline: "This delivery was cancelled",
        detail: "Nobody is coming. Post it again if you still need it moved.",
        tone: "dead",
        needsCustomer: false,
      };
    }

    if (leg === "failed_delivery" || leg === "returned_to_merchant") {
      return {
        label: legCopy(leg).label,
        headline: "It could not be delivered",
        detail: "We know, and we will be in touch. You have not been charged a delivery fee.",
        tone: "dead",
        needsCustomer: false,
      };
    }

    // The driver is gone, or a human has to step in. Saying "booked" here is
    // the exact failure this whole surface was written to prevent, reached
    // from the other end — a customer waiting for somebody nobody sent.
    if ((BROKEN_LEGS as readonly string[]).includes(leg)) {
      const c = legCopy(leg);
      return {
        label: c.label,
        headline:
          leg === "searching_driver"
            ? "Your driver had to drop out"
            : "We are sorting this one out",
        // Never asks the customer to do anything: it is not theirs to fix, and
        // a call to action they cannot act on reads as blame.
        detail: `${c.detail} Nothing for you to do — we will message you as soon as it moves.`,
        tone: "waiting",
        needsCustomer: false,
      };
    }

    return {
      label: "Driver booked",
      headline: "Your driver is booked",
      detail: "Follow their progress below. Pay them directly when they arrive.",
      tone: "moving",
      needsCustomer: false,
    };
  }

  // Open. The two cases the customer actually experiences.
  if (input.quoteCount > 0) {
    return {
      label: input.quoteCount === 1 ? "1 price in" : `${input.quoteCount} prices in`,
      headline: input.quoteCount === 1 ? "You have a price" : "You have prices to choose from",
      // The load-bearing sentence on the whole surface. Nobody is dispatched
      // until the customer taps, and if they do not know that, they wait.
      detail: "Nobody is on the way until you choose one. Tap a price to book that driver.",
      tone: "action",
      needsCustomer: true,
    };
  }

  return {
    label: "Waiting for prices",
    headline: "Your request is with the drivers",
    detail:
      "Drivers who can carry it are being shown your job now. We will message you the moment the first price arrives.",
    tone: "waiting",
    needsCustomer: false,
  };
}

/** The driver's leg of the journey, once one has been booked. */
const LEG_COPY: Record<DeliveryLeg, { label: string; detail: string }> = {
  created: { label: "Booked", detail: "Your delivery is being set up." },
  searching_driver: {
    label: "Finding another driver",
    detail: "Your driver had to drop out. We are looking for someone else.",
  },
  driver_unavailable: {
    label: "Driver unavailable",
    detail: "Your driver can no longer come. We are sorting it out.",
  },
  driver_unresponsive: {
    label: "We cannot reach your driver",
    detail: "We are chasing them and will find someone else if we have to.",
  },
  requires_admin: {
    label: "We are looking into it",
    detail: "Something went wrong with this delivery. We have been alerted.",
  },
  returned_to_merchant: {
    label: "Sent back",
    detail: "It could not be delivered and has gone back to where it came from.",
  },
  failed_delivery: {
    label: "Could not be delivered",
    detail: "Your driver could not complete it. We will be in touch.",
  },
  assigned: { label: "Booked", detail: "Your driver has the job and will set off shortly." },
  going_to_pickup: { label: "On the way to collect", detail: "Your driver is heading to the pickup." },
  arrived_at_pickup: { label: "At the pickup", detail: "Your driver has arrived to collect it." },
  picked_up: { label: "Collected", detail: "Your driver has it." },
  out_for_delivery: { label: "On the way to you", detail: "Your driver is bringing it to you now." },
  arrived: { label: "Outside", detail: "Your driver is at the drop-off. Have your 4-digit code ready." },
  delivered: { label: "Delivered", detail: "Handed over and confirmed with your code." },
  cancelled: { label: "Cancelled", detail: "This delivery was cancelled." },
};

export function legCopy(status: string): { label: string; detail: string } {
  return LEG_COPY[status as DeliveryLeg] ?? { label: "In progress", detail: "" };
}

/** The ordered legs a customer sees as a progress trail. Terminal states are
 *  absent on purpose — a trail is a route, not a list of every outcome. */
export const LEG_ORDER: DeliveryLeg[] = [
  "assigned",
  "going_to_pickup",
  "picked_up",
  "out_for_delivery",
  "arrived",
  "delivered",
];

/** How far along the trail a status sits; -1 when it is not on the trail. */
export function legIndex(status: string): number {
  // arrived_at_pickup shares its rung with going_to_pickup: the customer cares
  // that the driver is AT the pickup, not that it is a distinct database state.
  if (status === "arrived_at_pickup") return LEG_ORDER.indexOf("going_to_pickup");
  return LEG_ORDER.indexOf(status as DeliveryLeg);
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export type Quote = {
  id: string;
  fee: number;
  note: string | null;
  status: string;
  createdAt: string;
  driverName: string;
  vehicleType: string | null;
  driverPhone: string | null;
  completed: number;
  rating: number | null;
};

/**
 * Cheapest first, and the cheapest is BADGED rather than silently sorted to the
 * top. A price list where the ordering is the only signal quietly punishes the
 * driver who charges Rs 20 more for a van, so the reason is named.
 *
 * Ties are broken by who has completed more deliveries, then by who quoted
 * first — never randomly, or the order shuffles under the customer's thumb on
 * every refresh.
 */
export function sortQuotes(quotes: Quote[]): Quote[] {
  return [...quotes].sort(
    (a, b) =>
      a.fee - b.fee ||
      b.completed - a.completed ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export type QuoteBadge = "cheapest" | "most_experienced" | null;

/**
 * At most ONE badge per quote, and never on a list of one — a single price
 * labelled "cheapest" is a comparison with nothing, which reads as a sales
 * trick rather than help.
 *
 * A driver who is both cheapest and most experienced keeps only "cheapest":
 * two badges on one card turns a comparison aid into an advertisement.
 */
export function quoteBadges(quotes: Quote[]): Map<string, QuoteBadge> {
  const badges = new Map<string, QuoteBadge>();
  if (quotes.length < 2) return badges;

  const sorted = sortQuotes(quotes);
  const cheapest = sorted[0];
  badges.set(cheapest.id, "cheapest");

  // Only worth saying when it is genuinely a different driver AND the gap is
  // real. "Most experienced" at 4 deliveries against 3 is noise.
  const experienced = [...quotes].sort(
    (a, b) => b.completed - a.completed || a.fee - b.fee || a.id.localeCompare(b.id),
  )[0];
  if (
    experienced.id !== cheapest.id &&
    experienced.completed >= 5 &&
    experienced.completed >= cheapest.completed * 2
  ) {
    badges.set(experienced.id, "most_experienced");
  }
  return badges;
}

export const BADGE_LABEL: Record<Exclude<QuoteBadge, null>, string> = {
  cheapest: "Lowest price",
  most_experienced: "Most deliveries done",
};

/** "Rs 250". Whole rupees when there are no cents, which on this island is
 *  almost always — see centsToShortString. */
export function formatFee(cents: number): string {
  return `Rs ${centsToShortString(cents)}`;
}

/**
 * What the customer will actually hand over.
 *
 * On a shopping run the fee is NOT the bill: they also repay what was spent, up
 * to their own cap. Showing only the fee is how somebody opens their wallet at
 * the door and finds it short — so both numbers are always returned together,
 * and the caller cannot render one without having seen the other.
 */
export function payAtDoor(input: { fee: number; kind: string; spendCap: number | null }): {
  lines: { label: string; value: string }[];
  total: string;
  note: string | null;
} {
  const fee = { label: "Delivery", value: formatFee(input.fee) };
  if (input.kind !== "shop_and_deliver" || !input.spendCap) {
    return { lines: [fee], total: formatFee(input.fee), note: null };
  }
  return {
    lines: [fee, { label: "What it costs, up to", value: formatFee(input.spendCap) }],
    total: `up to ${formatFee(input.fee + input.spendCap)}`,
    note: "You repay exactly what the driver spent — the receipt decides, not your cap.",
  };
}

/** "in 3 hours" / "in 20 minutes" / null once it has passed. */
export function expiresIn(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  // The plural follows the number that is PRINTED, not the one that was
  // measured. Thirty seconds floors to 0 minutes and is clamped up to 1, and
  // pluralising off the raw value produced "in 1 minutes".
  const say = (n: number, unit: string) => `in ${n} ${unit}${n === 1 ? "" : "s"}`;

  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return say(Math.max(1, mins), "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return say(hours, "hour");
  return say(Math.floor(hours / 24), "day");
}
