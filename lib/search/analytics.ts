"use client";

import posthog from "posthog-js";

// ── What the search tells the owner ──────────────────────────────────────────
//
// The useful question is "what did people look for that we do not have?", so
// the no-results event matters most: each one is a synonym to add
// (lib/search/aliases.ts) or a listing to create.
//
// A search box is a free-text field, and people paste anything into it. The
// query is sent only when it looks like a search: an email address or a long
// run of digits (a phone, a booking reference, a card) is replaced, never
// sent. lib/posthog-scrub.ts strips by property NAME; this strips by VALUE.

type Props = Record<string, string | number | boolean | null | undefined>;

function capture(event: string, props: Props = {}) {
  try {
    posthog.capture(event, props);
  } catch {
    /* analytics must never break the search */
  }
}

/** The query as it may be recorded, or a placeholder. */
export function safeQuery(raw: string): string {
  const q = raw.trim().toLowerCase().slice(0, 60);
  if (/[^\s@]+@[^\s@]+/.test(q) || /\d[\d\s-]{5,}\d/.test(q)) return "[withheld]";
  return q;
}

export const searchTrack = {
  opened: (p: { via: "button" | "shortcut" | "event" }) => capture("search_opened", p),
  searched: (p: { query: string; results: number; lang: string }) =>
    capture(p.results === 0 ? "search_no_results" : "search_query", { ...p, query: safeQuery(p.query) }),
  clicked: (p: { query: string; kind: string; id: string; position: number }) =>
    capture("search_result_clicked", { ...p, query: safeQuery(p.query) }),
  askedTiRoule: (p: { query: string }) => capture("search_ask_tiroule", { query: safeQuery(p.query) }),
};
