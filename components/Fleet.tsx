"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { vehicleHref } from "@/lib/vehicle-slug";
import { Gauge, Zap, Users, Shield, ArrowRight, BadgeCheck, Ban, ChevronLeft, ChevronRight, Star, Maximize2, Snowflake, Fuel, MapPin, Bluetooth, DoorOpen, Check, LifeBuoy, Flame } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { DEFAULT_CONTENT, type FleetItem, type VehicleCategory } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import { typeChips, shouldShowTypeFilter, applyTypeFilter } from "@/lib/vehicle-filter";
import { useCurrency } from "@/context/CurrencyContext";
import ScooterDetailModal from "@/components/ScooterDetailModal";
import SaveButton from "@/components/SaveButton";

type Spec = { icon: React.ElementType; label: string };

// Default spec chips for scooters (used when the owner hasn't set custom specs).
const SCOOTER_SPECS: Spec[] = [
  { icon: Gauge, label: "125cc Engine" },
  { icon: Zap, label: "Automatic" },
  { icon: Users, label: "2 Riders" },
  { icon: Shield, label: "Helmet Included" },
];

// Pick a sensible icon for an owner-typed spec, by keyword (works for any vehicle).
function specIcon(label: string): React.ElementType {
  const s = label.toLowerCase();
  if (/auto|gear|transmis/.test(s)) return Zap;
  if (/seat|rider|person|people|pax|passenger/.test(s)) return Users;
  if (/helmet|insur|safe|protect|jacket|life/.test(s)) return s.includes("life") ? LifeBuoy : Shield;
  if (/engine|cc|power|km|speed|range|battery/.test(s)) return Gauge;
  if (/air|a\/c|\bac\b|cool|climate/.test(s)) return Snowflake;
  if (/fuel|petrol|tank|diesel/.test(s)) return Fuel;
  if (/door/.test(s)) return DoorOpen;
  if (/gps|map|nav/.test(s)) return MapPin;
  if (/bluetooth|audio|music/.test(s)) return Bluetooth;
  return Check;
}

// Resolve the spec chips for a vehicle: owner's custom specs first, else the
// scooter defaults for scooter-type categories, else none (no wrong assumptions).
function isScooterCat(cat: string): boolean {
  return /scooter|moto|bike|moped/.test(cat.toLowerCase());
}
function resolveSpecs(item: FleetItem): Spec[] {
  const own = (item.specs ?? []).filter(Boolean);
  if (own.length) return own.map((label) => ({ icon: specIcon(label), label }));
  if (isScooterCat(item.category ?? "scooter") || item.id === "burgman" || item.id === "avenis") return SCOOTER_SPECS;
  return [];
}

/**
 * Vehicle photo carousel — built for phones first:
 * photos auto-rotate while the card is on screen, a finger-swipe changes
 * photo, and the arrows/dots/counter are ALWAYS visible on touch screens
 * (they only hide-until-hover on desktop). Crossfade keeps it smooth.
 */
