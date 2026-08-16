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
 * Only in Rodrigues — the page's one moment of theatre.
 *
 * ── IT HAS BEEN THREE THINGS, AND THIS IS WHY ─────────────────────────────
 * First a two-column grid of photographs with prose under each: beautiful, and
 * 1,199px tall on a phone — it pushed everything after it out of reach. Then a
 * row of small square tiles: honest, compact, and completely flat. The owner's
 * note on that second version was the right one — it can be done better.
 *
 * So this is the section that is ALLOWED to be big, and it earns it by being
 * the only one:
 *
 *  · FULL BLEED. It breaks the page's container and runs edge to edge, which
 *    nothing else here does. That alone says "stop, look at this".
 *  · TALL. 3:4.6 portraits, the proportion of a printed plate, against the
 *    3:4 and 4:5 everywhere else.
 *  · A BROKEN BASELINE. Every second card sits lower, so the row reads as a
 *    hand-arranged spread rather than a carousel. This is the whole trick, and
 *    it costs one CSS class.
 *  · A GHOST NUMERAL behind each title — an editor's plate number, at 15%.
 *
 * It is still a rail, and still ~360px tall. Theatre, not expense.
 */
export default function OnlyInRodrigues({
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
  const { language } = useLanguage();
  if (!cards.length) return null;

  return (
    <section id={id} className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
        <SectionHeading title={title ?? ""} subtitle={subtitle} seeAll={seeAll} />
      </div>

      {/* pb-6 carries the offset of the dropped cards — without it the last
          row of them is clipped by the section below. */}
      <div className="rr-cur-rail mt-5 flex gap-2.5 overflow-x-auto px-5 pb-6 lg:mt-8 lg:gap-4 lg:px-8">
        {cards.map((card, i) => {
          const heading = locT(language, card.title);
          const meta = locT(language, card.meta);
          const dropped = i % 2 === 1;

          return (
            <Reveal
              key={card.id}
              delay={Math.min(i, 5) * 60}
              className={`w-[58vw] max-w-[15rem] shrink-0 lg:w-[15rem] ${dropped ? "mt-6" : ""}`}
            >
              <Link
                href={card.href}
                className="rr-cur-card group relative isolate flex aspect-[3/4.6] flex-col justify-end overflow-hidden rounded-[1.25rem] focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: "var(--cur-bg-raised)" }}
              >
                {card.image ? (
                  <Image
                    src={card.image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(max-width: 1024px) 58vw, 240px"
                    className="-z-10 object-cover"
                    unoptimized={unopt(card.image)}
                  />
                ) : (
                  <span
                    className="absolute inset-0 -z-10"
                    style={{ background: "var(--cur-fallback)" }}
                  />
                )}

                {/* Tall and dark at the foot: a plate number and a serif line
                    have to hold over a bright lagoon at any crop. */}
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3"
                  style={{
                    backgroundImage:
                      "linear-gradient(to top, rgba(8,7,6,0.96) 8%, rgba(10,8,6,0.55) 48%, transparent)",
                  }}
                />

                {/* The plate number. Decorative, so it is hidden from readers
                    who are listening rather than looking. */}
                <span
                  aria-hidden
                  className="rr-cur-display pointer-events-none absolute right-3 top-1 select-none text-[3.4rem] leading-none"
                  style={{ color: "rgba(255,252,247,0.15)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span className="relative p-3.5">
                  {meta && (
                    <span
                      className="rr-cur-eyebrow block text-[8px]"
                      style={{ color: "var(--cur-champagne)", letterSpacing: "0.2em" }}
                    >
                      {meta}
                    </span>
                  )}
                  <span
                    className="rr-cur-display mt-1 line-clamp-3 block text-[1.15rem] leading-[1.15]"
                    style={{ color: "#FFFCF7" }}
                  >
                    {heading}
                  </span>
                  <span
                    className="mt-2 inline-flex items-center gap-1 font-dm text-[11px] font-medium"
                    style={{ color: "rgba(242,235,225,0.6)" }}
                  >
                    {language === "fr" ? "Voir" : language === "cr" ? "Get" : "See it"}
                    <ArrowUpRight
                      size={12}
                      className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
