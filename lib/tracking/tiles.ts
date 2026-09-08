// ── THE MAP UNDERNEATH, BEHIND ONE SEAM ─────────────────────────────────────
//
// Every map in the app asks this module what to draw on, so swapping the tile
// provider later is a change to environment variables and nothing else. No
// component imports a tile URL, and none should.
//
// ── TWO BASEMAPS, SATELLITE FIRST ───────────────────────────────────────────
// The owner asked for satellite "like Google, so we can see the routes
// clearly", and on Rodrigues that is right for a reason beyond taste: much of
// the island's road network is unnamed, and a lot of what a driver actually
// follows — cane tracks, the turning into a guesthouse, the last 200 m of dirt
// to a beach — is legible in imagery and simply absent from a street rendering.
//
// ── THE LICENCE, WHICH DECIDED THE PROVIDER ─────────────────────────────────
// This is a COMMERCIAL taxi and delivery platform, so a basemap has to be
// licensed for commercial use. That rules out more than it sounds like:
//
//   Esri World Imagery      free to reach, but Esri state it is not available
//                           for commercial use without an ArcGIS licence.
//                           REMOVED for that reason (owner's decision).
//   EOX 2018-2024 layers    CC BY-NC-SA 4.0 — NON-commercial. Same problem.
//   EOX 2016 (`s2cloudless_3857`)
//                           CC BY 4.0. Commercial use permitted with
//                           attribution. THIS is what we use.
//   Google / Bing / Mapbox / HERE
//                           paid, and excluded by the zero-recurring-cost rule.
//
// Verified over the island centre (-19.7024, 63.4105) on 2026-08-19: the 2016
// layer returns real tiles at z12-z17.
//
// ── WHAT THAT COSTS, STATED PLAINLY ─────────────────────────────────────────
// Two honest limitations, both consequences of the licence choice rather than
// of the code:
//
//   AGE          2016 imagery. Rodrigues' coastline, ridge and main roads have
//                not moved, but a building or a track laid since then is not
//                in it.
//   RESOLUTION   Sentinel-2 is 10 m/pixel, which is about z14. Past that the
//                tiles are an upscale, not more detail — measured: 14.4 KB at
//                z12 falling to 1.9 KB at z17. maxNativeZoom stops Leaflet
//                requesting zooms the data does not contain and upscales
//                locally instead: same picture, fewer requests, politer to a
//                free service.
//
// The permanent fix is not another provider. Rodrigues is 108 km²: a satellite
// basemap for JUST this island, built from Copernicus Sentinel data (whose own
// licence expressly allows commercial use with attribution) and served as
// PMTiles from storage we already pay for, is a small asset and answers the
// licence, the age and the resolution at once. See docs/LIVE_TRACKING.md.
//
// ── LABELS ──────────────────────────────────────────────────────────────────
// Imagery alone is beautiful and unreadable — you cannot tell which grey line
// is the road you want. Google solves it with a labels overlay, and so do we,
// but from our OWN gazetteer (lib/rides/places.ts) rather than a third party's
// tiles. That is not a compromise: the global labels layer we trialled returned
// 872-byte, essentially empty tiles over Rodrigues, while the gazetteer holds
// the forty place names people here actually say out loud. It is also one fewer
// external dependency and one fewer licence to honour.
//
// ── OSM TILE POLICY (the streets basemap) ───────────────────────────────────
// The OSMF Tile Usage Policy is a real constraint, not a formality: heavy or
// bulk use is prohibited, an identifying User-Agent/Referer is required, and
// they may block a client without warning. A tracking map requests tiles
// CONTINUOUSLY while a customer watches, so it is the screen most likely to
// look like abuse. maxZoom is capped, Leaflet's tile cache is left alone, and
// the map pans rather than re-centres — see TrackingMap.

export type TileLayerSpec = {
  url: string;
  attribution: string;
  maxZoom: number;
  /** Past this, Leaflet upscales the last real tile instead of requesting a
   *  zoom the provider does not have. Prevents grey holes at high zoom. */
  maxNativeZoom?: number;
  subdomains?: string;
};

export type Basemap = {
  id: BasemapId;
  label: string;
  base: TileLayerSpec;
  /** Drawn over the base — roads, names, boundaries. What makes imagery usable. */
  overlay?: TileLayerSpec;
  /** Whether the design-system tile filter (a dark treatment) may apply. */
  tintable: boolean;
};

export type BasemapId = "satellite" | "streets";

