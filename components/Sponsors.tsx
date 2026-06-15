"use client";

import { motion } from "framer-motion";
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
    <section className="bg-dark py-16 md:py-20" aria-label="Sponsors">
      <div className="max-w-6xl mx-auto px-6 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="font-bebas text-muted/60 text-[11px] tracking-[0.4em] mb-8"
        >
          {s.title}
        </motion.p>
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {items.map((sp, i) => {
            const inner = (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={sp.image}
                alt={sp.name}
                className="h-12 md:h-16 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                loading="lazy"
              />
            );
            return (
              <motion.div
                key={sp.id}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                {sp.link ? (
                  <a href={sp.link} target="_blank" rel="noopener noreferrer" aria-label={sp.name}>
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
