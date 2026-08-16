"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import Reveal from "./Reveal";

/**
 * One heading treatment for the whole page.
 *
 * ── IT USED TO COST 120px BEFORE THE FIRST CARD ───────────────────────────
 * The first version opened with a hairline rule, then a 2.9rem serif title,
 * then two lines of subtitle, then a 40px gap — about a sixth of a phone
 * screen spent introducing a section the reader can already see. On a page
 * whose whole argument is "fewer, better", the chrome around the content was
 * the least edited thing on it.
 *
 * Now: the rule is gone on phones (the generous gap between sections already
 * separates them), the title is a size smaller, the subtitle is clamped to two
 * lines, and "See all" sits on the same baseline as the title instead of
 * needing a row of its own.
 */
export default function SectionHeading({
  title,
  subtitle,
  seeAll,
  id,
}: {
  title: string;
  subtitle?: string;
  seeAll?: string;
  id?: string;
}) {
  const { language } = useLanguage();
  if (!title && !subtitle) return null;

  return (
    <Reveal>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {/* Desktop keeps the rule: at that width the sections sit closer
              together relative to the eye, and it does real work there. */}
          <div className="rr-cur-rule mb-4 hidden max-w-[4rem] lg:block" />
          <h2
            id={id}
            className="rr-cur-display text-[clamp(1.4rem,5vw,2.4rem)]"
            style={{ color: "var(--cur-ivory)" }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="mt-1.5 line-clamp-2 max-w-xl font-dm text-[12.5px] leading-snug lg:text-sm"
              style={{ color: "var(--cur-dim)" }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {seeAll && (
          <Link
            href={seeAll}
            // -my-3 py-3: the link LOOKS like a 20px line of type and is a
            // 44px target. Padding alone would have pushed the baseline off
            // the heading it is meant to sit beside.
            className="group -my-3.5 inline-flex shrink-0 items-center gap-1 py-3.5 font-dm text-[12px] font-medium"
            style={{ color: "var(--cur-champagne)" }}
          >
            {language === "fr" ? "Voir tout" : language === "cr" ? "Get tou" : "See all"}
            <ArrowRight
              size={13}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </Link>
        )}
      </div>
    </Reveal>
  );
}
