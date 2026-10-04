import type { MapLocation } from "@/lib/defaults";
import { realProse } from "@/lib/place-prose";

// ── WHERE A PLACE IS WRITTEN ABOUT (architecture review 2026-09-30, items 3, 6, 8) ──
//
// One place, five pages that mention it: its theme guide (/guide/beaches,
// /guide/viewpoints, /guide/shops), the island map, /explore, the homepage and
// the curated world. Each of those used to decide for itself which page "owns"
// a place, and they had drifted: /explore required `story` and so dropped
// Trou d'Argent, which has only a description; landmark cards linked the bare
// /map although /guide/viewpoints carries every landmark with an anchor.
//
// This file is the one answer. It is deliberately PURE and has no server
// imports, because lib/world-docs/resolve.ts is read by client components and
// needs the same answer the guide pages give.

type Prose = Pick<MapLocation, "story" | "description">;
type Placed = Pick<MapLocation, "id" | "category" | "story" | "description">;

/**
 * A place is a guide ENTRY only when it has prose the owner wrote — a name and
 * a pin is not. realProse, not trim: the admin placeholder "Add a description."
 * is not writing (lib/place-prose.ts). The beaches and viewpoints pages each
 * carried their own copy of this line; they now read this one.
 */
export function hasGuideWriting(l: Prose): boolean {
  return Boolean(realProse(l.story) || realProse(l.description));
}

/** The three theme guides built from map locations. */
export const THEME_GUIDES = {
  beaches: "/guide/beaches",
  viewpoints: "/guide/viewpoints",
  shops: "/guide/shops",
} as const;

export type ThemeGuideHref = (typeof THEME_GUIDES)[keyof typeof THEME_GUIDES];

/**
 * The theme guide that carries this place, or null when no guide does.
 *
 * Mirrors the filters of the pages themselves: beaches need writing,
 * viewpoints AND landmarks share /guide/viewpoints and need writing, and every
 * shop pin is on /guide/shops (that page has never required prose). Restaurants,
 * activities and petrol stations are on the map only.
 */
export function themeGuideOf(l: Pick<MapLocation, "category"> & Prose): ThemeGuideHref | null {
  switch (l.category) {
    case "beach":
      return hasGuideWriting(l) ? THEME_GUIDES.beaches : null;
    case "viewpoint":
    case "landmark":
      return hasGuideWriting(l) ? THEME_GUIDES.viewpoints : null;
    case "shop":
      return THEME_GUIDES.shops;
    default:
      return null;
  }
}

/** The places a theme guide renders, in the owner's order. */
export function placesOnGuide<T extends Pick<MapLocation, "category"> & Prose>(
  locations: T[],
  guide: ThemeGuideHref,
): T[] {
  return locations.filter((l) => themeGuideOf(l) === guide);
}

/**
 * The beaches /fr/plages-rodrigues renders: French prose only, never the
 * English text under a French URL. A mirror of that page's own filter (trim,
 * not realProse — the placeholder the admin inserts is English), kept here so
 * the /fr hub can count what the page shows; lib/guide/hub.test.ts renders the
 * page and holds the two to the same number.
 */
export function frenchBeachesOnGuide<T extends Pick<MapLocation, "category" | "storyFr" | "descriptionFr">>(
  locations: T[],
): T[] {
  return locations.filter(
    (l) => l.category === "beach" && Boolean(l.storyFr?.trim() || l.descriptionFr?.trim()),
  );
}

/** Anchor lookup: map-location id → the #fragment every page uses for it. */
export type Anchors = Record<string, string>;

/**
 * Where a place is READ about: its own page when it has earned one, else its
 * entry on the theme guide, else null (the map is then the only page with it).
 * `pages` comes from locationPageHrefs() in ./location-page-gate.
 */
export function guideEntryHref(
  place: Placed,
  anchors: Anchors,
  pages: Record<string, string> = {},
): string | null {
  const page = pages[place.id];
  if (page) return page;
  const guide = themeGuideOf(place);
  if (!guide) return null;
  const anchor = anchors[place.id];
  return anchor ? `${guide}#${anchor}` : guide;
}

/** The place's row on the island map. Every map location has one. */
export function mapEntryHref(place: Pick<MapLocation, "id">, anchors: Anchors): string {
  const anchor = anchors[place.id];
  return anchor ? `/map#${anchor}` : "/map";
}

/**
 * The link a card about this place should carry: the guide entry when there
 * is one, else its row on the map — never the bare /map, which lands a reader
 * forty places away from the one they tapped (audit: landmarks → /map).
 */
export function readAboutHref(
  place: Placed,
  anchors: Anchors,
  pages: Record<string, string> = {},
): string {
  return guideEntryHref(place, anchors, pages) ?? mapEntryHref(place, anchors);
}

/**
 * The breadcrumb every page under /guide carries: Home › Island guide › page.
 *
 * The children used to name /guide/rodrigues as their parent while the link
 * they render at the foot of the page (HubBacklink) goes to /guide — the
 * markup and the page disagreed about where the reader was (item 6).
 */
export function guideTrail(
  siteUrl: string,
  page?: { name: string; path: string },
): { name: string; url: string }[] {
  return [
    { name: "Home", url: siteUrl },
    { name: "Island guide", url: `${siteUrl}/guide` },
    ...(page ? [{ name: page.name, url: `${siteUrl}${page.path}` }] : []),
  ];
}
