"use client";

import { useReportWebVitals } from "next/web-vitals";
import posthog from "posthog-js";

// ── CORE WEB VITALS, BESIDE THE TRAFFIC THEY AFFECT ─────────────────────────
//
// Vercel Speed Insights already measures these — it is mounted in the root
// layout. The problem is not measurement, it is that the numbers live in a
// different dashboard from the traffic, so nobody ever puts a slow page next to
// its bounce rate. A page that takes four seconds and loses half its visitors
// looks fine in both tools separately.
//
// Sending them to PostHog as well means the owner's own panel can rank pages by
// p75 LCP and show the visit count beside it, which is the form the finding
// actually takes: not "this page is slow" but "this page is slow AND busy".
//
// ── WHAT IS DELIBERATELY NOT SENT ───────────────────────────────────────────
// No id, no session, no referrer, no device string. A web vital is a fact about
// a PAGE, not about the person who loaded it, and everything needed to act on
// it is in the four properties below. `scrubPostHogEvent` would strip PII
// anyway; the point is not to write it in the first place.

/** Google's thresholds, so `rating` can be trusted rather than recomputed. */
const GOOD = { LCP: 2500, INP: 200, CLS: 100, FCP: 1800, TTFB: 800 } as const;

export default function WebVitals() {
  useReportWebVitals((metric) => {
    // CLS is a unitless ratio in the 0–1 range, so it is sent ×1000 as an
    // integer. Every other metric is milliseconds. Without this, CLS rounds to
    // 0 and the metric silently reports perfection.
    const value = Math.round(
      metric.name === "CLS" ? metric.value * 1000 : metric.value,
    );

    posthog.capture("web_vital", {
      metric: metric.name,
      value,
      // Chrome's own verdict where it gives one, ours where it does not.
      rating:
        metric.rating ??
        (value <= (GOOD[metric.name as keyof typeof GOOD] ?? Infinity)
          ? "good"
          : "poor"),
      // The path, never the full URL: a query string can carry a booking
      // reference or an email on this site.
      path: typeof window === "undefined" ? "" : window.location.pathname,
    });
  });

  return null;
}
