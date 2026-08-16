"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  Bike, Car, BedDouble, TreePalm, Bot, ShoppingBag, Utensils, Umbrella, Compass,
  PartyPopper,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import type { HomeCard } from "@/lib/defaults";
import Reveal from "./Reveal";

const HOME_ICON: Record<string, React.ElementType> = {
  scooter: Bike, car: Car, stay: BedDouble, experience: TreePalm, tiroule: Bot,
  store: ShoppingBag, restaurant: Utensils, beach: Umbrella, compass: Compass,
  event: PartyPopper,
};

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * The six photo cards — the same ones the homepage carries.
 *
 * ── WHY THIS IS NOT A SECOND CARD LIST ────────────────────────────────────
 * It reads `content.homeCards`, exactly as the homepage does. The owner adds a
 * category in the content studio and it appears in every world, with the same
 * label and the same photographs. A world-specific copy would have meant
 * maintaining the site's primary navigation in two places, and finding out they
 * had drifted from a customer.
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
  cards: HomeCard[];
  images: Record<string, string[]>;
}) {
  const { language } = useLanguage();
  if (!cards.length) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 lg:px-8">
      <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-6 lg:gap-3.5">
        {cards.map((c, i) => {
          const Icon = HOME_ICON[c.icon] ?? Compass;
          const src = (images[c.imageSource] ?? [])[0];
          const label = loc(language, c.label, c.labelFr, c.labelCr);

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
                className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg backdrop-blur-md"
                style={{
                  border: "1px solid var(--cur-line)",
                  backgroundColor: "rgba(10,9,8,0.4)",
                  color: "var(--cur-champagne)",
                }}
              >
                <Icon size={14} />
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
                  {loc(language, "Popular", "Populaire", "Popiler")}
                </span>
              )}
              <span className="relative p-2.5">
                <span
                  className="block font-dm text-[12px] font-semibold leading-tight"
                  style={{ color: "#FFFCF7" }}
                >
                  {label}
                </span>
                <span
                  className="mt-0.5 inline-flex items-center gap-1 font-dm text-[10px]"
                  style={{ color: "var(--cur-champagne)" }}
                >
                  {loc(language, "Explore", "Explorer", "Explor")}
                  <ArrowRight size={10} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </>
          );

          const cls =
            "rr-cur-card group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2";

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
