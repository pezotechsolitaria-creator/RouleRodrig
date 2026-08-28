import { centsToShortString } from "@/lib/money";
import type { Language } from "@/lib/i18n";

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
//
// ── IN THREE LANGUAGES, AND WHAT THAT MUST NOT TOUCH ───────────────────────
// Every copy table below is keyed by Language, exactly as SLOT_LABEL and
// URGENCY_LABEL are in lib/delivery/schedule.ts, and every function that
// returns words for a person takes a `lang`. The form at /deliver has been
// trilingual since it was built; these were the words that stayed English after
// it, on the screen where the money is actually agreed.
//
// THE STATUS VALUES ARE NOT COPY. 'open', 'accepted', 'searching_driver',
// 'failed_delivery' and the rest are database labels compared with === and sent
// to PostgREST. They are the KEYS of these tables and never the values. The
// same mistake at one remove — a hand-written "en_route" that is not in the
// enum — already 400d the owner's driver panel; a translated one would do it in
// two languages out of three and pass every test written in English.

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

/** A booked job the driver has NOT yet collected.
 *
 *  The window in which a customer may still call it off themselves. Once the
 *  driver is holding the goods it stops being a self-service decision --
 *  something physical has to happen to them, and a button cannot decide what --
 *  so cancel_delivery_request() refuses past this point and says who to call. */
