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
  const custom = fromEnv();
  return custom ? [satellite, custom] : [satellite, STREETS];
}

export function getBasemap(id: BasemapId): Basemap {
  return getBasemaps().find((b) => b.id === id) ?? SATELLITE;
}

/**
 * Satellite by default — the owner's call, and the right one here: on an island
 * where most roads are unnamed, imagery is what makes a route recognisable.
 */
export const DEFAULT_BASEMAP: BasemapId = "satellite";

/** Remembered per browser, so a viewer's choice survives a reload. */
export const BASEMAP_STORAGE_KEY = "rr-basemap";

/** Rodrigues, centred. Every tracking map opens here before it knows better. */
export const RODRIGUES_CENTRE: [number, number] = [-19.7024, 63.4105];

/**
 * Back-compat for callers that only ever wanted one layer.
 * @deprecated prefer getBasemap(id)
 */
export function getTileProvider(): TileLayerSpec {
  return getBasemap(DEFAULT_BASEMAP).base;
}
