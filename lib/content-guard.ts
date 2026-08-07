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

/** Collections whose sudden collapse indicates data loss rather than an edit. */
const GUARDED = [
  'fleet',
  'mapLocations',
  'events',
  'faq',
  'quickAccess',
  'homeCards',
  'rideRoutes',
  'usefulContacts',
  'plannerActivities',
] as const;

export type ContentGuardVerdict = { ok: true } | { ok: false; reason: string };

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
  const present = GUARDED.filter((k) => candidate[k] !== undefined);
  if (present.length === 0) {
    return { ok: false, reason: 'The content payload contained none of the expected sections — it looks truncated.' };
  }

  // Nothing stored yet (first run): accept whatever shape arrives.
  if (!current) return { ok: true };

  for (const key of GUARDED) {
    // An omitted key is left untouched by the caller's merge — not a deletion.
    if (candidate[key] === undefined) continue;
    const before = count(current[key]);
    const after = count(candidate[key]);
    if (before >= 4 && after < Math.ceil(before * SHRINK_FLOOR)) {
      return {
        ok: false,
        reason:
          `Refused: "${key}" would drop from ${before} to ${after} items in one save. ` +
          `If this is intentional, remove them in smaller batches.`,
      };
    }
  }

  return { ok: true };
}
