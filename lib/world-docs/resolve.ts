// Client-safe and PURE: turns a Curated document plus the live catalogue into
// render-ready cards. No React, no fetch, no clock of its own.
//
// ── WHY THE PAGE CANNOT SHOW A CARD THAT ISN'T REAL ─────────────────────────
//
// A curated card stores a POINTER (`{kind:"place", id:"rec-…"}`) and the
// editor's overrides — never a copy of the name, photo or price. Everything
// visible is read back out of `site_content` at render time, so:
//
//  · renaming a stay in /admin renames its curated card,
//  · deleting one REMOVES its card instead of leaving a 404 on the front page,
//  · and a card can never quietly drift out of date with the thing it sells.
//
// The cost is that a section can shrink. `topUp` covers that: a section that
// falls below its floor is filled from the same catalogue, by the same rules,
// so the page degrades to "fewer, still real" rather than to a hole.
//
// `now` is always a parameter. The admin's live preview must be able to render
// "what the public sees at 6pm on Friday", and a function that reads its own
// clock cannot do that — nor can it be tested.

import type { FavoriteType } from "@/context/FavoritesContext";
import type { FleetItem, MapLocation, RecommendedPlace, RideRoute } from "@/lib/defaults";
import { forWorld, type World } from "@/lib/worlds";
import {
  cardIsLive,
  type WorldCard,
  type WorldDoc,
  type EditorialLabel,
  type Localized,
} from "./types";

export interface CatalogueEvent {
  slug: string;
  name: string;
  coverUrl?: string | null;
  venueName?: string | null;
  fromPrice?: number | null;
}

/** Everything the resolver is allowed to read. Deliberately narrow. */
export interface Catalogue {
  places: RecommendedPlace[];
  locations: MapLocation[];
  routes: RideRoute[];
  /** Scooters and cars, so a world page can recommend one. */
  fleet: FleetItem[];
  events: CatalogueEvent[];
  /** The site hero photo — the last-resort image for the curated hero. */
  heroImage?: string;
}

export interface ResolvedCard {
  id: string;
  title: Localized;
  blurb?: Localized;
  image?: string;
  href: string;
  category?: Localized;
  labels: EditorialLabel[];
  /** One short factual line — a price note, a distance, "Viewpoint". Never invented. */
  meta?: Localized;
  /**
   * How this card is saved to Favourites.
   *
   * Keyed on the CATALOGUE row, not on the curated card, so hearting a stay
   * here and hearting the same stay on /browse/stays are one saved item rather
   * than two — and it stays saved if the curated card is later reworded or
   * moved to another section. An editorial `link` card has no catalogue row
   * behind it and so cannot be saved; it gets no heart rather than a heart that
   * saves a URL.
   */
  fav?: { type: FavoriteType; id: string };
  /** True when this card was added by topUp rather than chosen by an editor. */
  auto?: boolean;
}

const L = (en?: string, fr?: string, cr?: string): Localized | undefined =>
  en && en.trim() ? { en, fr, cr } : undefined;

const firstImage = (...candidates: (string | undefined | null)[]): string | undefined =>
  candidates.find((c): c is string => typeof c === "string" && c.trim().length > 0);

/** Where a catalogue place is bookable. Mirrors the homepage's own mapping. */
export function placeHref(p: RecommendedPlace): string {
  if (p.category === "hotel") return "/browse/stays";
  if (p.category === "restaurant") return "/food";
  if (p.serviceType) return `/experiences/${p.serviceType}`;
  return p.isTour ? "/browse/tours" : "/browse/activities";
}

/** Where a vehicle is rented. Its category IS its browse page. */
export function fleetHref(v: FleetItem): string {
  return `/browse/${v.category === "car" ? "car" : "scooter"}`;
}

/** Where a map location is READ ABOUT — the guide page that carries its story. */
export function locationHref(l: MapLocation): string {
  if (l.category === "beach") return `/guide/beaches#${l.id}`;
  if (l.category === "viewpoint") return `/guide/viewpoints#${l.id}`;
  return "/map";
}