function FleetImageCarousel({ scooter }: { scooter: FleetItem }) {
  const photos = scooter.images && scooter.images.length > 0
    ? scooter.images
    : scooter.image ? [scooter.image] : [];
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  // Auto-rotate — no touch needed to discover the other photos
  // (same simple pattern as the promo carousel; pauses on hover/touch)
  useEffect(() => {
    if (photos.length <= 1 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % photos.length), 3500);
    return () => clearInterval(t);
  }, [photos.length, paused]);

  const prev = (e: React.MouseEvent) => {
    e.preventDefault();
    setIdx((i) => (i - 1 + photos.length) % photos.length);
  };
  const next = (e: React.MouseEvent) => {
    e.preventDefault();
    setIdx((i) => (i + 1) % photos.length);
  };

  if (photos.length === 0) return (
    <div className="relative h-[240px] md:h-[300px] bg-dark-card flex items-center justify-center">
      <Gauge size={48} className="text-muted/20" />
    </div>
  );

  const dim = scooter.available === false || scooter.soldOutToday;

  return (
    <div
      ref={wrapRef}
      className="relative h-[240px] md:h-[300px] overflow-hidden group/carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { setPaused(true); touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current !== null) {
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40 && photos.length > 1) {
            setIdx((i) => (i + (dx < 0 ? 1 : -1) + photos.length) % photos.length);
          }
          touchX.current = null;
        }
        // resume the slideshow shortly after the finger lifts
        setTimeout(() => setPaused(false), 4000);
      }}
    >
      {/* Stacked photos with crossfade */}
      {photos.map((src, i) => (
        <Image
          key={`${src}-${i}`}
          src={src}
          alt={`${scooter.name} — photo ${i + 1}`}
          fill
          className={`object-cover transition-opacity duration-700 group-hover:scale-[1.04] ${
            i === idx ? "opacity-100" : "opacity-0"
          } ${dim ? "brightness-50" : ""}`}
          sizes="(max-width: 768px) 100vw, 50vw"
          loading={i === 0 ? "eager" : "lazy"}
          unoptimized={src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"))}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-dark-card/20 to-transparent pointer-events-none" />

      {photos.length > 1 && (
        <>
          {/* Arrows — always visible on touch screens, hover-reveal on desktop */}
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/45 backdrop-blur-sm border border-white/15 text-white flex items-center justify-center transition-opacity hover:bg-black/75 opacity-90 md:opacity-0 md:group-hover/carousel:opacity-100"
            aria-label="Previous photo"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/45 backdrop-blur-sm border border-white/15 text-white flex items-center justify-center transition-opacity hover:bg-black/75 opacity-90 md:opacity-0 md:group-hover/carousel:opacity-100"
            aria-label="Next photo"
          >
            <ChevronRight size={17} />
          </button>

          {/* Photo counter */}
          <span className="absolute bottom-4 right-4 z-10 font-dm text-[11px] text-white/90 bg-black/45 backdrop-blur-sm border border-white/10 rounded-full px-2.5 py-1">
            {idx + 1} / {photos.length}
          </span>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.preventDefault(); setIdx(i); }}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "bg-yellow w-4" : "bg-white/60 w-1.5"}`}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Fleet({
  fleet,
  categories,
  ratings,
  recentBookings,
  whatsapp,
  eyebrow,
  title,
  subtitle,
}: {
  fleet?: FleetItem[];
  categories?: VehicleCategory[];
  ratings?: Record<string, { avg: number; count: number }>;
  recentBookings?: Record<string, number>;
  whatsapp?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}) {
  const allItems = fleet ?? DEFAULT_CONTENT.fleet;
  const cats = categories ?? [];
  const { t, language } = useLanguage();
  const { convert } = useCurrency();
  const [activeCat, setActiveCat] = useState<string>("all");
  // Body style within the active category — "suv", "sedan". Separate state from
  // activeCat because the two filters compose: Cars → SUV.
  const [activeType, setActiveType] = useState<string>("all");
  const [detail, setDetail] = useState<{ scooter: FleetItem; specs: Spec[]; included: string[] } | null>(null);
  const calm = useReducedMotion();

  const enabledIds = new Set(cats.filter((c) => c.enabled).map((c) => c.id));
  const knownIds = new Set(cats.map((c) => c.id));
  const catOf = (it: FleetItem) => it.category ?? "scooter";

  const visibleItems = allItems.filter((it) => {
    if (cats.length === 0) return true;
    const c = catOf(it);
    if (!knownIds.has(c)) return true;
    return enabledIds.has(c);
  });

  const usedCats = cats.filter(
    (c) => c.enabled && visibleItems.some((it) => catOf(it) === c.id)
  );
  const showTabs = usedCats.length > 1;

  const baseItems =
    showTabs && activeCat !== "all"
      ? visibleItems.filter((it) => catOf(it) === activeCat)
      : visibleItems;

  // ── Body-style filter (SUV / Sedan / 4x4 …) ──────────────────────────────
  //
  // The category answers "what am I renting"; this answers "which one". On
  // /browse/cars the page has already narrowed to one category, so these chips
  // are the only filter on screen and the ONLY way to tell four cars apart
  // without reading every card.
  //
  // Which chips appear is derived, never declared: a style is offered only if
  // the owner enabled it AND a bookable vehicle currently carries it. That is
  // what makes a filter trustworthy — every chip returns results, so tapping
  // one can never produce an empty grid, and a style disappears on its own the
  // day the last car of that shape is taken off the site.
  const activeCatDef =
    showTabs && activeCat !== "all"
      ? cats.find((c) => c.id === activeCat)
      : usedCats.length === 1
      ? usedCats[0]
      : undefined;
  const typeChipList = typeChips(baseItems, activeCatDef?.types);
  const showTypes = shouldShowTypeFilter(typeChipList);
  const typeActive = showTypes && activeType !== "all" && typeChipList.some((c) => c.id === activeType);
  const typedItems = showTypes ? applyTypeFilter(baseItems, typeChipList, activeType) : baseItems;

  // Switching category must drop a body style that belonged to the old one,
  // or picking Scooters after SUV would silently show nothing.
  useEffect(() => setActiveType("all"), [activeCat]);

  // Available vehicles first, sold-out / unavailable ones last.
  const isOut = (it: FleetItem) => it.available === false || it.soldOutToday === true;
  const items = [...typedItems].sort((a, b) => Number(isOut(a)) - Number(isOut(b)));

  if (visibleItems.length === 0) return null;

  return (
    <section id="fleet" className="bg-dark pt-5 pb-14" aria-label="Vehicle fleet">
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="mb-6">
          <p className="font-bebas text-yellow text-[11px] tracking-[0.3em] mb-1.5 uppercase">{eyebrow ?? t.fleet.sectionEyebrow}</p>
          <h2 className="font-syne font-extrabold text-offwhite uppercase leading-tight text-2xl md:text-3xl">
            {title ?? t.fleet.sectionTitle}
          </h2>
          <p className="mt-2 max-w-xl font-dm text-sm leading-relaxed text-muted">
            {subtitle ?? t.fleet.sectionSub}
          </p>
        </div>

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

        {/* ── Body style ────────────────────────────────────────────────────
            A second, subordinate tier. When the category tabs above are on
            screen those own the solid-gold active state, so these take the
            quieter gold-wash treatment and the hierarchy stays legible; on a
            single-category page like /browse/cars there is no row above, these
            ARE the filter, and they take the solid pill. Two states for one
            control, chosen by what else is on the page — not two components. */}
        {showTypes && (
          <div
            role="group"
            aria-label={`Filter ${(activeCatDef?.label ?? "vehicles").toLowerCase()} by type`}
            className={`flex flex-wrap items-center gap-2 ${showTabs ? "-mt-5 mb-9" : "mb-10"}`}
          >
            {[
              { id: "all", label: t.fleet.allTypes, n: baseItems.length },
              ...typeChipList.map((c) => ({ id: c.id, label: c.label, n: c.count })),
            ].map((chip) => {
              const on = chip.id === "all" ? !typeActive : activeType === chip.id;
              const solid = !showTabs;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveType(chip.id)}
                  aria-pressed={on}
                  // min-h-11 is the 44px touch target, not a look: these sit
                  // under a thumb on a phone, and at their natural 39px they
                  // were the smallest tappable thing on the page.
                  className={`relative inline-flex min-h-11 items-center rounded-full border px-4 py-2 font-syne text-[13px] font-bold transition-colors ${
                    on
                      ? solid
                        ? "border-transparent text-dark"
                        : "border-yellow/40 bg-yellow/12 text-yellow"
                      : "border-white/10 bg-white/[0.03] text-muted hover:border-yellow/30 hover:text-offwhite"
                  }`}
                >
                  {/* The gold travels between chips instead of blinking out of
                      one and into another — the single piece of authored motion
                      in this row, and the thing that makes it feel like a
                      control rather than a set of links. */}
                  {on && solid && (
                    calm ? (
                      <span className="absolute inset-0 rounded-full bg-yellow" />
                    ) : (
                      <motion.span
                        layoutId="fleet-type-pill"
                        className="absolute inset-0 rounded-full bg-yellow"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )
                  )}
                  <span className="relative z-10">
                    {chip.label}{" "}
                    <span className={`ml-1 font-dm font-normal tabular-nums ${on && solid ? "text-dark/70" : ""}`}>
                      {chip.n}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 3-up from xl. The card design is untouched — this only stops a
            long catalogue turning into a very long scroll on a wide screen. */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
          {items.map((scooter, i) => {
            const specs = resolveSpecs(scooter);
            const ownInc = (scooter.included ?? []).filter(Boolean);
            const included = ownInc.length
              ? ownInc
              : (isScooterCat(scooter.category ?? "scooter") || scooter.id === "burgman" || scooter.id === "avenis")
              ? [...t.booking.included]
              : [];
            // "out" = not offered (admin off) OR every unit is on a trip today
            const out = scooter.available === false || scooter.soldOutToday === true;
            return (
              <motion.div
                key={`${scooter.id}-${i}`}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: Math.min(i, 3) * 0.05 }}
                className="group relative bg-dark-card rounded-2xl overflow-hidden border border-white/10 transition-colors duration-300 hover:border-yellow/50"
              >
                {/* Photo carousel */}
                <FleetImageCarousel scooter={scooter} />

                {/* Save (wishlist) heart */}
                <div className="absolute top-5 right-5 z-10">
                  <SaveButton
                    item={{
                      id: scooter.id,
                      type: "scooter",
                      name: scooter.name,
                      image: scooter.images?.[0] || scooter.image,
                      href: `/browse/${scooter.category ?? "scooter"}`,
                      meta: `${convert(scooter.price)} ${scooter.unit}`,
                    }}
                  />
                </div>

                {/* Badges overlay */}
                <div className="absolute top-5 left-5 flex items-center gap-2 z-10">
                  <span className="font-bebas text-xs tracking-[0.2em] bg-yellow text-dark px-3.5 py-1.5 rounded-full">
                    {scooter.badge}
                  </span>
                  {out ? (
                    <span className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] bg-red-500/90 text-white px-3 py-1.5 rounded-full">
                      <Ban size={10} /> {t.fleet.unavailable}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] bg-green-500/90 text-white px-3 py-1.5 rounded-full">
                      <BadgeCheck size={10} /> {t.fleet.available}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <p className="font-bebas text-muted text-[11px] tracking-[0.2em] mb-1 uppercase">
                    {loc(language, scooter.tagline, scooter.taglineFr, scooter.taglineCr)}
                  </p>
                  {/* The name is a real link to the vehicle's own page. The
                      Details button below still opens the modal — comparing a
                      grid is faster than loading three pages — but until now
                      there was no crawlable path to the vehicle pages at all,
                      and a URL nothing links to is a URL Google discovers late
                      and ranks lower. */}
                  <h3 className="font-syne font-extrabold text-offwhite uppercase leading-none mb-2 text-xl md:text-2xl">
                    <Link
                      href={vehicleHref(scooter)}
                      className="hover:text-yellow transition-colors"
                    >
                      {scooter.name}
                    </Link>
                  </h3>
                  {(() => {
                    const r = ratings?.[scooter.id];
                    return r && r.count > 0 ? (
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={13} className={n <= Math.round(r.avg) ? "text-yellow fill-yellow" : "text-muted/30"} />
                          ))}
                        </span>
                        <span className="font-dm text-offwhite text-xs font-medium">{r.avg.toFixed(1)}</span>
                        <span className="font-dm text-muted text-[11px]">({r.count})</span>
                      </div>
                    ) : null;
                  })()}
                  {(recentBookings?.[scooter.id] ?? 0) >= 2 && (
                    <div className="inline-flex items-center gap-1.5 mb-4 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-full px-3 py-1">
                      <Flame size={12} />
                      <span className="font-dm text-xs font-medium">
                        {t.fleet.bookedThisWeek
                          ? t.fleet.bookedThisWeek(recentBookings![scooter.id])
                          : `Booked ${recentBookings![scooter.id]}× this week`}
                      </span>
                    </div>
                  )}
                  <p className="text-muted/80 font-dm text-sm leading-snug line-clamp-2 mb-3">
                    {loc(language, scooter.description, scooter.descriptionFr, scooter.descriptionCr)}
                  </p>

                  {specs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-5">
                      {specs.map((spec) => {
                        const Icon = spec.icon;
                        return (
                          <span
                            key={spec.label}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-dm text-offwhite/85"
                          >
                            <Icon size={13} className="text-yellow shrink-0" /> {spec.label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <div>
                      <span className="font-syne font-extrabold text-yellow text-2xl">{convert(scooter.price)}</span>
                      <span className="font-dm text-muted text-sm ml-1">{scooter.unit}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setDetail({ scooter, specs, included })}
                        className="flex items-center justify-center gap-1.5 font-syne font-bold text-sm px-4 py-3 rounded-full border border-dark-border text-offwhite/80 hover:border-yellow/50 hover:text-yellow transition-colors shrink-0"
                      >
                        <Maximize2 size={13} /> Details
                      </button>
                      <Link
                        href="#booking"
                        onClick={() => {
                          if (!out) {
                            window.dispatchEvent(
                              new CustomEvent("rr:prefill-booking", { detail: { scooter: scooter.id } }),
                            );
                          }
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 font-syne font-bold text-sm px-6 py-3 rounded-full transition-colors ${
                          out
                            ? "bg-dark-border text-muted cursor-not-allowed pointer-events-none"
                            : "bg-yellow text-dark hover:bg-yellow-dark"
                        }`}
                        aria-label={`Book ${scooter.name}`}
                        aria-disabled={out}
                      >
                        {out
                          ? t.fleet.unavailableBtn
                          : <>{t.fleet.bookNow} <ArrowRight size={14} /></>}
                      </Link>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {detail && (
        <ScooterDetailModal
          scooter={detail.scooter}
          specs={detail.specs}
          included={detail.included}
          rating={ratings?.[detail.scooter.id]}
          whatsapp={whatsapp}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}
