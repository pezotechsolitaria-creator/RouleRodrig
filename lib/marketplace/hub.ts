// ── THE HUB, AND WHAT IS ACTUALLY BEHIND EACH DOOR ──────────────────────────
//
// "BUY IT. BOOK IT. GET IT DONE." — one page that says what Roule Rodrigues
// can do for somebody who does not already know which of eight routes they
// wanted.
//
// ── WHY THIS IS DATA AND NOT JSX ────────────────────────────────────────────
// So the page cannot quietly disagree with itself. A card whose `href` is null
// is not open yet, and that single field drives the link, the cursor, the
// wording and the aria — rather than four places each deciding separately, one
// of which will eventually say "Coming soon" over a working link.
//
// ── EVERY CARD IS LIVE ──────────────────────────────────────────────────────
// M183/M184/M185 turned the last two into real shelves, so nothing here is
// marked "Soon" any more. The `href: null` state is KEPT because the next
// category to be added will need it, and because the rule it encodes — one
// field decides the link, the cursor, the wording and the aria — is what stops
// a working flow being labelled "coming soon" again.
//
// PUBLIC SERVICE HELP came off. It was the one card with nothing behind it, and
// the owner's own category order — Local products, Professional Services,
// Vehicle Care & Detailing, Celebrations — does not include it. It is easy to
// put back the day there is something to put behind it.
//
// ── WHERE THE CARDS POINT ───────────────────────────────────────────────────
// At CATEGORY shelves, not at bespoke pages, because a category here is a
// SUBJECT and not a fulfilment type: /shop/c/vehicle-care holds the wash you
// book AND the shampoo you buy. That is the owner's rule — "each categories can
// also sell products ... but services are priorities" — and it is why the
// blurbs name both.
//
// /marketplace/wash still exists and still lists the BUSINESSES; this card goes
// to the shelf because somebody who wants their car cleaned is shopping for the
// job, not for a supplier. Wash My Vehicle became real when trade_providers,
// service_durations and book_service_slot_public landed:
// a car wash is a STORE whose products are booked time, so it already has a
// storefront, a diary, opening hours, a three-per-phone cap and commission
// through resolve_commission_rate. None of that is rebuilt here. What was
// missing was the door — a customer could only reach a car wash by knowing its
// URL.
//
// ── THE TREE IS DOORS, NOT CATEGORIES (architecture review 2026-09-30) ──────
// The brief asked for one Marketplace with five branches: Products, Services,
// Rentals, Tourist essentials, Requests & concierge. The repo already has a
// page behind every one of them, in four different engines — shop products,
// booked service slots, the fleet in site_content, place_bookings — and the
// owner ruled (M183) that a marketplace category is a SUBJECT, not a
// fulfilment type. So the branches are groupings of DOORS on this hub, each
// pointing at a page that exists; no shelf is renamed, nothing moves, no URL
// changes. Rentals has no door here at all: its section is built from the live
// vehicle categories (lib/marketplace/rentals-rail.ts), because a hand-typed
// "Cars" door would outlive the day the owner switches cars off.
//
// ── A DOOR IS SHOWN ONLY WHILE ITS ROOM HAS SOMETHING IN IT ─────────────────
// `gate` names the fact that decides it, read by the page from the same source
// the destination renders from (marketplace_home() for the shelves, the
// experiences filter for massage and hiking, the owner's own switch for the
// food concierge). Unknown is not empty: a read that failed keeps the door,
// the same rule lib/listing-gates.ts applies to indexing — a database blip must
// not strip the hub for an hour of ISR.

/** The five branches of the tree, in the order the page shows them. */
export type HubBranch = "products" | "services" | "rentals" | "essentials" | "requests";

export const HUB_BRANCHES: { key: HubBranch; title: string; blurb: string }[] = [
  { key: "products", title: "Products", blurb: "From the island's own shops and producers." },
  // Says nothing a gated door might take away: massage or hiking can be off.
  { key: "services", title: "Services", blurb: "Book someone on the island to do the job." },
  // What is true of every rental the fleet holds (M91): the owner approves the
  // dates first, and nothing is paid before that.
  { key: "rentals", title: "Rentals", blurb: "We confirm your dates before you pay anything." },
  {
    key: "essentials",
    title: "Tourist essentials",
    blurb: "Data, the airport run, the map and who to call.",
  },
  // /deliver is a reverse auction and the concierge a conversation: in both,
  // nothing is booked until the customer says yes. Never "someone is coming".
  {
    key: "requests",
    title: "Requests & concierge",
    blurb: "Ask for what you need. Nothing is booked until you say yes.",
  },
];

