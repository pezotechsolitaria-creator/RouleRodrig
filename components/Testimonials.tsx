"use client";

import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_CONTENT, type TestimonialItem } from "@/lib/defaults";

export default function Testimonials({ testimonials }: { testimonials?: TestimonialItem[] }) {
  const items = testimonials ?? DEFAULT_CONTENT.testimonials;
  if (!items || items.length === 0) return null;

  return (
    <section className="bg-dark py-24 md:py-36" aria-label="Customer testimonials">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-16"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">REVIEWS</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none"
            style={{ fontSize: "clamp(34px, 8vw, 80px)" }}
          >
            WHAT RIDERS SAY
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {items.map((t, i) => (
            <motion.article
              key={t.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
              className="bg-dark-card border border-dark-border rounded-2xl p-6 md:p-8 flex flex-col hover:border-yellow/30 transition-colors"
            >
              <div className="flex gap-1 mb-5" aria-label={`${t.rating} out of 5 stars`}>
                {Array.from({ length: Math.min(5, Math.max(1, t.rating)) }).map((_, si) => (
                  <Star key={si} size={14} className="fill-yellow text-yellow" />
                ))}
              </div>

              <p className="font-bebas text-yellow/20 text-6xl leading-none mb-2 -mt-2" aria-hidden="true">
                &ldquo;
              </p>

              <blockquote className="text-offwhite/75 font-dm text-sm leading-relaxed flex-1 mb-6">
                {t.text}
              </blockquote>

              <footer className="pt-5 border-t border-dark-border">
                <p className="font-syne font-bold text-offwhite text-sm">{t.name}</p>
                <p className="font-bebas text-muted text-xs tracking-[0.2em] mt-0.5">{t.origin}</p>
              </footer>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