export const PRE_PICKUP_LEGS: readonly DeliveryLeg[] = [
  "assigned",
  "going_to_pickup",
  "arrived_at_pickup",
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

type StatusWords = { label: string; headline: string; detail: string };

type StatusTable = {
  cancelled: StatusWords;
  expired: StatusWords;
  delivered: StatusWords;
  /** The DELIVERY was cancelled, which is not the same as withdrawing a request
   *  nobody had taken yet. */
  deliveryCancelled: StatusWords;
  /** No label of its own: failed and returned-to-sender read differently and
   *  legCopy already tells them apart. */
  failed: { headline: string; detail: string };
  broken: { dropped: string; sorting: string; tail: string };
  booked: StatusWords;
  priced: {
    label: (n: number) => string;
    headlineOne: string;
    headlineMany: string;
    detail: string;
  };
  waiting: StatusWords;
};

const STATUS_COPY: Record<Language, StatusTable> = {
  en: {
    cancelled: {
      label: "Cancelled",
      headline: "You cancelled this request",
      detail: "No driver was booked and nothing was charged.",
    },
    expired: {
      label: "Expired",
      headline: "This request has expired",
      // Says what to DO, not only what went wrong. An expired request with no
      // route forward is a dead end the customer has to work out alone.
      detail:
        "Requests stay open for 48 hours so nobody quotes on something you no longer need. Post it again and drivers will see it fresh.",
    },
    delivered: {
      label: "Delivered",
      headline: "Delivered",
      detail: "Handed over and confirmed with your code.",
    },
    deliveryCancelled: {
      label: "Cancelled",
      headline: "This delivery was cancelled",
      detail: "Nobody is coming. Post it again if you still need it moved.",
    },
    failed: {
      headline: "It could not be delivered",
      detail: "We know, and we will be in touch. You have not been charged a delivery fee.",
    },
    broken: {
      dropped: "Your driver had to drop out",
      sorting: "We are sorting this one out",
      // Never asks the customer to do anything: it is not theirs to fix, and a
      // call to action they cannot act on reads as blame.
      tail: "Nothing for you to do — this page shows it the moment it moves.",
    },
    booked: {
      label: "Driver booked",
      headline: "Your driver is booked",
      detail: "Follow their progress below. Pay them directly when they arrive.",
    },
    priced: {
      label: (n) => (n === 1 ? "1 price in" : `${n} prices in`),
      headlineOne: "You have a price",
      headlineMany: "You have prices to choose from",
      // The load-bearing sentence on the whole surface. Nobody is dispatched
      // until the customer taps, and if they do not know that, they wait.
      detail: "Nobody is on the way until you choose one. Tap a price to book that driver.",
    },
    waiting: {
      label: "Waiting for prices",
      headline: "Your request is with the drivers",
      // Says what is TRUE. Nothing in this flow enrols a customer in any
      // channel: a guest has no push subscription and is deliberately not
      // emailed (the shared mail budget pays for password resets, M41). Four
      // screens promised a message nobody sends, which is the one kind of copy
      // that turns a working feature into a broken-feeling one.
      detail:
        "Drivers who can carry it are being shown your job now. Every price lands on this page — keep it open, or come back with your reference.",
    },
  },

  fr: {
    cancelled: {
      label: "Annulée",
      headline: "Vous avez annulé cette demande",
      detail: "Aucun chauffeur n’a été réservé et rien n’a été facturé.",
    },
    expired: {
      label: "Expirée",
      headline: "Cette demande a expiré",
      detail:
        "Les demandes restent ouvertes 48 heures, pour que personne ne propose un prix sur quelque chose dont vous n’avez plus besoin. Publiez-la à nouveau et les chauffeurs la verront comme une nouvelle demande.",
    },
    delivered: {
      label: "Livrée",
      headline: "Livrée",
      detail: "Remise en main propre et confirmée avec votre code.",
    },
    deliveryCancelled: {
      label: "Annulée",
      headline: "Cette livraison a été annulée",
      detail: "Personne ne vient. Publiez-la à nouveau si vous en avez toujours besoin.",
    },
    failed: {
      headline: "Elle n’a pas pu être livrée",
      detail:
        "Nous le savons et nous vous recontacterons. Aucun frais de livraison ne vous a été facturé.",
    },
    broken: {
      dropped: "Votre chauffeur a dû se retirer",
      sorting: "Nous sommes en train de régler cela",
      tail: "Rien à faire de votre côté — cette page l’affichera dès que cela bouge.",
    },
    booked: {
      label: "Chauffeur réservé",
      headline: "Votre chauffeur est réservé",
      detail: "Suivez sa progression ci-dessous. Vous le payez directement à son arrivée.",
    },
    priced: {
      label: (n) => (n === 1 ? "1 prix reçu" : `${n} prix reçus`),
      headlineOne: "Vous avez un prix",
      headlineMany: "Vous avez des prix à comparer",
      detail:
        "Personne n’est en route tant que vous n’avez pas choisi. Touchez un prix pour réserver ce chauffeur.",
    },
    waiting: {
      label: "En attente de prix",
      headline: "Votre demande est chez les chauffeurs",
      detail:
        "Les chauffeurs qui peuvent la prendre voient votre demande maintenant. Chaque prix arrive sur cette page — gardez-la ouverte, ou revenez avec votre référence.",
    },
  },

  cr: {
    cancelled: {
      label: "Anile",
      headline: "Ou finn anil sa demann la",
      detail: "Okenn sofer pa ti rezerve ek nanye pa finn debite.",
    },
    expired: {
      label: "Expire",
      headline: "Sa demann la finn expire",
      detail:
        "Bann demann res ouver 48 er, pou personn pa donn enn pri lor enn zafer ki ou nepli bizin. Avoy li ankor ek bann sofer pou trouv li kouma enn nouvo demann.",
    },
    delivered: {
      label: "Livre",
      headline: "Livre",
      detail: "Finn remet ek konfirme ar ou kod.",
    },
    deliveryCancelled: {
      label: "Anile",
      headline: "Sa livrezon la finn anile",
      detail: "Personn pa pe vini. Avoy demann la ankor si ou ankor bizin li.",
    },
    failed: {
      headline: "Pa finn kapav livre li",
      detail: "Nou kone, ek nou pou kontakt ou. Ou pa finn peye okenn fre livrezon.",
    },
    broken: {
      dropped: "Ou sofer finn bizin retire",
      sorting: "Nou pe arranz sa",
      tail: "Nanye pou ou fer — sa paz la montre li deswit ki li bouze.",
    },
    booked: {
      label: "Sofer rezerve",
      headline: "Ou sofer finn rezerve",
      detail: "Swiv so progre anba. Ou peye li direk kan li arive.",
    },
    priced: {
      label: (n) => `${n} pri resevwar`,
      headlineOne: "Ou ena enn pri",
      headlineMany: "Ou ena bann pri pou swazir",
      detail: "Personn pa lor larout ziska ou swazir enn. Tous enn pri pou rezerv sa sofer la.",
    },
    waiting: {
      label: "Pe atann bann pri",
      headline: "Ou demann ar bann sofer",
      detail:
        "Bann sofer ki kapav pran li pe trouv ou travay la aster. Sak pri ariv lor sa paz la — gard li ouver, ouswa revini ar ou referans.",
    },
  },
};

/**
 * The customer-facing state of a request.
 *
 * `quoteCount` matters more than it looks: "no prices yet" and "3 prices
 * waiting for you" are the same database status and completely different
 * situations for the person reading the screen.
 */
export function requestStatusCopy(
  input: {
    status: RequestStatus | string;
    quoteCount: number;
    expiresAt?: string | null;
    /**
     * The DELIVERY's status, once one exists.
     *
     * Load-bearing, and its absence was a real defect.
     * `delivery_requests.status` goes to 'accepted' and NOTHING EVER MOVES IT
     * BACK: driver_cannot_complete() and admin_reassign_delivery() change only
     * the deliveries row. So a request whose driver walked away at 10:20 still
     * read 'accepted' at midnight, and this function cheerfully returned "Your
     * driver is booked" beside a working call button for somebody who was not
     * coming.
     *
     * The delivery is the truth about the journey. The request is only the
     * truth about whether a choice has been made.
     */
    deliveryStatus?: string | null;
    now?: Date;
  },
  lang: Language,
): StatusCopy {
  const c = STATUS_COPY[lang];
  const now = input.now ?? new Date();
  const expired =
    input.status === "open" &&
    Boolean(input.expiresAt) &&
    new Date(input.expiresAt as string).getTime() <= now.getTime();

  if (input.status === "cancelled") {
    return { ...c.cancelled, tone: "dead", needsCustomer: false };
  }

  if (expired || input.status === "expired") {
    return { ...c.expired, tone: "dead", needsCustomer: false };
  }

  if (input.status === "accepted") {
    const leg = (input.deliveryStatus ?? "") as DeliveryLeg;

    if (leg === "delivered") {
      return { ...c.delivered, tone: "done", needsCustomer: false };
    }

    if (leg === "cancelled") {
      return { ...c.deliveryCancelled, tone: "dead", needsCustomer: false };
    }

    if (leg === "failed_delivery" || leg === "returned_to_merchant") {
      return {
        label: legCopy(leg, lang).label,
        headline: c.failed.headline,
        detail: c.failed.detail,
        tone: "dead",
        needsCustomer: false,
      };
    }

    // The driver is gone, or a human has to step in. Saying "booked" here is
    // the exact failure this whole surface was written to prevent, reached
    // from the other end — a customer waiting for somebody nobody sent.
    if ((BROKEN_LEGS as readonly string[]).includes(leg)) {
      const l = legCopy(leg, lang);
      return {
        label: l.label,
        headline: leg === "searching_driver" ? c.broken.dropped : c.broken.sorting,
        detail: `${l.detail} ${c.broken.tail}`,
        tone: "waiting",
        needsCustomer: false,
      };
    }

    return { ...c.booked, tone: "moving", needsCustomer: false };
  }

  // Open. The two cases the customer actually experiences.
  if (input.quoteCount > 0) {
    return {
      label: c.priced.label(input.quoteCount),
      headline: input.quoteCount === 1 ? c.priced.headlineOne : c.priced.headlineMany,
      detail: c.priced.detail,
      tone: "action",
      needsCustomer: true,
    };
  }

  return { ...c.waiting, tone: "waiting", needsCustomer: false };
}

/** The driver's leg of the journey, once one has been booked. */
type LegWords = { label: string; detail: string };

const LEG_COPY: Record<Language, Record<DeliveryLeg, LegWords>> = {
  en: {
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
  },

  fr: {
    created: { label: "Réservée", detail: "Votre livraison est en cours de préparation." },
    searching_driver: {
      label: "Recherche d’un autre chauffeur",
      detail: "Votre chauffeur a dû se retirer. Nous en cherchons un autre.",
    },
    driver_unavailable: {
      label: "Chauffeur indisponible",
      detail: "Votre chauffeur ne peut plus venir. Nous nous en occupons.",
    },
    driver_unresponsive: {
      label: "Nous n’arrivons pas à joindre votre chauffeur",
      detail: "Nous le relançons et nous en trouverons un autre s’il le faut.",
    },
    requires_admin: {
      label: "Nous examinons la situation",
      detail: "Quelque chose s’est mal passé avec cette livraison. Nous avons été prévenus.",
    },
    returned_to_merchant: {
      label: "Renvoyée",
      detail: "Elle n’a pas pu être livrée et elle est repartie d’où elle venait.",
    },
    failed_delivery: {
      label: "N’a pas pu être livrée",
      detail: "Votre chauffeur n’a pas pu la terminer. Nous vous recontacterons.",
    },
    assigned: { label: "Réservée", detail: "Votre chauffeur a pris la livraison et part sous peu." },
    going_to_pickup: { label: "En route pour la récupérer", detail: "Votre chauffeur se rend au point de récupération." },
    arrived_at_pickup: { label: "Sur place", detail: "Votre chauffeur est arrivé pour la récupérer." },
    picked_up: { label: "Récupérée", detail: "Votre chauffeur l’a avec lui." },
    out_for_delivery: { label: "En route vers vous", detail: "Votre chauffeur vous l’apporte maintenant." },
    arrived: { label: "Devant chez vous", detail: "Votre chauffeur est au point de livraison. Préparez votre code à 4 chiffres." },
    delivered: { label: "Livrée", detail: "Remise en main propre et confirmée avec votre code." },
    cancelled: { label: "Annulée", detail: "Cette livraison a été annulée." },
  },

  cr: {
    created: { label: "Rezerve", detail: "Ou livrezon pe organize." },
    searching_driver: {
      label: "Pe rod enn lot sofer",
      detail: "Ou sofer finn bizin retire. Nou pe rod enn lot.",
    },
    driver_unavailable: {
      label: "Sofer pa disponib",
      detail: "Ou sofer nepli kapav vini. Nou pe arranz sa.",
    },
    driver_unresponsive: {
      label: "Nou pa pe kapav zwenn ou sofer",
      detail: "Nou pe rod li ek nou pou trouv enn lot si bizin.",
    },
    requires_admin: {
      label: "Nou pe get sa",
      detail: "Enn zafer finn mal pase ar sa livrezon la. Nou finn averti.",
    },
    returned_to_merchant: {
      label: "Retourne",
      detail: "Pa finn kapav livre li ek li finn retourn kot li ti sorti.",
    },
    failed_delivery: {
      label: "Pa finn kapav livre",
      detail: "Ou sofer pa finn kapav fini li. Nou pou kontakt ou.",
    },
    assigned: { label: "Rezerve", detail: "Ou sofer finn pran travay la ek li pou demare biento." },
    going_to_pickup: { label: "Lor sime pou al pran li", detail: "Ou sofer pe al kot bizin pran li." },
    arrived_at_pickup: { label: "Lor plas", detail: "Ou sofer finn arive pou pran li." },
    picked_up: { label: "Finn pran li", detail: "Ou sofer ena li ar li." },
    out_for_delivery: { label: "Lor sime ver ou", detail: "Ou sofer pe amenn li kot ou aster." },
    arrived: { label: "Deor kot ou", detail: "Ou sofer kot pwin livrezon. Gard ou kod 4 sif pare." },
    delivered: { label: "Livre", detail: "Finn remet ek konfirme ar ou kod." },
    cancelled: { label: "Anile", detail: "Sa livrezon la finn anile." },
  },
};

/** What a status the database has never announced falls back to. Its own entry
 *  per language: an English "In progress" inside a French trail is exactly the
 *  half-translated screen this change exists to remove. */
const LEG_UNKNOWN: Record<Language, LegWords> = {
  en: { label: "In progress", detail: "" },
  fr: { label: "En cours", detail: "" },
  cr: { label: "An kour", detail: "" },
};

export function legCopy(status: string, lang: Language): LegWords {
  return LEG_COPY[lang][status as DeliveryLeg] ?? LEG_UNKNOWN[lang];
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

export const BADGE_LABEL: Record<Language, Record<Exclude<QuoteBadge, null>, string>> = {
  en: {
    cheapest: "Lowest price",
    most_experienced: "Most deliveries done",
  },
  fr: {
    cheapest: "Prix le plus bas",
    most_experienced: "Le plus de livraisons",
  },
  cr: {
    cheapest: "Pri pli ba",
    most_experienced: "Plis livrezon fini",
  },
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
const PAY_COPY: Record<
  Language,
  { fee: string; spend: string; upTo: (total: string) => string; note: string }
> = {
  en: {
    fee: "Delivery",
    spend: "What it costs, up to",
    upTo: (total) => `up to ${total}`,
    note: "You repay exactly what the driver spent — the receipt decides, not your cap.",
  },
  fr: {
    fee: "Livraison",
    spend: "Ce que cela coûte, jusqu’à",
    upTo: (total) => `jusqu’à ${total}`,
    note: "Vous remboursez exactement ce que le chauffeur a dépensé — c’est le reçu qui décide, pas votre limite.",
  },
  cr: {
    fee: "Livrezon",
    spend: "Seki li koute, ziska",
    upTo: (total) => `ziska ${total}`,
    note: "Ou rambours exakteman seki sofer la finn depanse — se resi la ki deside, pa ou limit.",
  },
};

export function payAtDoor(
  input: { fee: number; kind: string; spendCap: number | null },
  lang: Language,
): {
  lines: { label: string; value: string }[];
  total: string;
  note: string | null;
} {
  const c = PAY_COPY[lang];
  const fee = { label: c.fee, value: formatFee(input.fee) };
  if (input.kind !== "shop_and_deliver" || !input.spendCap) {
    return { lines: [fee], total: formatFee(input.fee), note: null };
  }
  return {
    lines: [fee, { label: c.spend, value: formatFee(input.spendCap) }],
    total: c.upTo(formatFee(input.fee + input.spendCap)),
    note: c.note,
  };
}

/**
 * How long is left, in the largest useful unit.
 *
 * Kreol marks no plural on the noun — "3 zour", "1 zour" — which is the
 * language's own rule and not an oversight to be tidied up later. The same
 * decision lib/i18n.ts already took for its `days` counter.
 */
const LEFT_COPY: Record<Language, Record<"minute" | "hour" | "day", (n: number) => string>> = {
  en: {
    minute: (n) => `in ${n} minute${n === 1 ? "" : "s"}`,
    hour: (n) => `in ${n} hour${n === 1 ? "" : "s"}`,
    day: (n) => `in ${n} day${n === 1 ? "" : "s"}`,
  },
  fr: {
    minute: (n) => `dans ${n} minute${n === 1 ? "" : "s"}`,
    hour: (n) => `dans ${n} heure${n === 1 ? "" : "s"}`,
    day: (n) => `dans ${n} jour${n === 1 ? "" : "s"}`,
  },
  cr: {
    minute: (n) => `dan ${n} minit`,
    hour: (n) => `dan ${n} ertan`,
    day: (n) => `dan ${n} zour`,
  },
};

/** "in 3 hours" / "in 20 minutes" / null once it has passed. `lang` sits before
 *  `now` for the same reason it does in formatWindow(): the clock is the
 *  optional argument, the reader is not. */
export function expiresIn(
  iso: string | null | undefined,
  lang: Language,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  // The plural follows the number that is PRINTED, not the one that was
  // measured. Thirty seconds floors to 0 minutes and is clamped up to 1, and
  // pluralising off the raw value produced "in 1 minutes".
  const say = LEFT_COPY[lang];

  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return say.minute(Math.max(1, mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return say.hour(hours);
  return say.day(Math.floor(hours / 24));
}

// ── The reference a person can write down ───────────────────────────────────
//
// A request is identified by a uuid, which is unguessable and completely
// unsayable. A guest who loses the link — a different phone, cleared storage, a
// tab closed on the bus — had NO route back: they get no email (the shared mail
// budget is spent on password resets, M41), so the localStorage entry was the
// only thread. Cut it and the request was unreachable for ever.
//
// So the first six hex of the id becomes a short reference, the same one the
// driver and the owner already see on their boards. Paired with the email it
// is the credential lookup_delivery_request() checks — the identical shape
// /api/orders/lookup has always used, and the reference ALONE is worth nothing.

/** "RR-3F9A2B" — what the customer is shown and asked to keep. */
export function requestRef(id: string): string {
  return `RR-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/**
 * What somebody actually types, reduced to the six characters that matter.
 *
 * People write it down badly: lowercase, with or without the prefix, with a
 * space instead of a hyphen, with the O/0 confusion that hex invites. Returns
 * null when it cannot be six hex characters, so the form can say so before
 * spending a request.
 */
export function normaliseRef(input: string): string | null {
  const bare = input
    .trim()
    .toUpperCase()
    .replace(/^RR[-\s]?/, "")
    .replace(/[^0-9A-F]/g, "");
  return bare.length === 6 ? bare : null;
}
