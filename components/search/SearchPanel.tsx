"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BedDouble,
  Bike,
  BookOpen,
  CalendarDays,
  Car,
  ClipboardCheck,
  Clock,
  Compass,
  Footprints,
  HelpCircle,
  type LucideIcon,
  MapPin,
  MessageCircle,
  Mountain,
  Package,
  Phone,
  Plane,
  ShoppingBag,
  UtensilsCrossed,
  Waves,
  WifiOff,
} from "lucide-react";
import { createSearcher, type SearchHit, type Segment } from "@/lib/search/engine";
import { KIND_ALL, KIND_LABEL } from "@/lib/search/kinds";
import type { SearchDoc, SearchLang } from "@/lib/search/types";
import { searchTrack } from "@/lib/search/analytics";
import { useSearchIndex } from "./useSearchIndex";
import { SEARCH_COPY } from "./copy";

// ── The results half of the search dialog (loaded on first open) ────────────
//
// Everything heavy lives here — Fuse.js, the index, the result list — so the
// dialog shell that every page carries stays a few hundred bytes. The shell
// owns the input (so a phone keyboard opens on the very tap that opened
// search); this owns what the input finds, and the keyboard moving through it.
//
// Keyboard and screen reader: the input is a combobox; this list is its
// listbox; ↑/↓ move `aria-activedescendant`, Enter opens, Esc is the shell's.

const RECENT_KEY = "rr_search_recent";
const POPULAR = ["page:scooter", "page:cocos", "page:beaches", "page:transfers", "page:food", "page:hiking", "page:map", "page:emergency"];

function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* private mode: recent searches are a convenience */
  }
}

/** The icon a result wears: by what it is, then by where it goes. */
function iconFor(doc: SearchDoc): LucideIcon {
  if (doc.k === "vehicle") return doc.u.startsWith("/browse/car") ? Car : Bike;
  if (doc.id === "page:transfers") return Plane;
  if (doc.id === "page:deliver") return Package;
  if (doc.id === "page:errands") return ClipboardCheck;
  if (doc.id === "page:taxi") return Car;
  if (doc.id.startsWith("contact:")) return Phone;
  const byKind: Record<SearchDoc["k"], LucideIcon> = {
    vehicle: Bike,
    stay: BedDouble,
    experience: Compass,
    eat: UtensilsCrossed,
    beach: Waves,
    viewpoint: Mountain,
    place: MapPin,
    route: Footprints,
    event: CalendarDays,
    shop: ShoppingBag,
    service: Compass,
    guide: BookOpen,
    help: HelpCircle,
  };
  return byKind[doc.k];
}

