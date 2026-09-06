"use client";

import { useCallback, useState } from "react";
import type { DeliveryLogData } from "./DeliveryLogView";

// ── Loading a log, on either side ───────────────────────────────────────────
//
// The driver's console and the owner's driver card fetch from different
// endpoints and are allowed to ask about different people — but everything
// AROUND the fetch is the same: open to load, remember what you loaded, choose
// a window, say so when it fails.
//
// Written once for the same reason the SQL is one function and the rows are one
// component: these two screens exist to settle "what am I owed", and a
// difference between them is only ever a bug.
//
// ── WHY THE CACHE IS PER WINDOW ────────────────────────────────────────────
// Somebody comparing last week against last month will switch back and forth.
// Re-fetching a month of history on every tap spends island data to show
// something already downloaded, and the wait makes the comparison harder than
// doing it on paper.

export const LOG_RANGES = [7, 30, 90] as const;
export type LogRange = (typeof LOG_RANGES)[number];

export function useDeliveryLog(
  /** Given a window, where to fetch it from. */
  urlFor: (days: number) => string,
  failureText: string,
) {
  const [days, setDays] = useState<LogRange>(30);
  // Keyed by window, so switching back is instant and costs nothing.
  const [cache, setCache] = useState<Record<number, DeliveryLogData>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const log = cache[days] ?? null;

  const load = useCallback(
    async (d: number) => {
      setBusy(true);
      try {
        const res = await fetch(urlFor(d), { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || failureText);
        setCache((c) => ({ ...c, [d]: body as DeliveryLogData }));
        setError(null);
      } catch (e) {
        // Named, never swallowed. An empty history and a failed request look
        // identical on screen, and "you earned nothing" is the worse of the two
        // to say by accident to somebody asking to be paid.
        setError(e instanceof Error ? e.message : failureText);
      } finally {
        setBusy(false);
      }
    },
    [urlFor, failureText],
  );

  /** Switch window, fetching only what has not been seen yet. */
  const choose = useCallback(
    (d: LogRange) => {
      setDays(d);
      setError(null);
      if (!cache[d]) void load(d);
    },
    [cache, load],
  );

  return { days, log, error, busy, load, choose, setError };
}
