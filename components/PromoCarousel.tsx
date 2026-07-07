"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import type { PromoSlide } from "@/lib/defaults";

const AUTOPLAY_MS = 6000;

export default function PromoCarousel({ slides }: { slides?: PromoSlide[] }) {
  const items = (slides ?? []).filter((s) => s.enabled !== false && (s.title || s.image || s.video));
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const count = items.length;
  const go = (n: number, d: number) => { setDir(d); setIdx((n + count) % count); };
  const next = () => go(idx + 1, 1);
  const prev = () => go(idx - 1, -1);

  // Auto-advance unless paused or only one slide
  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setInterval(() => { setDir(1); setIdx((i) => (i + 1) % count); }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [count, paused, idx]);

  useEffect(() => { if (idx >= count) setIdx(0); }, [count, idx]);

  if (count === 0) return null;
  const s = items[idx];
  const hasMedia = !!(s.image || s.video);

  return (
    <section className="bg-dark py-14 md:py-20" aria-label="Highlights">
      <div className="max-w-7xl mx-auto px-6">
        <div
          className="group relative rounded-[28px] overflow-hidden border border-white/10 h-[380px] sm:h-[440px] md:h-[520px] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 40) (dx < 0 ? next() : prev());
            touchX.current = null;
          }}
        >
          {/* ── Animated slide ───────────────────────────── */}
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={s.id}
              custom={dir}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              {/* Media with slow Ken Burns zoom */}
              {s.video ? (
                <video
                  src={s.video} poster={s.image || undefined}
                  autoPlay muted loop playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : s.image ? (
                <motion.img
                  src={s.image} alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  initial={{ scale: 1.08 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: AUTOPLAY_MS / 1000 + 1, ease: "linear" }}
                />
              ) : (
                <div className="absolute inset-0">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow/25 via-dark-card to-dark" />
                  <div className="absolute -top-24 -right-16 w-[40vw] h-[40vw] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(245,200,66,0.22), transparent 65%)" }} />
                </div>
              )}

              {/* Cinematic gradient for legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />

              {/* Text — staggered reveal */}
              <div className="relative h-full flex flex-col justify-end p-7 sm:p-10 md:p-14 max-w-2xl">
                {s.eyebrow && (
                  <motion.p
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    className="font-bebas text-yellow text-xs tracking-[0.35em] mb-3"
                  >
                    {s.eyebrow}
                  </motion.p>
                )}
                <motion.h3
                  initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="font-syne font-extrabold text-offwhite uppercase leading-[0.92]"
                  style={{ fontSize: "clamp(30px, 5.5vw, 60px)" }}
                >
                  {s.title}
                </motion.h3>
                {s.subtitle && (
                  <motion.p
                    initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.32 }}
                    className="text-offwhite/80 font-dm text-sm md:text-base mt-3 max-w-lg"
                  >
                    {s.subtitle}
                  </motion.p>
                )}
                {s.link && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.42 }}
                    className="mt-6"
                  >
                    <Link
                      href={s.link}
                      className="group/btn inline-flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3 rounded-full transition-all hover:scale-[1.04] hover:shadow-[0_10px_36px_rgba(245,200,66,0.4)]"
                    >
                      {s.linkText || "Discover"}
                      <ArrowRight size={15} className="transition-transform group-hover/btn:translate-x-0.5" />
                    </Link>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* ── Controls ─────────────────────────────────── */}
          {count > 1 && (
            <>
              <button onClick={prev} aria-label="Previous" className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-11 md:h-11 rounded-full bg-black/35 md:bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white flex items-center justify-center transition-all opacity-90 md:opacity-0 md:group-hover:opacity-100 hover:scale-110">
                <ChevronLeft size={20} />
              </button>
              <button onClick={next} aria-label="Next" className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-11 md:h-11 rounded-full bg-black/35 md:bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white flex items-center justify-center transition-all opacity-90 md:opacity-0 md:group-hover:opacity-100 hover:scale-110">
                <ChevronRight size={20} />
              </button>

              {/* Slide counter */}
              <div className="absolute top-6 right-6 z-20 font-syne font-bold text-xs text-white/80 bg-black/30 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
                {String(idx + 1).padStart(2, "0")} <span className="text-white/40">/ {String(count).padStart(2, "0")}</span>
              </div>

              {/* Progress segments */}
              <div className="absolute bottom-6 right-7 z-20 flex items-center gap-2">
                {items.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => go(i, i > idx ? 1 : -1)}
                    aria-label={`Slide ${i + 1}`}
                    className="h-1 rounded-full overflow-hidden bg-white/25 transition-all"
                    style={{ width: i === idx ? 32 : 12 }}
                  >
                    {i === idx && !paused && (
                      <motion.span
                        key={`p-${idx}`}
                        className="block h-full bg-yellow"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                      />
                    )}
                    {i === idx && paused && <span className="block h-full w-full bg-yellow" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