const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/**
 * The 2016 Sentinel-2 cloudless mosaic — the ONE EOX layer released under
 * CC BY 4.0 rather than CC BY-NC-SA. Attribution is a licence condition, not a
 * courtesy, and Leaflet renders it in the map's attribution control whenever
 * this layer is active.
 */
const EOX_ATTR =
  '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH ' +
  '(Contains modified Copernicus Sentinel data 2016) &mdash; CC BY 4.0';

const SATELLITE: Basemap = {
  id: "satellite",
  label: "Satellite",
  base: {
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
    attribution: EOX_ATTR,
    maxZoom: 19,
    // 10 m/pixel is roughly z14. Beyond it Leaflet upscales the last real tile
    // rather than asking EOX for detail that does not exist.
    maxNativeZoom: 14,
  },
  // No third-party overlay. Place names come from our own gazetteer — see the
  // LABELS note above.
  overlay: undefined,
  // Never tinted: darkening photography does not make it stylish, it makes it
  // muddy, and the point of imagery is seeing the ground.
  tintable: false,
};

const STREETS: Basemap = {
  id: "streets",
  label: "Map",
  base: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTR,
    maxZoom: 19,
    maxNativeZoom: 18,
  },
  tintable: true,
};

/**
 * The self-hosted path, for when 2016 at 10 m/pixel stops being good enough.
 *
 * Copernicus Sentinel data is free and open INCLUDING for commercial use, with
 * attribution — it is EOX's hosted service that carries the non-commercial
 * terms, not the underlying imagery. So a newer, sharper basemap for Rodrigues
 * alone is a licensing question already answered; it is only a build step.
 *
 * Point NEXT_PUBLIC_MAP_SATELLITE_URL at it and this module needs no change.
 */
export function satelliteFromEnv(): TileLayerSpec | null {
  const url = process.env.NEXT_PUBLIC_MAP_SATELLITE_URL;
  const attribution = process.env.NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION;
  if (!url || !attribution) return null;
  const maxNative = Number(process.env.NEXT_PUBLIC_MAP_SATELLITE_MAX_NATIVE_ZOOM);
  return {
    url,
    attribution,
    maxZoom: 19,
    maxNativeZoom: Number.isFinite(maxNative) ? maxNative : undefined,
  };
}

function fromEnv(): Basemap | null {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  const attribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;
  // Both or neither. A custom source carrying OSM's attribution credits the
  // wrong people, and one with NO attribution breaks the licence of every
  // OSM-derived provider there is — so a half-configured swap falls back rather
  // than shipping something unlawful.
  if (!url || !attribution) return null;
  const maxZoom = Number(process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM);
  return {
    id: "streets",
    label: "Map",
    base: {
      url,
      attribution,
      maxZoom: Number.isFinite(maxZoom) && maxZoom >= 1 && maxZoom <= 22 ? maxZoom : 19,
      subdomains: process.env.NEXT_PUBLIC_MAP_TILE_SUBDOMAINS || undefined,
    },
    tintable: process.env.NEXT_PUBLIC_MAP_TILE_TINTABLE !== "false",
  };
}

/** Every basemap a viewer may switch between, in menu order. */
export function getBasemaps(): Basemap[] {
  const sat = satelliteFromEnv();
  const satellite: Basemap = sat ? { ...SATELLITE, base: sat } : SATELLITE;
  const streets = fromEnv() ?? STREETS;
  // The DEFAULT leads. That rule is unchanged; which basemap satisfies it
  // flipped on 2026-09-07 when satellite became the default again. A switcher
  // whose default is not the leading option reads as though something has
  // already been changed.
  return [satellite, streets];
}

export function getBasemap(id: BasemapId): Basemap {
  return getBasemaps().find((b) => b.id === id) ?? SATELLITE;
}

// ── WHEN THE PAID PROVIDER STOPS ANSWERING ──────────────────────────────────
//
// Everything above assumes the configured provider works. Once one of these is
// a METERED service that assumption has a bill attached to it: a quota that
// runs out, a token that gets rotated, a URL restriction that stops matching a
// new domain. Leaflet's response to any of those is to render nothing — the
// map goes grey, in silence, and the customer watching a delivery sees a blank
// rectangle where their driver was.
//
// That is the worst available failure. The free providers this file shipped
// with are still there, still free, still keyless, and a 2016 satellite tile or
// an OSM street tile beats no tile by a distance.
//
// ── WHY A COUNT AND NOT THE FIRST ERROR ────────────────────────────────────
// A single tileerror is ordinary: a tile at the edge of coverage, a dropped
// packet on a phone changing cell. Swapping the whole basemap on one of those
// would demote a working paid provider on a bad ten seconds. Six is roughly one
// screenful failing rather than one tile, which is the shape of "the provider
// is not answering" rather than "the network hiccuped".
//
// The swap is ONE WAY within a page view. Flapping between two providers as a
// connection recovers would redraw the map repeatedly, which looks far more
// broken than either provider on its own.

