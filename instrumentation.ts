import * as Sentry from "@sentry/nextjs";
import { SENTRY_COMMON } from "@/lib/sentry-scrub";

// Server + edge Sentry init. Next runs this once per runtime before anything
// else, which is why it replaces the old sentry.server.config.ts.
//
// Both runtimes share SENTRY_COMMON so the scrubbing rules cannot drift between
// them — a leak only has to be possible in ONE runtime to be a leak.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(SENTRY_COMMON);
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    // middleware.ts runs here: the canonical-host redirect, the /admin cookie
    // gate and the /merchant auth gate. An exception in any of those locks
    // people out of the site, so it is worth capturing.
    Sentry.init(SENTRY_COMMON);
  }
}

// Captures errors thrown inside Server Components, Server Actions and route
// handlers — the layer where checkout, orders and payments actually live, and
// where a failure previously produced nothing but a console.error in a Vercel
// log nobody reads.
export const onRequestError = Sentry.captureRequestError;