const LOCATION_KIND: Record<MapLocation["category"], Localized> = {
  beach: { en: "Beach", fr: "Plage", cr: "Laplaz" },
  viewpoint: { en: "Viewpoint", fr: "Point de vue", cr: "Vi" },
  landmark: { en: "Landmark", fr: "Site", cr: "Landmark" },
  activity: { en: "Activity", fr: "Activité", cr: "Aktivite" },
  restaurant: { en: "Table", fr: "Table", cr: "Latab" },
  shop: { en: "Local craft", fr: "Artisanat", cr: "Artizana" },
  gas: { en: "Fuel", fr: "Carburant", cr: "Delwil" },
};

/**
 * Resolve one card, or null if it points at something that no longer exists.
 *
 * Returning null rather than a placeholder is the whole safety property: an
 * editor's deleted stay leaves a shorter page, never a broken promise.
 */
export function resolveCard(
  card: WorldCard,
  cat: Catalogue,
  labels: EditorialLabel[],
  now: Date,
): ResolvedCard | null {
  if (!cardIsLive(card, now)) return null;

  const badge = (card.labels ?? [])
    .map((id) => labels.find((l) => l.id === id))
    .filter((l): l is EditorialLabel => !!l);

  const base = { id: card.id, labels: badge, category: card.category };

  switch (card.source.kind) {
    case "place": {
      const id = card.source.id;
      const p = cat.places.find((x) => x.id === id);
      if (!p) return null;
      const title = card.title ?? L(p.name);
      if (!title) return null;
      return {
        ...base,
        title,
        blurb: card.blurb ?? L(p.description, p.descriptionFr, p.descriptionCr),
        image: firstImage(card.image, p.image, p.images?.[0]),
        href: card.href ?? placeHref(p),
        meta: L(p.priceNote),
        fav: { type: "place", id: p.id },
      };
    }
    case "location": {
      const id = card.source.id;
      const l = cat.locations.find((x) => x.id === id);
      if (!l) return null;
      const title = card.title ?? L(l.name, l.nameFr, l.nameCr);
      if (!title) return null;
      return {
        ...base,
        title,
        blurb:
          card.blurb ??
          L(l.story, l.storyFr, l.storyCr) ??
          L(l.description, l.descriptionFr, l.descriptionCr),
        image: firstImage(card.image, l.image, l.images?.[0]),
        href: card.href ?? locationHref(l),
        meta: LOCATION_KIND[l.category],
        fav: { type: "place", id: l.id },
      };
    }
    case "route": {
      const id = card.source.id;
      const r = cat.routes.find((x) => x.id === id);
      if (!r) return null;
      const title = card.title ?? L(r.name, r.nameFr, r.nameCr);
      if (!title) return null;
      return {
        ...base,
        title,
        blurb: card.blurb ?? L(r.description, r.descriptionFr, r.descriptionCr),
        image: firstImage(card.image, r.image, r.images?.[0]),
        href: card.href ?? "/guide/routes",
        meta: L([r.distance, r.duration].filter(Boolean).join(" · ")),
        fav: { type: "route", id: r.id },
      };
    }
    case "fleet": {
      const id = card.source.id;
      const v = cat.fleet.find((x) => x.id === id);
      // A vehicle taken off the road (`available: false`) disappears from the
      // page rather than being recommended and then refused at checkout.
      if (!v || v.available === false) return null;
      const title = card.title ?? L(v.name);
      if (!title) return null;
      return {
        ...base,
        title,
        blurb: card.blurb ?? L(v.tagline, v.taglineFr, v.taglineCr),
        image: firstImage(card.image, v.image, v.images?.[0]),
        href: card.href ?? fleetHref(v),
        meta: L(v.price),
        fav: { type: "scooter", id: v.id },
      };
    }
    case "event": {
      const slug = card.source.slug;
      const e = cat.events.find((x) => x.slug === slug);
      if (!e) return null;
      return {
        ...base,
        title: card.title ?? { en: e.name },
        blurb: card.blurb,
        image: firstImage(card.image, e.coverUrl ?? undefined),
        href: card.href ?? `/events/${e.slug}`,
        meta: L(e.venueName ?? undefined),
        fav: { type: "place", id: `event-${e.slug}` },
      };
    }
    case "link": {
      // The one kind with no catalogue row behind it, so the editor's own title
      // is required — an untitled editorial card is not a card.
      if (!card.title) return null;
      return {
        ...base,
        title: card.title,
        blurb: card.blurb,
        image: card.image,
        href: card.href ?? card.source.href,
      };
    }
  }
}

