import type { Language } from "@/lib/i18n";
import { RIDES_COPY } from "./copy.i18n";

// ── THE SENTENCE A STUCK CUSTOMER READS ─────────────────────────────────────
//
// /api/rides/track used to answer with finished English prose in `error`, and
// the tracking screen rendered whatever arrived. So a French customer who
// mistyped a reference met an English sentence at the one moment they were
// already stuck — the worst possible place for the site to change language.
//
// A client cannot translate a sentence it did not author. So the route returns
// a CODE and the words come from the dictionary.
//
// This lives in its own module rather than inside the screen for one reason:
// the screen is a client component full of map wiring, and this is a pure
// function that decides what a person reads when something has gone wrong.
// That deserves a test, and a test deserves something it can import.

export type TrackFailure = {
  /** The machine-readable reason. Added to the route alongside `error`. */
  code?: string | null;
  /** The route's own English prose. A fallback for a build that predates
   *  `code`, never the first choice. */
  error?: string | null;
};

/**
 * What to show the customer when a lookup fails.
 *
 * Unknown codes fall through deliberately: a code this build has never heard of
 * is likelier to be a newer server than a bug, and the server's sentence beats
 * a generic one. Only when there is nothing at all does it reach for the
 * dictionary's shortest line.
 */
export function trackErrorMessage(
  language: Language,
  failure: TrackFailure,
): string {
  const c = RIDES_COPY[language].track;
  switch (failure.code) {
    case "missing_fields":
      return c.errors.missingFields;
    case "not_found":
      return c.errors.notFoundFull;
    case "server":
      return c.errors.server;
    default:
      return failure.error ?? c.errors.notFound;
  }
}

/** Every code the route can send. Kept beside the mapping so they cannot drift. */
export const TRACK_ERROR_CODES = [
  "missing_fields",
  "not_found",
  "server",
] as const;
