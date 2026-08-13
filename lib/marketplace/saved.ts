"use client";

import { useCallback, useEffect, useState } from "react";

// ── Saved items ─────────────────────────────────────────────────────────────
//
// More useful on a marketplace than on a food platform, and for a specific
// reason: dinner is decided in one sitting, a Rs 1,200 hand-woven basket is
// decided over three days and usually on a different device than the one it
// was found on. A tourist browsing on a phone at a beach and buying that
// evening is the actual journey, and without somewhere to put things, the
// second half of it starts with searching all over again.
//
// ── LOCAL FIRST, AND NO LOGIN WALL ─────────────────────────────────────────
// Saving is a private, low-stakes act. Making someone create an account to
// bookmark a jar of honey is the same mistake the checkout login wall was
// (M20), at a point in the journey where the customer is even less invested.
// So this is localStorage: instant, offline, no server round trip, nothing to
// leak. The cost is honest and stated on the page — clear your browser and the
// list goes with it.
//
// ── IDS ONLY ───────────────────────────────────────────────────────────────
// Only product ids are stored, never a name or a price. The list is re-resolved
// against the live catalogue every time it is shown, so a saved product that
// sold out, changed price, was archived, or belongs to a shop that has since
// been paused shows the truth rather than a snapshot from last week. It also
// means a stale localStorage entry can never render a card that 404s on tap.

const KEY = "rr-saved-products-v1";
const MAX = 100;

/** Broadcast within the tab; `storage` only fires in OTHER tabs. */
const EVENT = "rr-saved-changed";

export function readSaved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function writeSaved(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    if (ids.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    /* quota or private mode — the in-memory list still works this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Newest first: the thing just saved is the thing being looked for. */
export function toggleSavedId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids].slice(0, MAX);
}

export function useSaved() {
  const [ids, setIds] = useState<string[]>([]);
  // SSR and the first paint always see an empty list, so consumers must not
  // treat "not saved" as final until this is true — otherwise every save button
  // flashes its unsaved state on load.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIds(readSaved());
    setHydrated(true);
    const sync = () => setIds(readSaved());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) sync();
    });
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const toggle = useCallback((id: string) => {
    const next = toggleSavedId(readSaved(), id);
    writeSaved(next);
    setIds(next);
    return next.includes(id);
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, hydrated, toggle, isSaved, count: ids.length };
}