/** Failed tiles before a configured provider is considered down. */
export const TILE_ERROR_LIMIT = 6;

/**
 * Is this basemap coming from an environment override rather than the built-in?
 *
 * Only an overridden sheet has anywhere to fall back TO. If the built-in is
 * already in use, a tile error means OSM or EOX is having a bad day and there
 * is no second option worth switching to.
 */
export function isOverridden(id: BasemapId): boolean {
  return id === "satellite" ? satelliteFromEnv() !== null : fromEnv() !== null;
}

/** The free provider this file ships with, ignoring any override. */
export function builtinBasemap(id: BasemapId): Basemap {
  return id === "satellite" ? SATELLITE : STREETS;
}

/**
 * Should a layer that has failed this many times be replaced?
 *
 * Pure, so the rule is testable without a browser, a network or a paid key —
 * none of which a test should need to answer "does it give up at the right
 * time".
 */
export function shouldFallBack(id: BasemapId, errors: number): boolean {
  return isOverridden(id) && errors >= TILE_ERROR_LIMIT;
}

/**
 * SATELLITE by default — the owner's call, reversed on 2026-09-07 after seeing
 * the street map come up on their own phone and asking for the imagery back.
 *
 * The history matters, because this has now flipped twice:
 *
 *   until 2026-08-19   satellite, on Esri's sharp imagery
 *   2026-08-19         streets, when that layer had to go for licence reasons
 *                      and the Sentinel-2 fallback turned out visibly softer
 *                      past z14
 *   2026-09-07         satellite again, asked for directly
 *
 * The argument for streets was real: sharp roads and labels at every zoom, and
 * a fraction of the bytes on mobile data. It lost anyway, because the owner
 * looked at both on a phone and preferred the imagery — and for an island where
 * people navigate by a beach, a track or a building rather than by a road name,
 * that is a reasonable thing to prefer.
 *
 * One correction to the 2026-08-19 reasoning, checked rather than assumed:
 * "softer past z14" describes the Sentinel-2 FALLBACK, which is what a machine
 * with no map env vars renders. Production sets NEXT_PUBLIC_MAP_SATELLITE_URL
 * and serves Mapbox imagery — the "© Mapbox Satellite" in the owner's own
 * screenshot. So the sharpness objection barely applies to what visitors get.
 *
 * Streets stays one tap away.
 *
 * NOTE for anyone reading this after a bug report: a viewer's own tap is
 * remembered in localStorage under BASEMAP_STORAGE_KEY and BEATS this default.
 * Someone who once pressed "Map" keeps the street map whatever this says, so
 * changing this constant will not fix their screen — they have to tap
 * "Satellite" once. That is exactly what happened to the owner: the switch
 * became tappable for the first time on 2026-09-07 (it had been sitting
 * unreachable underneath the "Where I am" button), and a tap landed on Map.
 */
export const DEFAULT_BASEMAP: BasemapId = "satellite";

/** Remembered per browser, so a viewer's choice survives a reload. */
export const BASEMAP_STORAGE_KEY = "rr-basemap";

/** Rodrigues, centred. Every tracking map opens here before it knows better. */
export const RODRIGUES_CENTRE: [number, number] = [-19.7024, 63.4105];

/**
 * The island, with a small margin.
 *
 * Two jobs, both about refusing coordinates nobody can drive to: it clamps the
 * frame while somebody is pinning a pickup, and it decides whether a phone's
 * reported position is close enough to be worth showing — the same question,
 * asked by "you are here" and by "pin it on the map".
 *
 * It lived as a private constant inside IslandMap, which was fine while one
 * screen asked. A second copy in a second component is how two answers to
 * "is this on Rodrigues?" start disagreeing, so it lives here beside the centre
 * it belongs to.
 */
export const RODRIGUES_BOUNDS = {
  minLat: -19.78,
  maxLat: -19.61,
  minLng: 63.33,
  maxLng: 63.5,
} as const;

/**
 * Back-compat for callers that only ever wanted one layer.
 * @deprecated prefer getBasemap(id)
 */
export function getTileProvider(): TileLayerSpec {
  return getBasemap(DEFAULT_BASEMAP).base;
}
