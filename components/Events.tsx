"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";
import type { EventItem } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

export default function Events({ events = [] }: { events?: EventItem[] }) {
  const { t } = useLanguage();
  const e = t.events;
  const items = events.filter((ev) => ev.title);
  if (items.length === 0) return null;

  return (
    <section id="events" className="bg-dark-card py-24 md:py-32 border-y border-dark-border" aria-label="Island events">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{e.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(34px, 8vw, 80px)" }}
          >
            {e.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-3 max-w-lg">{e.subtitle}</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {items.map((ev, i) => (
            <motion.article
              key={ev.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
              className="flex flex-col bg-dark border border-dark-border rounded-2xl overflow-hidden hover:border-yellow/40 transition-colors"
            >
              {ev.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ev.image} alt={ev.title} className="w-full h-44 object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-44 bg-gradient-to-br from-yellow/15 via-dark-card to-dark flex items-center justify-center">
                  <Calendar size={36} className="text-yellow/40" />
                </div>
              )}
              <div className="p-6 flex flex-col flex-1">
                {ev.date && (
                  <span className="inline-flex items-center gap-1.5 font-bebas text-yellow text-[11px] tracking-[0.2em] mb-2">
                    <Calendar size={12} /> {ev.date}
                  </span>
                )}
                <h3 className="font-syne font-extrabold text-offwhite text-lg uppercase leading-tight mb-2">{ev.title}</h3>
                <p className="text-muted font-dm text-sm leading-relaxed flex-1">{ev.description}</p>
                {ev.location && (
                  <p className="flex items-center gap-1.5 text-offwhite/60 font-dm text-xs mt-4 pt-4 border-t border-dark-border">
                    <MapPin size={12} className="text-yellow" /> {ev.location}
                  </p>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
