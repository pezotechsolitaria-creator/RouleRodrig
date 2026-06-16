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
                className={`relative flex flex-col rounded-2xl p-7 transition-colors ${
                  opt.highlight
                    ? "bg-yellow/[0.06] border-2 border-yellow/50 hover:border-yellow shadow-[0_0_28px_rgba(245,200,66,0.1)]"
                    : "bg-dark-card border border-dark-border hover:border-yellow/40"
                }`}
              >
                {opt.highlight && (
                  <span className="absolute top-5 right-5 flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow text-dark px-2.5 py-1 rounded-full">
                    <Star size={8} className="fill-dark" /> {t.gettingAround.bestWay}
                  </span>
                )}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${
                    opt.highlight ? "bg-yellow text-dark" : "bg-yellow/10 text-yellow"
                  }`}
                >
                  <Icon size={22} />
                </div>
                <h3 className="font-syne font-extrabold text-offwhite text-lg uppercase mb-2">{opt.title}</h3>
                <p className="text-muted/85 font-dm text-sm leading-relaxed flex-1">{opt.text}</p>

                {opt.link && opt.linkText && (
                  <div className="mt-6">
                    {isExternal ? (
                      <a
                        href={opt.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-colors ${
                          opt.highlight
                            ? "bg-yellow text-dark hover:bg-yellow-dark"
                            : "border border-dark-border text-muted hover:text-yellow hover:border-yellow/40"
                        }`}
                      >
                        {opt.linkText} <ArrowRight size={14} />
                      </a>
                    ) : (
                      <Link
                        href={opt.link}
                        className={`inline-flex items-center gap-2 font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-colors ${
                          opt.highlight
                            ? "bg-yellow text-dark hover:bg-yellow-dark"
                            : "border border-dark-border text-muted hover:text-yellow hover:border-yellow/40"
                        }`}
                      >
                        {opt.linkText} <ArrowRight size={14} />
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
