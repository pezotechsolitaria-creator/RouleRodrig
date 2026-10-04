// ── Site search: the shapes shared by the index builder and the browser ──────
//
// Client-safe: no server imports. The index is built on the server
// (lib/search/build.ts), served as static JSON per language
// (/api/search-index/[lang]) and searched in the browser with Fuse.js
// (lib/search/engine.ts).

export type SearchLang = "en" | "fr" | "cr";
export const SEARCH_LANGS: readonly SearchLang[] = ["en", "fr", "cr"];

/** What a result IS — drives its group, its icon and its "View all" link. */
export type SearchKind =
  | "vehicle"
  | "stay"
  | "experience"
  | "eat"
  | "beach"
  | "viewpoint"
  | "place"
  | "route"
  | "event"
  | "shop"
  | "service"
  | "guide"
  | "help";

/**
 * One searchable thing. Field names are short on purpose: this ships to phones
 * on island mobile data, ~250 of them, and every key is repeated per entry.
 */
export type SearchDoc = {
  /** Stable, unique across kinds ("veh:scooter-125", "loc:anse-ally"). */
  id: string;
  k: SearchKind;
  /** Title in the index language, then the other languages' names if they
   *  differ — so "Plage de Trou d'Argent" finds the English entry too. */
  t: string[];
  /** One-line description in the index language (trimmed). */
  d?: string;
  /** Extra words that should find it but are not shown: synonyms, Kreol and
   *  French spellings, area names, the type in three languages. */
  w?: string;
  /** Where a tap goes. Always a path on this site. */
  u: string;
  /** Short price/extra line shown on the right ("Rs 800/day"). */
  p?: string;
  /** Ranking nudge, 0–1: the owner's featured/popular picks. */
  b?: number;
};

export type SearchIndex = {
  /** Bumped when the shape changes, so a cached copy of an old shape is refused. */
  v: number;
  lang: SearchLang;
  /** ISO time the index was built. */
  at: string;
  docs: SearchDoc[];
  /** Synonym GROUPS, normalised: every word in a group finds the others.
   *  The live search_synonyms table (pairs, joined into groups) plus the
   *  travel vocabulary in lib/search/aliases.ts. Groups, not pairs: 36 groups
   *  of up to 12 words would be ~1,000 pairs on the wire. */
  syn: string[][];
};

export const SEARCH_INDEX_VERSION = 1;
