"use client";

import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { DEFAULT_CONTENT, type HeroContent } from "@/lib/defaults";
import HeroVideoLayer from "@/components/HeroVideo";
import { INTRO, useCalm, useHeroReveal, useSplashGate } from "@/lib/hero-intro";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

// Fixed positions so SSR and client render identically (no hydration mismatch).
const PARTICLES = [
  { left: "8%",  top: "22%", size: 3, dur: 7,  delay: 0 },
  { left: "18%", top: "68%", size: 2, dur: 9,  delay: 1.2 },
  { left: "30%", top: "38%", size: 4, dur: 8,  delay: 0.6 },
  { left: "42%", top: "78%", size: 2, dur: 10, delay: 2 },
  { left: "55%", top: "28%", size: 3, dur: 7.5, delay: 1.5 },
  { left: "66%", top: "60%", size: 2, dur: 9.5, delay: 0.3 },
  { left: "74%", top: "32%", size: 4, dur: 8.5, delay: 1.8 },
  { left: "85%", top: "70%", size: 3, dur: 7,  delay: 0.9 },
  { left: "92%", top: "44%", size: 2, dur: 10, delay: 2.4 },
  { left: "12%", top: "48%", size: 2, dur: 8,  delay: 2.1 },
];

/**
 * Custom Rodrigues-inspired animated visual system — glowing gradients,
 * topographic contour rings, self-drawing route lines and floating particles.
 * Purely decorative (pointer-events-none, aria-hidden) and GPU-friendly.
 */
function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Glowing gradient blobs */}
      <motion.div
        className="absolute -top-32 -right-24 w-[55vw] h-[55vw] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(245,200,66,0.16), transparent 65%)" }}
        animate={{ opacity: [0.45, 0.85, 0.45], scale: [1, 1.08, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 -left-24 w-[50vw] h-[50vw] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(249,115,22,0.10), transparent 65%)" }}
        animate={{ opacity: [0.35, 0.65, 0.35], scale: [1.05, 1, 1.05] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Topographic contour rings — island-inspired geometry */}
      <svg className="absolute right-[-12%] top-1/2 -translate-y-1/2 w-[75vw] h-[75vw] opacity-[0.11]" viewBox="0 0 600 600" fill="none">
        {[60, 120, 180, 240, 300, 360].map((r, i) => (
          <motion.ellipse
            key={r}
            cx="300" cy="300" rx={r} ry={r * 0.82}
            stroke="#F5C842" strokeWidth="1"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.15, 0.45, 0.15] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          />
        ))}
      </svg>

      {/* Animated route lines — flowing dashes like live navigation */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.45]" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
        <motion.path
          d="M-50 680 C 250 560, 380 760, 620 600 S 1040 360, 1500 460"
          stroke="#F5C842" strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray="10 14"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.5, strokeDashoffset: [0, -240] }}
          transition={{
            pathLength: { duration: 2.4, ease: "easeInOut" },
            opacity: { duration: 1.2 },
            strokeDashoffset: { duration: 8, repeat: Infinity, ease: "linear" },
          }}
        />
        <motion.path
          d="M-50 240 C 300 320, 520 140, 780 280 S 1180 520, 1520 380"
          stroke="#F97316" strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray="8 16"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.32, strokeDashoffset: [0, 240] }}
          transition={{
            pathLength: { duration: 2.8, ease: "easeInOut", delay: 0.3 },
            opacity: { duration: 1.2, delay: 0.3 },
            strokeDashoffset: { duration: 10, repeat: Infinity, ease: "linear" },
          }}
        />
      </svg>

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-yellow/70"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size }}
          animate={{ y: [0, -16, 0], opacity: [0.2, 0.65, 0.2] }}
          transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
        />
      ))}
    </div>
  );
}

// The opening timeline now lives in lib/hero-intro.ts, because the Curated
// hero plays the same sequence and two copies of it would drift apart the first
// time somebody was asked to make it slower.

