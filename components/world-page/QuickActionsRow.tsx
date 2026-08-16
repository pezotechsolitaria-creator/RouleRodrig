"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { locT, type QuickActionItem } from "@/lib/world-docs/types";
import { curatedIcon } from "./icons";
import Reveal from "./Reveal";

/**
 * Six tactile tiles, immediately under the hero.
 *
 * ── ONE ROW, AND ALL SIX STILL VISIBLE ────────────────────────────────────
 * This was a 3×2 grid: correct in principle — every destination on screen, no
 * hidden swipe — and 199px tall, a quarter of a phone screen spent on six
 * words. Six tiles fit ACROSS a 390px phone at 56px each, which keeps the one
 * property that mattered (nothing hidden) and gives back 110px to the
 * recommendations underneath.
 *
 * `overflow-x-auto` is a safety net, not the design: it exists for a 320px
 * screen or a doubled text size, where the row would otherwise be crushed.
 * At every normal width there is nothing to scroll.
 *
 * ── THE ACTIVE STATE ──────────────────────────────────────────────────────
 * The tile for the world you are already in does not navigate. It is rendered
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
      <div className="rr-cur-rail flex items-stretch gap-2 overflow-x-auto pb-1 sm:gap-2.5 lg:gap-3">
        {live.map((item, i) => {
          const Icon = curatedIcon(item.icon);
          const here = item.href === pathname;
          const label = locT(language, item.label);

          const inner = (
            <>
              <Icon
                size={18}
                strokeWidth={1.4}
                style={{ color: here ? "var(--cur-champagne)" : "var(--cur-copper)" }}
              />
              <span
                className="text-center font-dm text-[10px] font-medium leading-tight sm:text-[11px]"
                style={{ color: here ? "var(--cur-champagne)" : "rgba(242,235,225,0.86)" }}
              >
                {label}
              </span>
              {/* No "you are here" caption: in a 68px tile it was a third
                  line of type saying what the champagne icon, the champagne
                  label and aria-current already say. */}
            </>
          );

          // basis-0 + grow: the six tiles share the row equally and shrink
          // together rather than the last one falling off the edge.
          const base =
            "flex h-full min-h-[68px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2.5 sm:min-h-[76px]";

          return (
            <Reveal
              key={item.id}
              delay={i * 45}
              className="h-auto min-w-[54px] shrink-0 grow basis-0 sm:min-w-[62px]"
            >
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
