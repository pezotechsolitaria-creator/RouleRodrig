"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

/**
 * The homepage's door into the Curated world.
 *
 * ── WHY IT IS A BAND AND NOT A SEVENTH TILE ───────────────────────────────
 * The tiles above it answer "what do you want to buy". Curated answers "show
 * me what's good", which is a different question and a different mood, and
 * putting it in the same grid would file it as one more category. One quiet
 * full-width row, with the only copper on the homepage, says it belongs to
 * something else — which is exactly what it does.
 *
 * It is deliberately hard-coded rather than admin-content: the world it opens
 * IS the admin-editable surface, and a link that can be accidentally deleted
 * from a tile list is how a whole section of a site goes quietly missing.
 */
export default function CuratedTeaser() {
  const { language } = useLanguage();

  return (
    <section className="mt-4">
      <Link
        href="/curated"
        className="group flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 transition-colors"
        style={{
          borderColor: "rgba(227,200,162,0.22)",
          background:
            "linear-gradient(100deg, rgba(192,132,87,0.14), rgba(255,255,255,0.02) 58%)",
        }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ border: "1px solid rgba(227,200,162,0.3)" }}
        >
          <Sparkles size={16} style={{ color: "#E3C8A2" }} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block font-dm text-[9.5px] font-medium uppercase tracking-[0.22em]"
            style={{ color: "#D9A87C" }}
          >
            {loc(language, "Curated", "Sélection", "Seleksion")}
          </span>
          <span className="mt-0.5 block font-syne text-[13.5px] font-bold leading-tight text-offwhite">
            {loc(
              language,
              "The Rodrigues we'd show a friend",
              "Le Rodrigues qu'on montrerait à un ami",
              "Rodrig ki nou ti pou montre enn kamarad",
            )}
          </span>
          <span className="mt-0.5 block font-dm text-[11px] text-muted">
            {loc(
              language,
              "A few handpicked stays, experiences and local gems.",
              "Quelques séjours, expériences et trésors locaux choisis un par un.",
              "Detrwa lozman, eksperyans ek trezor lokal swazir enn par enn.",
            )}
          </span>
        </span>
        <ArrowRight
          size={16}
          className="shrink-0 transition-transform group-hover:translate-x-1"
          style={{ color: "#E3C8A2" }}
        />
      </Link>
    </section>
  );
}
