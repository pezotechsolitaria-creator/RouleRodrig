"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Search, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { SearchLang } from "@/lib/search/types";
import { searchTrack } from "@/lib/search/analytics";
import { prefetchSearchIndex } from "./useSearchIndex";
import { SEARCH_COPY } from "./copy";
import type { PanelKeys } from "./SearchPanel";

// ── Site search: the shell every page carries ────────────────────────────────
//
// Mounted once in app/layout.tsx. Opens on:
//   · the header's search button     (window event "rr:search-open")
//   · Cmd/Ctrl + K, or "/" when not typing in a field
//
// The INPUT lives here, not in the lazily loaded panel, because a phone only
// raises its keyboard for a field focused inside the tap itself — a field
// that mounts a chunk-load later stays keyboard-less on iOS. Fuse.js, the
// index and the results (SearchPanel) load on first open, or earlier when a
// finger rests on the button ("rr:search-prefetch").

const loadPanel = () => import("./SearchPanel");
const SearchPanel = lazy(loadPanel);

export const SEARCH_OPEN_EVENT = "rr:search-open";
export const SEARCH_PREFETCH_EVENT = "rr:search-prefetch";

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

export default function GlobalSearch() {
  const { language } = useLanguage();
  const lang = (["en", "fr", "cr"].includes(language) ? language : "en") as SearchLang;
  const t = SEARCH_COPY[lang];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | undefined>();
  const [count, setCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keysRef = useRef<PanelKeys | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const openSearch = useCallback(
    (via: "button" | "shortcut" | "event") => {
      returnTo.current = document.activeElement as HTMLElement | null;
      // Render the dialog NOW, inside the tap, then focus: iOS raises the
      // keyboard only for a field focused in the same task as the gesture,
      // and a field still inside a hidden dialog cannot take focus at all.
      flushSync(() => setOpen(true));
      inputRef.current?.focus();
      searchTrack.opened({ via });
    },
    [],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCount(null);
    returnTo.current?.focus?.({ preventScroll: true });
  }, []);

  // Openers and warmers.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ query?: string } | undefined>).detail?.query;
      if (q) setQuery(q);
      openSearch((e as CustomEvent<{ via?: "button" } | undefined>).detail?.via === "button" ? "button" : "event");
    };
    const onPrefetch = () => {
      loadPanel().catch(() => {});
      prefetchSearchIndex(lang);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openSearch("shortcut");
      } else if (e.key === "/" && !open && !isTyping(document.activeElement)) {
        e.preventDefault();
        openSearch("shortcut");
      }
    };
    window.addEventListener(SEARCH_OPEN_EVENT, onOpen);
    window.addEventListener(SEARCH_PREFETCH_EVENT, onPrefetch);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(SEARCH_OPEN_EVENT, onOpen);
      window.removeEventListener(SEARCH_PREFETCH_EVENT, onPrefetch);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, openSearch, close, lang]);

  // The page behind stays put. The DOCUMENT scrolls on this site, not <body>
  // (see the note in app/layout.tsx), so that is what is locked.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [open]);

  const registerKeys = useCallback((fn: PanelKeys | null) => {
    keysRef.current = fn;
  }, []);

  // The input is rendered (hidden) before first open so focus() has a target
  // in the opening tap; the dialog itself is display:none until then.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.dialog}
      hidden={!open}
      className="fixed inset-0 z-[140] flex flex-col bg-dark sm:items-center sm:bg-black/70 sm:px-6 sm:pt-[10vh] sm:backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col sm:max-h-[min(680px,80vh)] sm:max-w-xl sm:flex-none sm:overflow-hidden sm:rounded-2xl sm:border sm:border-white/10 sm:bg-[#111111] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:pt-2.5">
          <Search size={18} className="ml-1 shrink-0 text-yellow" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={count !== null && count > 0}
            aria-controls="rr-search-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
                return;
              }
              keysRef.current?.(e);
            }}
            placeholder={t.placeholder}
            className="min-h-11 min-w-0 flex-1 bg-transparent font-dm text-base text-offwhite placeholder:text-muted/70 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t.clearQuery}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-offwhite"
            >
              <X size={16} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="min-h-11 shrink-0 rounded-full px-3 font-dm text-sm text-offwhite/80 hover:text-offwhite sm:hidden"
          >
            {t.close}
          </button>
          <kbd className="hidden shrink-0 rounded-md border border-white/15 px-1.5 py-0.5 font-dm text-[11px] text-muted sm:block">Esc</kbd>
        </div>

        <p className="sr-only" aria-live="polite">
          {count !== null ? t.count(count) : ""}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {open && (
            <Suspense fallback={<div className="h-40" aria-busy="true" />}>
              <SearchPanel
                query={query}
                lang={lang}
                setQuery={(q) => {
                  setQuery(q);
                  inputRef.current?.focus();
                }}
                onClose={close}
                registerKeys={registerKeys}
                setActiveId={setActiveId}
                setResultCount={setCount}
              />
            </Suspense>
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-white/10 px-4 py-2 font-dm text-[11px] text-muted sm:flex">
          <span>
            <kbd className="rounded border border-white/15 px-1">↑</kbd> <kbd className="rounded border border-white/15 px-1">↓</kbd> {t.hintMove}
          </span>
          <span>
            <kbd className="rounded border border-white/15 px-1">Enter</kbd> {t.hintOpen}
          </span>
          <span>
            <kbd className="rounded border border-white/15 px-1">Esc</kbd> {t.hintClose}
          </span>
        </div>
      </div>
    </div>
  );
}
