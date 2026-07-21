"use client";

import Link from "next/link";
import { Map, Compass, Route, BookOpen } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// "Quick Access" strip — the Air-Mauritius-style action row that sits right
// under the browse hub, kept compact so the hero + hub + this fit the first
// screen. Deliberately the free TOOLS & GUIDES (NOT Ti Roulé — that's the
// floating chat button — nor Food/Scooters/Cars, which are hub tiles). Every
// tile links to a page/section that already exists.
type Action = { key: string; icon: typeof Map; href: string; en: string; fr: string; cr: string };

const ACTIONS: Action[] = [
  { key: "guide", icon: Map, href: "/guide/rodrigues", en: "Guide", fr: "Guide", cr: "Gid" },
  { key: "planner", icon: Compass, href: "/trip-planner", en: "Planner", fr: "Planifier", cr: "Plan" },
  { key: "routes", icon: Route, href: "/guide/routes", en: "Routes", fr: "Routes", cr: "Semin" },
  { key: "blog", icon: BookOpen, href: "/blog", en: "Blog", fr: "Blog", cr: "Blog" },
];

export default function QuickActions() {
  const { language } = useLanguage();
  const label = (a: Action) => (language === "fr" ? a.fr : language === "cr" ? a.cr : a.en);
  const eyebrow = language === "fr" ? "Accès rapide" : language === "cr" ? "Aksé rapid" : "Quick access";

  return (
    <section className="bg-dark px-5 pb-9 pt-0.5" aria-label="Quick access">
      <div className="mx-auto max-w-4xl">
        <p className="mb-1.5 font-bebas text-[11px] tracking-[0.35em] text-yellow/90">{eyebrow}</p>
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
          {ACTIONS.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-2 py-3.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-yellow/40 hover:from-yellow/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow/12 text-yellow ring-1 ring-inset ring-yellow/20 transition-colors group-hover:bg-yellow/20">
                <a.icon size={19} />
              </span>
              <span className="font-dm text-[11px] font-medium leading-none text-offwhite/85 sm:text-xs">
                {label(a)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
