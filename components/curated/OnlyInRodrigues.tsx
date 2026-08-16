"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT } from "@/lib/world-docs/types";
import type { ResolvedCard } from "@/lib/world-docs/resolve";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * Only in Rodrigues.
 *
 * ── A DIFFERENT CARD LANGUAGE ON PURPOSE ──────────────────────────────────
 * Featured Curations puts its words ON the photograph. This section puts them
 * UNDER it. Two sections of identical overlay cards would read as one long
 * grid however different the copy is — the change of construction is what says
 * "this is a different kind of thing".
 *
 * It also suits the content: these are short stories about places, and a story
 * wants a line of prose the reader can actually read, which is exactly what a
 * scrim over a bright lagoon photograph makes hard.
 */
export default function OnlyInRodrigues({
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
  const { language } = useLanguage();
  if (!cards.length) return null;

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 lg:px-8">
      <SectionHeading title={title ?? ""} subtitle={subtitle} />

      <div className="mt-8 grid grid-cols-2 gap-x-3.5 gap-y-7 lg:mt-11 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10">
        {cards.map((card, i) => {
          const heading = locT(language, card.title);
          const blurb = locT(language, card.blurb);
          const meta = locT(language, card.meta);
          return (
            <Reveal key={card.id} delay={Math.min(i, 5) * 60}>
              <Link
                href={card.href}
                className="group block focus:outline-none focus-visible:ring-2"
              >
                <div
                  className="rr-cur-card relative aspect-[4/5] w-full overflow-hidden rounded-2xl lg:aspect-[5/4]"
                  style={{ backgroundColor: "var(--cur-bg-raised)" }}
                >
                  {card.image ? (
                    <Image
                      src={card.image}
                      alt=""
                      fill
                      loading="lazy"
                      sizes="(max-width: 1024px) 46vw, 340px"
                      className="object-cover"
                      unoptimized={unopt(card.image)}
                    />
                  ) : (
                    <span
                      className="absolute inset-0"
                      style={{
                        background: "var(--cur-fallback)",
                      }}
                    />
                  )}
                  {meta && (
                    <span
                      className="rr-cur-eyebrow absolute left-3 top-3 rounded-full px-2.5 py-1 text-[9px] backdrop-blur-md"
                      style={{
                        letterSpacing: "0.16em",
                        color: "var(--cur-ivory)",
                        backgroundColor: "rgba(10,9,8,0.44)",
                      }}
                    >
                      {meta}
                    </span>
                  )}
                </div>

                <h3
                  className="rr-cur-display mt-4 text-[clamp(1.05rem,3.6vw,1.4rem)]"
                  style={{ color: "var(--cur-ivory)" }}
                >
                  {heading}
                </h3>
                {blurb && (
                  <p
                    // Two lines on a phone, three on a wide screen. A curated
                    // page that lets one story run to six lines while its
                    // neighbour runs to one stops looking composed.
                    className="mt-1.5 line-clamp-2 font-dm text-[13px] leading-relaxed lg:line-clamp-3"
                    style={{ color: "var(--cur-dim)" }}
                  >
                    {blurb}
                  </p>
                )}
                <span
                  className="mt-2.5 inline-flex items-center gap-1 font-dm text-[12px] font-medium"
                  style={{ color: "var(--cur-copper)" }}
                >
                  {language === "fr" ? "Voir" : language === "cr" ? "Get" : "See it"}
                  <ArrowUpRight
                    size={13}
                    className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
