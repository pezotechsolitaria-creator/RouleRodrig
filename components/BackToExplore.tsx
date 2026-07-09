"use client";

import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

/**
 * Floating shortcut back to the "What are you looking for?" hub. Appears once
 * the visitor has scrolled past the hub (e.g. while reading the Island Guide),
 * so they can jump straight back to browsing categories with one tap — no
 * hunting through the menu. Homepage only (auto-hides where there's no hub).
 */
export default function BackToExplore() {
  const [show, setShow] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const onScroll = () => {
      const hub = document.getElementById("explore");
      // Show once the hub has scrolled off the top of the viewport.
      setShow(!!hub && hub.getBoundingClientRect().bottom < -40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jump = () => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <button
      type="button"
      onClick={jump}
      aria-label={t.explore.title}
      className={`fixed z-50 bottom-[5.25rem] left-6 flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm pl-3.5 pr-4 py-3 rounded-full shadow-[0_8px_30px_rgba(245,200,66,0.35)] transition-all duration-300 ${
        show ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <LayoutGrid size={17} /> {t.explore.nav}
    </button>
  );
}
