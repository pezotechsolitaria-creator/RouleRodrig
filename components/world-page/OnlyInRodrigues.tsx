"use client";

import Link from "next/link";
import Image from "next/image";
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
 * ── THE SECTION THAT COST A THIRD OF THE PAGE ─────────────────────────────
 * This was a two-column grid of 4:5 photographs, each with a heading and three
 * lines of prose beneath: 1,199px on a phone — more than the hero and the
 * featured rail put together — for six links. It was the best-looking section
 * on the page and the one that made everything after it unreachable.
 *
 * It is now what it was always trying to be: a fast visual index of what makes
 * this island itself. Square tiles, one line of type, six across a desktop and
 * two and a half on a phone. The stories did not disappear — they moved to the
 * pages the tiles were already linking to, which is where a reader who wants
 * them is going anyway.
 *
 * The titles carry the editorial voice ("Worth the climb"), so they have to
 * stay SHORT. Two lines is the budget, and the clamp enforces it rather than
 * trusting whoever writes the next one.
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

      <div className="mx-auto max-w-6xl">
        <div className="rr-cur-rail mt-4 flex gap-2.5 overflow-x-auto px-5 pb-2 lg:mt-7 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-8 lg:pb-0">
          {cards.map((card, i) => (
            <Reveal
              key={card.id}
              delay={Math.min(i, 5) * 50}
              className="w-[38vw] max-w-[11rem] shrink-0 lg:w-auto lg:max-w-none"
            >
              <Link
                href={card.href}
                className="rr-cur-card group relative isolate flex aspect-square flex-col justify-end overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: "var(--cur-bg-raised)" }}
              >
                {card.image ? (
                  <Image
                    src={card.image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(max-width: 1024px) 38vw, 180px"
                    className="-z-10 object-cover"
                    unoptimized={unopt(card.image)}
                  />
                ) : (
                  <span
                    className="absolute inset-0 -z-10"
                    style={{ background: "var(--cur-fallback)" }}
                  />
                )}
                {/* Tall and dark at the foot: one line of small type has to stay
                    legible over a bright lagoon at any crop. */}
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-3/4"
                  style={{
                    backgroundImage:
                      "linear-gradient(to top, rgba(8,7,6,0.94) 6%, rgba(10,8,6,0.5) 52%, transparent)",
                  }}
                />
                <span className="relative p-2.5">
                  <span
                    className="line-clamp-2 block font-dm text-[11.5px] font-medium leading-tight"
                    style={{ color: "#FFFCF7" }}
                  >
                    {locT(language, card.title)}
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
