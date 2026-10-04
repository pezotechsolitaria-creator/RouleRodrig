import { CONTENT_COLLECTIONS } from "@/lib/content-guard";
import type { SiteContent } from "@/lib/defaults";

// ── What a content snapshot would change (architecture review 2026-09-30,
// item 6) ───────────────────────────────────────────────────────────────────
//
// The daily cron copies site_content into site_content_history whenever it has
// changed and keeps 90 days (app/api/cron/reminders). Nothing could read those
// copies back: recovering from a bad save meant SQL. The history desk lists
// them, says which top-level sections differ from the site as it is now, and
// restores one.
//
// Pure and client-safe: the route computes with it, the desk labels with it,
// and a test drives it with real content shapes.

/** Owner-facing names for the top-level sections of the blob. */
const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  stats: "Stats",
  promoSlides: "Promo slides",
  fleet: "Vehicles",
  pricing: "Price table",
  contact: "Contact info",
  gallery: "Gallery",
  galleryEnabled: "Gallery switch",
  testimonials: "Featured reviews",
  social: "Social links",
  branding: "Branding",
  legal: "Legal identity",
  terms: "Terms",
  refunds: "Refund policy",
  announcement: "Announcement bar",
  mapLocations: "Island guide places",
  plannerActivities: "Trip planner",
  rideRoutes: "Routes & trails",
  vehicleCategories: "Vehicle categories",
  usefulContacts: "Useful numbers",
  events: "What's On notices",
  sponsorsEnabled: "Sponsors switch",
  sponsors: "Sponsors",
  gettingAround: "Getting around",
  faq: "FAQ",
  recommended: "Stays, activities & services",
  foodConcierge: "Food WhatsApp help",
  experience: "Experience photos",
  quickAccess: "Home tiles",
  homeCards: "Home cards",
};

export function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key;
}

/**
 * Top-level keys whose value differs between two raw blobs, in a stable order.
 * A key present on one side only counts as different. JSON comparison, the
 * same test the content PUT's audit line uses for "changed".
 */
export function changedSections(a: unknown, b: unknown): string[] {
  const ra = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const rb = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  return [...keys].filter((k) => JSON.stringify(ra[k]) !== JSON.stringify(rb[k])).sort();
}

export type CollectionCount = { key: string; label: string; now: number; then: number };

/**
 * The guarded collections, counted in the current blob and in the snapshot —
 * only those whose count differs. This is what the confirm step shows before a
 * restore: "Island guide places 42 → 38" is the sentence that stops the wrong
 * snapshot being restored.
 */
export function collectionChanges(current: unknown, snapshot: unknown): CollectionCount[] {
  const cur = (current && typeof current === "object" ? current : {}) as Partial<SiteContent>;
  const snap = (snapshot && typeof snapshot === "object" ? snapshot : {}) as Partial<SiteContent>;
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return CONTENT_COLLECTIONS.map((g) => ({
    key: g.key,
    label: g.label,
    now: n(g.items(cur)),
    then: n(g.items(snap)),
  })).filter((c) => c.now !== c.then);
}

/** Snapshots per page on the desk. Each is the whole ~150 kB blob. */
export const HISTORY_PAGE_SIZE = 10;
