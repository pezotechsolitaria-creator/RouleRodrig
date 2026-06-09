"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Gauge, Zap, Users, Shield, ArrowRight, BadgeCheck, Ban } from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_CONTENT, type FleetItem, type VehicleCategory } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { useCurrency } from "@/context/CurrencyContext";

const SPECS_BY_ID: Record<string, { icon: React.ElementType; label: string }[]> = {
  burgman: [
    { icon: Gauge, label: "125cc Engine" },
    { icon: Zap, label: "Automatic" },
    { icon: Users, label: "2 Riders" },
    { icon: Shield, label: "Helmet Included" },
  ],
  avenis: [
    { icon: Gauge, label: "125cc Engine" },
    { icon: Zap, label: "Automatic" },
    { icon: Users, label: "2 Riders" },
    { icon: Shield, label: "Helmet Included" },
  ],
  _default: [
    { icon: Zap, label: "Automatic" },
    { icon: Users, label: "2 Riders" },
    { icon: Shield, label: "Helmet Included" },
    { icon: Gauge, label: "Scooter" },
  ],
};

export default function Fleet({
  fleet,
  categories,
}: {
  fleet?: FleetItem[];
  categories?: VehicleCategory[];
}) {
  const allItems = fleet ?? DEFAULT_CONTENT.fleet;
  const cats = categories ?? [];
  const { t } = useLanguage();
  const { convert } = useCurrency();
  const [activeCat, setActiveCat] = useState<string>("all");

  // Which categories are enabled / known
  const enabledIds = new Set(cats.filter((c) => c.enabled).map((c) => c.id));
  const knownIds = new Set(cats.map((c) => c.id));
  const catOf = (it: FleetItem) => it.category ?? "scooter";

  // A vehicle is visible if categories aren't configured, its category is
  // unknown (safety), or its category is enabled.
  const visibleItems = allItems.filter((it) => {
    if (cats.length === 0) return true;
    const c = catOf(it);
    if (!knownIds.has(c)) return true;
    return enabledIds.has(c);
  });

  // Tabs: enabled categories that actually have visible vehicles
  const usedCats = cats.filter(
    (c) => c.enabled && visibleItems.some((it) => catOf(it) === c.id)
  );
  const showTabs = usedCats.length > 1;

  const items =
    showTabs && activeCat !== "all"
      ? visibleItems.filter((it) => catOf(it) === activeCat)
      : visibleItems;

  if (visibleItems.length === 0) return null;

  return (
    <section id="fleet" className="bg-dark py-24 md:py-36" aria-label="Scooter fleet">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-4"
        >
          <div>
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.fleet.sectionEyebrow}</p>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
              style={{ fontSize: "clamp(38px, 8vw, 80px)" }}
            >
              {t.fleet.sectionTitle}
            </h2>
          </div>
          <p className="text-muted font-dm text-sm max-w-xs leading-relaxed md:text-right">
            {t.fleet.sectionSub}
          </p>
        </motion.div>

        {/* Category filter pills */}
        {showTabs && (
          <div className="flex flex-wrap gap-2.5 mb-10">
            <button
              onClick={() => setActiveCat("all")}
              className={`font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-colors ${
                activeCat === "all"
                  ? "bg-yellow text-dark"
                  : "bg-dark-card border border-dark-border text-muted hover:text-offwhite hover:border-yellow/40"
              }`}
            >
              {t.fleet.allTypes}
            </button>
            {usedCats.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-colors ${
                  activeCat === c.id
                    ? "bg-yellow text-dark"
                    : "bg-dark-card border border-dark-border text-muted hover:text-offwhite hover:border-yellow/40"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {items.map((scooter, i) => {
            const specs = SPECS_BY_ID[scooter.id] ?? SPECS_BY_ID._default;
            const isUpload = scooter.image.startsWith("/uploads/") || scooter.image.startsWith("http");
            return (
              <motion.div
                key={`${scooter.id}-${i}`}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.8, delay: i * 0.12 }}
                whileHover={{ scale: 1.015 }}
                className="group relative bg-dark-card rounded-2xl overflow-hidden border border-dark-border hover:border-yellow/60 transition-all duration-400"
              >
                {/* Image */}
                <div className="relative h-[340px] md:h-[420px] overflow-hidden">
                  <Image
                    src={scooter.image}
                    alt={scooter.name}
                    fill
                    className={`object-cover transition-transform duration-700 group-hover:scale-[1.04] ${scooter.available === false ? "brightness-50" : ""}`}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    loading={i === 0 ? "eager" : "lazy"}
                    unoptimized={isUpload}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-dark-card/20 to-transparent" />
                  <div className="absolute top-5 left-5 flex items-center gap-2">
                    <span className="font-bebas text-xs tracking-[0.2em] bg-yellow text-dark px-3.5 py-1.5 rounded-full">
                      {scooter.badge}
                    </span>
                    {scooter.available === false ? (
                      <span className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] bg-red-500/90 text-white px-3 py-1.5 rounded-full">
                        <Ban size={10} /> {t.fleet.unavailable}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] bg-green-500/90 text-white px-3 py-1.5 rounded-full">
                        <BadgeCheck size={10} /> {t.fleet.available}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8">
                  <p className="font-bebas text-muted text-xs tracking-[0.2em] mb-1 uppercase">
                    {scooter.tagline}
                  </p>
                  <h3
                    className="font-syne font-extrabold text-offwhite uppercase leading-none mb-4"
                    style={{ fontSize: "clamp(32px, 5vw, 44px)" }}
                  >
                    {scooter.name}
                  </h3>
                  <p className="text-muted/80 font-dm text-sm leading-relaxed mb-7">
                    {scooter.description}
                  </p>

                  {/* Specs grid */}
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-8">
                    {specs.map((spec) => {
                      const Icon = spec.icon;
                      return (
                        <div key={spec.label} className="flex items-center gap-2.5 text-sm">
                          <Icon size={14} className="text-yellow shrink-0" />
                          <span className="font-dm text-offwhite/80">{spec.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Price + CTA */}
                  <div className="flex items-center justify-between pt-5 border-t border-dark-border">
                    <div>
                      <span className="font-syne font-extrabold text-yellow text-2xl">{convert(scooter.price)}</span>
                      <span className="font-dm text-muted text-sm ml-1">{scooter.unit}</span>
                    </div>
                    <Link
                      href="#booking"
                      className={`flex items-center gap-2 font-syne font-bold text-sm px-6 py-3 rounded-full transition-colors ${
                        scooter.available === false
                          ? "bg-dark-border text-muted cursor-not-allowed pointer-events-none"
                          : "bg-yellow text-dark hover:bg-yellow-dark"
                      }`}
                      aria-label={`Book ${scooter.name}`}
                      aria-disabled={scooter.available === false}
                    >
                      {scooter.available === false
                        ? t.fleet.unavailableBtn
                        : <>{t.fleet.bookNow} <ArrowRight size={14} /></>}
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
