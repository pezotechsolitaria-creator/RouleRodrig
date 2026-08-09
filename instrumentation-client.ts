import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { SENTRY_COMMON } from "@/lib/sentry-scrub";

// Both spellings are accepted on purpose. `.env.production` in this repo sets
// NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, but the dashboard calls it "project API
// key" and it is easy to add it to Vercel as NEXT_PUBLIC_POSTHOG_KEY instead.
// A real environment variable outranks the .env.production file, but only if
// the *name* matches — so a var under the other name would otherwise sit there
// looking configured while PostHog silently received nothing. Reading both
// means whichever name the value was set under, it is picked up.
//
// NEXT_PUBLIC_* is inlined by Next at build time, so these must stay written
// out as full literal property accesses, not built up dynamically.
//
// `||` and not `??` on purpose: a variable that exists but is blank is the
// common way this gets misconfigured, and an empty string is not nullish, so
// `??` would accept "" as a real token and initialise PostHog to nothing.
const posthogProjectToken =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ||
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// Same trap, worse consequence. A platform variable outranks .env.production
// even when it is blank, and posthog-js treats a blank api_host as a relative
// URL — so events would POST to roulerodrig.com/e/ and 404 into nothing, while
// the browser console shows no error at all. Falling back on empty keeps the
// EU host that the project actually lives on.
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

if (!posthogProjectToken) {
  // Warn, never throw. This module runs on every page load, so throwing here
  // takes the whole client down — and local dev legitimately has no PostHog
  // token (`.env.production` is not read in dev, and .env.local has no
  // PostHog entry). Analytics being absent must not stop the site running.
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "PostHog: no NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN set — analytics disabled for this session.",
    );
  }
} else {
  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    defaults: "2026-01-30",

    // Session Replay off, in code rather than by dashboard toggle. It records
    // the DOM, which on this site means a customer's name, phone number and
    // delivery address as they type them into checkout. Same reasoning as the
    // Sentry block below — and a dashboard setting is not a durable guarantee,
    // because anyone with project access can flip it back without review.
    disable_session_recording: true,

    // Exception capture off: Sentry owns error tracking here and scrubs PII on
    // the way out (lib/sentry-scrub.ts). PostHog has no equivalent scrubbing,
    // so letting it also swallow exceptions would quietly create a second,
    // unscrubbed copy of error payloads that can carry customer data.
    capture_exceptions: false,

    debug: process.env.NODE_ENV === "development",
  });
}

// Browser Sentry init. Replaces the old sentry.client.config.ts in Next 16.
//
// Same SENTRY_COMMON as the server, so the deny-list and the redaction rules are
// identical in both places. A form field in a browser event is exactly as
// sensitive as a request body on the server, and this app's forms carry names,
// phone numbers and delivery coordinates.
Sentry.init({
  ...SENTRY_COMMON,

  // Session Replay is deliberately NOT enabled. It records the DOM, which on
  // this site means a customer's name, phone number and delivery address as
  // they type them into checkout. Scrubbing a replay is far harder to get right
  // than scrubbing a JSON payload, and the debugging value does not justify
  // storing a recording of someone's private details in a third party.
  integrations: [],
});

// Lets Sentry tie a client error to the route the user was on, which is the
// first question anyone asks about a browser exception.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
