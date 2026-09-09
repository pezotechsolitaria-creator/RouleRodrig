import type { RecommendedPlace } from "@/lib/defaults";
import { SERVICE_TYPES } from "@/lib/defaults";

// ── ONE EXPERIENCE, ONE URL ─────────────────────────────────────────────────
//
// Until now no individual experience had an address. Every listing was reached
// as `/experiences/boat?place=rec-1784585562167` — a query parameter on a
// listing page, which canonicals away to the listing. So Île aux Cocos, the
// thing most visitors to Rodrigues actually search for, had no page of its own
// for Google to rank, nothing to paste into WhatsApp, and nothing an assistant
// could cite.
//
// The slug comes from the NAME, the way vehicle slugs already do
// (lib/vehicle-slug.ts), rather than from the id. `rec-1784585562167` is a
// timestamp: it tells a reader nothing, it looks like tracking, and it would
// have made the URL worse than the query parameter it replaced.

/** Longest a slug may get. Long enough for a real title, short enough to read
 *  in a WhatsApp preview, and cut on a word boundary rather than mid-word. */
const MAX = 60;

/**
 * "Île aux Cocos Excursion with Les Inséparables"
 *   → "ile-aux-cocos-excursion-with-les-inseparables"
 *
 * Accents are folded rather than dropped: without NFD the Î and the é survive
 * percent-encoded, and `%C3%8Ele-aux-cocos` is not a URL anybody pastes.
 */
export function placeSlug(p: Pick<RecommendedPlace, "name">): string {
  const base = (p.name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return "";
  if (base.length <= MAX) return base;
  const cut = base.slice(0, MAX);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/**
 * Which places get their own page.
 *
 * Activities and tours only. A hotel's listing is /browse/stays and a
 * restaurant's is /food — giving those an /experiences/ address would put a
 * guest house at a URL that says it is an experience, and this route is not
 * the place to argue about that. They keep their listing until they get a
 * route of their own.
 *
 * `bookable` is deliberately NOT required: an experience the owner has not
 * switched on for online booking is still a real thing worth a page and a
 * phone number.
 */
export function hasOwnPage(p: RecommendedPlace): boolean {
  return (
    p.category === "activity" &&
    Boolean(p.name?.trim()) &&
    placeSlug(p).length > 0 &&
    // A place must never take a slug that is already a listing route:
    // /experiences/boat is the sea-trips page and cannot also be one charter.
    !(SERVICE_TYPES as readonly string[]).includes(placeSlug(p))
  );
}

/** Every place that should have a detail page, in catalogue order. */
export function placesWithOwnPage(items: RecommendedPlace[]): RecommendedPlace[] {
  return (items ?? []).filter(hasOwnPage);
}

/**
 * Resolve a slug back to a place.
 *
 * First match wins, and the catalogue order is the owner's. Two experiences
 * with the same name would collide — the fleet has exactly that problem with
 * two "AVENIS 125cc" — so this is deliberate rather than accidental: the first
 * is reachable and the second is not, which is visible, instead of both
 * fighting over one URL and Google picking one at random.
 */
export function findPlaceBySlug(
  items: RecommendedPlace[],
  slug: string,
): RecommendedPlace | undefined {
  const want = slug.toLowerCase();
  return placesWithOwnPage(items).find((p) => placeSlug(p) === want);
}

/** The canonical address of a place that has its own page. */
export function placePageHref(p: RecommendedPlace): string {
  return `/experiences/${placeSlug(p)}`;
}
