import Fuse, { type FuseResult, type IFuseOptions, type RangeTuple } from "fuse.js";
import { KIND_ORDER } from "./kinds";
import { normalize } from "./normalize";
import type { SearchDoc, SearchIndex, SearchKind } from "./types";

// ── The search itself: Fuse.js, plus what it cannot do alone ─────────────────
//
// Fuse handles typos, partial words, case and accents ("ile aux coco" →
// "Île aux Cocos", "rivier banane" → "Rivière Banane"). Measured against the
// live index (lib/search/engine.test.ts), plain Fuse also got five things
// wrong, and each rule below is the fix for one of them:
//
//  1. TITLES FUZZY, DESCRIPTIONS NEARLY EXACT. One Fuse over title + keywords
//     at a forgiving threshold; a second over descriptions at a strict one.
//     Fuzzy on descriptions let "massage" find an FAQ answer by its letters.
//  2. INTENT WORDS. "stay" scored "Petrol Station" above every guest house
//     (one typo in a heavy title beats an exact word in light keywords). A
//     query word that NAMES a kind — stay, plage, rando, police — lifts that
//     kind, and a query that is only such a word lists the whole kind.
//  3. SYNONYMS, WHOLE PHRASES ONLY. "moto" finds scooters, "plage" beaches.
//     A synonym phrase is searched as a phrase: split into words,
//     "miel de rodrigues" turned "honey" into a search for "rodrigues".
//     A misspelt word ("snorkling") is matched to the vocabulary fuzzily first.
//  4. SHORT QUERIES ARE STRICT. Two letters match word starts only; three or
//     four letters allow almost no error — "atm" found "Port Mathurin".
//  5. A FLOOR. Anything far below the best hit is noise, and is dropped.
//
// Ranking nudges then order what survives: a title that IS or STARTS WITH the
// query, and the owner's featured picks (`b`), rise a little.
//
// Pure and synchronous: ~120 entries search in well under a millisecond per
// probe on a phone, so there is no worker.

export type Segment = { text: string; hit: boolean };

export type SearchHit = {
  doc: SearchDoc;
  /** 0 = perfect … 1 = none. After nudges. */
  score: number;
  /** The title in the visitor's language, marked where it matched. */
  title: Segment[];
  /** When the match was on another language's name ("Plage de Baladirou"
   *  for an English visitor typing "plage"): that name, marked — shown
   *  under the title so the visitor sees WHY it matched, in their language. */
  alt?: Segment[];
  /** Description, with its matched characters marked when it was the match. */
  desc?: Segment[];
};

export type SearchGroup = { kind: SearchKind; hits: SearchHit[]; total: number };

export type SearchOutcome = {
  query: string;
  /** Best hit overall, shown on its own at the top. */
  top: SearchHit | null;
  groups: SearchGroup[];
  total: number;
};

const TITLE_FUSE: IFuseOptions<SearchDoc> = {
  keys: [
    { name: "t", weight: 0.75 },
    { name: "w", weight: 0.25 },
  ],
  threshold: 0.34,
  ignoreLocation: true,
  ignoreDiacritics: true,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
};

const DESC_FUSE: IFuseOptions<SearchDoc> = {
  keys: ["d"],
  threshold: 0.12,
  ignoreLocation: true,
  ignoreDiacritics: true,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 3,
};

/**
 * Words that NAME a kind of result, in the three languages. `list` = a query
 * made only of such words shows the whole kind ("stays" → every stay). Only
 * GENERIC words list: "massage" or "fishing" name one activity, and listing
 * every experience for them buried the massage. Help and places never list —
 * "police" is not a request for all 25 FAQ answers.
 */
const INTENTS: { kinds: SearchKind[]; words: string[]; list?: boolean }[] = [
  { kinds: ["stay"], list: true, words: ["stay", "stays", "hotel", "hotels", "hebergement", "accommodation", "guesthouse", "guest house", "lakaz", "room", "rooms", "chambre", "gite", "villa", "lodge", "sleep", "dormir"] },
  { kinds: ["beach"], list: true, words: ["beach", "beaches", "plage", "plages", "laplaz", "plaj"] },
  { kinds: ["viewpoint"], list: true, words: ["viewpoint", "viewpoints", "point de vue", "points de vue", "panorama", "lookout"] },
  { kinds: ["route"], list: true, words: ["hike", "hikes", "hiking", "rando", "randonnee", "trail", "trails", "sentier", "ride", "rides", "balade", "road trip"] },
  { kinds: ["eat"], list: true, words: ["food", "eat", "manger", "manze", "restaurant", "restaurants", "resto", "dish", "plat", "takeaway", "lunch", "dinner"] },
  { kinds: ["vehicle"], list: true, words: ["scooter", "scooters", "moto", "motorbike", "car", "cars", "voiture", "loto", "rent", "rental", "location", "hire"] },
  { kinds: ["event"], list: true, words: ["event", "events", "evenement", "evenements", "festival", "concert", "party", "fete", "lafet"] },
  { kinds: ["experience"], list: true, words: ["tour", "tours", "excursion", "excursions", "activity", "activities", "activite", "activites", "experience", "experiences", "things to do"] },
  { kinds: ["help"], words: ["emergency", "urgence", "police", "hospital", "hopital", "doctor", "medecin", "pharmacy", "pharmacie", "faq", "help", "aide"] },
  { kinds: ["place"], words: ["fuel", "petrol", "essence", "landmark", "church", "eglise"] },
  { kinds: ["shop"], list: true, words: ["shop", "shops", "boutique", "boutiques", "souvenir", "souvenirs", "craft", "crafts", "artisanat"] },
];

