import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { SENTRY_COMMON } from "@/lib/sentry-scrub";

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (!posthogProjectToken) {
  if (process.env.NODE_ENV === "development") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
    );
  }
} else {
  posthog.init(posthogProjectToken, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
    capture_exceptions: true,
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
