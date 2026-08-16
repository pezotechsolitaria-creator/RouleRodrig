"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT, type WorldHero as HeroDoc } from "@/lib/world-docs/types";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * The signature moment.
 *
 * ── THE SEQUENCE ──────────────────────────────────────────────────────────
 * Image (already painting) → eyebrow 200ms → headline 380ms → supporting text
 * 720ms → CTA 940ms → indicators 1180ms. Every step is a CSS animation-delay,
 * so it starts before hydration and cannot be delayed by a slow bundle on an
 * island connection. Total ≈ 1.4s: long enough to read as composed, short
 * enough that a returning visitor is not made to sit through a title card.
 *
 * ── WHY THE STILL IS THE FOUNDATION, NOT THE VIDEO ────────────────────────
 * The poster is always rendered and never removed. Video plays on top of it if
 * it loads, and its failure — Data Saver, a dead codec, an autoplay policy —
 * costs nothing, because the thing underneath was already the finished hero.
 * That ordering is what this project learned the hard way on the homepage.
 */
export default function WorldHeroBanner({
  hero,
  images,
  world,
}: {
  hero: HeroDoc;
  /** Only used for the CTA's fallback anchor — see below. */
  world: string;
  /** Already resolved — the owner's pinned stills, or real island photography. */
  images: string[];
}) {
  const { language } = useLanguage();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLElement>(null);

  const interval = Math.max(0, hero.intervalSeconds ?? 7) * 1000;
  const many = images.length > 1;

  // The cross-fade stops when the hero is off screen and when the reader asks
  // for less motion. A hero quietly re-compositing a 2000px photograph while
  // somebody reads the concierge section at the bottom of the page is pure
  // battery cost with nobody watching.
  useEffect(() => {
    if (!many || interval === 0 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), interval);
    return () => clearInterval(t);
  }, [many, interval, paused, images.length]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPaused(!e.isIntersecting), {
      threshold: 0.01,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const eyebrow = locT(language, hero.eyebrow);
  const headline = locT(language, hero.headline);
  const accent = locT(language, hero.headlineAccent);
  const sub = locT(language, hero.subheadline);
  const cta = locT(language, hero.ctaLabel);

  return (
    <section
      ref={wrapRef}
      // ── AN INSET CARD, NOT A FULL-BLEED BANNER ──────────────────────────
      // Two reasons, and only one of them is height. A framed hero reads as an
      // app rather than a website — the photograph becomes an object on the
      // page instead of the page's own background — and it lets the rounded
      // language of everything below start at the top instead of arriving
      // after a hard edge.
      //
      // ── WHAT THE FIRST SCREEN HAS TO CARRY ──────────────────────────────
      // The owner's rule: hero, quick actions AND the first recommendations,
      // all before anybody scrolls. That is the budget the height is set from,
      // not the other way round — on a 392×800 phone it leaves ~290px here.
      //
      // 36svh is a FLOOR, not the height. The content measures ~284px, so the
      // card is content-sized on a normal phone and only stretches on a tall
      // screen where there is room to spare. The previous 52svh floor was
      // 416px of card wrapped around 364px of words: 52px of it was empty.
      className="relative isolate mx-4 mt-3 flex min-h-[36svh] max-h-[26rem] flex-col justify-end overflow-hidden rounded-[1.75rem] lg:mx-8 lg:mt-5 lg:min-h-[54svh] lg:max-h-[34rem] lg:rounded-[2rem]"
      aria-label={eyebrow || "Curated Rodrigues"}
    >
      {/* ── Photography ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 -z-10">
        {images.map((src, i) => (
          <div
            key={src + i}
            className="absolute inset-0 transition-opacity duration-[1600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ opacity: i === idx ? 1 : 0 }}
            aria-hidden={i !== idx}
          >
            <Image
              src={src}
              alt=""
              fill
              // The first still is the LCP element on this page. Everything
              // after it stays lazy — preloading four full-bleed photographs to
              // show one is how a hero becomes the slowest thing on the site.
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              sizes="100vw"
              className={`object-cover ${i === idx ? "rr-cur-drift" : ""}`}
              unoptimized={unopt(src)}
            />
          </div>
        ))}
        {hero.video && (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={hero.video}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            aria-hidden
          />
        )}
        {/* Two scrims, not one: a tall warm gradient for the text, plus a very
            slight overall darkening so a bright midday photograph cannot make
            champagne text illegible. */}
        <div className="rr-cur-scrim absolute inset-x-0 bottom-0 top-1/4" />
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(8,7,6,0.14)" }} />
      </div>

      {/* ── Words ───────────────────────────────────────────────────────── */}
      <div className="w-full px-5 pb-5 pt-14 lg:px-10 lg:pb-9 lg:pt-20">
        <div className="max-w-2xl lg:max-w-3xl">
          {eyebrow && (
            <p
              className="rr-cur-rise rr-cur-eyebrow"
              style={{ ["--rr-d" as string]: "200ms" }}
            >
              {eyebrow}
            </p>
          )}

          <h1
            className="rr-cur-rise rr-cur-display mt-2.5 text-[clamp(2rem,8.2vw,4.4rem)]"
            style={{ ["--rr-d" as string]: "380ms", color: "var(--cur-ivory)" }}
          >
            {headline}
            {accent && (
              <>
                {" "}
                <em>{accent}</em>
              </>
            )}
          </h1>

          {sub && (
            <p
              className="rr-cur-rise mt-2 line-clamp-2 max-w-md font-dm text-[13px] leading-snug lg:text-base lg:leading-relaxed"
              style={{ ["--rr-d" as string]: "720ms", color: "rgba(242,235,225,0.78)" }}
            >
              {sub}
            </p>
          )}

          {/* ── ONE ROW: THE BUTTON AND THE INDICATORS ──────────────────────
              The indicators used to have a row of their own — 44px of the first
              screen, a fifth of a recommendation card, spent on four hairlines.
              Pinning them to the bottom-right CORNER of the frame was the first
              attempt and it was wrong: measured, they landed 48px ON TOP of the
              button, because "the CTA is short" is an assumption about copy an
              editor is free to change tomorrow.

              Sharing the button's row costs nothing (44px of dots inside a 48px
              row), cannot collide whatever the button says, and reads as one
              control bar rather than two stray elements. */}
          {(cta || many) && (
            <div className="mt-4 flex items-center justify-between gap-3">
              {cta && (
                <a
                  // The document always carries a target; this is the fallback for a
                  // half-filled one, and it has to know its world — sending an
                  // Authentic reader to #curated-featured scrolls to nothing.
                  href={hero.ctaHref || `#${world}-featured`}
                  className="rr-cur-rise group inline-flex min-h-12 items-center gap-2.5 rounded-full px-5 py-3 font-dm text-[13.5px] font-medium transition-transform duration-300 hover:translate-y-[-2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{
                    ["--rr-d" as string]: "940ms",
                    backgroundColor: "var(--cur-champagne)",
                    color: "var(--cur-on-accent)",
                    boxShadow: "0 18px 40px -18px rgba(227,200,162,0.65)",
                  }}
                >
                  {cta}
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </a>
              )}

              {/* ── ONE CONTROL, NOT ONE PER PHOTO ─────────────────────────
                  Four separate 44×44 targets is the textbook carousel, and on a
                  392px phone the four of them are 176px — which pushed the CTA
                  into wrapping onto a second line, measured at 85px tall
                  instead of 48. The textbook answer did not fit the room.

                  So the whole strip is ONE button that advances the hero, with
                  the dashes as its face: 44px tall, ~68px wide, and it says
                  where you are as clearly as four buttons did. A hero is
                  browsed, not navigated — nobody is looking for photo three. */}
              {many && (
                <button
                  type="button"
                  onClick={() => setIdx((i) => (i + 1) % images.length)}
                  aria-label={`Next photo — showing ${idx + 1} of ${images.length}`}
                  className="rr-cur-rise -mr-2 flex h-11 shrink-0 items-center gap-1.5 px-2"
                  style={{ ["--rr-d" as string]: "1180ms" }}
                >
                  {images.map((_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="block h-[2px] rounded-full transition-all duration-500"
                      style={{
                        width: i === idx ? "1.5rem" : "0.5rem",
                        backgroundColor:
                          i === idx ? "var(--cur-champagne)" : "rgba(242,235,225,0.32)",
                      }}
                    />
                  ))}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
