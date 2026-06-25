"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Compass, Bike, BedDouble, UtensilsCrossed, Map as MapIcon } from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_CONTENT, type HeroContent } from "@/lib/defaults";

export interface HeroQuick {
  scooters: number;
  stays: number;
  eats: number;
  routes: number;
}

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
  { left: "48%", top: "52%", size: 3, dur: 9,  delay: 0.4 },
  { left: "60%", top: "84%", size: 2, dur: 7.5, delay: 1.1 },
];

/**
 * Custom Rodrigues-inspired animated visual system — glowing gradients,
 * topographic contour rings, self-drawing route lines and floating particles.
 * Purely decorative (pointer-events-none, aria-hidden), GPU-friendly.
 */
function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Glowing gradient blobs */}
      <motion.div
        className="absolute -top-32 -right-24 w-[55vw] h-[55vw] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(245,200,66,0.18), transparent 65%)" }}
        animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.08, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 -left-24 w-[50vw] h-[50vw] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(249,115,22,0.12), transparent 65%)" }}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [1.05, 1, 1.05] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Topographic contour rings — island-inspired geometry */}
      <svg className="absolute right-[-10%] top-1/2 -translate-y-1/2 w-[70vw] h-[70vw] opacity-[0.13]" viewBox="0 0 600 600" fill="none">
        {[60, 120, 180, 240, 300, 360].map((r, i) => (
          <motion.ellipse
            key={r}
            cx="300" cy="300" rx={r} ry={r * 0.82}
            stroke="#F5C842" strokeWidth="1"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          />
        ))}
      </svg>

      {/* Animated route lines — flowing dashes like live navigation */}
      <svg className="absolute inset-0 w-full h-full opacity-50" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="xMidYMid slice">
        <motion.path
          d="M-50 680 C 250 560, 380 760, 620 600 S 1040 360, 1500 460"
          stroke="#F5C842" strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray="10 14"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.55, strokeDashoffset: [0, -240] }}
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
          animate={{ pathLength: 1, opacity: 0.35, strokeDashoffset: [0, 240] }}
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
          animate={{ y: [0, -16, 0], opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
        />
      ))}
    </div>
  );
}

export default function Hero({ hero, quick }: { hero?: HeroContent; quick?: HeroQuick }) {
  const h = hero ?? DEFAULT_CONTENT.hero;
  const headlineLines = h.headline;

  const cards = [
    { icon: Bike,            label: "Scooters",            count: quick?.scooters ?? 0, suffix: "ready",  href: "#fleet" },
    { icon: BedDouble,       label: "Places to Stay",      count: quick?.stays ?? 0,    suffix: "stays",  href: "#recommended" },
    { icon: UtensilsCrossed, label: "Restaurants",         count: quick?.eats ?? 0,     suffix: "spots",  href: "#recommended" },
    { icon: MapIcon,         label: "Routes & Attractions", count: quick?.routes ?? 0,   suffix: "routes", href: "#routes" },
  ];

  return (
    <section className="relative min-h-screen w-full overflow-hidden flex flex-col" aria-label="Hero section">
      {/* ── Background image (owner's brand photo) ──────── */}
      <div className="absolute inset-0">
        {h.backgroundImage && (
          <Image
            src={h.backgroundImage}
            alt="Scooter by the ocean at golden hour on Rodrigues Island"
            fill
            className="object-cover object-center"
            priority
            sizes="100vw"
            unoptimized={h.backgroundImage.startsWith("/uploads/") || h.backgroundImage.startsWith("http")}
          />
        )}
        {/* Base darkening so the animated system reads on any photo */}
        <div className="absolute inset-0 bg-gradient-to-b from-dark/85 via-dark/55 to-dark/95" />
      </div>

      {/* ── Animated Rodrigues visual system ───────────── */}
      <HeroBackdrop />

      {/* ── Main content ──────────────────────────────── */}
      <div className="relative z-10 flex flex-col justify-center flex-1 max-w-7xl mx-auto w-full px-6 pt-32 pb-10">
        {/* Eyebrow pill */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="inline-flex items-center gap-2 self-start bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />
          <span className="font-bebas text-yellow text-[11px] md:text-xs tracking-[0.3em]">{h.eyebrow}</span>
        </motion.div>

        {/* Staggered headline */}
        <div>
          {headlineLines.map((line, i) => (
            <div key={`${line}-${i}`} className="overflow-hidden">
              <motion.h1
                initial={{ y: 110, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.3 + i * 0.13, ease: [0.22, 1, 0.36, 1] }}
                className="block font-syne font-extrabold text-offwhite leading-[0.9] uppercase tracking-tight"
                style={{ fontSize: "clamp(26px, 7.5vw, 130px)" }}
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
          className="mt-7 text-white/70 text-base md:text-xl max-w-xl font-dm leading-relaxed"
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
            href="#booking"
            className="group relative flex items-center gap-2 bg-yellow text-dark font-syne font-bold px-8 py-4 rounded-full text-sm md:text-base transition-all duration-200 hover:scale-[1.04] shadow-[0_0_0_rgba(245,200,66,0)] hover:shadow-[0_8px_40px_rgba(245,200,66,0.35)]"
          >
            Book a Scooter <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="#fleet"
            className="flex items-center gap-2 border border-white/30 text-white px-8 py-4 rounded-full text-sm md:text-base hover:bg-white/10 hover:border-white/50 transition-colors backdrop-blur-sm"
          >
            Explore Rodrigues <Compass size={18} />
          </Link>
        </motion.div>

        {/* Glassmorphism quick cards */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 max-w-3xl"
        >
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.3 + i * 0.08 }}
              >
                <Link
                  href={c.href}
                  className="group relative block rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 p-4 md:p-5 overflow-hidden transition-all duration-300 hover:bg-white/[0.1] hover:border-yellow/40 hover:-translate-y-1"
                >
                  {/* soft hover glow */}
                  <span className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-yellow/0 group-hover:bg-yellow/20 blur-2xl transition-all duration-500" />
                  <div className="relative flex items-center justify-between">
                    <Icon size={20} className="text-yellow" />
                    {c.count > 0 && (
                      <span className="font-syne font-extrabold text-offwhite text-xl leading-none">{c.count}</span>
                    )}
                  </div>
                  <p className="relative font-dm text-white/75 text-xs md:text-sm mt-3 leading-tight">{c.label}</p>
                  <p className="relative font-dm text-white/35 text-[10px] mt-0.5">
                    {c.count > 0 ? c.suffix : "explore"}
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

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
