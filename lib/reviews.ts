// ── WHERE A REVIEW ACTUALLY GOES ────────────────────────────────────────────
//
// One destination, written once, for every "Leave a review" button this
// platform emails.
//
// ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
//
// Two senders each carried their own copy of the same twelve-line comment and
// the same expression:
//
//     process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#contact`
//
// GOOGLE_REVIEW_URL has never been set — not in .env.local, not anywhere — so
// every review request this business has ever sent dropped the customer at a
// section of its own homepage. The review funnel has been pointing at itself
// since launch, on a site whose reviews section reads "Be the first to leave
// a review".
//
// The owner supplied the real destination on 23 September 2026. Resolving the
// share link gives:
//
//   https://www.google.com/search?q=Roule+Rodrigues&kgmid=/g/11nvxr_s3t&…
//
// — `kgmid` being the Knowledge Graph id of the Roulé Rodrigues business
// entity, and `source=sh/x/loc/…` marking it as shared from the local
// listing. It is his Google Business Profile, which is the one place a review
// helps the business twice: future customers read it, and Google ranks on it.
//
// The env var still wins if somebody sets it, because a destination the owner
// can change without a deploy is worth keeping. It is an escape hatch now
// rather than the only route — the fallback below is a real link, not a guess.

/** The owner's Google Business Profile, as he supplied it. */
export const GOOGLE_REVIEW_LINK = "https://share.google/YljFB8HExNjCmKL5K";

/**
 * Where a review button points.
 *
 * Read at call time, not at module load: a cron that has been warm for hours
 * should still pick up a changed environment.
 */
export function reviewUrl(): string {
  return process.env.GOOGLE_REVIEW_URL || GOOGLE_REVIEW_LINK;
}

/**
 * The button's words, bilingual like every other customer-facing string here.
 *
 * One label, so the scooter, the excursion and the shop order all ask in the
 * same voice — and so it cannot drift into three slightly different asks.
 */
export const REVIEW_CTA = "⭐ Leave a review · Laisser un avis";

/**
 * Why it is worth thirty seconds, in both languages.
 *
 * Kept here rather than retyped per sender: the reason is the same whatever
 * was bought, and a small business asking for help is more persuasive than a
 * platform asking for engagement.
 */
export const REVIEW_ASK = {
  en: "A quick review means the world to a small island business — it takes about 30 seconds and helps other travellers find us.",
  fr: "Un petit avis compte énormément pour une petite entreprise locale — cela prend 30 secondes et aide d'autres voyageurs à nous trouver.",
} as const;
