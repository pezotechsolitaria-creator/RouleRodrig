"use client";

import { useEffect, useRef } from "react";
import { trackSearch, trackCategorySelected } from "@/lib/marketplace/analytics";

// Fires the listing's analytics once per distinct view.
//
// It renders nothing. It exists because the listing pages are server components
// and posthog-js is a browser client, and because the single most useful row in
// the whole funnel — a search that returned ZERO results — can only be recorded
// where the result count and the query are both known, which is here.
//
// The ref guard is not paranoia: React runs effects twice in development Strict
// Mode, and a search that reports itself twice quietly doubles every number in
// the funnel.
export default function ListingAnalytics({
  query, category, resultCount,
}: {
  query: string;
  category: string;
  resultCount: number;
}) {
  const sent = useRef("");

  useEffect(() => {
    const key = `${query}|${category}|${resultCount}`;
    if (sent.current === key) return;
    sent.current = key;

    if (query) trackSearch({ query, resultCount, category: category || null });
    else if (category) trackCategorySelected({ category, resultCount });
  }, [query, category, resultCount]);

  return null;
}