/** Which fact decides whether a door is shown. See the note above. */
export type HubGate =
  | { kind: "always" }
  /** /shop has a product on it (it renders its launch state at zero). */
  | { kind: "products" }
  /** /shop/c/<slug> has a product a visitor can see (M185). */
  | { kind: "shelf"; slug: string }
  /** /experiences/<type> has a provider (experiencesOfType). */
  | { kind: "experiences"; type: HubExperience }
  /** The owner's own switch, the one /explore gates its concierge card on. */
  | { kind: "foodConcierge" };

/** The experience verticals the hub points at. Boats and fishing are named in
 *  the Rentals section instead — skippered trips, never rentals. */
export type HubExperience = "massage" | "hiking" | "boat" | "fishing";

export type HubAction = {
  key: string;
  /** The card's own words. Short — this is a menu, not a description. */
  title: string;
  blurb: string;
  /** null means the door is not open. There is no second flag. */
  href: string | null;
  branch: Exclude<HubBranch, "rentals">;
  gate: HubGate;
};

export const HUB_ACTIONS: HubAction[] = [
  {
    key: "shop",
    title: "Shop",
    blurb: "Honey, piment, crafts and souvenirs from island producers.",
    href: "/shop",
    branch: "products",
    gate: { kind: "products" },
  },
  {
    key: "wash",
    title: "Wash my vehicle",
    blurb: "Book a wash or a valet, or buy the shampoo and cloths.",
    href: "/shop/c/vehicle-care",
    branch: "services",
    gate: { kind: "shelf", slug: "vehicle-care" },
  },
  // ── THESE TWO LIVE AT /deliver, AND BOTH SAY SO ───────────────────────────
  // /deliver's own first screen offers all three of its modes as quick actions:
  // "Collect & deliver", "Buy & deliver", and "Do it for me — someone goes and
  // gets it done".
  //
  // So the hub is a second door to that room, which is what a hub is for. What
  // it must never be again is a door with the wrong sign: "Do it for me"
  // shipped here marked SOON while the real thing was live one route away, and
  // a card that says "closed" about an open room sends somebody away for good.
  // Both carry a real href for that reason, and a test asserts neither can go
  // back to null.
  //
  // There is no deep link to a single mode — /deliver reads no search params —
  // so both land on the chooser, where the wording matches the card that was
  // tapped.
  {
    key: "deliver",
    title: "Delivery",
    blurb: "Have something collected and brought to you, anywhere on Rodrigues.",
    href: "/deliver",
    branch: "requests",
    gate: { kind: "always" },
  },
  {
    key: "task",
    title: "Do it for me",
    blurb: "Someone goes, queues, collects or drops off — an errand, not a parcel.",
    href: "/deliver",
    branch: "requests",
    gate: { kind: "always" },
  },
  {
    key: "pro",
    title: "Hire a pro",
    blurb: "Plumbers and electricians — book a call-out, or buy the parts.",
    href: "/shop/c/professional-services",
    branch: "services",
    gate: { kind: "shelf", slug: "professional-services" },
  },
  {
    key: "celebrations",
    title: "Celebrations",
    blurb: "Party setup and decoration, hired or bought by the pack.",
    href: "/shop/c/celebrations",
    branch: "products",
    gate: { kind: "shelf", slug: "celebrations" },
  },
  // ── NEW DOORS, EACH TO A PAGE THAT ALREADY EXISTS (review 2026-09-30) ─────
  // Massage and hiking guides are place_bookings experiences, not shop
  // products, which is why they were never on this hub: the hub only knew the
  // shop. They are services in every sense a customer means.
  {
    key: "massage",
    title: "Massage & wellness",
    blurb: "Book a massage with a therapist on the island.",
    href: "/experiences/massage",
    branch: "services",
    gate: { kind: "experiences", type: "massage" },
  },
  {
    key: "hiking",
    title: "Hiking guides",
    blurb: "Walk the trails with someone who knows them.",
    href: "/experiences/hiking",
    branch: "services",
    gate: { kind: "experiences", type: "hiking" },
  },
  {
    key: "concierge",
    title: "Food concierge",
    blurb: "Say what you fancy on WhatsApp — we suggest a place and book the table.",
    href: "/food/concierge",
    branch: "requests",
    gate: { kind: "foodConcierge" },
  },
  // Links only: each of these is its own product with its own page (the eSIM
  // store is another session's work and is never edited from here).
  {
    key: "esim",
    title: "Mobile data (eSIM)",
    blurb: "Data for your phone on Rodrigues and Mauritius.",
    href: "/esim",
    branch: "essentials",
    gate: { kind: "always" },
  },
  {
    key: "transfers",
    title: "Airport transfers",
    blurb: "Fixed fares by zone from Plaine Corail airport.",
    href: "/transfers",
    branch: "essentials",
    gate: { kind: "always" },
  },
  {
    key: "map",
    title: "Island map",
    blurb: "Every place we have pinned, with directions.",
    href: "/map",
    branch: "essentials",
    gate: { kind: "always" },
  },
  {
    key: "emergency",
    title: "Emergency numbers",
    blurb: "Who to call if something goes wrong.",
    href: "/emergency",
    branch: "essentials",
    gate: { kind: "always" },
  },
];