export default function Hero({ hero, compact }: { hero?: HeroContent; compact?: boolean }) {
  const { t } = useLanguage();
  const h = hero ?? DEFAULT_CONTENT.hero;
  const { language } = useLanguage();
  const headlineLines =
    language === "fr" && h.headlineFr?.length ? h.headlineFr :
    language === "cr" && h.headlineCr?.length ? h.headlineCr :
    h.headline;
  const eyebrow = loc(language, h.eyebrow, h.eyebrowFr, h.eyebrowCr)?.trim();

  // Read synchronously on first render, unlike the `calm` state below which is
  // set in an effect and is therefore false for the first frame — long enough
  // for a staggered reveal to have already started. MotionConfig
  // reducedMotion="user" (components/MotionProvider) already strips the y and
  // scale; this collapses the per-letter STAGGER too, so the line simply
  // appears instead of being written out.
  const prefersReduced = useReducedMotion();

  // ── The arrival ─────────────────────────────────────────────────────────
  //
  // Three things that used to be written out here and are now shared with the
  // Curated hero: waiting for the launch splash to lift before writing the
  // headline, tracking the reduced-motion preference, and the reveal itself.
  // See lib/hero-intro.ts — every comment that was here went with them.
  const gateOpen = useSplashGate();
  const calm = useCalm();

  // Gated on there BEING a video. Without one this headline IS the hero, so on
  // a visit with no footage the words stay and nothing dims away to an empty
  // photograph.
  const hasVideo = (h.videos ?? []).some((v) => v?.enabled !== false && !!v?.url);
  const revealed = useHeroReveal({
    hasVideo,
    calm: !!prefersReduced,
    lines: headlineLines,
  });

  // Reduced motion keeps the headline permanently: content that leaves on its
  // own is exactly the unrequested movement that setting is about.
  const hideText = !calm && revealed;

  return (
    <section className={`relative w-full overflow-hidden flex flex-col ${compact ? "rr-home-hero min-h-[172px] md:min-h-[36vh]" : "min-h-[40vh] md:min-h-[62vh]"}`} aria-label={t.a11yMore.heroSection}>
      {/* ── Background: the owner's photo, with their footage layered over ───
          Order is load-bearing. The still renders first and unconditionally;
          the video sits on top and fades in only once a frame has decoded. So
          the hero is never blank while a clip loads, and every way video can
          fail — none uploaded, a codec the browser refuses, Data Saver,
          reduced motion — simply leaves the photograph showing. */}
      {/* The footage waking up. Brightness and saturation only — a blur on a
          full-bleed video is the one filter that genuinely costs frames on a
          mid-range phone, and the "sharper" impression comes from the scrim
          lifting off it anyway. The slight scale settles at the same time so
          the frame breathes open rather than snapping. */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={
          // prefersReduced starts it OPEN. The reveal never fires in that mode,
          // so dimming first would leave the hero permanently darker than it
          // was before this animation existed — a regression aimed squarely at
          // the people least able to absorb it.
          revealed || prefersReduced
            ? { filter: "brightness(1) saturate(1.06)", scale: 1 }
            : { filter: "brightness(0.72) saturate(0.88)", scale: 1.035 }
        }
        transition={{ duration: INTRO.REVEAL, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: "50% 45%" }}
      >
        {h.backgroundImage && (
          <Image
            src={h.backgroundImage}
            alt={t.a11yMore.heroAlt}
            fill
            className="object-cover object-center rr-kenburns"
            priority
            sizes="100vw"
            unoptimized={h.backgroundImage.startsWith("/uploads/") || (h.backgroundImage.startsWith("http") && !h.backgroundImage.includes("supabase.co"))}
          />
        )}
        <HeroVideoLayer videos={h.videos} />
        {/* ── Cinematic treatment ──────────────────────────────────────────
            This used to be three full-bleed scrims stacked on top of each
            other: 85%→100% black vertically, 75% black horizontally, and a 55%
            radial. They MULTIPLY, so the bottom-left — exactly where the
            headline sits — was effectively opaque, and the island was gone.
            The hero read as "a dark rectangle with text on it".

            The replacement protects only what needs protecting and leaves the
            middle of the frame alone, so the footage is actually visible:

            1. TOP — a short scrim for the sticky header, nothing more.
            2. BOTTOM — taller and denser, but ending in the page's own colour
               so the hero DISSOLVES into the cards below instead of stopping
               at a hard edge. This is the section transition, not decoration.
            3. TEXT — a soft ellipse under the headline. It follows the text:
               the headline is centred now, so an ellipse still anchored at
               18%/82% would be darkening an empty corner while leaving the
               words themselves unprotected.
            4. VIGNETTE — barely there; it settles the edges and pulls the eye
               to the centre, which is where the horizon usually is. */}
        {/* The cinematic darkening, animated as ONE layer. Only opacity moves —
            the gradients themselves are untouched, so this stays a compositor
            job on a full-bleed element. It settles at 0.45 rather than 0: the
            bottom scrim is the section transition into the cards below and the
            headline needs some backing while it is still fading, so removing it
            entirely would leave a hard edge and a moment of unreadable text. */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{ opacity: revealed || prefersReduced ? 0.45 : 1 }}
          transition={{ duration: INTRO.REVEAL, ease: [0.22, 1, 0.36, 1] }}
        >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-dark/75 via-dark/25 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-dark via-dark/70 to-transparent" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 78% 55% at 50% 58%, rgba(0,0,0,0.48), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 115% 95% at 50% 45%, transparent 52%, rgba(0,0,0,0.34))" }}
        />
        </motion.div>
      </motion.div>

      {/* ── Animated Rodrigues visual system ───────────── */}
      <HeroBackdrop />

      {/* ── Main content ──────────────────────────────────────────────────
          The whole block retires once footage is actually playing: the text
          introduces the place, the video then becomes the place. It fades and
          drifts up rather than cutting — quickly, so the handover reads as one
          movement with the video's own fade instead of two separate events — and it comes STRAIGHT BACK if playback
          fails, because on every path without video this text is the hero.
          Reduced motion keeps it on screen permanently — a visitor who has
          asked for less movement should not have content leave on its own. */}
      <motion.div
        // A DISSOLVE, not an exit. 0.22s with a 14px lift read as the text
        // being taken away; over 0.9s, with barely any drift, it reads as the
        // words giving way to what is behind them. Deliberately the same
        // duration and curve as the scrim lifting and the footage brightening,
        // so the three resolve as one movement rather than three.
        animate={{ opacity: hideText ? 0 : 1, y: hideText ? -8 : 0 }}
        transition={{ duration: INTRO.DISSOLVE, ease: [0.22, 1, 0.36, 1] }}
        className={`relative z-10 flex flex-1 flex-col items-center justify-center text-center max-w-5xl mx-auto w-full px-4 md:px-6 pb-4 ${compact ? "pt-6" : "pt-20"}`}
      >
        {/* Eyebrow pill — only when there is something to put in it.
            It rendered unconditionally, so an empty eyebrow (which is exactly
            what this site's content holds) drew a small dark capsule with a
            lone pulsing dot floating above the headline: a UI element with no
            content, which reads as a bug because it is one. */}
        {/* Readability over a PHOTO, which is the hard case: the hero image is
            bright sky and sunlit water, so bg-white/5 gave this pill almost no
            backing and gold-on-sky fell well under contrast. Three fixes that
            only work together — a DARK scrim rather than a white one (the text
            is light, so it needs dark behind it, not lighter), a visible border,
            and a text shadow covering the moment before backdrop-blur paints on
            a slow phone. */}
        {eyebrow && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="inline-flex items-center gap-2 self-center bg-dark/70 backdrop-blur-md border border-yellow/25 rounded-full px-4 py-2 mb-3 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.6)]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />
            {/* 0.3em at 11px pushed the letters so far apart they stopped reading
                as words — the eye has to reassemble them. 0.18em keeps the
                editorial feel and stays legible, and 12px on mobile is the
                smallest this should ever be on a phone held at arm's length. */}
            <span className="font-bebas text-yellow text-xs md:text-sm tracking-[0.18em] [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{eyebrow}</span>
          </motion.div>
        )}

        {/* Staggered headline. Empty lines are dropped rather than rendered as
            empty <h1>s — the content model keeps three slots and this site fills
            one, so two of them were shipping as blank headings on every page
            load: meaningless to a screen reader and a stray gap in the layout. */}
        {/* ── The headline arrives a letter at a time ──────────────────────
            The whole line used to rise as one block. Now each character is
            placed individually, which is the difference between text appearing
            and a word being written.

            IT SAYS "WELCOME TO" AND STOPS THERE ON PURPOSE. The hero footage
            opens on its own title card reading RODRIGUES, so the destination is
            revealed by the film, not by a second line of HTML competing with
            it. The headline greets, the video answers, and the handover is the
            existing one: this whole block retires the moment footage is
            genuinely playing.

            ACCESSIBILITY: the <h1> carries the real sentence as aria-label and
            every span is aria-hidden. Without that a screen reader announces
            ten separate letters, which is how a decorative split turns a
            headline into noise.

            The letters rise inside the existing overflow-hidden mask, so they
            emerge from behind an edge rather than fading in mid-air. Only
            opacity and transform — no blur across ten nodes, which is what
            makes this kind of effect stutter on a cheap phone. */}
        <div>
          {headlineLines.filter((l) => l?.trim()).map((line, i) => {
            // Where this line's letters start, so line two follows line one
            // instead of both writing themselves at once.
            const lineDelay = INTRO.START + i * INTRO.LINE_GAP;
            return (
              <div key={`${line}-${i}`} className="overflow-hidden">
                <h1
                  aria-label={line}
                  className="rr-on-media block font-syne font-extrabold text-offwhite leading-[0.9] uppercase tracking-tight [text-shadow:0_2px_40px_rgba(0,0,0,0.45)]"
                  style={{ fontSize: "clamp(1.85rem, 6.6vw, 7rem)" }}
                >
                  {[...line].map((ch, j) =>
                    ch === " " ? (
                      // A real space, not an animated one: giving it a width in
                      // em keeps the gap proportional at every clamp size.
                      <span key={j} aria-hidden className="inline-block w-[0.26em]" />
                    ) : (
                      <motion.span
                        key={j}
                        aria-hidden
                        className="inline-block"
                        // Reduced motion gets the finished headline, immediately.
                        initial={prefersReduced ? false : { opacity: 0, y: 26, scale: 0.96 }}
                        animate={
                          gateOpen
                            ? { opacity: 1, y: 0, scale: 1 }
                            : { opacity: 0, y: 26, scale: 0.96 }
                        }
                        transition={{
                          duration: prefersReduced ? 0.3 : INTRO.LETTER,
                          // No per-letter offset when motion is reduced: the
                          // whole line resolves at once.
                          delay: prefersReduced ? 0 : lineDelay + j * INTRO.STAGGER,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      >
                        {ch}
                      </motion.span>
                    ),
                  )}
                </h1>
              </div>
            );
          })}
        </div>

        {/* Subheadline and hero CTA both stay OUT, at the owner's direction.
            Each was tried and each made the hero taller — and height is the one
            thing this hero cannot spend, because every pixel it takes pushes
            the six discovery cards further below the fold. The eyebrow and the
            headline over clear footage is the whole composition; the cards
            immediately underneath are the actual call to action. The
            subheadline copy still lives in the CMS for the pages that use it. */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1 }}
          className="mt-5 hidden md:flex flex-wrap justify-center gap-3"
        >
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("tiroule:open"))}
            className="hidden md:flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm text-white backdrop-blur-sm transition-colors hover:border-white/45 hover:bg-white/10 md:px-8 md:py-4 md:text-base"
          >
            {language === "fr" ? "Demander à Ti Roulé" : language === "cr" ? "Demann Ti Roulé" : "Ask Ti Roulé"}
            <MessageCircle size={18} />
          </button>
        </motion.div>
      </motion.div>

      {/* ── Refined scroll cue ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        className="hidden md:flex absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex-col items-center gap-2"
        aria-hidden="true"
      >
        <span className="relative flex h-9 w-5 items-start justify-center rounded-full border border-white/25 p-1">
          <motion.span
            className="block h-1.5 w-1.5 rounded-full bg-yellow"
            animate={{ y: [0, 12, 0], opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.div>

      {/* ── Marquee ticker ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="relative z-10 hidden md:block border-t border-white/10 bg-black/40 backdrop-blur-sm py-3 overflow-hidden"
        aria-hidden="true"
      >
        <div className="flex animate-marquee whitespace-nowrap will-change-transform">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="font-bebas text-yellow text-xs tracking-[0.25em] mx-10">
              {t.a11yMore.marquee}
            </span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
