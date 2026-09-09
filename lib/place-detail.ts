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

/** What a customer pays. The note wins; the deposit is a fallback. */
export function placePrice(p: RecommendedPlace): number | null {
  return (
    priceFromNote(p.priceNote) ??
    (typeof p.depositAmount === "number" && p.depositAmount > 0
      ? p.depositAmount
      : null)
  );
}

/** What holds the booking, when that is genuinely less than the price. */
export function placeDeposit(p: RecommendedPlace): number | null {
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
 */
const GUIDES: { match: RegExp; href: string; label: string }[] = [
  {
    match: /^ile-aux-cocos/,
    href: "/guide/ile-aux-cocos",
    label: "Read the full guide to Île aux Cocos",
  },
];

export function GUIDE_FOR_PLACE(
  p: Pick<RecommendedPlace, "name">,
): { href: string; label: string } | null {
  const slug = (p.name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const hit = GUIDES.find((g) => g.match.test(slug));
  return hit ? { href: hit.href, label: hit.label } : null;
}