/** Not worth searching for on their own in a longer query. */
const STOP = new Set(["de", "la", "le", "les", "du", "des", "aux", "au", "a", "the", "and", "et", "in", "on", "at", "to", "of", "en", "near", "pres", "rodrigues", "rodrig", "island"]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does `haystack` contain `phrase` as whole words? */
function hasPhrase(haystack: string, phrase: string): boolean {
  return new RegExp(`(^|\\s)${escapeRe(phrase)}(?=\\s|$)`).test(haystack);
}

function replacePhrase(haystack: string, phrase: string, by: string): string {
  return haystack.replace(new RegExp(`(^|\\s)${escapeRe(phrase)}(?=\\s|$)`), `$1${by}`);
}

export function createSearcher(index: SearchIndex) {
  const titleFuse = new Fuse(index.docs, TITLE_FUSE);
  const descFuse = new Fuse(index.docs, DESC_FUSE);
  const groups = index.syn.map((g) => [...new Set(g.map(normalize).filter(Boolean))]);
  const vocab = [...new Set(groups.flat())];
  const vocabFuse = new Fuse(vocab, { threshold: 0.25, includeScore: true, ignoreDiacritics: true });

  /** The query, then the query with each synonym swapped in. */
  function variants(q: string): string[] {
    const out = [q];
    // A misspelt word maps to its nearest vocabulary word first, so the
    // synonym swap below can see it ("snorkling" → "snorkeling").
    let fixed = q;
    for (const w of q.split(" ")) {
      if (w.length < 5 || vocab.includes(w)) continue;
      const near = vocabFuse.search(w, { limit: 1 })[0];
      if (near && (near.score ?? 1) <= 0.25 && !near.item.includes(" ")) fixed = replacePhrase(fixed, w, near.item);
    }
    if (fixed !== q) out.push(fixed);
    for (const base of [...out]) {
      for (const g of groups) {
        for (const term of g) {
          // Two-letter words ("vi") only ever stand for the whole query, and
          // a stop word never swaps: the shop table maps "the" to "tea".
          if ((term.length < 3 || STOP.has(term)) && term !== base) continue;
          if (!hasPhrase(base, term)) continue;
          for (const alt of g) {
            if (alt === term) continue;
            const v = replacePhrase(base, term, alt);
            if (!out.includes(v)) out.push(v);
          }
        }
        if (out.length >= 10) break;
      }
    }
    return out.slice(0, 10);
  }

  /** Kinds the query names; and the kinds to LIST when it names nothing else. */
  function intent(q: string): { kinds: Set<SearchKind>; list: Set<SearchKind> } {
    const kinds = new Set<SearchKind>();
    const listable = new Set<SearchKind>();
    let rest = ` ${q} `;
    for (const it of INTENTS) {
      for (const w of it.words) {
        if (!hasPhrase(q, w)) continue;
        for (const k of it.kinds) {
          kinds.add(k);
          if (it.list) listable.add(k);
        }
        rest = rest.replace(new RegExp(`\\s${escapeRe(w)}(?=\\s)`, "g"), " ");
      }
    }
    const left = rest.trim().split(" ").filter((w) => w && !STOP.has(w));
    return { kinds, list: left.length === 0 ? listable : new Set() };
  }

  function search(raw: string, perGroup = 4): SearchOutcome {
    const query = normalize(raw);
    if (query.length < 2) return { query, top: null, groups: [], total: 0 };

    // ── Two letters: word starts in titles, nothing fuzzy ──
    if (query.length === 2) {
      const hits = index.docs
        .filter((d) => d.t.some((t) => normalize(t).split(" ").some((w) => w.startsWith(query))))
        .map((doc) => {
          const shown = doc.t.find((t) => normalize(t).split(" ").some((w) => w.startsWith(query))) ?? doc.t[0];
          const at = normalize(shown).split(" ").findIndex((w) => w.startsWith(query));
          return {
            doc,
            score: Math.max(0, 0.2 + at * 0.05 - (doc.b ?? 0) * 0.06),
            title: [{ text: doc.t[0], hit: false }],
            alt: shown !== doc.t[0] ? [{ text: shown, hit: false }] : undefined,
          } as SearchHit;
        });
      return finish(query, hits, perGroup);
    }

    const { kinds, list } = intent(query);
    type Best = { score: number; raw: number; titleR?: FuseResult<SearchDoc>; descR?: FuseResult<SearchDoc> };
    const best = new Map<string, Best>();
    const keep = (id: string, score: number, raw: number, patch: Partial<Best>) => {
      const prev = best.get(id);
      if (!prev || score < prev.score) best.set(id, { ...prev, ...patch, score, raw });
    };
    // How much error a probe may carry, by its length: at the forgiving
    // default "atm" found "Port Mathurin" and "ourite" found "Fourche".
    const cap = (p: string) => (p.length <= 4 ? 0.12 : p.length <= 6 ? 0.22 : 1);

    variants(query).forEach((v, i) => {
      // Each word of the query AS TYPED is also searched alone, so "beach le
      // chou" can find "Le Chou" — never the words of a synonym variant.
      const words = i === 0 && v.includes(" ") ? v.split(" ").filter((w) => w.length >= 3 && !STOP.has(w)) : [];
      const probes: [string, number][] = [[v, i > 0 ? 0.06 : 0], ...words.map((w): [string, number] => [w, 0.14])];
      for (const [p, penalty] of probes) {
        for (const r of titleFuse.search(p, { limit: 40 })) {
          const s = r.score ?? 1;
          if (s > cap(p)) continue;
          keep(r.item.id, s + penalty, s, { titleR: r });
        }
        if (p.length >= 4) {
          for (const r of descFuse.search(p, { limit: 20 })) {
            const s = r.score ?? 1;
            keep(r.item.id, s + penalty + 0.18, s, { descR: r });
          }
        }
      }
    });

    // A query that only names a kind ("stays", "plages") lists all of it.
    for (const d of index.docs) if (list.has(d.k)) keep(d.id, 0.2, 0, {});

    const hits: SearchHit[] = [];
    for (const [id, b] of best) {
      const doc = index.docs.find((d) => d.id === id)!;
      const tm = b.titleR?.matches?.find((m) => m.key === "t");
      const ref = tm?.refIndex ?? 0;
      const shown = doc.t[ref] ?? doc.t[0];
      const nt = normalize(shown);
      let s = b.score;
      if (nt === query) s -= 0.3;
      else if (nt.startsWith(query)) s -= 0.18;
      else if (` ${nt} `.includes(` ${query} `)) s -= 0.1;
      // The kind the query names rises — but only on a real match, or a weak
      // fuzzy hit dressed up by the boost outranks a true one.
      if (kinds.has(doc.k) && b.raw <= 0.25) s -= 0.22;
      s -= (doc.b ?? 0) * 0.06;
      const dm = b.descR?.matches?.find((m) => m.key === "d");
      hits.push({
        doc,
        score: Math.max(0, s),
        title: segments(doc.t[0], tm && ref === 0 ? tm.indices : [], query.length),
        alt: tm && ref > 0 ? segments(shown, tm.indices, query.length) : undefined,
        desc: doc.d ? segments(doc.d, dm && !tm ? dm.indices : [], query.length) : undefined,
      });
    }
    return finish(query, hits, perGroup);
  }

  function finish(query: string, all: SearchHit[], perGroup: number): SearchOutcome {
    all.sort((a, b) => a.score - b.score || KIND_ORDER.indexOf(a.doc.k) - KIND_ORDER.indexOf(b.doc.k));
    const floor = all.length ? Math.min(0.5, all[0].score + 0.4) : 0;
    const hits = all.filter((h) => h.score <= floor);
    const top = hits[0] ?? null;
    const byKind = new Map<SearchKind, SearchHit[]>();
    for (const h of hits.slice(1)) byKind.set(h.doc.k, [...(byKind.get(h.doc.k) ?? []), h]);
    const groups: SearchGroup[] = [...byKind.entries()]
      .map(([kind, list]) => ({ kind, hits: list.slice(0, perGroup), total: list.length }))
      .sort((a, b) => a.hits[0].score - b.hits[0].score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return { query, top, groups, total: hits.length };
  }

  return { search, size: index.docs.length };
}

export type Searcher = ReturnType<typeof createSearcher>;

/**
 * Split text into marked and unmarked runs. Fuse's fuzzy indices can mark
 * scattered single letters, which reads as noise; a run shorter than two
 * characters is only marked when the query itself is that short.
 */
export function segments(text: string, indices: readonly RangeTuple[], queryLen: number): Segment[] {
  const min = queryLen <= 2 ? 1 : 2;
  const ranges = [...indices].filter(([a, b]) => b - a + 1 >= min).sort((x, y) => x[0] - y[0]);
  const out: Segment[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a < at) continue;
    if (a > at) out.push({ text: text.slice(at, a), hit: false });
    out.push({ text: text.slice(a, b + 1), hit: true });
    at = b + 1;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out.length ? out : [{ text, hit: false }];
}
