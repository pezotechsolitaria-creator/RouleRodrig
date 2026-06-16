"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BedDouble, UtensilsCrossed, Compass, ArrowUpRight, MapPin } from "lucide-react";
import type { RecommendedContent, RecommendedPlace } from "@/lib/defaults";

const CATEGORY: Record<
  RecommendedPlace["category"],
  { label: string; plural: string; icon: React.ElementType; color: string }
> = {
  hotel:      { label: "Hotel",      plural: "Stay", icon: BedDouble,        color: "bg-amber-400/10 text-amber-400 border-amber-400/30" },
  restaurant: { label: "Restaurant", plural: "Eat",  icon: UtensilsCrossed,  color: "bg-green-500/10 text-green-400 border-green-500/30" },
  activity:   { label: "Activity",   plural: "Do",   icon: Compass,          color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
};

export default function RecommendedPlaces({ content }: { content?: RecommendedContent }) {
  const [filter, setFilter] = useState<string>("all");
  if (!content || !content.enabled) return null;

  const items = (content.items ?? []).filter((p) => p.name);
  if (items.length === 0) return null;

  const cats = Array.from(new Set(items.map((p) => p.category)));
  const showTabs = cats.length > 1;
  const shown = filter === "all" ? items : items.filter((p) => p.category === filter);

  return (
    <section id="recommended" className="bg-dark py-24 md:py-32" aria-label="Recommended places">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">RECOMMENDED</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(32px, 7vw, 72px)" }}
          >
            {content.title}
          </h2>
          {content.subtitle && (
            <p className="text-muted font-dm text-sm md:text-base mt-3 max-w-lg">{content.subtitle}</p>
          )}
        </motion.div>

        {/* Category filter */}
        {showTabs && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-full text-xs font-dm border transition-colors ${
                filter === "all"
                  ? "bg-yellow text-dark border-yellow font-bold"
                  : "border-dark-border text-muted hover:border-yellow/40 hover:text-offwhite"
              }`}
            >
              All
            </button>
            {cats.map((c) => {
              const cfg = CATEGORY[c];
              return (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-dm border transition-colors ${
                    filter === c
                      ? "bg-yellow text-dark border-yellow font-bold"
                      : "border-dark-border text-muted hover:border-yellow/40 hover:text-offwhite"
                  }`}
                >
                  <cfg.icon size={13} /> {cfg.plural}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shown.map((p, i) => {
            const cfg = CATEGORY[p.category];
            const isExternal = p.link?.startsWith("http");
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden flex flex-col hover:border-yellow/40 transition-colors group"
              >
                {/* Image */}
                <div className="relative h-44 bg-gradient-to-br from-yellow/10 via-dark-card to-dark overflow-hidden">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <cfg.icon size={36} className="text-yellow/30" />
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.2em] border px-2.5 py-1 rounded-full backdrop-blur-sm ${cfg.color}`}>
                    <cfg.icon size={10} /> {cfg.label.toUpperCase()}
                  </span>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-syne font-bold text-offwhite text-base mb-1.5">{p.name}</h3>
                  <p className="text-muted/85 font-dm text-sm leading-relaxed flex-1">{p.description}</p>
                  {p.link && (
                    <a
                      href={p.link}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                      className="mt-4 inline-flex items-center gap-1.5 text-yellow hover:text-yellow-dark text-sm font-syne font-bold transition-colors"
                    >
                      {p.linkText || (isExternal ? "Visit" : "View on map")}
                      {isExternal ? <ArrowUpRight size={14} /> : <MapPin size={14} />}
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
