// ── ONE WAY TO SEND SOMEBODY SOMEWHERE ──────────────────────────────────────
//
// There were twenty hand-rolled Google Maps URLs in this repo, in three
// incompatible shapes:
//
//   ?q=lat,lng                              drops a pin
//   /maps/search/?api=1&query=lat,lng       drops a pin
//   /maps/dir/?api=1&destination=lat,lng    offers a route
//
// The difference is not cosmetic. A pin is a picture of where a place is; a
// driver holding a phone at the roadside wants turn-by-turn, and from a pin
// that is two more taps (Directions, then Start) on a screen they are trying
// not to look at. `dir_action=navigate` skips both and starts guidance.
//
// The driver console shipped the WORST of the three — /search/ — on the one
// screen in the product where navigation is the entire job.

/** A point worth navigating to. Both halves or neither; a half is not a place. */
export type Point = { lat: number; lng: number };

export function isPoint(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    // 0,0 is in the Gulf of Guinea. On an island at -19.7, 63.4 it is always a
    // missing value that survived a `?? 0` somewhere, never a destination.
    !(lat === 0 && lng === 0)
  );
}

/** Turn-by-turn to a single point, starting immediately. */
export function navigateUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&dir_action=navigate`;
}

/**
 * The WHOLE journey — A to B — without starting guidance.
 *
 * This is what a driver pricing a quote needs and never had: the board could
 * tell them a job was 3.2 km away and not whether the two addresses were next
 * door to each other or at opposite ends of the island. Deciding what to bid
 * is a question about the route, not about either end of it.
 *
 * No `dir_action=navigate` here on purpose: they are sitting still, looking.
 */
export function routeUrl(from: Point, to: Point): string {
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${from.lat},${from.lng}` +
    `&destination=${to.lat},${to.lng}`
  );
}

/**
 * Show a point on a map, without starting anything.
 *
 * ── THE SHAPE THIS FILE CALLS THE WORST ONE, USED ON PURPOSE ──────────────
 * The header above says /maps/search/ "drops a pin" and calls it the worst of
 * the three for the driver console. That is true THERE: a driver at the
 * roadside wants guidance, and a pin costs them two more taps.
 *
 * At a desk it is exactly right. The dispatcher is not going anywhere — they
 * are answering "where actually is this person", which on a request whose
 * pickup reads "Ma position actuelle" is a question the label cannot answer
 * and only the coordinates can. Turn-by-turn from the office would be absurd.
 */
export function pinUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** A named place with no coordinates — the only case a text search is right. */
export function searchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
