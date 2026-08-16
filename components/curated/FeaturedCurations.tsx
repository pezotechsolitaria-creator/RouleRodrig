"use client";

import type { ResolvedCard } from "@/lib/world-docs/resolve";
import CurationCard from "./CurationCard";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

/**
 * Handpicked for you.
 *
 * ── TWO LAYOUTS, ONE LIST ─────────────────────────────────────────────────
 * Phone: a snap rail whose cards are 84vw, so the next one always peeks. The
 * peek is the affordance — it is what makes the swipe discoverable without an
 * arrow, a dot row or a "swipe" hint.
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
  cards,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  cards: ResolvedCard[];
}) {
  if (!cards.length) return null;

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 lg:px-8">
      <SectionHeading title={title ?? ""} subtitle={subtitle} />

      <div
        className="rr-cur-rail -mx-5 mt-8 flex gap-3.5 overflow-x-auto px-5 pb-2 lg:mx-0 lg:mt-10 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0 lg:[grid-auto-rows:16.5rem]"
      >
        {cards.map((card, i) => (
          <div
            key={card.id}
            className={`w-[84vw] max-w-[21rem] shrink-0 lg:w-auto lg:max-w-none lg:shrink ${
              i === 0 ? "lg:col-span-2 lg:row-span-2" : ""
            }`}
          >
            {/* The reveal is per card and staggered by 70ms. On the desktop grid
                that reads as the spread assembling; on the rail only the first
                two are ever on screen when it fires, so the rest arrive already
                shown rather than animating under the reader's thumb. */}
            <Reveal delay={Math.min(i, 4) * 70} className="h-full">
              <CurationCard card={card} feature={i === 0} priority={i === 0} />
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}
