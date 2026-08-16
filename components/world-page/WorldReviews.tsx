"use client";

import { Star } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { WorldReview } from "@/lib/world-docs/page-data";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

/**
 * What people said.
 *
 * ── REAL ONES OR NONE ─────────────────────────────────────────────────────
 * These come from `product_reviews`, approved, with the reviewer's own words.
 * There is no seed copy and no fallback: a page of invented praise is the one
 * thing here that would be a lie, and on a curated page — whose entire claim is
 * that a person vouched for these things — it would be the most expensive lie
 * available. No reviews, no section.
 *
 * ── NO AGGREGATE SCORE ────────────────────────────────────────────────────
 * No "4.9 из 5 from 128 reviews" banner either. That number belongs to a
 * product page, where somebody is comparing; here it would be a statistic
 * standing in front of the sentences that actually persuade.
 */
export default function WorldReviews({
  id,
  title,
  subtitle,
  reviews,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  reviews: WorldReview[];
}) {
  const { language } = useLanguage();
  if (!reviews.length) return null;

  return (
    <section id={id} className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
        <SectionHeading title={title ?? ""} subtitle={subtitle} />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="rr-cur-rail mt-4 flex gap-2.5 overflow-x-auto px-5 pb-2 lg:mt-6 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-8 lg:pb-0">
          {reviews.slice(0, 6).map((r, i) => (
            <Reveal
              key={r.id}
              delay={Math.min(i, 3) * 55}
              className="w-[78vw] max-w-[20rem] shrink-0 lg:w-auto lg:max-w-none"
            >
              <figure
                className="flex h-full flex-col rounded-2xl p-4"
                style={{
                  border: "1px solid var(--cur-line)",
                  backgroundColor: "var(--cur-bg-card)",
                }}
              >
                <span className="flex items-center gap-0.5" aria-hidden>
                  {Array.from({ length: 5 }, (_, n) => (
                    <Star
                      key={n}
                      size={12}
                      className={n < Math.round(r.rating) ? "fill-current" : ""}
                      style={{
                        color:
                          n < Math.round(r.rating) ? "var(--cur-peach)" : "var(--cur-faint)",
                      }}
                    />
                  ))}
                </span>
                <span className="sr-only">
                  {r.rating} {language === "fr" ? "sur 5" : "out of 5"}
                </span>

                {/* The serif carries the quote. It is the one place on this page
                    where somebody else is talking, and the change of voice is
                    what makes that legible without a "TESTIMONIAL" label. */}
                <blockquote
                  className="rr-cur-display mt-3 line-clamp-5 text-[1.05rem] leading-snug"
                  style={{ color: "var(--cur-ivory)" }}
                >
                  {r.text}
                </blockquote>

                <figcaption
                  className="mt-auto pt-3 font-dm text-[11.5px]"
                  style={{ color: "var(--cur-faint)" }}
                >
                  {r.name}
                  {r.origin ? ` · ${r.origin}` : ""}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
