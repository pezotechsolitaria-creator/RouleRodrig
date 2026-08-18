"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT, resolveHeroBackground, type WorldHero as HeroDoc } from "@/lib/world-docs/types";
import type { HeroVideo } from "@/lib/defaults";
import HeroVideoLayer from "@/components/HeroVideo";
import CuratedBackdrop from "./CuratedBackdrop";
import { INTRO, useHeroReveal } from "@/lib/hero-intro";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

// The hero's own tokens, so an editor who sets nothing still gets the world's
// palette rather than a black rectangle. Read from CSS rather than hardcoded,
// which means the light Curated theme recolours the backdrop for free.
const BG_DEFAULT = "var(--cur-bg)";
const ACCENT_DEFAULT = "var(--cur-champagne)";

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
  videos,
  world,
}: {
  hero: HeroDoc;
  /** Resolved by the view: this world's clip, or the site's. */
  videos: HeroVideo[];
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

  // ── THE BACKGROUND ──────────────────────────────────────────────────────
  // Something is painted on the very first frame, always. Before this the hero
  // was photograph-or-nothing: with no stills pinned it borrowed the site's
  // photo, and for the moment before that decoded there was simply nothing
  // behind the words.
  //
  // `colour` mode drops photography altogether — no stills, no LCP image, no
  // download — and opens on the painted backdrop. It is a real editorial
  // choice, not a fallback, which is why the mode is stored rather than
  // inferred from an empty image list.
  const { painted, canvas, glow, animated, stills } = resolveHeroBackground(hero, images, {
    canvas: BG_DEFAULT,
    glow: ACCENT_DEFAULT,
  });
  const many = stills.length > 1;


  // The cross-fade stops when the hero is off screen and when the reader asks
  // for less motion. A hero quietly re-compositing a 2000px photograph while
  // somebody reads the concierge section at the bottom of the page is pure
  // battery cost with nobody watching.
  useEffect(() => {
    if (!many || interval === 0 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % stills.length), interval);
    return () => clearInterval(t);
  }, [many, interval, paused, stills.length]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPaused(!e.isIntersecting), {
      threshold: 0.01,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── THE ARRIVAL, THE SAME ONE THE HOMEPAGE PLAYS ────────────────────────
  //
  // The owner asked for Authentic's opening here: the headline written a letter
  // at a time, held, and then dissolving into the footage. It runs off the
  // shared clock in lib/hero-intro.ts rather than a second copy of the timing —
  // see that file for why every number is what it is.
  //
  // ── IT ONLY RUNS WHEN THERE IS SOMETHING TO DISSOLVE INTO ───────────────
  // Without a video this headline IS the hero, so the words must not leave.
  // In that case the original CSS sequence plays instead — eyebrow at 200ms
  // through to the indicators at 1180ms — which is what the owner tuned the
  // compact first screen around, and it is untouched.
  //
  // ── READ SYNCHRONOUSLY, NOT IN AN EFFECT ────────────────────────────────
  // `cinematic` decides which of two DIFFERENT headlines is rendered — one
  // split into per-letter spans, one whole. A preference read in an effect
  // starts false, so a reader with reduced motion would get the split version
  // for one frame and then have it swapped underneath them: a flash, and a
  // remount of the element they are trying to read. useReducedMotion resolves
  // during render, which is why the homepage uses it for the same decision.
  const prefersReduced = useReducedMotion();
  const hasVideo = videos.some((v) => v?.enabled !== false && !!v?.url);
  const revealed = useHeroReveal({
    hasVideo,
    calm: !!prefersReduced,
    lines: [locT(language, hero.headline)],
  });
  // The cinematic path is taken only when it can finish. Reduced motion gets
  // the finished hero immediately and keeps it.
  const cinematic = hasVideo && !prefersReduced;
  // Reduced motion keeps the words permanently: content that leaves on its own
  // is exactly the unrequested movement that setting is about.
  const hideWords = cinematic && revealed;

  const eyebrow = locT(language, hero.eyebrow);
  const headline = locT(language, hero.headline);
  const accent = locT(language, hero.headlineAccent);
  const sub = locT(language, hero.subheadline);
  // Off, or unlabelled, means no button. Both are the same intent.
  const cta = hero.ctaEnabled === false ? "" : locT(language, hero.ctaLabel);


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
      {/* ── Background ──────────────────────────────────────────────────
          Four layers, bottom to top: the painted canvas, the animated backdrop,
          the photography, and the video. Each one only covers the one below it
          when it actually succeeds, so every failure path — colour mode, a
          still that has not decoded, a video that is refused — still leaves a
          finished hero rather than a hole. That ordering is what this project
          learned the hard way on the homepage. */}
      <div className="absolute inset-0 -z-10" style={{ backgroundColor: canvas }}>
        {/* Drawn whenever the hero opens on colour, and also under photography
            while it loads. `animated: false` keeps the glows and stops them
            moving — a still backdrop is a choice, not a degraded state. */}
        {(painted || stills.length === 0) && (
          <CuratedBackdrop accent={glow} animated={animated} />
        )}

        {/* ── The footage waking up ──────────────────────────────────────
            Brightness and saturation only, settling as the words dissolve, so
            the scrim lifting and the picture opening read as ONE movement
            rather than two events. A blur on a full-bleed video is the single
            filter that genuinely costs frames on a mid-range phone. */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={
            // Not cinematic (no video, or reduced motion) means the hero starts
            // and stays at rest. Dimming first would leave it permanently
            // darker than before this existed, aimed squarely at the people
            // least able to absorb it.
            !cinematic || revealed
              ? { filter: "brightness(1) saturate(1.04)", scale: 1 }
              : { filter: "brightness(0.74) saturate(0.9)", scale: 1.03 }
          }
          transition={{ duration: INTRO.REVEAL, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "50% 45%" }}
        >
          {stills.map((src, i) => (
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
                // after it stays lazy — preloading four full-bleed photographs
                // to show one is how a hero becomes the slowest thing on the
                // site.
                priority={i === 0}
                loading={i === 0 ? undefined : "lazy"}
                sizes="100vw"
                className={`object-cover ${i === idx ? "rr-cur-drift" : ""}`}
                unoptimized={unopt(src)}
              />
            </div>
          ))}

          {/* ── THE SAME BUG, IN A NEW HERO ──────────────────────────────
              This was `<video src={hero.video}>`, which is exactly the failure
              lib/video.ts was written to fix on the homepage: a YouTube WATCH
              page is not a video file, so the browser fetches HTML, the decode
              fails, and the layer disappears with nothing said. The owner
              pasted a YouTube link here and got a still photograph and no
              explanation — the second time, in the second hero.

              HeroVideoLayer is the answer that already exists and already
              carries every lesson this project paid for: it plays an MP4 as a
              <video> and a YouTube or Vimeo link as a chromeless embed, passes
              `origin` so the player answers the handshake, waits for the player
              to say it is really PLAYING before revealing it, and renders
              nothing at all on a link it cannot play. */}
          {videos.length > 0 && <HeroVideoLayer videos={videos} />}
        </motion.div>

        {/* Two scrims, not one: a tall warm gradient for the text, plus a very
            slight overall darkening so a bright midday photograph cannot make
            champagne text illegible. Both ease off as the words leave, because
            they exist to protect words that are no longer there. */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{ opacity: cinematic && revealed ? 0.42 : 1 }}
          transition={{ duration: INTRO.REVEAL, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rr-cur-scrim absolute inset-x-0 bottom-0 top-1/4" />
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(8,7,6,0.14)" }} />
        </motion.div>
      </div>

      {/* ── Words ───────────────────────────────────────────────────────── */}
      <div className="w-full px-5 pb-5 pt-14 lg:px-10 lg:pb-9 lg:pt-20">
        <div className="max-w-2xl lg:max-w-3xl">
          {/* ── WHAT LEAVES, AND WHAT STAYS ────────────────────────────────
              On the homepage the whole text block retires — there is no button
              in it, so there is nothing to lose. Here there can be, and an
              editor who deliberately turned the CTA on should not watch it
              fade out of reach eight seconds after the page opens.

              So the DISSOLVE covers the editorial words only: eyebrow,
              headline, supporting line. The control row underneath — the
              button and the photo indicators — stays put and stays clickable.
              The greeting gives way to the film; the controls are not part of
              the greeting. */}
          <motion.div
            // A DISSOLVE, not an exit. 0.22s with a 14px lift reads as the text
            // being taken away; over 1.6s, with barely any drift, it reads as
            // the words giving way to what is behind them. Deliberately the
            // same duration and curve as the scrim lifting and the footage
            // brightening, so the three resolve as one movement.
            initial={false}
            animate={{ opacity: hideWords ? 0 : 1, y: hideWords ? -8 : 0 }}
            transition={{ duration: INTRO.DISSOLVE, ease: [0.22, 1, 0.36, 1] }}
          >
            {eyebrow && (
              <p
                className={cinematic ? "rr-cur-eyebrow" : "rr-cur-rise rr-cur-eyebrow"}
                style={cinematic ? undefined : { ["--rr-d" as string]: "200ms" }}
              >
                {cinematic ? (
                  <motion.span
                    className="inline-block"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: INTRO.START }}
                  >
                    {eyebrow}
                  </motion.span>
                ) : (
                  eyebrow
                )}
              </p>
            )}

            {/* ── The headline arrives a letter at a time ──────────────────
                The whole line used to rise as one block on a CSS delay. In the
                cinematic path each character is placed individually, which is
                the difference between text appearing and a word being written.

                ACCESSIBILITY: the <h1> carries the real sentence as aria-label
                and every span is aria-hidden. Without that a screen reader
                announces twenty separate letters, which is how a decorative
                split turns a headline into noise.

                Only opacity and transform — no blur across twenty nodes, which
                is what makes this kind of effect stutter on a cheap phone. */}
            {cinematic ? (
              <h1
                aria-label={[headline, accent].filter(Boolean).join(" ")}
                className="rr-cur-display mt-2.5 block text-[clamp(2rem,8.2vw,4.4rem)]"
                style={{ color: "var(--cur-ivory)" }}
              >
                {[...headline].map((ch, j) =>
                  ch === " " ? (
                    // A real space, not an animated one: giving it a width in
                    // em keeps the gap proportional at every clamp size.
                    <span key={j} aria-hidden className="inline-block w-[0.26em]" />
                  ) : (
                    <motion.span
                      key={j}
                      aria-hidden
                      className="inline-block"
                      initial={{ opacity: 0, y: 22, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: INTRO.LETTER,
                        delay: INTRO.START + j * INTRO.STAGGER,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      {ch}
                    </motion.span>
                  ),
                )}
                {accent && (
                  <>
                    <span aria-hidden className="inline-block w-[0.26em]" />
                    {/* The italic ending follows the line it completes rather
                        than writing itself in parallel, so the phrase reads
                        left to right the way it is meant to be read. */}
                    <motion.em
                      aria-hidden
                      className="inline-block"
                      initial={{ opacity: 0, y: 22, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: INTRO.LETTER,
                        delay: INTRO.START + [...headline].length * INTRO.STAGGER,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      {accent}
                    </motion.em>
                  </>
                )}
              </h1>
            ) : (
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
            )}

            {sub && (
              <motion.p
                className={`mt-2 line-clamp-2 max-w-md font-dm text-[13px] leading-snug lg:text-base lg:leading-relaxed ${
                  cinematic ? "" : "rr-cur-rise"
                }`}
                style={{
                  ["--rr-d" as string]: "720ms",
                  color: "rgba(242,235,225,0.78)",
                }}
                initial={cinematic ? { opacity: 0, y: 12 } : false}
                animate={cinematic ? { opacity: 1, y: 0 } : undefined}
                // Lands just after the last letter, so the supporting line
                // completes the phrase instead of racing it.
                transition={{ duration: 0.9, delay: INTRO.START + 1.1 }}
              >
                {sub}
              </motion.p>
            )}
          </motion.div>

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
