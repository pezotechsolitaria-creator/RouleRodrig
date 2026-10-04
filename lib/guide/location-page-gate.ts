import type { MapLocation } from "@/lib/defaults";
import { realProse } from "@/lib/place-prose";
import { isOnRodrigues } from "@/lib/tracking/model";
import { themeGuideOf } from "./places";

// ── A PLACE EARNS ITS OWN PAGE, OR IT STAYS A SECTION (architecture review 2026-09-30, items 1, 2) ──
//
// The brief asked for location pages: Port Mathurin, Pointe Coton, Trou
// d'Argent. The repo's standing rule is one page per THEME until a place earns
// its own (components/PlaceGuide.tsx): a place's story is 25–70 words, and a
// page made of that would be a thin copy of its own anchor on /guide/beaches,
// competing with it and dragging the guide cluster — the site's only ranking
// asset — down with it.
//
// So a page is built from new writing, not from the prose the theme guide
// already shows, and only when all of this is true:
//
//   · the owner asked (pageEnabled) and gave it a stable, readable slug;
//   · the slug is not an existing /guide route (static routes win anyway, but a
//     place must never be silently shadowed by one);
//   · it is a place people go to look at — beach, viewpoint or landmark — and it
//     is already an entry on its theme guide, so the page deepens an anchor
//     that exists rather than inventing a subject;
//   · MIN_LONG_READ_CHARS of real long-read prose in English (longRead, plus the
//     story when it is not already inside it) AND in French (longReadFr, plus
//     storyFr) — the French because the French pages are this site's best
//     performers and a place page will want its /fr twin;
//   · MIN_PHOTOS distinct photos;
//   · coordinates that fall on Rodrigues.
//
// Nothing here is ever lowered to make a page appear. On 30 Sep 2026 no place
// in the live content has any of the new fields, so no page ships: that is the
// gate working, not failing.

/** Characters of real prose, per language, before a place gets a page. */
export const MIN_LONG_READ_CHARS = 1200;
/** Distinct photos before a place gets a page. */
export const MIN_PHOTOS = 3;
/** Same ceiling lib/place-slug.ts uses for experience slugs. */
export const MAX_SLUG_LENGTH = 60;

/**
 * The static children of app/guide. Next routes them ahead of [place] whatever
 * this says; the gate refuses them too, so a place asking for one is told no
 * instead of rendering nowhere. lib/guide/location-page-gate.test.ts fails if a
 * new guide directory is added without being listed here.
 */
export const RESERVED_GUIDE_SLUGS: readonly string[] = [
  "beaches",
  "hiking",
  "ile-aux-cocos",
  "rodriguan-food",
  "rodrigues",
  "routes",
  "shops",
  "viewpoints",
];

/** Places people go and look at. A restaurant, shop or petrol pump is a listing, not a location page. */
export const LOCATION_PAGE_CATEGORIES: readonly MapLocation["category"][] = [
  "beach",
  "viewpoint",
  "landmark",
];

const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * "Rivière Banane  Main Beach " → "riviere-banane-main-beach".
 * The same fold lib/place-slug.ts applies to experience names: accents folded
 * rather than dropped, so an anchor is never percent-encoded.
 */
