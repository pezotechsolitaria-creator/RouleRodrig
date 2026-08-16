"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT } from "@/lib/world-docs/types";
import type { ResolvedCard } from "@/lib/world-docs/resolve";
import SaveButton from "./SaveButton";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/** Label tones map to weight, not to hue — one accent family, three volumes. */
const TONE: Record<string, { bg: string; fg: string; border: string }> = {
  pick: {
    bg: "var(--cur-champagne)",
    fg: "var(--cur-on-accent)",
    border: "transparent",
  },
  warm: {
    bg: "rgba(192,132,87,0.18)",
    fg: "var(--cur-peach)",
    border: "rgba(192,132,87,0.4)",
  },
  quiet: {
    bg: "rgba(255,250,244,0.06)",
    fg: "rgba(242,235,225,0.82)",
    border: "rgba(255,250,244,0.14)",
  },
};

/**
 * The editorial recommendation card.
 *
 * ── THE IMAGE SELLS IT ────────────────────────────────────────────────────
 * There is no rating, no review count, no "from Rs" chip and no availability
 * badge on this card, and their absence is the design. Those belong on a
 * product tile, where the reader is comparing. Here they are comparing nothing
 * — they are being shown something — so the card carries a photograph, one
 * category, a name, at most one factual line, and a way in.
 *
 * `feature` is the asymmetry: on desktop one card per section is allowed to be
 * twice the size of its neighbours. That is what stops a grid of equals from
 * reading as a catalogue page.
 */
export default function CurationCard({
  card,
  feature = false,
  priority = false,
}: {
  card: ResolvedCard;
  feature?: boolean;
  priority?: boolean;
}) {
  const { language } = useLanguage();
  const title = locT(language, card.title);
  const blurb = locT(language, card.blurb);
  const category = locT(language, card.category);
  const meta = locT(language, card.meta);

  return (
    <Link
      href={card.href}
      className={`rr-cur-card group relative isolate flex h-full flex-col justify-end overflow-hidden rounded-3xl focus:outline-none focus-visible:ring-2 ${
        feature ? "min-h-[26rem] lg:min-h-0" : "min-h-[20rem] lg:min-h-0"
      }`}
      style={{ backgroundColor: "var(--cur-bg-raised)" }}
    >
      {card.image ? (
        <Image
          src={card.image}
          alt=""
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes={
            feature
              ? "(max-width: 1024px) 86vw, 640px"
              : "(max-width: 1024px) 86vw, 380px"
          }
          className="-z-10 object-cover"
          unoptimized={unopt(card.image)}
        />
      ) : (
        <span
          className="absolute inset-0 -z-10"
          style={{
            background: "var(--cur-fallback)",
          }}
        />
      )}

      {/* The scrim is only as tall as the text needs. A full-card overlay is
          what turns photography into a grey rectangle with words on it. */}
      <span
        className="rr-cur-scrim pointer-events-none absolute inset-x-0 bottom-0 -z-10"
        style={{ height: feature ? "72%" : "78%" }}
      />

      {/* Top row: category on the left, save on the right. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        <span className="flex flex-wrap gap-1.5">
          {category && (
            <span
              className="rr-cur-eyebrow rounded-full px-2.5 py-1 text-[9px] backdrop-blur-md"
              style={{
                letterSpacing: "0.18em",
                color: "var(--cur-ivory)",
                backgroundColor: "rgba(10,9,8,0.44)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {category}
            </span>
          )}
        </span>
        <span className="pointer-events-auto">
          <SaveButton card={card} />
        </span>
      </div>

      {/* Bottom: labels, title, one fact, the way in. */}
      <div className="relative p-4 lg:p-5">
        {card.labels.length > 0 && (
          <span className="mb-2.5 flex flex-wrap gap-1.5">
            {card.labels.slice(0, 2).map((l) => {
              const tone = TONE[l.tone] ?? TONE.quiet;
              return (
                <span
                  key={l.id}
                  className="rr-cur-eyebrow rounded-full px-2.5 py-1 text-[9px]"
                  style={{
                    letterSpacing: "0.16em",
                    backgroundColor: tone.bg,
                    color: tone.fg,
                    border: `1px solid ${tone.border}`,
                  }}
                >
                  {locT(language, l.text)}
                </span>
              );
            })}
          </span>
        )}

        {/* Clamped on the small cards. On the desktop grid every row is a fixed
            height, so a four-line name — and the catalogue has some — would push
            "Discover" out of its own card. */}
        <h3
          className={`rr-cur-display ${
            feature
              ? "line-clamp-3 text-[clamp(1.6rem,5vw,2.4rem)]"
              : "line-clamp-2 text-[clamp(1.25rem,4.4vw,1.5rem)]"
          }`}
          style={{ color: "#FFFCF7" }}
        >
          {title}
        </h3>

        {feature && blurb && (
          <p
            className="mt-2 max-w-md font-dm text-sm leading-relaxed"
            style={{ color: "rgba(242,235,225,0.72)" }}
          >
            {blurb}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span
            className="inline-flex items-center gap-1.5 font-dm text-[12.5px] font-medium"
            style={{ color: "var(--cur-champagne)" }}
          >
            {language === "fr" ? "Découvrir" : language === "cr" ? "Dekouver" : "Discover"}
            <ArrowRight
              size={14}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </span>
          {meta && (
            <span
              className="truncate font-dm text-[11.5px]"
              style={{ color: "rgba(242,235,225,0.5)" }}
            >
              {meta}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
