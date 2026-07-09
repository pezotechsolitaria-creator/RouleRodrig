"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_CONTENT, type HeroContent } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

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

export default function Hero({ hero }: { hero?: HeroContent }) {
  const h = hero ?? DEFAULT_CONTENT.hero;
  const headlineLines = h.headline;
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen w-full overflow-hidden flex flex-col" aria-label="Hero section">
      {/* ── Background image (owner's brand photo) ──────── */}
      <div className="absolute inset-0">
        {h.backgroundImage && (
          <Image
            src={h.backgroundImage}
            alt="Exploring Rodrigues Island at golden hour"
            fill
            className="object-cover object-center"
            priority
            sizes="100vw"
            unoptimized={h.backgroundImage.startsWith("/uploads/") || h.backgroundImage.startsWith("http")}
          />
        )}
        {/* Layered cinematic darkening for depth + legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-dark/85 via-dark/40 to-dark" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark/75 via-dark/20 to-transparent" />
        {/* Soft scrim anchored where the text sits, so the headline always reads */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 70% at 20% 75%, rgba(0,0,0,0.55), transparent 60%)" }} />
      </div>

      {/* ── Animated Rodrigues visual system ───────────── */}
      <HeroBackdrop />

      {/* ── Main content ──────────────────────────────── */}
      <div className="relative z-10 flex flex-col justify-center flex-1 max-w-7xl mx-auto w-full px-6 pt-28 pb-24">
        {/* Eyebrow pill */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="inline-flex items-center gap-2 self-start bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 mb-7"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />
          <span className="font-bebas text-yellow text-[11px] md:text-xs tracking-[0.3em]">{h.eyebrow}</span>
        </motion.div>

        {/* Staggered headline */}
        <div>
          {headlineLines.map((line, i) => (
            <div key={`${line}-${i}`} className="overflow-hidden">
              <motion.h1
                initial={{ y: 120, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.95, delay: 0.25 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="block font-syne font-extrabold text-offwhite leading-[0.9] uppercase tracking-tight [text-shadow:0_2px_40px_rgba(0,0,0,0.45)]"
                style={{ fontSize: "clamp(2.1rem, 7.5vw, 7.5rem)" }}
              >
                {line}
              </motion.h1>
            </div>
          ))}
        </div>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.85 }}
          className="mt-8 text-white/70 text-base md:text-xl max-w-xl font-dm leading-relaxed"
        >
          {h.subheadline}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1 }}
          className="mt-10 flex flex-wrap gap-4"
        >
          <Link
            href="/#explore"
            className="group relative flex items-center gap-2 bg-yellow text-dark font-syne font-bold px-8 py-4 rounded-full text-sm md:text-base transition-all duration-200 hover:scale-[1.04] shadow-[0_0_0_rgba(245,200,66,0)] hover:shadow-[0_8px_44px_rgba(245,200,66,0.4)]"
          >
            {t.explore.title} <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/#map"
            className="flex items-center gap-2 border border-white/25 text-white px-8 py-4 rounded-full text-sm md:text-base hover:bg-white/10 hover:border-white/45 transition-colors backdrop-blur-sm"
          >
            {t.map.title} <Compass size={18} />
          </Link>
        </motion.div>
      </div>

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
        className="relative z-10 border-t border-white/10 bg-black/40 backdrop-blur-sm py-3 overflow-hidden"
        aria-hidden="true"
      >
        <div className="flex animate-marquee whitespace-nowrap will-change-transform">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="font-bebas text-yellow text-xs tracking-[0.25em] mx-10">
              EXPLORE THE ISLAND&nbsp;•&nbsp;FEEL THE WIND&nbsp;•&nbsp;ROULE RODRIGUES&nbsp;•
            </span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
