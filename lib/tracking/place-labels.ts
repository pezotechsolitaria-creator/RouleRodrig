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
  /**
   * Is this a name the BASEMAP will not print for us?
   *
   * Checked against OpenStreetMap on 2026-09-16, which is where Mapbox's
   * satellite-streets labels come from too. These seven returned no match, so
   * they are ours alone — and they are exactly the names a local uses: the
   * ferry terminal, the jetty, the hospital, the beach as distinct from its
   * village.
   */
  ownOnly: boolean;
};

/**
 * Names OpenStreetMap has no record of, so no OSM-derived basemap prints them.
 *
 * Everything NOT in this set is already drawn by Mapbox satellite-streets and
 * by OSM's own raster, which is why drawing all 33 put two of every name on
 * screen.
 */
const NOT_IN_OSM = new Set([
  "ferry", "brulee", "anse-quitor", "citron-donis",
  "gravier-beach", "ile-aux-cocos", "hospital",
]);

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

const PLACE_LABELS_UNSORTED: PlaceLabel[] = RIDE_PLACES.flatMap((p) =>
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
        ownOnly: NOT_IN_OSM.has(p.id),
      }],
);

// ── TWO NAMES FOR ONE PLACE IS WORSE THAN NO NAME ──────────────────────────
//
// The owner sent a screenshot of the admin map around Graviers carrying, on
// one screen, "Graviers", "Graviers beach", and a third "Graviers" printed
// into the satellite imagery itself. His words: "there are 2 graviers u shows
// me on admin dashboard".
//
// The gazetteer holds both, roughly 300 m apart:
//   graviers        -19.7265, 63.4830   (the village, per OpenStreetMap)
//   gravier-beach   -19.7282, 63.4854   (the sand in front of it)
//
// (An earlier version of this note quoted -19.7014 / -19.7031 and "505 m".
// Both pins were then 2.6 km north of the real village; the village was later
// corrected and the beach was not, which left a beach label on a wooded
// hillside until 17 Sept 2026. lib/rides/places-geography.test.ts now holds
// every "X beach" within 1 km of X.)
//
// Both are legitimate — somebody really does ask for the beach rather than the
// village — so neither is deleted. At zoom 14 they are closer than the width
// of a label, render as one smudge, and read as a duplicate.
//
// So the overlay thins by DISTANCE ON SCREEN rather than by name. Nothing
// leaves the gazetteer, nothing is renamed, and zooming in still reveals the
// finer name once there is room for it — which is exactly when the difference
// between a village and its beach begins to matter.

// Sorted by tier so the thinning below keeps the label that ORIENTS you.
// Without this the survivor of a collision would be whichever happened to sit
// earlier in the gazetteer file, which is not a decision anybody made.
export const PLACE_LABELS: PlaceLabel[] = [...PLACE_LABELS_UNSORTED].sort(
  (a, b) => a.minZoom - b.minZoom,
);

/** How much clear space a label needs before the next one may be drawn. */
const MIN_LABEL_GAP_PX = 60;

/**
 * Ground metres per screen pixel at a Web Mercator zoom, at this latitude.
 *
 * 156543.03392 is the equatorial figure for zoom 0. Rodrigues sits near 19.7
 * degrees south and the cosine matters: dropping it overstates the gap by 6%
 * and lets through a pair that should have been thinned.
 */
function metresPerPixel(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Cheap planar metres — exact enough across an island 18 km wide. */
function roughMetres(a: PlaceLabel, b: PlaceLabel): number {
  const dy = (a.lat - b.lat) * 110_574;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * What belongs on screen at this zoom, thinned so no two labels collide.
 *
 * Order is priority: an anchor beats a village, a village beats a beach, and
 * inside a tier the gazetteer's own order wins. When two names compete for one
 * patch of screen the one that orients you survives, so "Graviers" stays and
 * "Graviers beach" waits for a closer zoom.
 */
export function labelsForZoom(
  zoom: number,
  /**
   * Does the basemap under this overlay already print place names?
   *
   * Production serves Mapbox satellite-streets-v12, whose labels are baked
   * into the raster — so every name we drew appeared alongside Mapbox's own
   * and the owner reported "there are 2 graviers u shows me". A label burnt
   * into a JPEG cannot be moved or hidden; ours can, so ours gives way.
   *
   * We keep drawing the seven OSM has never heard of. Those are the names a
   * local actually uses and no basemap will ever supply them.
   *
   * Defaults false so an existing caller behaves as before.
   */
  basemapHasLabels = false,
): PlaceLabel[] {
  const gap = MIN_LABEL_GAP_PX * metresPerPixel(zoom, -19.7);
  const kept: PlaceLabel[] = [];
  for (const l of PLACE_LABELS) {
    if (basemapHasLabels && !l.ownOnly) continue;
    if (zoom < l.minZoom) continue;
    if (kept.some((k) => roughMetres(k, l) < gap)) continue;
    kept.push(l);
  }
  return kept;
}
