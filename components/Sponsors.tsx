"use client";

import { motion } from "framer-motion";
import { Handshake, ArrowUpRight } from "lucide-react";
import type { Sponsor } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

export default function Sponsors({
  enabled,
  sponsors = [],
}: {
  enabled?: boolean;
  sponsors?: Sponsor[];
}) {
  const { t } = useLanguage();
  const s = t.sponsors;
  const items = sponsors.filter((sp) => sp.enabled && sp.image);
  if (!enabled || items.length === 0) return null;

  return (
    <section className="relative bg-dark py-7 md:py-10 overflow-hidden" aria-label="Our partners">
      {/* soft ambient accent (desktop only) */}
      <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2 h-[40vw] w-[70vw] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(245,200,66,0.06), transparent 65%)" }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-5 md:mb-8"
        >
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-3">
            <Handshake size={13} className="text-yellow" />
            <span className="font-bebas text-yellow text-[11px] tracking-[0.3em]">{s.title}</span>
          </div>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(22px, 5vw, 42px)" }}
          >
            {s.heading}
          </h2>
          <p className="hidden md:block text-muted font-dm text-sm md:text-base mt-3 max-w-lg mx-auto">{s.subtitle}</p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
          {items.map((sp, i) => {
            const card = (
              <div className="group relative flex h-full flex-col items-center justify-center gap-2.5 rounded-2xl bg-white p-4 md:p-5 ring-1 ring-white/10 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.7)] transition-all duration-300 hover:-translate-y-1 hover:ring-yellow/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sp.image}
                  alt={sp.name}
                  className="h-10 md:h-14 w-auto max-w-full object-contain"
                  loading="lazy"
                />
                <p className="font-dm text-xs font-medium text-dark/70 text-center leading-tight">{sp.name}</p>
                {sp.link && (
                  <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-dark/5 text-dark/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <ArrowUpRight size={13} />
                  </span>
                )}
              </div>
            );
            return (
              <motion.div
                key={sp.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.3) }}
              >
                {sp.link ? (
                  <a href={sp.link} target="_blank" rel="noopener noreferrer" aria-label={sp.name} className="block h-full">
                    {card}
                  </a>
                ) : (
                  card
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
