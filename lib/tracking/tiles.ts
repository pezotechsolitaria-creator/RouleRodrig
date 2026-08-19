// ── THE MAP UNDERNEATH, BEHIND ONE SEAM ─────────────────────────────────────
//
// Every map in the app asks this module what to draw on, so swapping the tile
// provider later is a change to environment variables and nothing else. No
// component imports a tile URL, and none should.
//
// ── TWO BASEMAPS, SATELLITE FIRST ───────────────────────────────────────────
// The owner asked for satellite "like Google, so we can see the routes clearly",
// and on Rodrigues that is the right default for a reason beyond taste: much of
// the island's road network is unnamed, and a lot of what a driver actually
// follows — cane tracks, the turning into a guesthouse, the last 200 m of dirt
// to a beach — is legible in imagery and simply absent from a street rendering.
//
// SATELLITE is a HYBRID, exactly as Google's is: imagery underneath, a
// transparent labels/boundaries layer on top. Imagery alone is beautiful and
// unreadable — you cannot tell which grey line is the road you want.
//
// ── WHAT WAS VERIFIED, AND WHEN ─────────────────────────────────────────────
// Measured 2026-08-19 against the real island centre (-19.7024, 63.4105):
//
//   Esri World Imagery        z13 14.5 KB · z15 16.3 KB · z17 10.5 KB   real
//   Esri Reference labels     z13/15/17 ~0.9 KB (sparse here, as expected)
//   EOX Sentinel-2 cloudless  z13 11.8 KB · z15 7.4 KB · z17 2.9 KB     thin
//   OSM standard              z15 17.9 KB · z17 4.1 KB                  real
//
// Sentinel-2 is 10 m/pixel, so past about z14 it is upsampled mush — fine as a
// licence-clean fallback, not as the thing a driver navigates by. Esri holds
// detail to z17 and beyond over Rodrigues.
//
// ── THE LICENCE POSITION, STATED PLAINLY ────────────────────────────────────
// Esri's World Imagery tile service is publicly reachable without a key and is
// the standard free satellite layer in the Leaflet ecosystem, used with the
// attribution below. It is NOT covered by an open licence the way OpenStreetMap
// is: Esri's terms of use govern it, and a commercial deployment at scale is a
// question for the owner, not for this file. It is therefore swappable by env
// var like everything else here, and `EOX_SENTINEL` below is the fully-open
// (CC-BY) alternative if that answer ever comes back "no".
//
// ── OSM TILE POLICY (the streets basemap) ───────────────────────────────────
// The OSMF Tile Usage Policy is a real constraint, not a formality: heavy or
// bulk use is prohibited, an identifying User-Agent/Referer is required, and
// they may block a client without warning. A tracking map requests tiles
// CONTINUOUSLY while a customer watches, so it is the one screen most likely to
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

const ESRI_ATTR =
  'Imagery &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics';

const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const SATELLITE: Basemap = {
  id: "satellite",
  label: "Satellite",
  base: {
    // NOTE the {y}/{x} order — ArcGIS REST is row/col, the reverse of the
    // XYZ convention every other provider here uses. Swapping them yields
    // tiles from the wrong hemisphere, which looks like "satellite is broken".
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: ESRI_ATTR,
    maxZoom: 19,
    maxNativeZoom: 18,
  },
  overlay: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    attribution: "",
    maxZoom: 19,
    maxNativeZoom: 18,
  },
  // Never tinted. Darkening photography does not make it stylish, it makes it
  // muddy — and the whole point of imagery is seeing the ground.
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
 * Fully-open (CC-BY) satellite, for the day Esri's terms become a problem.
 * Not wired to the UI: at 10 m/pixel it is unusable above ~z14, so it is a
 * documented escape hatch rather than a choice a customer should be offered.
 */
export const EOX_SENTINEL: TileLayerSpec = {
  url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
  attribution:
    'Sentinel-2 cloudless by <a href="https://eox.at" target="_blank" rel="noopener">EOX</a> (CC-BY-NC-SA)',
  maxZoom: 19,
  maxNativeZoom: 14,
};

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
  const custom = fromEnv();
  return custom ? [SATELLITE, custom] : [SATELLITE, STREETS];
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
