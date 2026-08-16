"use client";

import Link from "next/link";
import { Map as MapIcon, CalendarRange, BookOpen, Siren } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

type Tool = { icon: React.ElementType; label: [string, string, string]; href: string };

// The same four the homepage carries, in the same order. They are utilities
// rather than destinations — the things you reach for mid-trip — which is why
// they sit apart from the navigation instead of inside it.
const TOOLS: Tool[] = [
  { icon: MapIcon, label: ["Map", "Carte", "Kart"], href: "/map" },
  { icon: CalendarRange, label: ["Planner", "Planifier", "Plan"], href: "/trip-planner" },
  { icon: BookOpen, label: ["Guide", "Guide", "Gid"], href: "/guide/rodrigues" },
  { icon: Siren, label: ["Emergency", "Urgences", "Irzans"], href: "/emergency" },
];

/**
 * The travel-tools strip, docked above the bottom navigation.
 *
 * ── THE OWNER SPOTTED IT MISSING ──────────────────────────────────────────
 * The homepage has carried this row for months and the world pages shipped
 * without it, so a visitor who switched worlds lost the map, the planner, the
 * guide and — worse — the emergency numbers. That last one is not a
 * convenience.
 *
 * It is `fixed` and sits directly on top of the floating nav's own gap, so it
 * costs no page height at all; the page's bottom spacer already reserves the
 * room. `pointer-events-none` on the wrapper keeps the strip from swallowing
 * taps meant for the card underneath it — only the chips themselves are live.
 */
export default function WorldTools() {
  const { language } = useLanguage();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-3 md:hidden"
      aria-hidden={false}
    >
      <nav
        aria-label={loc(language, "Travel tools", "Outils de voyage", "Zouti vwayaz")}
        className="rr-cur-rail pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full px-1.5 py-1.5 backdrop-blur-xl"
        style={{
          border: "1px solid var(--cur-line)",
          backgroundColor: "var(--cur-veil)",
        }}
      >
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            // min-h-11, not the 30px the homepage uses for the same row. One of
            // these four is EMERGENCY, and a 30px target for the control
            // somebody reaches for in trouble is not a trade worth making for
            // 14px of screen.
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5"
            style={{ color: "rgba(242,235,225,0.88)" }}
          >
            <t.icon size={13} style={{ color: "var(--cur-copper)" }} />
            <span className="font-dm text-[11px] font-medium">
              {loc(language, t.label[0], t.label[1], t.label[2])}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
