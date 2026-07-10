"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import type { ReviewCard } from "@/lib/site-data";
import { useLanguage } from "@/context/LanguageContext";

/**
 * A gliding marquee of REAL approved customer reviews (premium DTC-brand style).
 * Renders nothing until there are enough genuine reviews for a smooth loop — we
 * never fabricate testimonials. It fills in automatically as riders leave
 * reviews (the post-trip feedback email drives this).
 */
export default function ReviewsMarquee({ reviews }: { reviews: ReviewCard[] }) {
  const { t } = useLanguage();
  if (!reviews || reviews.length < 3) return null;

  // Duplicate the list so the CSS marquee (translateX -50%) loops seamlessly.
  const loop = [...reviews, ...reviews];

  return (
    <section className="relative bg-dark py-16 md:py-20 overflow-hidden" aria-label="Customer reviews">
      <div className="max-w-7xl mx-auto px-6 mb-9">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.testimonials.eyebrow}</p>
          <h2 className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]" style={{ fontSize: "clamp(30px, 6vw, 60px)" }}>
            {t.testimonials.title}
          </h2>
        </motion.div>
      </div>

      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 md:w-28 bg-gradient-to-r from-dark to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 md:w-28 bg-gradient-to-l from-dark to-transparent z-10" />

      <div className="group flex w-max gap-5 animate-marquee hover:[animation-play-state:paused]">
        {loop.map((r, i) => (
          <article
            key={`${r.id}-${i}`}
            className="w-[300px] sm:w-[360px] shrink-0 bg-dark-card border border-dark-border rounded-2xl p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={14} className={n <= Math.round(r.rating) ? "text-yellow fill-yellow" : "text-muted/30"} />
                ))}
              </span>
              <Quote size={20} className="text-yellow/25" />
            </div>
            <p className="text-offwhite/85 font-dm text-sm leading-relaxed flex-1 line-clamp-5">“{r.text}”</p>
            <div className="mt-4 pt-3 border-t border-dark-border">
              <p className="font-syne font-bold text-offwhite text-sm">{r.name}</p>
              <p className="font-dm text-muted text-xs">
                {[r.origin, r.scooter_name].filter(Boolean).join(" · ")}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
