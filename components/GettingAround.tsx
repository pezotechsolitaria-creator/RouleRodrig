"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Bus, Car, Bike, Footprints, ArrowRight, Star } from "lucide-react";
import type { GettingAroundContent, TransportOption } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

const ICONS: Record<TransportOption["icon"], React.ElementType> = {
  bus: Bus,
  taxi: Car,
  car: Car,
  scooter: Bike,
  bike: Bike,
  walk: Footprints,
};

export default function GettingAround({ content }: { content?: GettingAroundContent }) {
  const { t, language } = useLanguage();
  if (!content || !content.enabled) return null;
  const options = content.options ?? [];
  if (options.length === 0) return null;

  return (
    <section id="getting-around" className="bg-dark pt-5 pb-14" aria-label={t.a11yMore.gettingAround}>
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="mb-6">
          <p className="font-bebas text-yellow text-[11px] tracking-[0.3em] mb-1.5 uppercase">{t.gettingAround.eyebrow}</p>
          <h2 className="font-syne font-extrabold text-offwhite uppercase leading-tight text-2xl md:text-3xl">
            {loc(language, content.title, content.titleFr, content.titleCr)}
          </h2>
          {content.subtitle && (
            <p className="text-muted font-dm text-sm mt-2 max-w-xl leading-relaxed">{loc(language, content.subtitle, content.subtitleFr, content.subtitleCr)}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {options.map((opt, i) => {
            const Icon = ICONS[opt.icon] ?? Car;
            const isExternal = opt.link?.startsWith("http");
            return (
              <motion.div
                key={opt.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: Math.min(i, 3) * 0.05 }}
                className={`group relative flex flex-col rounded-2xl p-5 transition-colors duration-300 ${
                  opt.highlight
                    ? "bg-gradient-to-b from-yellow/[0.08] to-transparent ring-1 ring-yellow/50 hover:ring-yellow shadow-[0_0_44px_-14px_rgba(245,200,66,0.35)]"
                    : "bg-dark-card ring-1 ring-white/10 hover:ring-yellow/40"
                }`}
              >
                {opt.highlight && (
                  <span className="absolute top-5 right-5 flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow text-dark px-2.5 py-1 rounded-full">
                    <Star size={8} className="fill-dark" /> {t.gettingAround.bestWay}
                  </span>
                )}
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 border transition-colors ${
                    opt.highlight
                      ? "bg-yellow text-dark border-yellow"
                      : "bg-white/[0.06] text-yellow border-white/10 backdrop-blur-md group-hover:border-yellow/40"
                  }`}
                >
                  <Icon size={22} />
                </div>
                <h3 className="font-syne font-extrabold text-offwhite text-lg uppercase mb-2">{loc(language, opt.title, opt.titleFr, opt.titleCr)}</h3>
                <p className="text-muted/85 font-dm text-sm leading-relaxed flex-1">{loc(language, opt.text, opt.textFr, opt.textCr)}</p>

                {opt.link && opt.linkText && (
                  <div className="mt-4">
                    {isExternal ? (
                      <a
                        href={opt.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group/btn inline-flex items-center gap-2 font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-all ${
                          opt.highlight
                            ? "bg-yellow text-dark hover:bg-yellow-dark"
                            : "border border-white/15 text-offwhite/80 hover:text-yellow hover:border-yellow/40"
                        }`}
                      >
                        {opt.linkText} <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
                      </a>
                    ) : (
                      <Link
                        href={opt.link}
                        className={`group/btn inline-flex items-center gap-2 font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-all ${
                          opt.highlight
                            ? "bg-yellow text-dark hover:bg-yellow-dark"
                            : "border border-white/15 text-offwhite/80 hover:text-yellow hover:border-yellow/40"
                        }`}
                      >
                        {opt.linkText} <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
                      </Link>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
