"use client";

import type { ResolvedCard } from "@/lib/world-docs/resolve";
import CurationCard from "./CurationCard";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

/**
 * Handpicked for you.
 *
 * ── TWO LAYOUTS, ONE LIST ─────────────────────────────────────────────────
 * Phone: a snap rail of 3:4 cards at 41vw, so two and a half are on screen and
 * the third is visibly there to be swiped to. The first version used 84vw
 * cards — one card, one screen — which is a fine way to show somebody a single
 * recommendation and a poor way to show them six. Seeing the SET is the
 * editorial argument: "we chose these", not "here is one, swipe for another".
 *
 * Desktop: NOT the rail stretched out. A 3-column editorial grid where the
 * first card takes two columns and two rows, so the eye has somewhere to land
 * before it starts scanning. Six equal rectangles is a search results page; one
 * big and five small is a spread.
 */
export default function FeaturedCurations({
  id,
  title,
  subtitle,
  seeAll,
  cards,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  seeAll?: string;
  cards: ResolvedCard[];
}) {
  if (!cards.length) return null;

  return (
    <section id={id} className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
        <SectionHeading title={title ?? ""} subtitle={subtitle} seeAll={seeAll} />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="rr-cur-rail mt-4 flex gap-2.5 overflow-x-auto px-5 pb-2 lg:mt-7 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-8 lg:pb-0 lg:[grid-auto-rows:14rem]">
          {cards.map((card, i) => (
            <div
              key={card.id}
              className={`aspect-[3/4] w-[41vw] max-w-[13rem] shrink-0 lg:aspect-auto lg:w-auto lg:max-w-none lg:shrink ${
                i === 0 ? "lg:col-span-2 lg:row-span-2" : ""
              }`}
            >
              {/* Staggered by 60ms, and only for the first few. On the desktop
                  grid that reads as the spread assembling; on the rail the rest
                  arrive already shown rather than animating under a thumb. */}
              <Reveal delay={Math.min(i, 4) * 60} className="h-full">
                <CurationCard card={card} feature={i === 0} priority={i === 0} />
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
