"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT } from "@/lib/world-docs/types";
import type { ResolvedMood } from "@/lib/world-docs/resolve";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * How do you want to experience Rodrigues?
 *
 * ── EMOTIONAL DISCOVERY, NOT A FILTER BAR ─────────────────────────────────
 * The difference is what the card promises. "Beaches (24)" asks the reader to
 * already know what they want and offers to narrow it. "Slow days — quiet
 * mornings, an empty lagoon, a long lunch and nowhere to be" describes a day
 * and lets them recognise themselves in it. So: no counts, no chips, no filter
 * language, and a full photograph behind every one.
 *
 * These are the tallest cards on the page (3:4 on a phone) because a feeling
 * needs room. They stay a rail on every breakpoint — five moods across a
 * desktop row would make each one a column of a table, which is precisely the
 * filter-bar reading this section exists to avoid.
 */
export default function MoodRail({
  id,
  title,
  subtitle,
  seeAll,
  moods,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  seeAll?: string;
  moods: ResolvedMood[];
}) {
  const { language } = useLanguage();
  if (!moods.length) return null;

  return (
    <section id={id} className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
        <SectionHeading title={title ?? ""} subtitle={subtitle} seeAll={seeAll} />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="rr-cur-rail mt-4 flex gap-2.5 overflow-x-auto px-5 pb-2 lg:mt-7 lg:gap-4 lg:px-8">
          {moods.map((mood, i) => (
            <Reveal
              key={mood.id}
              delay={Math.min(i, 3) * 80}
              className="w-[58vw] max-w-[15rem] shrink-0 lg:w-[16rem]"
            >
              <Link
                href={mood.href}
                className="rr-cur-card group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 lg:rounded-3xl"
                style={{ backgroundColor: "var(--cur-bg-raised)" }}
              >
                {mood.image ? (
                  <Image
                    src={mood.image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(max-width: 1024px) 58vw, 256px"
                    className="-z-10 object-cover"
                    unoptimized={unopt(mood.image)}
                  />
                ) : (
                  <span
                    className="absolute inset-0 -z-10"
                    style={{
                      background: "var(--cur-fallback)",
                    }}
                  />
                )}
                {/* Heavier than the other scrims: a mood card is carrying three
                    lines of prose over a photograph, not a name. */}
                <span
                  className="pointer-events-none absolute inset-0 -z-10"
                  style={{
                    backgroundImage:
                      "linear-gradient(to top, rgba(8,7,6,0.96) 4%, rgba(10,8,6,0.62) 46%, rgba(18,12,6,0.14) 78%, transparent)",
                  }}
                />

                <div className="p-3.5 lg:p-4">
                  <h3
                    className="rr-cur-eyebrow text-[9px]"
                    style={{ color: "var(--cur-champagne)", letterSpacing: "0.22em" }}
                  >
                    {locT(language, mood.title)}
                  </h3>
                  <p
                    className="rr-cur-display mt-1.5 line-clamp-3 text-[1.1rem] leading-[1.16] lg:text-[1.25rem]"
                    style={{ color: "#FFFCF7" }}
                  >
                    {locT(language, mood.blurb)}
                  </p>
                  <span
                    className="mt-2.5 inline-flex items-center gap-1.5 font-dm text-[11px] font-medium"
                    style={{ color: "rgba(242,235,225,0.62)" }}
                  >
                    {language === "fr" ? "Voir" : language === "cr" ? "Get" : "Show me"}
                    <ArrowRight
                      size={12}
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
