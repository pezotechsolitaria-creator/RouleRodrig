import type { RecommendedPlace } from "@/lib/defaults";

// ── TAPPING A NAMED CARD MUST OPEN THAT NAME (M160) ─────────────────────────
//
// The owner tapped "Île aux Cocos" on /experiences and was shown "Rituel
// Signature Harmony Spa". He tapped "Plongée en apnée" and was shown "Balade
// en mer" above it. Neither was a rendering bug — the links were correct about
// where the CATEGORY lives and silent about which item he had chosen.
//
// Île aux Cocos carries serviceType null and isTour true. The hub's card built
// its href as `serviceType ? /experiences/<type> : /browse/activities` — it had
// no isTour branch, unlike the three other copies of this same mapping — so it
// sent him to /browse/activities, a page whose filter is
// `category === "activity" && !p.isTour`. That page excludes tours by
// construction, so it could never show Île aux Cocos, and the only non-tour
// activity in the catalogue is the spa. He was shown the one thing that was
// left.
//
// Plongée en apnée has serviceType "boat", so it landed on /experiences/boat —
// the right page, listing Balade en mer first because it is earlier in the
// catalogue. Correct page, wrong item, no way to say which.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// The mapping had been copied four times (the homepage, /explore, the hub, and
// lib/world-docs/resolve.ts), and they had already drifted — which is exactly
// how the missing isTour branch survived. One function now, imported by all of
// them, plus the query parameter that names the item.

/** Query key naming ONE place on a listing page. */
export const PLACE_PARAM = "place";

/** DOM id of a place's card, so a deep link can scroll to it. */
export const placeAnchorId = (id: string) => `exp-place-${id}`;

/**
 * The listing page a place lives on. Category first, because a hotel is
 * browsed among hotels whatever else is tagged on it.
 */
export function placeListingHref(p: RecommendedPlace): string {
  if (p.category === "hotel") return "/browse/stays";
  if (p.category === "restaurant") return "/food";
  if (p.serviceType) return `/experiences/${p.serviceType}`;
  return p.isTour ? "/browse/tours" : "/browse/activities";
}

/**
 * Where a tap on a place's card must land: its listing, with that place
 * already open. Every card, teaser and rail links through here.
 */
export function placeHref(p: RecommendedPlace): string {
  const base = placeListingHref(p);
  // /food is a dish menu, not a list of places — there is no card there to
  // open, so pointing a parameter at it would promise something it cannot do.
  if (!p.id || base === "/food") return base;
  return `${base}?${PLACE_PARAM}=${encodeURIComponent(p.id)}`;
}
