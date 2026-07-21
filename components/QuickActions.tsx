"use client";

import Link from "next/link";
import { MessageCircle, Map, Compass, Route, BookOpen, UtensilsCrossed } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// "Quick Access" dashboard grid — the app-like, action-first strip. Deliberately
// the free TOOLS & GUIDES (not the browse categories, which the hub carousel
// below already covers) so it complements rather than duplicates. Every item is
// an existing feature; nothing invented. Ti Roulé opens the chat via the same
// event the hero uses (TiRouleGuide is mounted on the homepage).
type Action = { key: string; icon: typeof Map; href?: string; en: string; fr: string; cr: string };

const ACTIONS: Action[] = [
  { key: "tiroule", icon: MessageCircle, en: "Ask Ti Roulé", fr: "Ti Roulé", cr: "Ti Roulé" },
  { key: "guide", icon: Map, href: "/guide/rodrigues", en: "Island guide", fr: "Guide de l'île", cr: "Gid lil" },
  { key: "planner", icon: Compass, href: "/#trip-planner", en: "Trip planner", fr: "Planifier", cr: "Plan vwayaz" },
  { key: "routes", icon: Route, href: "/guide/routes", en: "Routes & trails", fr: "Itinéraires", cr: "Semin" },
  { key: "blog", icon: BookOpen, href: "/blog", en: "Travel blog", fr: "Blog", cr: "Blog" },
  { key: "food", icon: UtensilsCrossed, href: "/food", en: "Food concierge", fr: "Concierge food", cr: "Manze" },
];

export default function QuickActions() {
  const { language } = useLanguage();
  const label = (a: Action) => (language === "fr" ? a.fr : language === "cr" ? a.cr : a.en);

  const tile = (a: Action) => (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow/10 group-hover:bg-yellow/20 transition-colors">
        <a.icon size={20} className="text-yellow" />
      </span>
      <span className="font-dm text-xs md:text-[13px] text-offwhite/90 leading-tight text-center">{label(a)}</span>
    </>
  );

  const tileClass =
    "group flex flex-col items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm transition-colors hover:border-yellow/40 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50";

  return (
    <section className="bg-dark px-5 pt-10 pb-2" aria-label="Quick access">
      <div className="mx-auto max-w-5xl grid grid-cols-3 gap-3 md:grid-cols-6">
        {ACTIONS.map((a) =>
          a.href ? (
            <Link key={a.key} href={a.href} className={tileClass}>
              {tile(a)}
            </Link>
          ) : (
            <button
              key={a.key}
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("tiroule:open"))}
              className={tileClass}
            >
              {tile(a)}
            </button>
          ),
        )}
      </div>
    </section>
  );
}