/**
 * Fill a thin section from the catalogue.
 *
 * Only ever adds things that already carry a photo and a name, in the order the
 * owner arranged them in /admin — this is a fallback, not a recommendation
 * engine, and it must not pretend to rank anything.
 */
export function topUpPlaces(
  have: ResolvedCard[],
  cat: Catalogue,
  want: number,
  world?: World,
): ResolvedCard[] {
  if (have.length >= want) return have;
  const usedHrefs = new Set(have.map((c) => c.href));
  const usedTitles = new Set(have.map((c) => c.title.en.trim().toLowerCase()));
  const out = [...have];
  // Activities first: they are what a curated page is for. Stays and tables
  // follow so a catalogue of only hotels still fills the rail.
  const order: RecommendedPlace["category"][] = ["activity", "hotel", "restaurant"];
  // ── "BOTH, BUT DE-EMPHASISED" IS A REAL BEHAVIOUR ────────────────────────
  // `forWorld` is the owner's existing tagging (lib/worlds.ts): a listing
  // marked for one world is dropped from the other, one marked "both" — which
  // is EVERY listing until somebody narrows it — stays visible in both and is
  // ordered by that world's own priority. So a village walk is not hidden from
  // Curated; it simply comes after the villa. Filtering it out instead would
  // have made the two worlds two catalogues, which is the thing this design
  // exists to avoid.
  const ranked = world ? forWorld(cat.places, world) : cat.places;
  for (const category of order) {
    for (const p of ranked.filter((x) => x.category === category)) {
      if (out.length >= want) return out;
      const image = firstImage(p.image, p.images?.[0]);
      if (!image || !p.name.trim()) continue;
      if (usedTitles.has(p.name.trim().toLowerCase())) continue;
      const href = placeHref(p);
      // Two different stays share /browse/stays, so href alone cannot dedupe —
      // the title check above is what really prevents a repeat.
      if (usedHrefs.has(href) && category !== "hotel" && category !== "activity") continue;
      usedTitles.add(p.name.trim().toLowerCase());
      out.push({
        id: `auto-${p.id}`,
        title: { en: p.name },
        blurb: L(p.description, p.descriptionFr, p.descriptionCr),
        image,
        href,
        labels: [],
        meta: L(p.priceNote),
        fav: { type: "place", id: p.id },
        auto: true,
      });
    }
  }
  return out;
}

/** The same, from the map's places — used by "Only in Rodrigues". */
// No `world` parameter, deliberately: map locations carry no world tagging —
// the owner tags LISTINGS (RecommendedPlace), not pins — so there is nothing
// here to rank by, and a parameter that silently did nothing would be worse
// than its absence. A beach belongs to both islands anyway.
export function topUpLocations(
  have: ResolvedCard[],
  cat: Catalogue,
  want: number,
): ResolvedCard[] {
  if (have.length >= want) return have;
  const usedTitles = new Set(have.map((c) => c.title.en.trim().toLowerCase()));
  const out = [...have];
  // A location with a written story is a story worth putting on this page; one
  // without is a pin on a map. Stories first, then the rest.
  const ranked = [
    ...cat.locations.filter((l) => (l.story ?? "").trim().length > 0),
    ...cat.locations.filter((l) => !(l.story ?? "").trim()),
  ].filter((l) => l.category !== "gas");
  for (const l of ranked) {
    if (out.length >= want) return out;
    const image = firstImage(l.image, l.images?.[0]);
    if (!image || !l.name.trim()) continue;
    if (usedTitles.has(l.name.trim().toLowerCase())) continue;
    usedTitles.add(l.name.trim().toLowerCase());
    out.push({
      id: `auto-${l.id}`,
      title: { en: l.name, fr: l.nameFr, cr: l.nameCr },
      blurb: L(l.story, l.storyFr, l.storyCr) ?? L(l.description, l.descriptionFr, l.descriptionCr),
      image,
      href: locationHref(l),
      labels: [],
      meta: LOCATION_KIND[l.category],
      fav: { type: "place", id: l.id },
      auto: true,
    });
  }
  return out;
}

/**
 * The hero's stills.
 *
 * An empty `hero.images` is the DEFAULT, not an error: rather than shipping the
 * seed document with stock photography the owner would later have to be talked
 * out of, the hero borrows the site's own hero photo and the best-photographed
 * places on the island until someone pins exact stills in /admin/worlds.
 */