function slugify(name: string | undefined): string {
  const base = (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= MAX_SLUG_LENGTH) return base;
  const cut = base.slice(0, MAX_SLUG_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/**
 * The slug the owner stored, if it is one a URL can carry unchanged:
 * lower-case words joined by single hyphens. Never repaired — a slug is an
 * indexed URL once a page ships, so "Port-Mathurin" is refused rather than
 * quietly lower-cased into a different address than the one he typed.
 */
export function storedSlug(p: Pick<MapLocation, "slug">): string | null {
  const s = (p.slug ?? "").trim();
  return s.length > 0 && s.length <= MAX_SLUG_LENGTH && SLUG_SHAPE.test(s) ? s : null;
}

/**
 * The stored slug, else the name slugified. The name-derived form is used ONLY
 * as an #anchor: a place never gets a page URL without a slug the owner chose,
 * because a name edited in admin would otherwise move an indexed page.
 */
export function placeSlug(p: Pick<MapLocation, "slug" | "name">): string {
  return storedSlug(p) ?? slugify(p.name);
}

/**
 * One anchor per place, unique across the whole map, so /map#x and
 * /guide/beaches#x name the same place and a link built on one page lands on
 * the other. Stored slugs are claimed first (the owner's choice beats a name
 * that happens to slugify the same way); a name that collides, or slugifies to
 * nothing, falls back to the place's id, which is unique and stable.
 */
export function placeAnchors(
  places: readonly Pick<MapLocation, "id" | "slug" | "name">[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const p of places) {
    const s = storedSlug(p);
    if (s && !taken.has(s)) {
      out[p.id] = s;
      taken.add(s);
    }
  }
  for (const p of places) {
    if (out[p.id]) continue;
    let a = slugify(p.name);
    if (!a || taken.has(a)) a = p.id;
    out[p.id] = a;
    taken.add(a);
  }
  return out;
}

/**
 * The place a URL fragment names: "#trou-d-argent" by its anchor, or
 * "#loc-1786897115499" by the admin id that /explore, the homepage and the
 * curated world still link with. Anchors win a tie. Null for anything else,
 * including a fragment that is not valid percent-encoding.
 */
export function placeIdForHash(
  hash: string,
  places: readonly Pick<MapLocation, "id">[],
  anchors: Record<string, string>,
): string | null {
  let want: string;
  try {
    want = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  if (!want) return null;
  const byAnchor = places.find((p) => (anchors[p.id] ?? p.id) === want);
  if (byAnchor) return byAnchor.id;
  return places.find((p) => p.id === want)?.id ?? null;
}

/** Distinct photos, cover first. */
export function photosOf(p: Pick<MapLocation, "image" | "images">): string[] {
  const seen = new Set<string>();
  for (const src of [p.image, ...(p.images ?? [])]) {
    const s = (src ?? "").trim();
    if (s) seen.add(s);
  }
  return [...seen];
}

const LINKS = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/**
 * The paragraphs of a long read that count as writing: one per line, with
 * pasted links, runs of whitespace and the admin placeholder ("Add a
 * description.") removed, and a paragraph pasted twice kept once. The page
 * renders exactly these, so what the gate measured is what a reader gets.
 */
export function longReadParagraphs(main?: string, extra?: string): string[] {
  const clean = (text?: string) =>
    (text ?? "")
      .split(/\n/)
      .map((line) => realProse(line.replace(LINKS, " ").replace(/\s+/g, " ")))
      .filter(Boolean);
  const body = clean(main);
  // No long read, no page — however long the story. The story is already on
  // the theme guide; a page made only of it is the thin copy this gate exists
  // to stop.
  if (body.length === 0) return [];
  const whole = body.join(" ").toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of body) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  for (const p of clean(extra)) {
    const k = p.toLowerCase();
    if (seen.has(k) || whole.includes(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** Characters of real long-read prose, counted as a reader sees them. */
export function longReadChars(main?: string, extra?: string): number {
  return longReadParagraphs(main, extra).reduce((n, p) => n + Array.from(p).length, 0);
}

/** Why a place has no page. Named, so the admin and the owner can be told which. */
export type GateRefusal =
  | "not-requested"
  | "no-slug"
  | "reserved-slug"
  | "not-a-location"
  | "not-on-theme-guide"
  | "short-english"
  | "short-french"
  | "few-photos"
  | "no-coordinates";

/** Every reason this place does not get a page; empty when it does. */
export function locationGateRefusals(p: MapLocation): GateRefusal[] {
  const out: GateRefusal[] = [];
  if (p.pageEnabled !== true) out.push("not-requested");
  const slug = storedSlug(p);
  if (!slug) out.push("no-slug");
  else if (RESERVED_GUIDE_SLUGS.includes(slug)) out.push("reserved-slug");
  if (!LOCATION_PAGE_CATEGORIES.includes(p.category)) out.push("not-a-location");
  else if (!themeGuideOf(p)) out.push("not-on-theme-guide");
  if (longReadChars(p.longRead, p.story) < MIN_LONG_READ_CHARS) out.push("short-english");
  if (longReadChars(p.longReadFr, p.storyFr) < MIN_LONG_READ_CHARS) out.push("short-french");
  if (photosOf(p).length < MIN_PHOTOS) out.push("few-photos");
  if (!(Number.isFinite(p.lat) && Number.isFinite(p.lng) && isOnRodrigues(p.lat, p.lng))) {
    out.push("no-coordinates");
  }
  return out;
}

/** True only when every condition in the header holds. */
export function passesLocationGate(p: MapLocation): boolean {
  return locationGateRefusals(p).length === 0;
}

const nameKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The places that get a page, in the owner's order. Two places asking for one
 * slug, or carrying one name (and so one <title>), cannot both have a page: the
 * first keeps it and the second stays a section, visibly, rather than two pages
 * fighting over one URL or one search result.
 */
export function locationPages<T extends MapLocation>(all: readonly T[]): T[] {
  const slugs = new Set<string>();
  const names = new Set<string>();
  const out: T[] = [];
  for (const p of all) {
    if (!passesLocationGate(p)) continue;
    const slug = storedSlug(p)!;
    const name = nameKey(p.name);
    if (slugs.has(slug) || names.has(name)) continue;
    slugs.add(slug);
    names.add(name);
    out.push(p);
  }
  return out;
}

/** The page of a place that has one, by slug. */
export function findLocationPage<T extends MapLocation>(all: readonly T[], slug: string): T | undefined {
  return locationPages(all).find((p) => storedSlug(p) === slug);
}

/** map-location id → /guide/<slug>, for every place that has a page. */
export function locationPageHrefs(all: readonly MapLocation[]): Record<string, string> {
  return Object.fromEntries(locationPages(all).map((p) => [p.id, `/guide/${storedSlug(p)}`]));
}
