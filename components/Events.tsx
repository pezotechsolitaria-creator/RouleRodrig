"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin, Star, Images } from "lucide-react";
import type { EventItem } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

export default function Events({ events = [] }: { events?: EventItem[] }) {
  const { t, language } = useLanguage();
  const e = t.events;

  // Featured first, then the rest in original order
  const items = [...events.filter((ev) => ev.title)].sort((a, b) =>
    (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
  );
  if (items.length === 0) return null;

  return (
    <section id="events" className="bg-dark pt-5 pb-14" aria-label="Island events">
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="mb-6">
          <p className="font-bebas text-yellow text-[11px] tracking-[0.3em] mb-1.5 uppercase">{e.eyebrow}</p>
          <h2 className="font-syne font-extrabold text-offwhite uppercase leading-tight text-2xl md:text-3xl">
            {e.title}
          </h2>
          <p className="text-muted font-dm text-sm mt-2 max-w-xl leading-relaxed">{e.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {items.map((ev, i) => (
            <motion.article
              key={ev.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: Math.min(i, 3) * 0.05 }}
              className={`flex flex-col bg-dark-card rounded-2xl overflow-hidden transition-colors ${
                ev.featured
                  ? "border-2 border-yellow/50 hover:border-yellow shadow-[0_0_24px_rgba(47,128,237,0.08)]"
                  : "border border-white/10 hover:border-yellow/40"
              }`}
            >
              {ev.image ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ev.image} alt={ev.title} className="w-full h-44 object-cover" loading="lazy" />
                  {/* The editor takes as many photos as the owner has; the card
                      shows the cover and says how many more are inside, the
                      same promise the places cards make. */}
                  {(ev.images?.length ?? 0) > 1 && (
                    <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 font-dm text-[10px] text-white">
                      <Images size={10} /> {ev.images!.length}
                    </span>
                  )}
                </div>
              ) : (
                <div className="w-full h-44 bg-gradient-to-br from-yellow/15 via-dark-card to-dark flex items-center justify-center">
                  <Calendar size={36} className="text-yellow/40" />
                </div>
              )}
              <div className="p-5 flex flex-col flex-1">
                {/* Featured badge + date */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {ev.featured && (
                    <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2.5 py-1 rounded-full">
                      <Star size={8} className="fill-yellow" /> FEATURED
                    </span>
                  )}
                  {ev.date && (
                    <span className="inline-flex items-center gap-1.5 font-bebas text-yellow text-[11px] tracking-[0.2em]">
                      <Calendar size={12} /> {ev.date}
                    </span>
                  )}
                </div>
                <h3 className="font-syne font-extrabold text-offwhite text-lg uppercase leading-tight mb-2">{loc(language, ev.title, ev.titleFr, ev.titleCr)}</h3>
                <p className="text-muted font-dm text-sm leading-relaxed flex-1">{loc(language, ev.description, ev.descriptionFr, ev.descriptionCr)}</p>
                {ev.location && (
                  <p className="flex items-center gap-1.5 text-offwhite/60 font-dm text-xs mt-4 pt-4 border-t border-white/10">
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
