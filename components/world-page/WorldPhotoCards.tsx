"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  Bike, Car, BedDouble, TreePalm, Bot, ShoppingBag, Utensils, Umbrella, Compass,
  PartyPopper,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT, type WorldPhotoCard } from "@/lib/world-docs/types";
import Reveal from "./Reveal";

const HOME_ICON: Record<string, React.ElementType> = {
  scooter: Bike, car: Car, stay: BedDouble, experience: TreePalm, tiroule: Bot,
  store: ShoppingBag, restaurant: Utensils, beach: Umbrella, compass: Compass,
  event: PartyPopper,
};

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * The large photo cards, from THIS WORLD'S document.
 *
 * ── INDEPENDENT, DELIBERATELY ─────────────────────────────────────────────
 * These are not the homepage's cards. Adding one here changes this world and
 * nothing else — see the note on CardsSection in lib/world-docs/types.ts for
 * why that is worth the duplicate entry.
 *
 * The PHOTOGRAPHS are still shared, and that part is right: `imageSource` names
 * a catalogue category, so a scooter photo uploaded once appears on every card
 * that draws from scooters. What each world SHOWS is editorial; which
 * photographs exist is not.
 *
 * ── ONE CARD LANGUAGE ON THE PAGE ─────────────────────────────────────────
 * These wear the same construction as the recommendation cards below them: a
 * chip in the top corner, a serif name over a tall scrim, a champagne way in.
 * They were a smaller, sans-serif tile with an icon badge, which read as a
 * different component from a different site sitting above the real ones. Same
 * language, smaller size — that is what makes a page look composed rather than
 * assembled.
 *
 * ── ONE PHOTOGRAPH, NOT SIX CYCLING ───────────────────────────────────────
 * The homepage version cross-fades through every photo in each category — six
 * cards each running a timer. It suits a page whose job is to show how much is
 * here. A curated page's job is the opposite, so each card holds one still and
 * spends nothing.
 */
export default function WorldPhotoCards({
  cards,
  images,
}: {
  cards: WorldPhotoCard[];
  images: Record<string, string[]>;
}) {
  const { language } = useLanguage();
  if (!cards.length) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 lg:px-8">
      <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-6 lg:gap-3.5">
        {cards.map((c, i) => {
          const Icon = HOME_ICON[c.icon] ?? Compass;
          const src = c.image?.trim() || (images[c.imageSource] ?? [])[0];
          const label = locT(language, c.label);

          const body = (
            <>
              {src ? (
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 33vw, 190px"
                  priority={i < 3}
                  loading={i < 3 ? undefined : "lazy"}
                  className="-z-10 object-cover"
                  unoptimized={unopt(src)}
                />
              ) : (
                <span className="absolute inset-0 -z-10" style={{ background: "var(--cur-fallback)" }} />
              )}
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-4/5"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(8,7,6,0.95) 4%, rgba(10,8,6,0.5) 48%, transparent)",
                }}
              />
              <span
                className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full backdrop-blur-md"
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(10,9,8,0.44)",
                  color: "var(--cur-champagne)",
                }}
              >
                <Icon size={12} />
              </span>
              {c.popular && (
                <span
                  className="rr-cur-eyebrow absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[7.5px]"
                  style={{
                    backgroundColor: "var(--cur-champagne)",
                    color: "var(--cur-on-accent)",
                    letterSpacing: "0.12em",
                  }}
                >
                  {language === "fr" ? "Populaire" : language === "cr" ? "Popiler" : "Popular"}
                </span>
              )}
              <span className="relative p-2.5">
                <span
                  className="rr-cur-display line-clamp-2 block text-[1.05rem] leading-[1.1]"
                  style={{ color: "#FFFCF7" }}
                >
                  {label}
                </span>
                <span
                  className="mt-1 inline-flex items-center gap-1 font-dm text-[10.5px] font-medium"
                  style={{ color: "var(--cur-champagne)" }}
                >
                  {language === "fr" ? "Explorer" : language === "cr" ? "Explor" : "Explore"}
                  <ArrowRight size={10} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </>
          );

          const cls =
            "rr-cur-card group relative isolate flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2";

          return (
            <Reveal key={c.id} delay={Math.min(i, 5) * 45}>
              {c.action === "tiroule" ? (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("tiroule:open"))}
                  className={`${cls} w-full text-left`}
                  style={{ backgroundColor: "var(--cur-bg-raised)" }}
                >
                  {body}
                </button>
              ) : (
                <Link
                  href={c.href ?? "/explore"}
                  className={cls}
                  style={{ backgroundColor: "var(--cur-bg-raised)" }}
                >
                  {body}
                </Link>
              )}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
