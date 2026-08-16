"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { locT, type QuickActionItem } from "@/lib/world-docs/types";
import { curatedIcon } from "./icons";
import Reveal from "./Reveal";

/**
 * Six tactile cards, immediately under the hero.
 *
 * ── A GRID, NOT A CARRIER RAIL ────────────────────────────────────────────
 * Six items fit a 3×2 grid on a 375px phone at a comfortable size, so all six
 * are visible on the first screen. A horizontal rail here would show four and a
 * half and hide the rest behind a swipe nobody makes — the exact failure this
 * project already fixed once on the homepage's tile row. The brief allows a
 * scroll "if needed"; with six items it is not needed.
 *
 * ── THE ACTIVE STATE ──────────────────────────────────────────────────────
 * The card for the world you are already in does not navigate. It is rendered
 * as a marked, non-interactive tile that says "you are here", because a link
 * back to the page you are on is the clearest way to make navigation feel
 * broken.
 */
export default function QuickActionsRow({ items }: { items: QuickActionItem[] }) {
  const { language } = useLanguage();
  const pathname = usePathname() || "/curated";
  const live = items.filter((i) => i.enabled !== false && i.href);
  if (!live.length) return null;

  return (
    <nav
      aria-label={language === "fr" ? "Univers" : "Worlds"}
      className="mx-auto w-full max-w-6xl px-5 lg:px-8"
    >
      {/* auto-rows-fr: the "you are here" tile carries one extra line of type,
          and without it that tile's ROW grew taller than the one above it. */}
      <div className="grid auto-rows-fr grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-6">
        {live.map((item, i) => {
          const Icon = curatedIcon(item.icon);
          const here = item.href === pathname;
          const label = locT(language, item.label);

          const inner = (
            <>
              <Icon
                size={20}
                strokeWidth={1.4}
                style={{ color: here ? "var(--cur-champagne)" : "var(--cur-copper)" }}
              />
              <span
                className="text-center font-dm text-[11px] font-medium leading-tight sm:text-xs"
                style={{ color: here ? "var(--cur-champagne)" : "rgba(242,235,225,0.86)" }}
              >
                {label}
              </span>
              {here && (
                <span
                  className="rr-cur-eyebrow text-[8px] leading-none"
                  style={{ color: "var(--cur-faint)", letterSpacing: "0.18em" }}
                >
                  {language === "fr" ? "Ici" : language === "cr" ? "Isi" : "Here"}
                </span>
              )}
            </>
          );

          const base =
            "flex h-full min-h-[86px] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-4 sm:min-h-[96px]";

          return (
            <Reveal key={item.id} delay={i * 55} className="h-full">
              {here ? (
                <div
                  aria-current="page"
                  className={base}
                  style={{
                    border: "1px solid var(--cur-line-strong)",
                    background: "var(--cur-tint)",
                  }}
                >
                  {inner}
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={`rr-cur-card ${base} focus:outline-none focus-visible:ring-2`}
                  style={{ backgroundColor: "var(--cur-bg-card)" }}
                >
                  {inner}
                </Link>
              )}
            </Reveal>
          );
        })}
      </div>
    </nav>
  );
}
