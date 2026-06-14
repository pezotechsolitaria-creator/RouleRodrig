"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Navigation } from "lucide-react";
import type { MapLocation } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

// Load Leaflet map only on client (no SSR — window required)
const IslandMap = dynamic(() => import("./IslandMap"), { ssr: false });

const CATEGORY_COLOR: Record<string, string> = {
  beach:     "bg-blue-500",
  viewpoint: "bg-amber-400",
  restaurant:"bg-emerald-500",
  landmark:  "bg-violet-500",
  activity:  "bg-red-500",
};

const CATEGORY_LABEL: Record<string, string> = {
  beach:     "Beach",
  viewpoint: "Viewpoint",
  restaurant:"Restaurant",
  landmark:  "Landmark",
  activity:  "Activity",
};

export default function MapSection({ locations }: { locations?: MapLocation[] }) {
  const { t } = useLanguage();
  const locs = locations ?? [];
  if (locs.length === 0) return null;

  return (
    <section id="map" className="bg-dark py-24 md:py-36" aria-label="Island guide map">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.map.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(34px, 7vw, 72px)" }}
          >
            {t.map.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-lg">
            {t.map.subtitle}
          </p>
        </motion.div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-8">
          {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
            <span key={key} className="flex items-center gap-2 text-xs font-dm text-muted">
              <span className={`w-3 h-3 rounded-full shrink-0 ${CATEGORY_COLOR[key]}`} />
              {label}
            </span>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        >
          {/* Map */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-dark-border" style={{ minHeight: 460 }}>
            {/* leaflet.css must be loaded — inject via link tag */}
            <link
              rel="stylesheet"
              href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
              crossOrigin=""
            />
            <IslandMap locations={locs} />
          </div>

          {/* Location list — tap any place for live directions */}
          <div className="space-y-3 overflow-y-auto max-h-[460px] pr-1">
            {locs.map((loc) => (
              <a
                key={loc.id}
                href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 bg-dark-card border border-dark-border rounded-xl p-4 hover:border-yellow/40 transition-colors"
                aria-label={`Get directions to ${loc.name}`}
              >
                {loc.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={loc.image}
                    alt={loc.name}
                    className="w-14 h-14 rounded-lg object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${CATEGORY_COLOR[loc.category] ?? "bg-yellow"}`} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-syne font-bold text-offwhite text-sm">{loc.name}</p>
                    <span className="font-bebas text-[9px] tracking-[0.15em] text-muted uppercase">
                      {CATEGORY_LABEL[loc.category]}
                    </span>
                  </div>
                  <p className="text-muted font-dm text-xs leading-relaxed">{loc.description}</p>
                  <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-dm text-yellow/70 group-hover:text-yellow transition-colors">
                    <Navigation size={11} /> {t.map.directions}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