export function heroImages(doc: WorldDoc, cat: Catalogue, max = 4): string[] {
  const pinned = (doc.hero.images ?? []).filter((s) => s && s.trim());
  if (pinned.length) return pinned.slice(0, max);

  const out: string[] = [];
  const push = (s?: string | null) => {
    if (s && s.trim() && !out.includes(s)) out.push(s);
  };
  push(cat.heroImage);
  // Wide, recognisably-Rodrigues scenery — the lagoon and the ridge lines —
  // rather than whatever happens to be first in the array.
  for (const l of cat.locations) {
    if (out.length >= max) break;
    if (l.category !== "beach" && l.category !== "viewpoint") continue;
    push(firstImage(l.image, l.images?.[0]));
  }
  return out.slice(0, max);
}

export interface ResolvedMood {
  id: string;
  title: Localized;
  blurb: Localized;
  href: string;
  image?: string;
}

/**
 * Give every mood card a photograph.
 *
 * A mood is a feeling, not a catalogue row, so it has no source to borrow an
 * image from — and a mood card without one is a coloured rectangle with a verb
 * on it. Unpinned moods are dealt distinct island photographs, **by index**:
 * the assignment has to be deterministic or the server and the browser would
 * render different pictures and React would tear the section apart on hydration.
 * (Which is also why there is no shuffle here, however tempting.)
 */
export function resolveMoods(
  moods: { id: string; title: Localized; blurb: Localized; href: string; image?: string; enabled?: boolean }[],
  cat: Catalogue,
): ResolvedMood[] {
  const pool = cat.locations
    .filter((l) => l.category === "beach" || l.category === "viewpoint" || l.category === "landmark")
    .map((l) => firstImage(l.image, l.images?.[0]))
    .filter((s): s is string => !!s);

  let next = 0;
  return moods
    .filter((m) => m.enabled !== false && m.href)
    .map((m) => ({
      id: m.id,
      title: m.title,
      blurb: m.blurb,
      href: m.href,
      image: m.image?.trim() ? m.image : pool[next++ % Math.max(pool.length, 1)],
    }));
}

/** Fully resolved page model — what the Curated page actually renders. */
export interface ResolvedSection {
  id: string;
  type: WorldDoc["sections"][number]["type"];
  title?: Localized;
  subtitle?: Localized;
  cards: ResolvedCard[];
  /** Carried through untouched for the section types that aren't card lists. */
  raw: WorldDoc["sections"][number];
}

/**
 * Resolve the whole document.
 *
 * Sections that end up empty are dropped — a heading with nothing under it is
 * the same broken promise as a dead card.
 */
export function resolveWorldDoc(
  doc: WorldDoc,
  cat: Catalogue,
  now: Date,
  /** Ranks the auto top-up by this world's tagging. Omit for no ranking. */
  world?: World,
): { hero: { images: string[] }; sections: ResolvedSection[] } {
  const labels = doc.labels ?? [];
  const sections: ResolvedSection[] = [];

  for (const s of doc.sections) {
    if (s.enabled === false) continue;
    const common = { id: s.id, type: s.type, title: s.title, subtitle: s.subtitle, raw: s };

    if (s.type === "featured") {
      const want = Math.max(3, Math.min(s.limit ?? 6, 12));
      let cards = s.cards
        .map((c) => resolveCard(c, cat, labels, now))
        .filter((c): c is ResolvedCard => c !== null);
      cards = topUpPlaces(cards, cat, want, world).slice(0, want);
      if (cards.length) sections.push({ ...common, cards });
      continue;
    }

    if (s.type === "onlyInRodrigues") {
      let cards = s.cards
        .map((c) => resolveCard(c, cat, labels, now))
        .filter((c): c is ResolvedCard => c !== null);
      cards = topUpLocations(cards, cat, 4).slice(0, 8);
      if (cards.length) sections.push({ ...common, cards });
      continue;
    }

    if (s.type === "moods") {
      const live = s.moods.filter((m) => m.enabled !== false && m.href);
      if (live.length) sections.push({ ...common, cards: [] });
      continue;
    }

    if (s.type === "editors") {
      const live = s.notes.filter((n) => n.enabled !== false);
      if (live.length) sections.push({ ...common, cards: [] });
      continue;
    }

    // Concierge — always renders when enabled; it has no list to be empty.
    sections.push({ ...common, cards: [] });
  }

  return { hero: { images: heroImages(doc, cat) }, sections };
}
