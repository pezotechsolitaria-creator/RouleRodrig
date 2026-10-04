import type { RecommendedPlace } from "@/lib/defaults";

// ── ONE MONEY FIELD DOING TWO JOBS ──────────────────────────────────────────
//
// A RecommendedPlace carries `priceNote` — the owner's own words, "Rs 2000/
// Person" — and `depositAmount`, the flat sum that holds the booking. They are
// different numbers and they mean different things.
//
// Everything that publishes a price for an experience reads depositAmount,
// because fromPriceOf() does. On Île aux Cocos that is Rs 1,000 against a
// priceNote of Rs 2,000, so the site's most-searched product published HALF
// its real price as a schema.org Offer while the page beside it showed the
// full one. An assistant asked "how much is the Île aux Cocos trip" reads the
// Offer, so the machine-readable answer was wrong by a factor of two.
//
// priceNote first, because it is what the customer is quoted. depositAmount is
// the fallback for listings whose note is missing or unparseable, which is
// still better than nothing — it is at least a real sum of money the listing
// charges.

/**
 * The number inside the owner's price note.
 *
 * Deliberately tolerant of how a human types money and deliberately narrow
 * about what counts: "Rs 2000/Person ", "from Rs 2500 per night (for one
 * person)", "Rs 2,990 per night" and "Rs 1 200" all yield their first figure.
 * A note with no digits yields null rather than 0 — a place with no stated
 * price must not publish an Offer of zero.
 */
export function priceFromNote(note?: string | null): number | null {
  if (!note) return null;
  // Group separators only between digits, so "Rs 2,990" is 2990 while the
  // "1" in "(for one person)" cannot glue itself onto anything.
  const m = note.replace(/(\d)[ ,](?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The two fields that decide a price.
 *
 * Narrower than RecommendedPlace on purpose: these functions read nothing
 * else, and a caller holding a partial listing — a test fixture, a projection
 * from a query — should not have to invent an id and a description to ask what
 * something costs.
 */
export type Priced = {
  priceNote?: string | null;
  /** Null as well as undefined: several callers read it straight from a row. */
  depositAmount?: number | null;
};

/** What a customer pays. The note wins; the deposit is a fallback. */
export function placePrice(p: Priced): number | null {
  return (
    priceFromNote(p.priceNote) ??
    (typeof p.depositAmount === "number" && p.depositAmount > 0
      ? p.depositAmount
      : null)
  );
}

/** What holds the booking, when that is genuinely less than the price. */
export function placeDeposit(p: Priced): number | null {
  return typeof p.depositAmount === "number" && p.depositAmount > 0
    ? p.depositAmount
    : null;
}

/**
 * The guide page that already covers this place properly, where one exists.
 *
 * /guide/* is a fixed set of hand-written routes, not a dynamic one, so this
 * is a lookup rather than a guess: a link is only offered when the page is
 * known to be there. Île aux Cocos has ~4,000 characters of real writing with
 * TouristAttraction schema, and a booking page that restated it badly would
 * only compete with it.
 *
 * `blurb` is the line under the link, and it describes the GUIDE, not the
 * listing: the Île aux Cocos line ("what you will see") would be false under a
 * hike.
 */
export type PlaceGuide = { href: string; label: string; blurb: string };

type GuideRule = PlaceGuide & {
  /** Matched against the accent-folded name. */
  name?: RegExp;
  /** Matched against the owner's own tag, never guessed from the name. */
  serviceType?: RecommendedPlace["serviceType"];
};

const GUIDES: GuideRule[] = [
  {
    name: /^ile-aux-cocos/,
    href: "/guide/ile-aux-cocos",
    label: "Read the full guide to Île aux Cocos",
    blurb: "What it is, when to go and what you will see.",
  },
  // Architecture review 2026-09-30, item 3 (experiences ↔ guides). A hiking
  // listing is a PERSON to walk with; the trails themselves are public and
  // /guide/hiking writes each one up (its own description: distance, climb,
  // time and what to carry) and lists the hiking guides beside them. So the
  // link runs both ways and describes the page it opens. By serviceType, the
  // tag experiencesOfType() reads, and only while the row is still an
  // activity: a name containing "hike" proves nothing, and a stay that once
  // carried the tag is not a hike (lib/experiences.ts, the same two guards).
  {
    serviceType: "hiking",
    href: "/guide/hiking",
    label: "Read the hiking guide",
    blurb: "The island's walking trails, with distance, climb, time and what to carry.",
  },
];

export function GUIDE_FOR_PLACE(
  p: Pick<RecommendedPlace, "name"> &
    Partial<Pick<RecommendedPlace, "serviceType" | "category">>,
): PlaceGuide | null {
  const slug = (p.name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const isActivity = (p.category ?? "activity") === "activity";
  const hit = GUIDES.find((g) =>
    g.name
      ? g.name.test(slug)
      : Boolean(g.serviceType) && isActivity && p.serviceType === g.serviceType,
  );
  return hit ? { href: hit.href, label: hit.label, blurb: hit.blurb } : null;
}

/**
 * The guides a whole listing page can point at: one per guide, in GUIDES
 * order, from the listings it shows — plus /guide/hiking on the hiking page
 * even while no walk is listed, because the trails it covers exist either way
 * and that page's empty state already says they are written up there
 * (EXPERIENCES.hiking.emptyBody). Architecture review 2026-09-30, item 3.
 */
export function guidesForListing(
  places: (Pick<RecommendedPlace, "name"> &
    Partial<Pick<RecommendedPlace, "serviceType" | "category">>)[],
  serviceType?: RecommendedPlace["serviceType"],
): PlaceGuide[] {
  const hits = places.map((p) => GUIDE_FOR_PLACE(p)).filter((g): g is PlaceGuide => g !== null);
  const own = serviceType
    ? GUIDES.filter((g) => g.serviceType === serviceType).map(
        ({ href, label, blurb }) => ({ href, label, blurb }),
      )
    : [];
  const byHref = new Map([...hits, ...own].map((g) => [g.href, g]));
  return GUIDES.filter((g) => byHref.has(g.href)).map((g) => byHref.get(g.href)!);
}
