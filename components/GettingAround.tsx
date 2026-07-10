"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Bus, Car, Bike, Footprints, ArrowRight, Star } from "lucide-react";
import type { GettingAroundContent, TransportOption } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

const ICONS: Record<TransportOption["icon"], React.ElementType> = {
  bus: Bus,
  taxi: Car,
  car: Car,
  scooter: Bike,
  bike: Bike,
  walk: Footprints,
};

export default function GettingAround({ content }: { content?: GettingAroundContent }) {
  const { t } = useLanguage();
  if (!content || !content.enabled) return null;
  const options = content.options ?? [];
  if (options.length === 0) return null;

  return (
    <section id="getting-around" className="bg-dark py-24 md:py-32" aria-label="Getting around Rodrigues">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.gettingAround.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(34px, 8vw, 80px)" }}
          >
            {content.title}
          </h2>
          {content.subtitle && (
            <p className="text-muted font-dm text-sm md:text-base mt-3 max-w-lg">{content.subtitle}</p>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {options.map((opt, i) => {
            const Icon = ICONS[opt.icon] ?? Car;
            const isExternal = opt.link?.startsWith("http");
            return (
              <motion.div
                key={opt.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -6 }}
                className={`group relative flex flex-col rounded-[24px] p-7 transition-all duration-300 ${
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
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 border transition-colors ${
                    opt.highlight
                      ? "bg-yellow text-dark border-yellow"
                      : "bg-white/[0.06] text-yellow border-white/10 backdrop-blur-md group-hover:border-yellow/40"
                  }`}
                >
                  <Icon size={24} />
                </div>
                <h3 className="font-syne font-extrabold text-offwhite text-xl uppercase mb-2.5">{opt.title}</h3>
                <p className="text-muted/85 font-dm text-sm leading-relaxed flex-1">{opt.text}</p>

                {opt.link && opt.linkText && (
                  <div className="mt-6">
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