/**
 * What the page read, for deciding which doors to show. Every field is null
 * when its read failed: unknown, which keeps the door (see the note above).
 */
export type HubFacts = {
  /** Products /shop would show (marketplace_home().productCount). */
  products: number | null;
  /** Shelf slugs with a visible product (marketplace_home().categories). */
  shelves: ReadonlySet<string> | null;
  /** Providers per experience vertical (recommendedCount of experiencesOfType). */
  experiences: Record<HubExperience, number | null>;
  /** content.foodConcierge.enabled — a setting, so never unknown. */
  foodConcierge: boolean;
};

/** Is the room behind this gate known to be empty? Unknown answers "open". */
export function gateIsOpen(gate: HubGate, facts: HubFacts): boolean {
  switch (gate.kind) {
    case "always":
      return true;
    case "products":
      return facts.products !== 0;
    case "shelf":
      return facts.shelves === null || facts.shelves.has(gate.slug);
    case "experiences":
      return facts.experiences[gate.type] !== 0;
    case "foodConcierge":
      return facts.foodConcierge;
  }
}

/**
 * The doors of one branch that the page shows, in their listed order.
 *
 * A door marked not-open (`href: null`) is still shown — as "Soon" — because
 * that card is a promise about a room being built, not a link into an empty
 * one. Every open door must pass its gate.
 */
export function doorsOf(
  branch: HubAction["branch"],
  facts: HubFacts,
  actions: readonly HubAction[] = HUB_ACTIONS,
): HubAction[] {
  return actions.filter(
    (a) => a.branch === branch && (a.href === null || gateIsOpen(a.gate, facts)),
  );
}

/**
 * The live /shop/c shelves that no door already points at, for the one-line
 * list under Products. Ordered as marketplace_home() returns them (by the
 * owner's position), and only those with something on them (M185).
 */
export function otherShelves(
  categories: readonly { slug: string; name: string; count: number }[] | null,
  actions: readonly HubAction[] = HUB_ACTIONS,
): { slug: string; name: string }[] {
  if (!categories) return [];
  const doored = new Set(
    actions.flatMap((a) =>
      a.href?.startsWith("/shop/c/") ? [a.href.slice("/shop/c/".length)] : [],
    ),
  );
  return categories
    .filter((c) => c.count > 0 && c.name?.trim() && !doored.has(c.slug))
    .map((c) => ({ slug: c.slug, name: c.name.trim() }));
}

/**
 * Words that mean "this business works on vehicles".
 *
 * `trade_providers.trade` is free text on purpose — its own comment says "an
 * island of tradespeople will not fit a list we guessed in advance" — so there
 * is no enum to filter on and this has to read what the owner typed.
 *
 * Deliberately generous, and deliberately not clever. A missed provider is
 * invisible on the one page meant to find them, which is far worse than a
 * plumber appearing under vehicles once. Both spellings of "valet(ing)" and the
 * French words are here because the admin who types this may use any of them.
 */
export const VEHICLE_WORDS = [
  "car wash",
  "carwash",
  "wash",
  "valet",
  "detail",
  "mechanic",
  "garage",
  "tyre",
  "tire",
  "auto",
  "vehicle",
  "scooter",
  "moto",
  "lavage",
  "voiture",
  "garagiste",
] as const;

/**
 * Does this trade work on vehicles?
 *
 * Case- and accent-insensitive, because "Lavage Auto" and "lavage auto" are the
 * same business and nobody typing a trade name is thinking about our filter.
 */
export function isVehicleTrade(trade: string): boolean {
  const t = normalise(trade);
  if (!t) return false;
  return VEHICLE_WORDS.some((w) => t.includes(w));
}

/** Lowercase, unaccented, single-spaced. */
function normalise(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
