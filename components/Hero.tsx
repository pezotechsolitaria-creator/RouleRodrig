"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronsDown } from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_CONTENT, type HeroContent } from "@/lib/defaults";

export default function Hero({ hero }: { hero?: HeroContent }) {
  const h = hero ?? DEFAULT_CONTENT.hero;
  const headlineLines = h.headline;

  return (
    <section className="relative h-screen w-full overflow-hidden flex flex-col" aria-label="Hero section">
      {/* ── Background image ───────────────────────────── */}
      <div className="absolute inset-0">
        <Image
          src={h.backgroundImage}
          alt="Suzuki Burgman 200 scooter parked by the ocean at golden-hour sunset on Rodrigues Island"
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
          unoptimized={h.backgroundImage.startsWith("/uploads/") || h.backgroundImage.startsWith("http")}
        />
        {/* layered gradient: heavy bottom for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/85" />
      </div>

      {/* ── Main content ──────────────────────────────── */}
      <div className="relative z-10 flex flex-col justify-center flex-1 max-w-7xl mx-auto w-full px-6 pt-28">
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="font-bebas text-yellow text-xs md:text-sm tracking-[0.35em] mb-6"
        >
          {h.eyebrow}
        </motion.p>

        {/* Staggered headline */}
        <div className="overflow-hidden">
          {headlineLines.map((line, i) => (
            <div key={line} className="overflow-hidden">
              <motion.h1
                initial={{ y: 110, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  duration: 0.9,
                  delay: 0.35 + i * 0.14,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="block font-syne font-extrabold text-offwhite leading-[0.9] uppercase tracking-tight"
                style={{ fontSize: "clamp(56px, 11vw, 140px)" }}
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
          transition={{ duration: 0.7, delay: 0.95 }}
          className="mt-7 text-white/65 text-base md:text-xl max-w-lg font-dm leading-relaxed"
        >
          {h.subheadline}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.1 }}
          className="mt-10 flex flex-wrap gap-4"
        >
          <Link
            href="#contact"
            className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold px-8 py-4 rounded-full text-sm md:text-base hover:bg-yellow-dark transition-all duration-200 hover:scale-105"
          >
            Book Your Scooter <ArrowRight size={18} />
          </Link>
          <Link
            href="#fleet"
            className="flex items-center gap-2 border border-white/35 text-white px-8 py-4 rounded-full text-sm md:text-base hover:bg-white/10 transition-colors backdrop-blur-sm"
          >
            View Fleet <ChevronDown size={18} />
          </Link>
        </motion.div>
      </div>

      {/* ── Scroll bounce indicator ───────────────────── */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 text-white/40"
        aria-hidden="true"
      >
        <ChevronsDown size={28} />
      </motion.div>

      {/* ── Marquee ticker ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
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
