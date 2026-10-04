"use client";

import { Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { SEARCH_COPY } from "./copy";
import { SEARCH_OPEN_EVENT, SEARCH_PREFETCH_EVENT } from "./GlobalSearch";

// ── The header's way into site search ────────────────────────────────────────
//
// It only announces intent — the search itself lives once in the layout
// (components/search/GlobalSearch.tsx). A finger resting on it (hover, focus,
// the start of a press) warms the results code and the index, so by the time
// the tap lands, there is usually nothing left to load.
//
//   circle  the 36px bordered circle the app headers use (AppPageHeader, AppHome)
//   bare    an icon on its own, for the marketing Navbar's mobile row
//   chip    a pill with the shortcut, for the desktop Navbar

export default function SearchButton({ variant = "circle", className = "" }: { variant?: "circle" | "bare" | "chip"; className?: string }) {
  const { language } = useLanguage();
  const t = SEARCH_COPY[language === "fr" || language === "cr" ? language : "en"];
  const warm = () => window.dispatchEvent(new Event(SEARCH_PREFETCH_EVENT));
  const open = () => window.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT, { detail: { via: "button" } }));
  const handlers = { onClick: open, onPointerEnter: warm, onPointerDown: warm, onFocus: warm };

  if (variant === "chip") {
    return (
      <button
        type="button"
        {...handlers}
        aria-label={t.button}
        className={`flex items-center gap-2 rounded-full border border-dark-border px-3 py-2 font-dm text-xs text-muted transition-all duration-200 hover:border-yellow/50 hover:text-offwhite ${className}`}
      >
        <Search size={14} aria-hidden />
        <span>{t.button}</span>
        <kbd className="rounded border border-white/15 px-1 text-[10px] text-muted/80">⌘K</kbd>
      </button>
    );
  }
  if (variant === "bare") {
    return (
      <button type="button" {...handlers} aria-label={t.button} className={`p-2 text-offwhite transition-colors hover:text-yellow ${className}`}>
        <Search size={22} aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      {...handlers}
      aria-label={t.button}
      // after:-inset-1 lifts the 36px circle's hit area to 44px, like its neighbours.
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted transition-colors after:absolute after:-inset-1 after:content-[''] hover:border-yellow/50 hover:text-yellow ${className}`}
    >
      <Search size={16} aria-hidden />
    </button>
  );
}
