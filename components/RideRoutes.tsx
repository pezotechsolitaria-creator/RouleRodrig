"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Clock, Route as RouteIcon, ArrowUpRight, WifiOff, Star, Footprints, Bike, Images as ImageIcon } from "lucide-react";
import type { RideRoute } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import SaveButton from "@/components/SaveButton";

const DIFFICULTY_CLS: Record<string, string> = {
  Easy:     "bg-green-500/10 text-green-400 border-green-500/30",
  Moderate: "bg-yellow/10 text-yellow border-yellow/30",
  Advanced: "bg-red-500/10 text-red-400 border-red-500/30",
};

const kindOf = (r: RideRoute) => r.kind ?? "ride";

export default function RideRoutes({ routes = [] }: { routes?: RideRoute[] }) {
  const { t, language } = useLanguage();
  const tr = t.routes;
  const [filter, setFilter] = useState<"all" | "ride" | "hike">("all");
  if (!routes || routes.length === 0) return null;

  const hasRides = routes.some((r) => kindOf(r) === "ride");
  const hasHikes = routes.some((r) => kindOf(r) === "hike");
  const showFilter = hasRides && hasHikes;

  const base = filter === "all" ? routes : routes.filter((r) => kindOf(r) === filter);

  // Featured first, then original order
  const sorted = [...base].sort((a, b) =>
    (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
  );

  return (
    <section id="routes" className="bg-dark-card py-24 md:py-36 border-y border-dark-border" aria-label="Scenic ride routes">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{tr.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(34px, 8vw, 80px)" }}
          >
            {tr.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-xl">{tr.subtitle}</p>
          <div className="inline-flex items-center gap-2 mt-5 bg-dark border border-yellow/25 rounded-full px-3.5 py-1.5">
            <WifiOff size={13} className="text-yellow" />
            <span className="font-dm text-xs text-offwhite/70">{tr.offline}</span>
          </div>
        </motion.div>

        {showFilter && (
          <div className="flex flex-wrap gap-2.5 mb-10">
            {([
              { id: "all", label: "All", icon: null },
              { id: "ride", label: "Scooter rides", icon: Bike },
              { id: "hike", label: "Hiking & trails", icon: Footprints },
            ] as const).map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-2 font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-colors ${
                    filter === f.id
                      ? "bg-yellow text-dark"
                      : "bg-dark border border-dark-border text-muted hover:text-offwhite hover:border-yellow/40"
                  }`}
                >
                  {Icon && <Icon size={15} />} {f.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {sorted.map((r, i) => {
            const stops = r.stops.split(/\n+/).map((s) => s.trim()).filter(Boolean);
            const isHike = kindOf(r) === "hike";
            const DistIcon = isHike ? Footprints : RouteIcon;
            return (
              <motion.article
                key={r.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: (i % 3) * 0.1 }}
                className={`group flex flex-col bg-dark rounded-2xl overflow-hidden transition-colors ${
                  r.featured
                    ? "border-2 border-yellow/50 hover:border-yellow shadow-[0_0_24px_rgba(245,200,66,0.08)]"
                    : "border border-dark-border hover:border-yellow/40"
                }`}
              >
                {/* Image / gradient header */}
                <div className="relative h-44 overflow-hidden">
                  {r.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.image} alt={r.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-yellow/20 via-dark-card to-dark flex items-center justify-center">
                      {isHike ? <Footprints size={40} className="text-yellow/40" /> : <RouteIcon size={40} className="text-yellow/40" />}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-dark via-transparent to-transparent" />
                  {/* The editor takes a whole gallery now — the viewpoints
                      along the way, not just one cover. */}
                  {(r.images?.length ?? 0) > 1 && (
                    <span className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 font-dm text-[10px] text-white">
                      <ImageIcon size={10} /> {r.images!.length}
                    </span>
                  )}
                  {/* Save (wishlist) heart */}
                  <div className="absolute top-4 right-4 z-10">
                    <SaveButton
                      item={{
                        id: r.id,
                        type: "route",
                        name: r.name,
                        image: r.image,
                        href: "#routes",
                        meta: `${r.distance} · ${r.duration}`,
                      }}
                    />
                  </div>
                  {/* Kind + difficulty + featured badges */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.2em] bg-dark/80 backdrop-blur text-offwhite border border-white/15 px-3 py-1 rounded-full">
                      {isHike ? <><Footprints size={10} /> TRAIL</> : <><Bike size={10} /> RIDE</>}
                    </span>
                    <span className={`font-bebas text-[10px] tracking-[0.2em] border px-3 py-1 rounded-full ${DIFFICULTY_CLS[r.difficulty] ?? DIFFICULTY_CLS.Moderate}`}>
                      {tr.difficulty[r.difficulty as keyof typeof tr.difficulty] ?? r.difficulty}
                    </span>
                    {r.featured && (
                      <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2.5 py-1 rounded-full">
                        <Star size={8} className="fill-yellow" /> FEATURED
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="font-syne font-extrabold text-offwhite text-xl uppercase leading-tight mb-2">{loc(language, r.name, r.nameFr, r.nameCr)}</h3>
                  <p className="text-muted font-dm text-sm leading-relaxed mb-4">{loc(language, r.description, r.descriptionFr, r.descriptionCr)}</p>

                  <div className="flex items-center gap-5 mb-4">
                    <span className="flex items-center gap-1.5 text-offwhite/80 font-dm text-xs">
                      <DistIcon size={13} className="text-yellow" /> {r.distance}
                    </span>
                    <span className="flex items-center gap-1.5 text-offwhite/80 font-dm text-xs">
                      <Clock size={13} className="text-yellow" /> {r.duration}
                    </span>
                  </div>

                  {stops.length > 0 && (
                    <ul className="space-y-1.5 mb-6">
                      {stops.map((s, si) => (
                        <li key={si} className="flex items-start gap-2 text-offwhite/70 font-dm text-xs">
                          <MapPin size={12} className="text-yellow shrink-0 mt-0.5" /> {s}
                        </li>
                      ))}
                    </ul>
                  )}

                  {r.mapsUrl && (
                    <a
                      href={r.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center justify-center gap-2 bg-yellow/10 hover:bg-yellow text-yellow hover:text-dark border border-yellow/30 font-syne font-bold text-xs px-4 py-3 rounded-full transition-colors"
                    >
                      {r.linkLabel ?? tr.openMaps} <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
