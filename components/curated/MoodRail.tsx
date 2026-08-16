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
  moods,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  moods: ResolvedMood[];
}) {
  const { language } = useLanguage();
  if (!moods.length) return null;

  return (
    <section id={id} className="scroll-mt-24">
      <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
        <SectionHeading title={title ?? ""} subtitle={subtitle} />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="rr-cur-rail mt-8 flex gap-3.5 overflow-x-auto px-5 pb-3 lg:mt-11 lg:gap-5 lg:px-8">
          {moods.map((mood, i) => (
            <Reveal
              key={mood.id}
              delay={Math.min(i, 3) * 80}
              className="w-[76vw] max-w-[19rem] shrink-0 lg:w-[19rem]"
            >
              <Link
                href={mood.href}
                className="rr-cur-card group relative isolate flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-3xl focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: "var(--cur-bg-raised)" }}
              >
                {mood.image ? (
                  <Image
                    src={mood.image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(max-width: 1024px) 76vw, 304px"
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

                <div className="p-5">
                  <h3
                    className="rr-cur-eyebrow text-[10px]"
                    style={{ color: "var(--cur-champagne)", letterSpacing: "0.22em" }}
                  >
                    {locT(language, mood.title)}
                  </h3>
                  <p
                    className="rr-cur-display mt-2.5 text-[1.35rem] leading-[1.2]"
                    style={{ color: "#FFFCF7" }}
                  >
                    {locT(language, mood.blurb)}
                  </p>
                  <span
                    className="mt-4 inline-flex items-center gap-1.5 font-dm text-[12px] font-medium"
                    style={{ color: "rgba(242,235,225,0.62)" }}
                  >
                    {language === "fr"
                      ? "Voir ces journées"
                      : language === "cr"
                        ? "Get sa bann zourne la"
                        : "Show me these days"}
                    <ArrowRight
                      size={13}
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
