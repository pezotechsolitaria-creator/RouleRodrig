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

export type HubAction = {
  key: string;
  /** The card's own words. Short — this is a menu, not a description. */
  title: string;
  blurb: string;
  /** null means the door is not open. There is no second flag. */
  href: string | null;
};

export const HUB_ACTIONS: HubAction[] = [
  {
    key: "shop",
    title: "Shop",
    blurb: "Honey, piment, crafts and souvenirs from island producers.",
    href: "/shop",
  },
  {
    key: "wash",
    title: "Wash my vehicle",
    blurb: "Book a wash or a valet, or buy the shampoo and cloths.",
    href: "/shop/c/vehicle-care",
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
  },
  {
    key: "task",
    title: "Do it for me",
    blurb: "Someone goes, queues, collects or drops off — an errand, not a parcel.",
    href: "/deliver",
  },
  {
    key: "pro",
    title: "Hire a pro",
    blurb: "Plumbers and electricians — book a call-out, or buy the parts.",
    href: "/shop/c/professional-services",
  },
  {
    key: "celebrations",
    title: "Celebrations",
    blurb: "Party setup and decoration, hired or bought by the pack.",
    href: "/shop/c/celebrations",
  },
];

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