function Marked({ parts }: { parts: Segment[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-[3px] bg-yellow/20 px-px text-yellow">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export type PanelKeys = (e: React.KeyboardEvent<HTMLInputElement>) => void;

export default function SearchPanel({
  query,
  lang,
  setQuery,
  onClose,
  registerKeys,
  setActiveId,
  setResultCount,
}: {
  query: string;
  lang: SearchLang;
  setQuery: (q: string) => void;
  onClose: () => void;
  /** The shell's input forwards ↑ ↓ Enter here. */
  registerKeys: (fn: PanelKeys | null) => void;
  /** For the input's aria-activedescendant. */
  setActiveId: (id: string | undefined) => void;
  setResultCount: (n: number | null) => void;
}) {
  const t = SEARCH_COPY[lang];
  const router = useRouter();
  const { index, failed, retry } = useSearchIndex(lang);
  const searcher = useMemo(() => (index ? createSearcher(index) : null), [index]);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => setRecent(readRecent()), []);

  // Typing is instant; the search runs once the fingers pause (~90 ms).
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(query), 90);
    return () => window.clearTimeout(id);
  }, [query]);

  const outcome = useMemo(() => (searcher ? searcher.search(settled) : null), [searcher, settled]);
  const searching = settled.trim().length >= 2;

  // One flat list in screen order, for the keyboard.
  const flat = useMemo<SearchHit[]>(() => {
    if (!outcome || !searching) return [];
    return [outcome.top, ...outcome.groups.flatMap((g) => g.hits)].filter(Boolean) as SearchHit[];
  }, [outcome, searching]);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [settled]);

  const optionId = (i: number) => `rr-search-opt-${i}`;
  useEffect(() => {
    setActiveId(flat.length ? optionId(Math.min(active, flat.length - 1)) : undefined);
    setResultCount(searching && outcome ? outcome.total : null);
  }, [active, flat.length, outcome, searching, setActiveId, setResultCount]);

  // What people looked for, once they stop typing — the no-results ones
  // are the owner's to-do list (lib/search/analytics.ts).
  useEffect(() => {
    if (!searching || !outcome) return;
    const id = window.setTimeout(() => searchTrack.searched({ query: settled, results: outcome.total, lang }), 1200);
    return () => window.clearTimeout(id);
  }, [settled, searching, outcome, lang]);

  const remember = useCallback(
    (q: string) => {
      const v = q.trim();
      if (v.length < 2) return;
      const next = [v, ...readRecent().filter((r) => r.toLowerCase() !== v.toLowerCase())];
      writeRecent(next);
      setRecent(next.slice(0, 6));
    },
    [],
  );

  const go = useCallback(
    (hit: SearchHit, position: number, viaKeyboard: boolean) => {
      searchTrack.clicked({ query: settled, kind: hit.doc.k, id: hit.doc.id, position });
      remember(settled);
      onClose();
      if (viaKeyboard) router.push(hit.doc.u);
    },
    [settled, remember, onClose, router],
  );

  const askTiRoule = useCallback(() => {
    searchTrack.askedTiRoule({ query: settled });
    onClose();
    window.dispatchEvent(new CustomEvent("tiroule:open", { detail: { prompt: settled.trim() } }));
  }, [settled, onClose]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    registerKeys((e) => {
      if (!flat.length) {
        if (e.key === "Enter" && searching) {
          e.preventDefault();
          askTiRoule();
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => {
          const n = (a + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
          document.getElementById(optionId(n))?.scrollIntoView({ block: "nearest" });
          return n;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const i = Math.min(active, flat.length - 1);
        go(flat[i], i, true);
      }
    });
    return () => registerKeys(null);
  }, [flat, active, go, askTiRoule, searching, registerKeys]);

  // ── States ────────────────────────────────────────────────────────────
  if (!index) {
    if (failed) {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <WifiOff size={22} className="text-muted" aria-hidden />
          <p className="font-dm text-sm text-offwhite/80">{t.offline}</p>
          <button type="button" onClick={retry} className="min-h-11 rounded-full border border-white/15 px-5 font-dm text-sm text-offwhite hover:border-yellow/50">
            {t.retry}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-2 px-4 py-4" aria-busy="true">
        <span className="sr-only">{t.loading}</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-white/[0.06]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!searching) {
    const popular = POPULAR.map((id) => index.docs.find((d) => d.id === id)).filter(Boolean) as SearchDoc[];
    return (
      <div className="px-4 py-4">
        {recent.length > 0 && (
          <section aria-labelledby="rr-search-recent" className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="rr-search-recent" className="font-bebas text-[12px] tracking-[0.24em] text-muted">
                {t.recent.toUpperCase()}
              </h2>
              <button
                type="button"
                onClick={() => {
                  writeRecent([]);
                  setRecent([]);
                }}
                className="min-h-9 px-2 font-dm text-xs text-muted hover:text-offwhite"
              >
                {t.clearRecent}
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    onClick={() => setQuery(r)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 font-dm text-sm text-offwhite/85 hover:border-white/25"
                  >
                    <Clock size={13} className="text-muted" aria-hidden /> {r}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="rr-search-popular">
          <h2 id="rr-search-popular" className="mb-2 font-bebas text-[12px] tracking-[0.24em] text-muted">
            {t.popular.toUpperCase()}
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {popular.map((d) => {
              const Icon = iconFor(d);
              return (
                <li key={d.id}>
                  <Link
                    href={d.u}
                    onClick={onClose}
                    className="flex min-h-12 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 font-dm text-[13px] text-offwhite/90 transition-colors hover:border-yellow/40"
                  >
                    <Icon size={16} className="shrink-0 text-yellow" aria-hidden />
                    <span className="min-w-0 leading-tight">{d.t[0]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <AskRow label={t.ask("")} onClick={askTiRoule} />
      </div>
    );
  }

  if (!outcome || outcome.total === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="font-syne text-base font-bold text-offwhite">{t.none(settled.trim())}</p>
        <p className="mx-auto mt-1.5 max-w-xs font-dm text-sm text-muted">{t.noneHint}</p>
        <div className="mx-auto mt-5 max-w-sm">
          <AskRow label={t.ask(settled.trim())} onClick={askTiRoule} primary />
        </div>
      </div>
    );
  }

  let n = 0;
  const row = (h: SearchHit, big = false) => {
    const i = n++;
    const Icon = iconFor(h.doc);
    const isActive = i === Math.min(active, flat.length - 1);
    return (
      <li key={h.doc.id} id={optionId(i)} role="option" aria-selected={isActive}>
        <Link
          href={h.doc.u}
          tabIndex={-1}
          onClick={() => go(h, i, false)}
          onMouseMove={() => active !== i && setActive(i)}
          className={`flex items-center gap-3 rounded-xl px-2.5 transition-colors ${big ? "py-3" : "py-2.5"} ${
            isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
          }`}
        >
          <span
            className={`flex shrink-0 items-center justify-center rounded-lg ${big ? "h-11 w-11 bg-yellow/15 text-yellow" : "h-9 w-9 bg-white/[0.05] text-offwhite/80"}`}
            aria-hidden
          >
            <Icon size={big ? 19 : 16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block font-dm leading-snug text-offwhite ${big ? "text-[15px] font-semibold" : "text-sm"}`}>
              <Marked parts={h.title} />
            </span>
            {h.alt ? (
              <span className="mt-0.5 line-clamp-1 font-dm text-xs text-muted">
                <Marked parts={h.alt} />
              </span>
            ) : (
              h.desc && (
                <span className="mt-0.5 line-clamp-1 font-dm text-xs text-muted">
                  <Marked parts={h.desc} />
                </span>
              )
            )}
          </span>
          {h.doc.p && <span className="shrink-0 whitespace-nowrap pl-1 font-dm text-xs tabular-nums text-offwhite/70">{h.doc.p}</span>}
          {isActive && <ArrowRight size={14} className="hidden shrink-0 text-yellow sm:block" aria-hidden />}
        </Link>
      </li>
    );
  };

  return (
    <div ref={listRef} id="rr-search-listbox" role="listbox" aria-label={t.count(outcome.total)} className="px-2 py-2">
      {outcome.top && (
        <div role="group" aria-labelledby="rr-search-g-top" className="mb-1">
          <h2 id="rr-search-g-top" className="px-2.5 pb-1 pt-2 font-bebas text-[12px] tracking-[0.24em] text-yellow">
            {t.top.toUpperCase()}
          </h2>
          <ul>{row(outcome.top, true)}</ul>
        </div>
      )}
      {outcome.groups.map((g) => {
        const all = KIND_ALL[g.kind];
        return (
          <div key={g.kind} role="group" aria-labelledby={`rr-search-g-${g.kind}`} className="mt-1">
            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <h2 id={`rr-search-g-${g.kind}`} className="font-bebas text-[12px] tracking-[0.24em] text-muted">
                {KIND_LABEL[g.kind][lang].toUpperCase()}
                {g.total > g.hits.length && <span className="ml-1.5 text-muted/70">{g.total}</span>}
              </h2>
              {all && g.total > g.hits.length && (
                <Link href={all} onClick={onClose} tabIndex={-1} className="inline-flex min-h-8 items-center gap-1 font-dm text-xs text-yellow/90 hover:text-yellow">
                  {t.viewAll} <ArrowRight size={12} aria-hidden />
                </Link>
              )}
            </div>
            <ul>{g.hits.map((h) => row(h))}</ul>
          </div>
        );
      })}
      <div className="px-2 pb-2 pt-3">
        <AskRow label={t.ask(settled.trim())} onClick={askTiRoule} />
      </div>
    </div>
  );
}

function AskRow({ label, onClick, primary = false }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 font-dm text-sm transition-colors ${
        primary ? "bg-yellow font-semibold text-dark hover:bg-yellow-dark" : "border border-white/12 text-offwhite/85 hover:border-yellow/40 hover:text-offwhite"
      }`}
    >
      <MessageCircle size={16} aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
