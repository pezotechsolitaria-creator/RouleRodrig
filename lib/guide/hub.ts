import type { RideRoute, SiteContent } from "@/lib/defaults";
import { isHike } from "@/components/HikingGuide";
import { GUIDE_PAGES, type HubLink } from "@/lib/nav/hubs";
import { metaDescription } from "@/lib/meta-description";
import { realProse } from "@/lib/place-prose";
import { THEME_GUIDES, frenchBeachesOnGuide, placesOnGuide } from "./places";
import { locationPages, storedSlug } from "./location-page-gate";

// ── THE HUBS ASK THE PAGES (architecture review 2026-09-30, items 2, 5) ─────
//
// /guide and /fr list their children with titles. Three of those titles led
// with a number typed on the day it was true ("The 5 best hikes" beside a page
// showing 2; "Les 19 plus belles plages"), and /guide published the wrong one
// in its ItemList. The pages count their own lists live, so the hub now counts
// the same list with the same filter and the two cannot disagree —
// lib/guide/hub.test.ts renders each target page and compares the H1.

type Content = Pick<SiteContent, "mapLocations" | "rideRoutes">;

/**
 * The trails /guide/hiking renders: a hike with a name and a description.
 * A trail with nothing written yet stays out of the list, the count and the
 * structured data alike. The hiking page reads this, so the hub cannot count
 * differently.
 */
export function hikesOnGuide(routes: RideRoute[]): RideRoute[] {
  return routes.filter((r) => isHike(r) && Boolean(r.name) && Boolean(r.description));
}

/** How many entries the page behind a counted hub link shows. */
export function hubCount(content: Content, of: NonNullable<HubLink["counted"]>["of"]): number {
  switch (of) {
    case "beaches":
      return placesOnGuide(content.mapLocations, THEME_GUIDES.beaches).length;
    case "hikes":
      return hikesOnGuide(content.rideRoutes).length;
    case "plages":
      return frenchBeachesOnGuide(content.mapLocations).length;
  }
}

/** The hub title for a page: its live-counted H1 where it has one. */
export function hubTitle(content: Content, link: HubLink): string {
  return link.counted ? link.counted.title(hubCount(content, link.counted.of)) : link.title;
}

/**
 * Everything the /guide hub lists, in order: the theme guides (shops only
 * while a shop is pinned — the page 404s without one, and a hub card that
 * opens a 404 is what this hub was built to end), then any place that has
 * earned a page of its own. That last part is how a new location page is
 * reachable by a click the hour it passes the gate, with no code change —
 * the dynamic route's version of being listed in GUIDE_PAGES.
 */
export function guideHubLinks(content: Content): HubLink[] {
  const hasShops = placesOnGuide(content.mapLocations, THEME_GUIDES.shops).length > 0;
  const themed = GUIDE_PAGES.filter((g) => g.href !== THEME_GUIDES.shops || hasShops).map((g) => ({
    ...g,
    title: hubTitle(content, g),
  }));
  const places: HubLink[] = locationPages(content.mapLocations).map((p) => ({
    href: `/guide/${storedSlug(p)}`,
    title: p.name.trim(),
    // The owner's own first sentence, cut on a sentence boundary.
    blurb: metaDescription(realProse(p.description) || realProse(p.story), 120),
  }));
  return [...themed, ...places];
}
