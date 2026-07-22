"use client";

import { motion } from "framer-motion";
import { Handshake, ArrowUpRight, Star } from "lucide-react";
import type { Sponsor } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

export default function Sponsors({
  enabled,
  sponsors = [],
}: {
  enabled?: boolean;
  sponsors?: Sponsor[];
}) {
  const { t, language } = useLanguage();
  const s = t.sponsors;
  const items = sponsors.filter((sp) => sp.enabled && sp.image);
  if (!enabled || items.length === 0) return null;

  // Featured partners lead; the admin's order is preserved within each group.
  const ordered = [...items].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));

  const badge = (featured?: boolean) =>
    featured
      ? language === "fr" ? "Partenaire officiel" : language === "cr" ? "Partener ofisiel" : "Official Partner"
      : language === "fr" ? "Partenaire de confiance" : language === "cr" ? "Partener konfyans" : "Trusted Partner";
  const visit = language === "fr" ? "Visiter le site" : language === "cr" ? "Get sit web" : "Visit website";

  const card = (sp: Sponsor) => (
    <div className="group relative flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-5 backdrop-blur-sm shadow-[0_18px_50px_-28px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-1 hover:border-yellow/40">
      <span
        className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bebas text-[9px] tracking-[0.12em] ${
          sp.featured ? "bg-yellow text-dark" : "bg-white/[0.07] text-muted ring-1 ring-inset ring-white/10"
        }`}
      >
        {sp.featured && <Star size={9} className="fill-dark" />}
        {badge(sp.featured)}
      </span>

      {/* Logo on a light panel so any brand mark reads on the dark theme */}
      <div className="flex h-24 items-center justify-center rounded-xl bg-white/95 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sp.image} alt={sp.name} className="max-h-14 w-auto max-w-full object-contain" loading="lazy" />
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-syne text-sm font-bold text-offwhite">{sp.name}</p>
          {sp.category && (
            <span className="shrink-0 rounded-full bg-yellow/10 px-2 py-0.5 font-bebas text-[9px] tracking-[0.12em] text-yellow/90">
              {sp.category}
            </span>
          )}
        </div>
        {sp.description && <p className="mt-1 font-dm text-xs leading-snug text-muted line-clamp-2">{sp.description}</p>}
        {sp.link && (
          <span className="mt-3 inline-flex items-center gap-1 self-start font-syne text-xs font-bold text-yellow transition-all group-hover:gap-1.5">
            {visit} <ArrowUpRight size={13} />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <section className="relative bg-dark py-7 md:py-10 overflow-hidden" aria-label="Our partners">
      <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2 h-[40vw] w-[70vw] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(245,200,66,0.06), transparent 65%)" }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-5 text-center md:mb-8"
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            <Handshake size={13} className="text-yellow" />
            <span className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{s.title}</span>
          </div>
          <h2 className="font-syne font-extrabold uppercase leading-[0.95] text-offwhite" style={{ fontSize: "clamp(22px, 5vw, 42px)" }}>
            {s.heading}
          </h2>
          <p className="mx-auto mt-3 hidden max-w-lg font-dm text-sm text-muted md:block md:text-base">{s.subtitle}</p>
        </motion.div>

        {/* Mobile: full-bleed snapping carousel · Desktop: elegant grid */}
        <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
          {ordered.map((sp, i) => (
            <motion.div
              key={sp.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.3) }}
              className="w-[72%] shrink-0 snap-start sm:w-[46%] md:w-auto"
            >
              {sp.link ? (
                <a href={sp.link} target="_blank" rel="noopener noreferrer" aria-label={sp.name} className="block h-full">
                  {card(sp)}
                </a>
              ) : (
                card(sp)
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
