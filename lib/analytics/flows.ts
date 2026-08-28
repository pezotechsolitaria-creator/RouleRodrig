"use client";

import posthog from "posthog-js";

// ── THE DELIVERY AND RIDE FUNNELS, NAMED ONCE ───────────────────────────────
//
// The sibling of lib/marketplace/analytics.ts, for the same reason and with the
// same rules. Not a second analytics system: a thin wrapper over the posthog-js
// client already loaded in instrumentation-client.ts, so every event still
// passes through lib/posthog-scrub.ts on the way out.
//
// It exists because the events ARE the funnel. `deliver_step_advanced` fired
// from two places with two property names is two metrics that cannot be
// compared, and the question this platform most needs answered — the delivery
// flow was rebuilt to fit a phone without scrolling, did that change anything —
// is exactly the one a drifting event name makes unanswerable.
//
// ── WHAT NEVER GOES IN A PROPERTY BAG ──────────────────────────────────────
// Enums, counts, booleans. No name, no phone, no email, no address, no place
// NAME, no reference code. Note that place names are different here from the
// marketplace: a shop name is business data, but "where a person is being
// collected from" is about a person, and on an island of 43,000 a village plus
// a timestamp is not anonymous. `scrubPostHogEvent` would strip the obvious
// fields, and relying on the scrub for something we could simply not send is
// backwards.

type Props = Record<string, string | number | boolean | null | undefined>;

function capture(event: string, props: Props = {}) {
  try {
    posthog.capture(event, props);
  } catch {
    // Analytics must never be able to break a booking. If posthog-js has not
    // loaded, or an ad blocker removed it, the customer still gets their ride.
  }
}

// ── Ti Roulé delivery ───────────────────────────────────────────────────────

/**
 * A screen of the delivery flow was completed.
 *
 * Per-step rather than one "started/finished" pair, because the flow is four
 * screens and the useful finding is WHICH one loses people. A single completion
 * rate cannot tell "nobody can find the date picker" from "nobody wanted to".
 */
export function deliverStepAdvanced(fromStep: number, toStep: number) {
  capture("deliver_step_advanced", { from_step: fromStep, to_step: toStep });
}

/** The request was accepted by the server and now exists for drivers to see. */
export function deliverRequestPosted(p: {
  kind: string;
  scheduleKind: string;
  hasPhoto: boolean;
}) {
  capture("deliver_request_posted", {
    kind: p.kind,
    schedule_kind: p.scheduleKind,
    has_photo: p.hasPhoto,
  });
}

// ── Taxi, transfers and private hire ────────────────────────────────────────

/**
 * A price was shown to the customer.
 *
 * The step before the booking, and the one that tells you whether quoting is
 * even reaching people. If ride_request_submitted is low but this is lower,
 * the problem is upstream of the price and not the price itself.
 */
export function rideQuoteShown(p: { service: string; flat: boolean }) {
  capture("ride_quote_shown", { service: p.service, flat: p.flat });
}

/** The ride request was accepted by the server. */
export function rideRequestSubmitted(p: {
  service: string;
  direction: "to" | "from" | null;
  whenKind: string;
}) {
  capture("ride_request_submitted", {
    service: p.service,
    // Null for services with no fixed end — taxi, hotel, private hire.
    direction: p.direction,
    when_kind: p.whenKind,
  });
}

// ── Everywhere ──────────────────────────────────────────────────────────────

/**
 * Somebody left for WhatsApp.
 *
 * A handoff is the end of what this site can see, so it is the last honest
 * data point on several journeys — the taxi directory has no other conversion
 * at all. `context` says which journey, never who or where.
 */
export function whatsappHandoff(context: string) {
  capture("whatsapp_handoff", { context });
}

/**
 * Somebody opened the island assistant.
 *
 * `source_path` is where they were standing when they gave up looking and
 * asked instead — which is a list of pages that did not answer their question,
 * ranked by how often it happens.
 */
export function tirouleOpened(sourcePath: string) {
  capture("tiroule_opened", { source_path: sourcePath });
}

/**
 * A question was asked, and whether anything was found for it.
 *
 * `matched: false` is the valuable half. It is a content backlog written by the
 * island's own visitors: every question the site could not answer, in the words
 * they used. lead_events already records the miss TEXT; this records the RATE,
 * so "is Ti Roulé getting better" becomes a question with an answer.
 *
 * The question itself is deliberately NOT sent here — free text is where
 * somebody types a phone number or a hotel room. The text already has a home in
 * lead_events, behind the admin password.
 */
export function tirouleQuestionAsked(matched: boolean) {
  capture("tiroule_question_asked", { matched });
}

/**
 * The language was changed.
 *
 * The switcher is a cycle, so `from` and `to` are both needed: "how many people
 * end up in French" is a different question from "how many pass through it on
 * the way to Kreol", and only one of them justifies writing more French pages.
 */
export function languageSwitched(from: string, to: string) {
  capture("language_switched", { from, to });
}
