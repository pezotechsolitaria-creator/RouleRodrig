"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export interface BrowseCategory {
  slug: string;
  label: string;
  image?: string;
  emoji?: string;
  count: number;
}

/**
 * "What are you looking for?" — a cinematic, swipeable carousel of category
 * cards (no arrow buttons; a peek of the next card + dot indicators signal that
 * it scrolls). Each card opens its own /browse page. This is the homepage's
 * main entry point, replacing the old always-open fleet + booking sections.
 */
export default function WhatLookingFor({ categories }: { categories: BrowseCategory[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { t } = useLanguage();

  const cardStep = useCallback(() => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>("[data-card]");
    return card ? card.getBoundingClientRect().width + 16 : el?.clientWidth ?? 1;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => setActive(Math.round(el.scrollLeft / cardStep()));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [cardStep, categories.length]);

  if (!categories.length) return null;

  const goTo = (i: number) => scroller.current?.scrollTo({ left: i * cardStep(), behavior: "smooth" });

  return (
    <section id="explore" className="bg-dark py-20 md:py-28 scroll-mt-24" aria-label="What are you looking for">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-9"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.explore.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(32px, 7vw, 68px)" }}
          >
            {t.explore.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-lg">{t.explore.subtitle}</p>
        </motion.div>

        <div
          ref={scroller}
          className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((c, i) => (
            <motion.div
              key={c.slug}
              data-card
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3) }}
              className="snap-center shrink-0 w-[82vw] max-w-[400px] sm:w-[360px]"
            >
              <Link
                href={`/browse/${c.slug}`}
                className="group relative block h-[440px] rounded-[28px] overflow-hidden border border-dark-border hover:border-yellow/60 transition-all duration-300"
              >
                {c.image ? (
                  <Image
                    src={c.image}
                    alt={c.label}
                    fill
                    className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
                    sizes="(max-width: 640px) 82vw, 360px"
                    unoptimized={c.image.startsWith("/uploads/") || c.image.startsWith("http")}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a17] to-dark-card flex items-center justify-center text-7xl">
                    {c.emoji ?? "📍"}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/40 to-transparent" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/5 rounded-[28px]" />

                <div className="absolute inset-x-0 bottom-0 p-7">
                  <p className="font-bebas text-yellow text-[11px] tracking-[0.3em] mb-2">
                    {c.count} {c.count === 1 ? t.explore.option : t.explore.options}
                  </p>
                  <h3 className="font-syne font-extrabold text-offwhite uppercase leading-[0.95] mb-4" style={{ fontSize: "clamp(30px, 6vw, 44px)" }}>
                    {c.label}
                  </h3>
                  <span className="inline-flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-transform group-hover:gap-3">
                    {t.explore.cta} <ArrowRight size={16} />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {categories.length > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {categories.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to card ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? "bg-yellow w-7" : "bg-dark-border w-2.5 hover:bg-muted"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
