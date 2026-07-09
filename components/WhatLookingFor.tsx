"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export interface BrowseCategory {
  slug: string;
  label: string;
  image?: string;
  emoji?: string;
  count: number;
}

/**
 * "What are you looking for?" — the compact hub that replaces the old
 * always-open fleet section. A swipeable carousel of category tiles; each opens
 * its own /browse page. De-scooterises the homepage and saves vertical space.
 */
export default function WhatLookingFor({ categories }: { categories: BrowseCategory[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  if (!categories.length) return null;

  const scrollBy = (dir: number) =>
    scroller.current?.scrollBy({ left: dir * 340, behavior: "smooth" });

  return (
    <section id="explore" className="bg-dark py-20 md:py-28 scroll-mt-24" aria-label="What are you looking for">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-8 flex items-end justify-between gap-4"
        >
          <div>
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.explore.eyebrow}</p>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
              style={{ fontSize: "clamp(32px, 7vw, 68px)" }}
            >
              {t.explore.title}
            </h2>
            <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-lg">{t.explore.subtitle}</p>
          </div>
          <div className="hidden md:flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className="w-10 h-10 rounded-full border border-dark-border text-offwhite hover:border-yellow/50 hover:text-yellow flex items-center justify-center transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className="w-10 h-10 rounded-full border border-dark-border text-offwhite hover:border-yellow/50 hover:text-yellow flex items-center justify-center transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </motion.div>

        <div
          ref={scroller}
          className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((c, i) => (
            <motion.div
              key={c.slug}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.4) }}
              className="snap-start shrink-0"
            >
              <Link
                href={`/browse/${c.slug}`}
                className="group relative block w-[210px] sm:w-[230px] h-[290px] rounded-2xl overflow-hidden border border-dark-border hover:border-yellow/60 transition-colors"
              >
                {c.image ? (
                  <Image
                    src={c.image}
                    alt={c.label}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="230px"
                    unoptimized={c.image.startsWith("/uploads/") || c.image.startsWith("http")}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-dark-card to-[#1a1a17] flex items-center justify-center text-6xl">
                    {c.emoji ?? "📍"}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="font-syne font-extrabold text-offwhite text-xl uppercase leading-tight">
                    {c.label}
                  </h3>
                  <p className="font-dm text-muted text-xs mt-1">
                    {c.count} {c.count === 1 ? t.explore.option : t.explore.options}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-yellow font-syne font-bold text-sm opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {t.explore.cta} <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
