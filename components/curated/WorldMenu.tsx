"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { WORLD_IDS, WORLD_META, type WorldId } from "@/lib/world-docs/types";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

// ── A MODE SWITCH, NOT A DROPDOWN ───────────────────────────────────────────
//
// The distinction is the whole design. A dropdown is a filter — it changes what
// you are looking at within one screen. This changes which WORLD you are
// standing in, so the closed state has to answer "where am I?" without being
// opened, and the open state has to say what each destination is FOR, not just
// name it. That is why every row carries a sentence and why the current world
// is marked rather than merely highlighted.
//
// `global` is the admin's settings bucket, not a place a visitor can stand, so
// it is filtered out here.

const VISITOR_WORLDS = WORLD_IDS.filter((w) => w !== "global");

const WORLD_BLURB_FR: Partial<Record<WorldId, string>> = {
  curated: "Notre sélection — la porte d'entrée éditoriale.",
  explore: "Chercher et parcourir toute l'île.",
  stays: "Où dormir.",
  experiences: "À faire, à réserver, à retenir.",
  "eat-drink": "Cuisines, tables et conciergerie.",
  shops: "La place du marché.",
  transfers: "Aéroport, taxi et transferts privés.",
};

const WORLD_LABEL_FR: Partial<Record<WorldId, string>> = {
  curated: "Sélection",
  explore: "Explorer",
  stays: "Séjours",
  experiences: "Expériences",
  "eat-drink": "Manger & boire",
  shops: "Boutiques",
  transfers: "Transferts",
};

export default function WorldMenu({ current }: { current: WorldId }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();

  const label = (w: WorldId) => loc(language, WORLD_META[w].label, WORLD_LABEL_FR[w]);
  const blurb = (w: WorldId) => loc(language, WORLD_META[w].blurb, WORLD_BLURB_FR[w]);

  // Escape closes, and a click anywhere outside closes. Both listeners exist
  // only while the panel is open — a page-wide pointerdown handler that lives
  // for the lifetime of the header is a cost paid on every tap of every card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    // Move focus into the panel so a keyboard user is not left behind the
    // trigger they just activated.
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={loc(
          language,
          `Current world: ${WORLD_META[current].label}. Switch world`,
          `Univers actuel : ${label(current)}. Changer d'univers`,
        )}
        className="group inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 py-2 transition-colors"
        style={{
          borderColor: "var(--cur-line-strong)",
          background: "var(--cur-tint)",
        }}
      >
        <Sparkles size={13} style={{ color: "var(--cur-champagne)" }} />
        <span
          className="font-dm text-[11px] font-medium uppercase tracking-[0.2em]"
          style={{ color: "var(--cur-ivory)" }}
        >
          {label(current)}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--cur-dim)" }}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={loc(language, "Worlds", "Univers")}
          className="rr-cur-rise absolute right-0 z-50 mt-2 w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border p-1.5 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl"
          style={{
            borderColor: "var(--cur-line)",
            backgroundColor: "var(--cur-panel)",
            // No stagger: a menu that arrives one row at a time reads as slow,
            // however elegant it looks the first time.
            ["--rr-d" as string]: "0ms",
          }}
        >
          <p
            className="rr-cur-eyebrow px-3 pb-1.5 pt-2"
            style={{ color: "var(--cur-faint)" }}
          >
            {loc(language, "You are inside", "Vous êtes dans")}
          </p>
          {VISITOR_WORLDS.map((w) => {
            const active = w === current;
            return (
              <Link
                key={w}
                role="menuitem"
                href={WORLD_META[w].href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className="flex min-h-11 items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.05] focus:outline-none focus-visible:bg-white/[0.07]"
              >
                <span className="mt-0.5 w-4 shrink-0">
                  {active && <Check size={14} style={{ color: "var(--cur-champagne)" }} />}
                </span>
                <span className="min-w-0">
                  <span
                    className="block font-dm text-sm font-medium"
                    style={{ color: active ? "var(--cur-champagne)" : "var(--cur-ivory)" }}
                  >
                    {label(w)}
                  </span>
                  <span
                    className="block font-dm text-xs leading-snug"
                    style={{ color: "var(--cur-faint)" }}
                  >
                    {blurb(w)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
