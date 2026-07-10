"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Navigation, ChevronDown, X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
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
  gas:       "bg-orange-500",
};

const CATEGORY_LABEL: Record<string, string> = {
  beach:     "Beach",
  viewpoint: "Viewpoint",
  restaurant:"Restaurant",
  landmark:  "Landmark",
  activity:  "Activity",
  gas:       "Petrol",
};

export default function MapSection({ locations }: { locations?: MapLocation[] }) {
  const { t } = useLanguage();
  const locs = locations ?? [];
  const [filter, setFilter] = useState<string>("all");

  // ── Lazy-load the Leaflet map only once it's scrolled near ──
  // Leaflet + its tiles are heavy; deferring keeps the initial page fast.
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const [showMap, setShowMap] = useState(false);
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el || showMap) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShowMap(true);
          obs.disconnect();
        }
      },
      { rootMargin: "500px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [showMap]);

  // ── Scroll affordance for the location list ──
  const listRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const checkScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 12);
  }, []);
  useEffect(() => {
    checkScroll();
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, filter]);

  // ── Photo lightbox (zoom) ──
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; name: string } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const openLightbox = (images: string[], name: string) => {
    if (!images.length) return;
    setZoomed(false);
    setLightbox({ images, index: 0, name });
  };
  const step = useCallback((dir: number) => {
    setZoomed(false);
    setLightbox((lb) => (lb ? { ...lb, index: (lb.index + dir + lb.images.length) % lb.images.length } : lb));
  }, []);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox, step]);

  // Only offer filter chips for categories that actually have locations.
  const presentCats = Object.keys(CATEGORY_LABEL).filter((k) =>
    locs.some((l) => l.category === k),
  );
  const shown = filter === "all" ? locs : locs.filter((l) => l.category === filter);

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

        {/* Filter chips — tap a category to focus the map + list */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex items-center gap-2 text-xs font-dm px-3.5 py-1.5 rounded-full border transition-colors ${
              filter === "all"
                ? "bg-yellow text-dark border-yellow font-semibold"
                : "border-dark-border text-muted hover:text-offwhite hover:border-yellow/40"
            }`}
          >
            All ({locs.length})
          </button>
          {presentCats.map((key) => {
            const n = locs.filter((l) => l.category === key).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex items-center gap-2 text-xs font-dm px-3.5 py-1.5 rounded-full border transition-colors ${
                  filter === key
                    ? "bg-yellow text-dark border-yellow font-semibold"
                    : "border-dark-border text-muted hover:text-offwhite hover:border-yellow/40"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_COLOR[key]}`} />
                {CATEGORY_LABEL[key]} ({n})
              </button>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        >
          {/* Map */}
          <div ref={mapWrapRef} className="lg:col-span-2 rounded-2xl overflow-hidden border border-dark-border" style={{ minHeight: 460 }}>
            {/* Leaflet CSS is imported locally inside IslandMap (CSP-safe).
                Only mounted once scrolled near — keeps the initial load light. */}
            {showMap ? (
              <IslandMap locations={shown} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-dark-card" style={{ minHeight: 460 }}>
                <div className="flex flex-col items-center gap-3 text-muted">
                  <div className="w-8 h-8 rounded-full border-2 border-yellow/30 border-t-yellow animate-spin" />
                  <span className="font-dm text-xs">{t.map.title}</span>
                </div>
              </div>
            )}
          </div>

          {/* Location list — tap a photo to zoom, tap "directions" for the map */}
          <div className="relative">
            <div ref={listRef} className="space-y-3 overflow-y-auto max-h-[460px] pr-1 scroll-smooth">
              {shown.map((loc) => {
                const imgs = (loc.images && loc.images.length ? loc.images : loc.image ? [loc.image] : []).filter(
                  Boolean,
                ) as string[];
                return (
                  <div
                    key={loc.id}
                    className="group flex items-start gap-3 bg-dark-card border border-dark-border rounded-xl p-4 hover:border-yellow/40 transition-colors"
                  >
                    {imgs.length ? (
                      <button
                        type="button"
                        onClick={() => openLightbox(imgs, loc.name)}
                        className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-yellow/60"
                        aria-label={`View photos of ${loc.name}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgs[0]} alt={loc.name} className="w-full h-full object-cover" loading="lazy" />
                        <span className="absolute inset-0 flex items-center justify-center bg-dark/45 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ZoomIn size={18} className="text-white" />
                        </span>
                        {imgs.length > 1 && (
                          <span className="absolute bottom-0.5 right-0.5 bg-dark/80 text-white text-[9px] font-dm px-1 rounded">
                            {imgs.length}
                          </span>
                        )}
                      </button>
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
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-[11px] font-dm text-yellow/70 hover:text-yellow transition-colors"
                        aria-label={`Get directions to ${loc.name}`}
                      >
                        <Navigation size={11} /> {t.map.directions}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scroll cue — so every visitor knows the list continues */}
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-dark to-transparent rounded-b-xl transition-opacity duration-300 ${
                canScroll ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              className={`pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-yellow text-dark text-[11px] font-dm font-semibold px-3 py-1 rounded-full shadow-lg transition-all duration-300 ${
                canScroll ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              {t.map.scrollMore ?? "Scroll for more"} <ChevronDown size={13} className="animate-bounce" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Photo lightbox ── */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/92 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              aria-label="Close"
            >
              <X size={22} />
            </button>

            <div className="absolute top-5 left-5 font-syne font-bold text-white text-sm max-w-[60%] truncate">
              {lightbox.name}
            </div>

            {lightbox.images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); step(1); }}
                  className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                  aria-label="Next photo"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.images[lightbox.index]}
              alt={lightbox.name}
              onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
              className={`max-h-[86vh] max-w-[94vw] object-contain rounded-lg select-none transition-transform duration-300 ${
                zoomed ? "scale-[1.9] cursor-zoom-out" : "cursor-zoom-in"
              }`}
              draggable={false}
            />

            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/70 text-xs font-dm">
              <ZoomIn size={13} /> Tap photo to zoom
              {lightbox.images.length > 1 && (
                <span className="ml-2">{lightbox.index + 1} / {lightbox.images.length}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
