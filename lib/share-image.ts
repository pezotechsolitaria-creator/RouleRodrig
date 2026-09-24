import { SITE_URL } from "./site";

// ── THE PICTURE ON A SHARED LINK ────────────────────────────────────────────
//
// ── THE TRAP THIS EXISTS FOR ────────────────────────────────────────────────
//
// Next.js does NOT deep-merge `openGraph`. A page that exports
//
//     openGraph: { title, description }
//
// REPLACES the whole block the root layout set — including its `images`. The
// page keeps a title and a description and silently loses its picture, and
// nothing anywhere reports it: the build passes, the page renders, and the
// only symptom is a blank grey rectangle in somebody else's chat window.
//
// Twelve pages were in that state, among them /about, /faq, /map, /guide,
// /trip-planner and four of the French pages. On an island where WhatsApp is
// how a link actually travels, a blank card is most of what a share is worth.
//
// So: one image, one helper, and a test that walks every public route and
// fails if a declared openGraph or twitter block has no images.

/**
 * The fallback share card.
 *
 * The ROOT layout does better than this — it prefers the hero image the owner
 * has set in the CMS, so the card follows the season he is actually selling.
 * It can do that because it is already async. A page's own metadata usually
 * is not, and a slightly dated picture is worth far more than none, so every
 * per-page override falls back to the bundled file rather than reaching for
 * the database and making itself uncacheable.
 */
export const SHARE_IMAGE_URL = `${SITE_URL}/og-image.jpg`;

const DEFAULT_ALT =
  "Roule Rodrigues — rent a scooter or car and explore Rodrigues Island";

/**
 * The `images` array an openGraph block needs.
 *
 * Spread it into every page-level openGraph. The dimensions are the ones
 * Facebook, WhatsApp and LinkedIn all read; omitting them makes a scraper
 * fetch the file before it can decide how to crop it, which on a slow link is
 * the difference between a card and no card.
 */
export function ogImages(alt: string = DEFAULT_ALT) {
  return [{ url: SHARE_IMAGE_URL, width: 1200, height: 630, alt }];
}

/** Twitter takes a bare URL list rather than objects. */
export function twitterImages(): string[] {
  return [SHARE_IMAGE_URL];
}
