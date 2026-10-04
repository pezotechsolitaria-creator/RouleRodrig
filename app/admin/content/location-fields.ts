import type { MapLocation, RecommendedPlace } from "@/lib/defaults";
import {
  MIN_LONG_READ_CHARS,
  MIN_PHOTOS,
  RESERVED_GUIDE_SLUGS,
  locationGateRefusals,
  longReadChars,
  photosOf,
  placeSlug,
  storedSlug,
  type GateRefusal,
} from "@/lib/guide/location-page-gate";

// ── THE ISLAND GUIDE EDITOR'S NEW FIELDS, AS RULES (architecture review
// 2026-09-30, item 2) ───────────────────────────────────────────────────────
//
// MapLocation gained slug, area, pageEnabled, longRead/longReadFr and
// relatedListingIds (lib/defaults.ts). What decides whether a place gets its
// own page at /guide/<slug> is lib/guide/location-page-gate.ts, and this file
// never second-guesses it: the checklist below is built FROM the gate's own
// refusals and its own measures (longReadChars, photosOf), so the admin can
// never show a green tick for a condition the page will refuse. Nothing here
// lowers a threshold.
//
// Pure and client-safe so the studio can import it and a test can drive it.

/** The slug the guide would use for this name: the gate's own fold. */
export function slugFromName(name: string): string {
  return placeSlug({ slug: undefined, name });
}

/** Stored slugs of every OTHER place, so two places never claim one URL. */
function slugsOf(others: readonly MapLocation[]): Set<string> {
  const out = new Set<string>();
  for (const o of others) {
    const s = storedSlug(o);
    if (s) out.add(s);
  }
  return out;
}

/**
 * A suggestion from the name, made unique against the other places by a
 * numeric suffix. A reserved guide slug is NOT suffixed away: "ile-aux-cocos"
 * for the Île aux Cocos pin is the right anchor even though that URL already
 * belongs to a hand-written page, and the checklist says why no second page
 * can be made from it.
 */
export function suggestSlug(name: string, others: readonly MapLocation[]): string {
  const base = slugFromName(name);
  if (!base) return "";
  const taken = slugsOf(others);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const s = `${base}-${n}`;
    if (!taken.has(s)) return s;
  }
  return "";
}

/**
 * What the owner types, shaped as he types it: lower case, accents folded,
 * anything else becomes one hyphen. Trailing hyphens are left alone mid-word
 * (the next letter is coming) — storedSlug() refuses them if they survive, and
 * the problem line below says so.
 */
export function slugInput(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
}

/** Why this slug cannot be used, or null. */
export function slugProblem(place: MapLocation, others: readonly MapLocation[]): string | null {
  const raw = (place.slug ?? "").trim();
  if (!raw) return null;
  const s = storedSlug(place);
  if (!s) return "Use lower-case words joined by single hyphens, e.g. port-mathurin.";
  if (slugsOf(others).has(s)) return "Another place already uses this slug. Each place needs its own.";
  if (RESERVED_GUIDE_SLUGS.includes(s)) {
    return `/guide/${s} is already a guide page, so it cannot become this place's page. It still works as the place's #anchor.`;
  }
  return null;
}

/**
 * Switching "give this place its own page" ON. Locks the slug, so it must be a
 * good one first: the stored slug if valid, else the suggestion from the name.
 * Returns the patch to apply, or the sentence saying why not.
 */
export function enablePagePatch(
  place: MapLocation,
  others: readonly MapLocation[],
): { patch: Partial<MapLocation> } | { refused: string } {
  const current = (place.slug ?? "").trim();
  const slug = current ? current : suggestSlug(place.name, others);
  const candidate = { ...place, slug };
  if (!slug) return { refused: "Give the place a name or a slug first — the page needs a web address." };
  const problem = slugProblem(candidate, others);
  if (problem) return { refused: problem };
  return { patch: { pageEnabled: true, slug } };
}

export type ChecklistLine = { ok: boolean; label: string };

const has = (r: GateRefusal[], ...codes: GateRefusal[]) => codes.some((c) => r.includes(c));

/**
 * The gate's conditions as the owner reads them, each with the live figure.
 *
 * Built with pageEnabled forced on, so the list answers "what would this page
 * still need?" whether or not the owner has asked for it yet.
 */
export function pageChecklist(place: MapLocation): ChecklistLine[] {
  const refusals = locationGateRefusals({ ...place, pageEnabled: true });
  const en = longReadChars(place.longRead, place.story);
  const fr = longReadChars(place.longReadFr, place.storyFr);
  const photos = photosOf(place).length;
  const min = MIN_LONG_READ_CHARS.toLocaleString("en-US");
  return [
    {
      ok: !has(refusals, "no-slug", "reserved-slug"),
      label: "A web address (slug) that no guide page already uses",
    },
    {
      ok: !has(refusals, "not-a-location", "not-on-theme-guide"),
      label: "A beach, viewpoint or landmark that already has a description on its guide page",
    },
    {
      ok: !has(refusals, "short-english"),
      label: `English long read: ${en.toLocaleString("en-US")} of ${min} characters`,
    },
    {
      ok: !has(refusals, "short-french"),
      label: `French long read: ${fr.toLocaleString("en-US")} of ${min} characters`,
    },
    { ok: !has(refusals, "few-photos"), label: `Photos: ${photos} of ${MIN_PHOTOS}` },
    { ok: !has(refusals, "no-coordinates"), label: "Coordinates that fall on Rodrigues" },
  ];
}

/** The listings the owner can link, named, with the ones already chosen first. */
export function listingOptions(
  listings: readonly RecommendedPlace[],
  chosen: readonly string[],
): { id: string; name: string; hidden: boolean; chosen: boolean }[] {
  const picked = new Set(chosen);
  return listings
    .filter((l) => l.id && l.name?.trim())
    .map((l) => ({ id: l.id, name: l.name.trim(), hidden: l.hidden === true, chosen: picked.has(l.id) }))
    .sort((a, b) => Number(b.chosen) - Number(a.chosen) || a.name.localeCompare(b.name));
}

/** Chosen ids that no longer match any listing — shown so they can be cleared. */
export function staleListingIds(listings: readonly RecommendedPlace[], chosen: readonly string[]): string[] {
  const ids = new Set(listings.map((l) => l.id));
  return chosen.filter((id) => !ids.has(id));
}

/** Toggle one listing id, leaving no empty array behind in the blob. */
export function toggleListing(chosen: readonly string[] | undefined, id: string): string[] | undefined {
  const list = chosen ?? [];
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return next.length ? next : undefined;
}

/** The other places' areas, for a suggestion list that keeps spellings consistent. */
export function knownAreas(places: readonly MapLocation[]): string[] {
  const seen = new Map<string, string>();
  for (const p of places) {
    const a = p.area?.trim();
    if (a && !seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
