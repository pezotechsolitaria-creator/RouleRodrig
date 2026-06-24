"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import type { PromoSlide } from "@/lib/defaults";

export default function PromoCarousel({ slides }: { slides?: PromoSlide[] }) {
  const items = (slides ?? []).filter((s) => s.enabled !== false && (s.title || s.image || s.video));
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const count = items.length;
  const go = (n: number) => setIdx((i) => (n + count) % count);

  // Auto-advance every 6s unless paused or only one slide
  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count, paused]);

  // Keep index in range if slides change
  useEffect(() => { if (idx >= count) setIdx(0); }, [count, idx]);

  if (count === 0) return null;

  return (
    <section className="bg-dark py-12 md:py-16" aria-label="Highlights">
      <div className="max-w-7xl mx-auto px-6">
        <div
          className="relative rounded-3xl overflow-hidden border border-dark-border h-[260px] sm:h-[320px] md:h-[380px]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
            touchX.current = null;
          }}
        >
          {items.map((s, i) => {
            const inner = (
              <>
                {/* Media */}
                {s.video ? (
                  <video
                    src={s.video} poster={s.image || undefined}
                    autoPlay muted loop playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow/20 via-dark-card to-dark" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
                {/* Text */}
                <div className="relative h-full flex flex-col justify-end p-7 sm:p-10 max-w-2xl">
                  <h3 className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]" style={{ fontSize: "clamp(28px, 5vw, 48px)" }}>
                    {s.title}
                  </h3>
                  {s.subtitle && <p className="text-offwhite/80 font-dm text-sm md:text-base mt-2 max-w-lg">{s.subtitle}</p>}
                  {s.link && (
                    <span className="mt-4 inline-flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full w-fit">
                      {s.linkText || "Discover"} <ArrowRight size={15} />
                    </span>
                  )}
                </div>
              </>
            );
            const cls = `absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0 pointer-events-none"}`;
            return s.link ? (
              <Link key={s.id} href={s.link} className={cls} aria-hidden={i !== idx}>{inner}</Link>
            ) : (
              <div key={s.id} className={cls} aria-hidden={i !== idx}>{inner}</div>
            );
          })}

          {count > 1 && (
            <>
              <button onClick={() => go(idx - 1)} aria-label="Previous" className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => go(idx + 1)} aria-label="Next" className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-colors">
                <ChevronRight size={20} />
              </button>
              <div className="absolute bottom-4 right-5 flex gap-1.5 z-10">
                {items.map((_, i) => (
                  <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === idx ? "bg-yellow w-5" : "bg-white/50 w-1.5"}`} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
