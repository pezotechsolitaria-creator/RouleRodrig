"use client";

import { useCallback, useEffect, useState } from "react";
import { SEARCH_INDEX_VERSION, type SearchIndex, type SearchLang } from "@/lib/search/types";

// ── Getting the index onto the phone, once ───────────────────────────────────
//
// ~35 KB of JSON per language (≈10 KB gzipped), fetched the first time search
// is opened — or the moment a finger rests on the search button — never on a
// page load. Then:
//
//   · kept in memory for the visit, so reopening search is instant;
//   · kept in localStorage, so the NEXT visit opens with results already
//     there and search works offline (island mobile data drops);
//   · refreshed in the background when the stored copy is over 30 minutes old.
//
// localStorage can throw (Safari private mode, storage full): every access is
// guarded, and the only cost of a failure is a network fetch.

const MEMORY = new Map<SearchLang, SearchIndex>();
const INFLIGHT = new Map<SearchLang, Promise<SearchIndex>>();
const STALE_MS = 30 * 60_000;
const key = (lang: SearchLang) => `rr_search_index_${lang}`;

function readStored(lang: SearchLang): { index: SearchIndex; savedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(key(lang));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { index?: SearchIndex; savedAt?: number };
    if (!parsed.index || parsed.index.v !== SEARCH_INDEX_VERSION || !Array.isArray(parsed.index.docs)) return null;
    return { index: parsed.index, savedAt: parsed.savedAt ?? 0 };
  } catch {
    return null;
  }
}

function store(lang: SearchLang, index: SearchIndex) {
  try {
    window.localStorage.setItem(key(lang), JSON.stringify({ index, savedAt: Date.now() }));
  } catch {
    /* quota or private mode: memory still has it */
  }
}

/** Fetch (once at a time per language) and remember. */
export function fetchSearchIndex(lang: SearchLang): Promise<SearchIndex> {
  const pending = INFLIGHT.get(lang);
  if (pending) return pending;
  const p = fetch(`/api/search-index/${lang}`)
    .then((r) => {
      if (!r.ok) throw new Error(`search index ${r.status}`);
      return r.json() as Promise<SearchIndex>;
    })
    .then((index) => {
      if (index.v !== SEARCH_INDEX_VERSION) throw new Error("search index version");
      MEMORY.set(lang, index);
      store(lang, index);
      return index;
    })
    .finally(() => INFLIGHT.delete(lang));
  INFLIGHT.set(lang, p);
  return p;
}

/** Warm the index before search opens (hover, focus, press on the button). */
export function prefetchSearchIndex(lang: SearchLang): void {
  if (MEMORY.has(lang)) return;
  const stored = readStored(lang);
  if (stored) {
    MEMORY.set(lang, stored.index);
    if (Date.now() - stored.savedAt < STALE_MS) return;
  }
  fetchSearchIndex(lang).catch(() => {});
}

export function useSearchIndex(lang: SearchLang) {
  const [index, setIndex] = useState<SearchIndex | null>(() => MEMORY.get(lang) ?? null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    const mem = MEMORY.get(lang);
    const stored = mem ? null : readStored(lang);
    const have = mem ?? stored?.index ?? null;
    if (have) {
      MEMORY.set(lang, have);
      setIndex(have);
    } else {
      setIndex(null);
    }
    const fresh = mem || (stored && Date.now() - stored.savedAt < STALE_MS);
    if (!fresh) {
      fetchSearchIndex(lang)
        .then(setIndex)
        .catch(() => {
          // Offline with nothing stored: say so. With a stored copy, keep it.
          if (!have) setFailed(true);
        });
    }
  }, [lang]);

  useEffect(load, [load]);

  return { index, failed, retry: load };
}
