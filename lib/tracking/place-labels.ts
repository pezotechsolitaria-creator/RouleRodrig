import { RIDE_PLACES } from "@/lib/rides/places";

// ── PLACE NAMES ON THE IMAGERY, FROM OUR OWN GAZETTEER ──────────────────────
//
// Satellite alone is beautiful and unreadable: you cannot tell which grey line
// is the road you want, or which bay you are looking at. Google solves this
// with a labels overlay, and so do we — but from lib/rides/places.ts rather
// than a third party's tiles.
//
// This is not a fallback, it is the better source here. The global labels layer
// we trialled returned 872-byte, essentially empty tiles over Rodrigues, while
// the gazetteer holds the ~35 names people on this island actually say out loud
// — the ones a passenger uses when they tell a driver where to go. It is also
// one fewer external dependency and one fewer licence to honour, which is the
// whole reason the imagery provider had to change in the first place.
//
// ── WHY ZOOM BANDS ─────────────────────────────────────────────────────────
// Drawing all 35 at once turns the map into a word cloud. Zoomed out, only the
// places that orient you belong on screen; zoomed in, the rest earn their space.

export type PlaceLabel = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Below this zoom the label is hidden. */
  minZoom: number;
};

/**
 * The handful that orient somebody looking at the whole island. The two
 * transport gateways plus the town: if you can see these three you know which
 * way up Rodrigues is.
 */
const ANCHORS = new Set(["airport", "ferry", "port-mathurin"]);

/** Villages and landmarks that identify a coast rather than a spot. */
const MAJOR = new Set([
  "mont-lubin", "la-ferme", "riviere-cocos", "baie-du-nord", "oyster-bay",
  "grand-baie", "port-sud-est", "st-francois", "riviere-banane",
]);

export const PLACE_LABELS: PlaceLabel[] = RIDE_PLACES.flatMap((p) =>
  // A place with no coordinates cannot be drawn. The gazetteer allows null for
  // "somewhere else", which exists so a customer is never refused a booking.
  p.lat == null || p.lng == null
    ? []
    : [{
        id: p.id,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        minZoom: ANCHORS.has(p.id) ? 11 : MAJOR.has(p.id) ? 13 : 14,
      }],
);

/** What belongs on screen at this zoom. */
export function labelsForZoom(zoom: number): PlaceLabel[] {
  return PLACE_LABELS.filter((l) => zoom >= l.minZoom);
}
