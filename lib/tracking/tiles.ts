// ── THE MAP UNDERNEATH, BEHIND ONE SEAM ─────────────────────────────────────
//
// Every map in the app asks this module what to draw on, so swapping the tile
// provider later is a change to two environment variables and nothing else. No
// component imports a tile URL, and none should.
//
// ── THE DEFAULT, AND ITS LIMITS ─────────────────────────────────────────────
// OpenStreetMap's own tile servers. Free, no key, no account, and covered by the
// OSMF Tile Usage Policy, which is a genuine constraint rather than a formality:
//
//   · heavy or bulk use is prohibited, and "heavy" is not defined numerically —
//     the policy is aimed at hobby-scale traffic;
//   · a valid HTTP Referer or User-Agent identifying the app is required;
//   · no pre-fetching, no bulk downloading, no scraping;
//   · they may block a client without warning.
//
// A tracking map is the one screen on this platform that requests tiles
// CONTINUOUSLY while a customer watches, so it is the one most likely to look
// like abuse. Three things keep it inside the policy:
//
//   · maxZoom 18, not 19 — one zoom level is four times the tiles;
//   · the map does not auto-follow at high zoom, so a moving vehicle does not
//     drag a fresh tile set across the screen every second;
//   · Leaflet's own tile cache is left alone (keepBuffer default), so panning
//     back and forth re-requests nothing.
//
// At Rodrigues scale — a handful of concurrent watchers on an island 18 km
// across, which is a couple of hundred tiles at z14 in TOTAL — this is
// comfortably hobby traffic. It stops being true if the platform grows or if
// tracking is ever embedded somewhere that renders it to every visitor.
//
// ── SWAPPING IT ─────────────────────────────────────────────────────────────
// Set both, redeploy, done:
//
//   NEXT_PUBLIC_MAP_TILE_URL="https://tiles.example.com/{z}/{x}/{y}.png?key=…"
//   NEXT_PUBLIC_MAP_TILE_ATTRIBUTION="© Example, © OpenStreetMap contributors"
//
// Anything speaking the XYZ/slippy-map convention drops straight in: a
// self-hosted OSM stack, MapTiler, Stadia, Thunderforest, Protomaps. The
// attribution is required, not decorative — every OSM-derived source obliges you
// to carry it, and the credit line is why the data is free.
//
// NOTE ON CSP: next.config.ts sets `img-src 'self' data: blob: https:`, so any
// HTTPS tile host is already allowed. A tile provider needing a non-HTTPS origin
// or a WebGL vector style would need that header changed too.

export type TileProvider = {
  url: string;
  attribution: string;
  maxZoom: number;
  /**
   * Subdomain rotation ({s} in the URL). OSM's policy discourages it now — HTTP/2
   * makes it pointless and it defeats their caching — so the default omits it.
   */
  subdomains?: string;
};

const OSM_STANDARD: TileProvider = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  maxZoom: 18,
};

export function getTileProvider(): TileProvider {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  const attribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;
  // Both or neither. A custom tile source with OSM's attribution would credit
  // the wrong people, and a custom source with NO attribution breaks the licence
  // of every OSM-derived provider there is — so a half-configured swap falls back
  // rather than shipping something unlawful.
  if (url && attribution) {
    const maxZoom = Number(process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM);
    return {
      url,
      attribution,
      maxZoom: Number.isFinite(maxZoom) && maxZoom >= 1 && maxZoom <= 22 ? maxZoom : 19,
      subdomains: process.env.NEXT_PUBLIC_MAP_TILE_SUBDOMAINS || undefined,
    };
  }
  return OSM_STANDARD;
}

/** Rodrigues, centred. Every tracking map opens here before it knows better. */
export const RODRIGUES_CENTRE: [number, number] = [-19.7024, 63.4105];
