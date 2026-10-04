import type { SiteContent } from './defaults';

// ── The last line of defence for the owner's content ────────────────────────
//
// /api/admin/content PUT replaces the ENTIRE site_content blob in one write.
// Until 2026-08-08 it did `(await req.json()) as SiteContent` — a bare
// TypeScript cast, which checks nothing at runtime — and handed it straight to
// saveContent(). Three realistic ways that destroys the live site:
//
//   1. getContent() silently falls back to DEFAULT_CONTENT when Supabase is
//      unreachable, so /admin can render the seed defaults as if they were
//      real. One "Save Changes" then overwrites years of the owner's work.
//   2. A truncated or malformed request body (dropped mobile connection
//      mid-PUT) writes a partial blob; mergeWithDefaults() then quietly
//      backfills the rest, so the site *looks* fine while the owner's fleet,
//      map locations and copy are gone.
//   3. A stale second tab saves its hours-old snapshot over newer edits.
//
// This module refuses the writes that cannot be honest mistakes worth keeping.
// It is deliberately a SHRINK guard, not a schema validator: the owner must
// stay free to delete things on purpose, but never to lose everything at once
// to a blip. Deleting the last scooter is legitimate; going from 12 scooters
// and 40 map pins to zero in a single request is not.

/**
 * Collections whose sudden collapse indicates data loss rather than an edit.
 *
 * ── WHY EACH ENTRY SAYS WHERE ITS LIST LIVES (architecture review 2026-09-30,
 * item 4) ─────────────────────────────────────────────────────────────────
 * This was a list of top-level keys counted with Array.isArray, and two of the
 * largest collections on the site slipped through it:
 *
 *   · `faq` was listed, but SiteContent.faq is an OBJECT ({ enabled, title,
 *     subtitle, items }). count() returned 0 for it before and after every
 *     save, so the FAQ was never protected at all. The test passed only because
 *     it faked faq as an array.
 *   · recommended.items — every stay, activity and service on the site — was
 *     not listed. One bad save could empty the catalogue.
 *
 * So each entry now names the section that must be present for the check to
 * apply, and how to reach the list inside it. `label` is what the owner reads
 * in the refusal, because the studio now shows that sentence instead of
 * "Error".
 */
export type Guarded = {
  key: string;
  label: string;
  section: keyof SiteContent;
  items: (c: Partial<SiteContent>) => unknown;
};

const top = (section: keyof SiteContent, label: string): Guarded => ({
  key: section,
  label,
  section,
  items: (c) => c[section],
});

const GUARDED: Guarded[] = [
  top('fleet', 'vehicles'),
  top('mapLocations', 'map places'),
  top('events', "What's On notices"),
  top('quickAccess', 'home tiles'),
  top('homeCards', 'home cards'),
  top('rideRoutes', 'routes & trails'),
  top('usefulContacts', 'useful numbers'),
  top('plannerActivities', 'trip planner activities'),
  { key: 'faq.items', label: 'FAQ questions', section: 'faq', items: (c) => c.faq?.items },
  {
    key: 'recommended.items',
    label: 'stays, activities & services',
    section: 'recommended',
    items: (c) => c.recommended?.items,
  },
];

/**
 * The same collections, for screens that show counts before a whole-blob write
 * (the content history restore). One list, so the history screen can never
 * count differently from the guard that decides what a save may do.
 */
export const CONTENT_COLLECTIONS: readonly Guarded[] = GUARDED;

export type ContentGuardVerdict = { ok: true } | { ok: false; reason: string };

// A section that IS present but whose list is missing or not an array counts
// as zero. That is deliberate: mergeWithDefaults() backfills a missing
// faq.items with the SEED questions, so `faq: { enabled: true }` would quietly
// replace the owner's FAQ with the defaults — a wipe that looks like content.
const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Items may drop to this fraction of the stored count before we refuse. */
const SHRINK_FLOOR = 0.5;

/**
 * Decides whether `next` may replace `current`.
 *
 * Pure and synchronous so it can be tested exhaustively — this is the only
 * thing standing between a bad request and an irreversible overwrite of the
 * live site.
 */
export function contentSaveVerdict(next: unknown, current: SiteContent | null): ContentGuardVerdict {
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    return { ok: false, reason: 'The content payload was not an object.' };
  }
  const candidate = next as Partial<SiteContent>;

  // A payload missing every guarded collection is a truncated body, not an edit.
  const present = GUARDED.filter((g) => candidate[g.section] !== undefined);
  if (present.length === 0) {
    return { ok: false, reason: 'The content payload contained none of the expected sections — it looks truncated.' };
  }

  // Nothing stored yet (first run): accept whatever shape arrives.
  if (!current) return { ok: true };

  for (const g of GUARDED) {
    // An omitted section is left untouched by the caller's merge — not a deletion.
    if (candidate[g.section] === undefined) continue;
    const before = count(g.items(current));
    const after = count(g.items(candidate));
    if (before >= 4 && after < Math.ceil(before * SHRINK_FLOOR)) {
      return {
        ok: false,
        reason:
          `Refused: ${g.label} ("${g.key}") would drop from ${before} to ${after} items in one save. ` +
          `If this is intentional, remove them in smaller batches.`,
      };
    }
  }

  return { ok: true };
}
