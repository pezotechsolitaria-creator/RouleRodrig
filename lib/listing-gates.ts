import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── A LISTING PAGE WITH NOTHING LISTED IS NOT A PAGE TO INDEX ───────────────
//
// SEO audit 2026-09-29 C16/T4. /events ("Nothing on sale right now"), /shop
// ("The island's shops are coming online"), /marketplace/wash ("No car washes
// listed yet") and /experiences/chauffeur were all 200, indexable and in the
// sitemap with no inventory — what Google classes as a soft 404, and each a
// promise in a snippet the page could not keep.
//
// The rule, in one place so the sitemap and the pages cannot disagree: a
// listing page is submitted and indexable while it has something on it, and
// `noindex, follow` while it is KNOWN to be empty. Follow stays on so its links
// still pass, and it re-enters on its own the moment the first item goes live —
// nothing to remember, no switch to throw.
//
// "Known" matters. A read that failed is not an empty shelf: `null` means we
// could not tell, and an unknown page keeps the behaviour it had before this
// file existed — indexable — rather than being de-indexed by a DB hiccup.

export const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/** Robots for a listing page, from how many things it lists (null = unknown). */
export function robotsWhileEmpty(count: number | null): Pick<Metadata, "robots"> {
  return count === 0 ? { robots: NOINDEX_FOLLOW } : {};
}

/**
 * /events has something on it: a public event of any phase (past ones still
 * render, with their own indexable pages) or a titled notice on the owner's
 * noticeboard (site_content.events — a blank title is a half-created row, the
 * same filter app/events/page.tsx applies).
 *
 * Either side may be null — a read that could not be trusted: the events
 * (knownPublicEventCount) or the noticeboard (site_content fell back to its
 * defaults, see contentWasRead). Whatever WAS read still proves the page has
 * something on it; without that, the answer is unknown, never zero.
 */
export function eventsPageItemCount(
  publicEvents: number | null,
  notices: { title?: string | null }[] | null,
): number | null {
  const titled = notices ? notices.filter((n) => n.title?.trim()).length : 0;
  const seen = (publicEvents ?? 0) + titled;
  if (publicEvents === null || notices === null) return seen > 0 ? seen : null;
  return seen;
}

/**
 * Whether getContent() reached the stored row. It swallows a failed read and
 * answers DEFAULT_CONTENT, whose recommended.items is [] — and the live site
 * has dozens of listings there, so an entirely empty list is the failure, not
 * a quiet week. A list read off the defaults is unknown, not empty.
 */
export function contentWasRead(content: {
  recommended?: { items?: readonly unknown[] | null } | null;
}): boolean {
  return (content.recommended?.items?.length ?? 0) > 0;
}

/**
 * How many public events there are, where [] from listPublicEvents() can be
 * trusted as "none".
 *
 * listPublicEvents() answers [] on a failed read as well as on an empty table,
 * and a DB hiccup must not noindex /events or drop it from the sitemap while it
 * has events on it. So an empty list is checked once more with a head-only
 * count under the same RLS (events_public_read): an error there is unknown
 * (null), and a count above zero means the list and the table disagree —
 * unknown too, so the page keeps its old, indexable behaviour. Only a count
 * of zero is a known-empty shelf. A non-empty list needs no second read.
 */
export async function knownPublicEventCount(
  supabase: SupabaseClient,
  listed: number,
): Promise<number | null> {
  if (listed > 0) return listed;
  try {
    const { count, error } = await supabase
      .from("events")
      .select("store_id", { count: "exact", head: true });
    if (error || typeof count !== "number") return null;
    return count === 0 ? 0 : null;
  } catch {
    return null;
  }
}

/**
 * How many listings a slice of site_content.recommended holds (one service
 * vertical's, say), or null when the content could not be read — "this
 * vertical has nothing" and "nothing could be read" look identical from the
 * slice alone (see contentWasRead). Unknown keeps the page listed and
 * indexable, by the rule at the top of this file.
 */
export function recommendedCount(
  content: { recommended?: { items?: readonly unknown[] | null } | null },
  matching: readonly unknown[],
): number | null {
  return contentWasRead(content) ? matching.length : null;
}
