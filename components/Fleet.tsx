"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { vehicleHref } from "@/lib/vehicle-slug";
import { Gauge, Zap, Users, Shield, ArrowRight, ChevronLeft, ChevronRight, Star, Snowflake, Fuel, MapPin, Bluetooth, DoorOpen, Check, LifeBuoy, Truck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { DEFAULT_CONTENT, type FleetItem, type VehicleCategory } from "@/lib/defaults";
import type { Language } from "@/lib/i18n";
import { useLanguage } from "@/context/LanguageContext";
import { fleetTerm } from "@/lib/fleet-terms";
import { typeChips, shouldShowTypeFilter, applyTypeFilter } from "@/lib/vehicle-filter";
import { useCurrency } from "@/context/CurrencyContext";
import { openBooking } from "@/lib/rentals/events";
import { deliveryFee, usesScooterRates, vehicleDayRate } from "@/lib/booking-pricing";
import { RENT_COPY, rentLang, rs as rsIn } from "@/lib/rentals/copy";
import { displayUnits } from "@/lib/rentals/units";
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
function resolveSpecs(item: FleetItem, lang: Language): Spec[] {
  const own = (item.specs ?? []).filter(Boolean);
  // The ICON is chosen from the owner's English, the LABEL is what the reader
  // sees — pick the icon first or a French card loses every icon it has.
  if (own.length)
    return own.map((label) => ({
      icon: specIcon(label),
      label: fleetTerm(lang, label),
    }));
  if (isScooterCat(item.category ?? "scooter") || item.id === "burgman" || item.id === "avenis") return SCOOTER_SPECS;
  return [];
}

/**
 * Vehicle photo carousel — built for phones first:
 * photos auto-rotate while the card is on screen, a finger-swipe changes
 * photo, and the arrows/dots/counter are ALWAYS visible on touch screens
 * (they only hide-until-hover on desktop). Crossfade keeps it smooth.
 */
function FleetImageCarousel({
  scooter,
  cardIndex,
  onOpen,
}: {
  scooter: FleetItem;
  /** A tap on the photo opens the booking sheet; the arrows and dots don't. */
  onOpen?: () => void;
  /** Which CARD this is in the grid. `i` inside the component is the index of
   *  a photo within this one card's carousel, and the two were being confused
   *  — see the loading attribute below. */
  cardIndex: number;
}) {
  const { t } = useLanguage();
  const photos = scooter.images && scooter.images.length > 0
    ? scooter.images
    : scooter.image ? [scooter.image] : [];
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  // ── AUTO-ROTATE, BUT NOT BEFORE LCP HAS SETTLED ──────────────────────────
  //
  // No touch needed to discover the other photos — except on the FIRST card,
  // where rotating early cost four seconds of Largest Contentful Paint.
  //
  // Every slide is a full-width photograph in the same box, so every rotation
  // paints a new LCP CANDIDATE. LCP takes the last one, and it stops updating
  // only on the first user input — which in a lab run never comes. Measured on
  // /browse/car (PageSpeed, mobile):
  //
  //   LCP reported            7.6 s
  //   sum of its own subparts 3.0 s   <- the gap is the carousel
  //
  // Photo 1 painted at ~3s; the slide at 3.5s and the one at 7s each reset the
  // clock. That is also why adding `priority` to photo 1 moved nothing: it
  // made the wrong image faster.
  //
  // Waiting for the first real interaction is exactly right rather than a
  // guessed delay: LCP is finalised BY that interaction, so a rotation which
  // starts there can never become the LCP, and a visitor who scrolls or taps
  // — which is everybody, within a second — still gets the feature. Cards
  // below the fold are not LCP candidates at all, so they rotate immediately.
  const [mayRotate, setMayRotate] = useState(cardIndex !== 0);
  useEffect(() => {
    if (mayRotate) return;
    const go = () => setMayRotate(true);
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", go, opts);
    window.addEventListener("keydown", go, opts);
    window.addEventListener("scroll", go, opts);
    // A belt-and-braces ceiling for a visitor who opens the page and simply
    // reads it: they should still see the other photos eventually.
    const t = setTimeout(go, 12_000);
    return () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
      window.removeEventListener("scroll", go);
      clearTimeout(t);
    };
  }, [mayRotate]);

  useEffect(() => {
    if (photos.length <= 1 || paused || !mayRotate) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % photos.length), 3500);
    return () => clearInterval(t);
  }, [photos.length, paused, mayRotate]);

  const prev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i - 1 + photos.length) % photos.length);
  };
  const next = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
      onClick={onOpen}
      className={`relative h-[220px] md:h-[260px] overflow-hidden group/carousel${onOpen ? " cursor-pointer" : ""}`}
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
          // ── ONE EAGER IMAGE, NOT ONE PER CARD ──────────────────────
          // This read `i === 0`, and `i` is the photo index WITHIN a card. So
          // every card's first photo was eager: four full-viewport images on
          // /browse/car, three on /browse/scooter, each with a matching
          // <link rel="preload" as="image"> in the head at
          // sizes="(max-width:768px) 100vw" — four phone-width photographs
          // racing the one that is actually on screen. Only the first photo
          // of the first card is above the fold.
          loading={cardIndex === 0 && i === 0 ? "eager" : "lazy"}
          // ── AND THE EAGER ONE HAS TO BE THE PRIORITY ONE ───────────
          // `eager` only means "do not lazy-load"; it says nothing about
          // WHEN. Measured on /browse/car (PageSpeed, mobile, real run):
          //
          //   LCP                     7.7 s
          //   time to first byte      20 ms
          //   resource load DELAY     936 ms   <- this line fixes this
          //   resource load duration  275 ms   (the photo itself is fine)
          //   element render delay    1,410 ms
          //
          // Lighthouse's lcp-discovery check scored 0.00 with exactly one
          // box unticked: "fetchpriority=high should be applied to the
          // image preload request". The photo was discoverable and not
          // lazy — it simply queued behind 330 KB of JavaScript for most
          // of a second before the browser bothered to start it.
          //
          // `priority` is what emits fetchpriority="high" plus a
          // <link rel="preload">. Same single image as `loading` above —
          // deliberately the same condition, because a preload per card is
          // the bug the comment above describes, in a more expensive form.
          priority={cardIndex === 0 && i === 0}
          unoptimized={src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"))}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-dark-card/20 to-transparent pointer-events-none" />

      {photos.length > 1 && (
        <>
          {/* Arrows — always visible on touch screens, hover-reveal on desktop */}
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm border border-white/15 text-white flex items-center justify-center transition-opacity hover:bg-black/75 opacity-90 md:opacity-0 md:group-hover/carousel:opacity-100"
            aria-label={t.a11y.prevPhoto}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm border border-white/15 text-white flex items-center justify-center transition-opacity hover:bg-black/75 opacity-90 md:opacity-0 md:group-hover/carousel:opacity-100"
            aria-label={t.a11y.nextPhoto}
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
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx(i); }}
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
  title,
  titleAs = "h2",
  subtitle,
  intro,
}: {
  fleet?: FleetItem[];
  categories?: VehicleCategory[];
  ratings?: Record<string, { avg: number; count: number }>;
  /** Kept for callers that still pass them; the cards no longer show
   *  urgency badges or an eyebrow (owner brief, 6 Oct 2026). */
  recentBookings?: Record<string, number>;
  whatsapp?: string;
  eyebrow?: string;
  title?: string;
  /** The section heading is the PAGE heading on /browse/[category]: that page's
   *  only other candidate is the chrome bar, whose text is the one-word nav
   *  label ("Cars"). Defaults to h2 so every other caller is unchanged. */
  titleAs?: "h1" | "h2";
  /** ONE sentence under the heading. */
  subtitle?: React.ReactNode;
  /** The longer paragraph about renting here (and the French twin link),
   *  kept on the page for readers and search, BELOW the cards. */
  intro?: React.ReactNode;
}) {
  const allItems = fleet ?? DEFAULT_CONTENT.fleet;
  const cats = categories ?? [];
  const { t, language } = useLanguage();
  const r = RENT_COPY[rentLang(language)];
  // The card's figure, grouped the reader's way ("Rs 1 899" in French).
  const rs = (n: number | null | undefined) => rsIn(n, rentLang(language));
  const { convert } = useCurrency();
  const [activeCat, setActiveCat] = useState<string>("all");
  // Body style within the active category — "suv", "sedan". Separate state from
  // activeCat because the two filters compose: Cars → SUV.
  const [activeType, setActiveType] = useState<string>("all");
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
  // Derived, never declared: a style is offered only if the owner enabled it
  // AND a bookable vehicle carries it, so every chip returns results.
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

  // Switching category must drop a body style that belonged to the old one.
  useEffect(() => setActiveType("all"), [activeCat]);

  // ── TWO DIFFERENT STATES, AND THEY WERE ONE (M158) ────────────────────────
  // `available === false` is the owner withdrawing a vehicle: not for hire.
  // `soldOutToday` is every unit out on a trip TODAY — bookable next Tuesday.
  const isWithdrawn = (it: FleetItem) => it.available === false;
  const isBusyToday = (it: FleetItem) =>
    it.available !== false && it.soldOutToday === true;
  // Free today first, out-on-a-trip next, withdrawn last.
  const rank = (it: FleetItem) => (isWithdrawn(it) ? 2 : isBusyToday(it) ? 1 : 0);
  // Numbered in catalogue order FIRST, then sorted, so "Avenis 125 · 02"
  // stays 02 whether or not 01 is out today.
  const cards = displayUnits(typedItems).sort((a, b) => rank(a.item) - rank(b.item));

  if (visibleItems.length === 0) return null;

  // Resolved to a tag name rather than branching the JSX twice.
  const Heading = titleAs;

  const open = (scooter: FleetItem, unit: string) => openBooking({ scooter: scooter.id, unit });

  return (
    <section id="fleet" className="bg-dark pb-10 pt-6" aria-label={t.a11yMore.vehicleFleet}>
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="mb-6">
          <Heading className="font-syne text-[28px] font-extrabold leading-[1.1] text-offwhite md:text-4xl">
            {title ?? t.fleet.sectionTitle}
          </Heading>
          <p className="mt-2 max-w-xl font-dm text-[15px] leading-relaxed text-muted">
            {subtitle ?? t.fleet.sectionSub}
          </p>
        </div>

        {showTabs && (
          <div className="mb-6 flex flex-wrap gap-2">
            {[{ id: "all", label: t.fleet.allTypes }, ...usedCats.map((c) => ({ id: c.id, label: c.label }))].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                aria-pressed={activeCat === c.id}
                className={`inline-flex min-h-11 items-center rounded-full px-4 font-syne text-sm font-bold transition-colors ${
                  activeCat === c.id
                    ? "bg-yellow text-dark"
                    : "border border-white/10 bg-white/[0.03] text-muted hover:text-offwhite"
                }`}
              >
                {c.id === "all" ? c.label : fleetTerm(language, c.label)}
              </button>
            ))}
          </div>
        )}

        {/* ── Body style ── the existing chips, no new filter UI. */}
        {showTypes && (
          <div
            role="group"
            aria-label={`Filter ${(activeCatDef?.label ?? "vehicles").toLowerCase()} by type`}
            className="mb-6 flex flex-wrap items-center gap-2"
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
                  className={`relative inline-flex min-h-11 items-center rounded-full border px-4 py-2 font-syne text-[13px] font-bold transition-colors ${
                    on
                      ? solid
                        ? "border-transparent text-dark"
                        : "border-yellow/40 bg-yellow/12 text-yellow"
                      : "border-white/10 bg-white/[0.03] text-muted hover:border-white/25 hover:text-offwhite"
                  }`}
                >
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
                    {fleetTerm(language, chip.label)}{" "}
                    <span className={`ml-1 font-dm font-normal tabular-nums ${on && solid ? "text-dark/70" : ""}`}>
                      {chip.n}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Vertical cards on a phone, two columns from 900px. The whole card
            opens the booking sheet with this vehicle chosen; Details is a real
            link to the vehicle's own page. */}
        <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2">
          {cards.map((u, i) => {
            const scooter = u.item;
            const out = scooter.available === false;
            const busyToday = !out && scooter.soldOutToday === true;
            const rate = vehicleDayRate(scooter, cats);
            const scooterRates = usesScooterRates(scooter);
            const chips = cardChips(scooter, language, deliveryFee(scooter, cats) === 0 ? r.deliveryIncluded : null);
            const rating = ratings?.[scooter.id];
            return (
              <article
                key={u.key}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-dark-card transition-colors ${out ? "" : "hover:border-white/25"}`}
              >
                <FleetImageCarousel scooter={scooter} cardIndex={i} onOpen={out ? undefined : () => open(scooter, u.key)} />

                <div className="absolute right-4 top-4 z-10">
                  <SaveButton
                    item={{
                      id: scooter.id,
                      type: "scooter",
                      name: u.label,
                      image: scooter.images?.[0] || scooter.image,
                      href: vehicleHref(scooter),
                      meta: rate ? `${rs(rate)} ${scooter.unit}` : "",
                    }}
                  />
                </div>

                <div className="relative flex flex-1 flex-col p-5">
                  {/* The card's main action covers the text area; Details and
                      the photo controls sit above it. No nested buttons. */}
                  {!out && (
                    <button
                      type="button"
                      onClick={() => open(scooter, u.key)}
                      aria-label={`${r.reserve} — ${u.label}`}
                      className="absolute inset-0 z-[1] rounded-b-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-offwhite/70"
                    />
                  )}
                  <h3 className="font-syne text-lg font-bold leading-snug text-offwhite">{u.label}</h3>
                  {rating && rating.count > 0 ? (
                    <p className="mt-1 flex items-center gap-1 font-dm text-xs text-muted">
                      <Star size={12} className="fill-offwhite text-offwhite" aria-hidden />
                      <span className="tabular-nums text-offwhite/85">{rating.avg.toFixed(1)}</span>
                      <span className="tabular-nums">({rating.count})</span>
                    </p>
                  ) : null}

                  {chips.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {chips.map((c) => {
                        const Icon = c.icon;
                        return (
                          <li
                            key={c.label}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 font-dm text-xs text-offwhite/80"
                          >
                            <Icon size={12} className="shrink-0 text-muted" aria-hidden /> {c.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {out ? (
                    <p className="mt-3 font-dm text-xs text-muted">{r.withdrawn}</p>
                  ) : busyToday ? (
                    /* Amber, not red, and it says what is true: out on a trip
                       today, bookable for any other date. */
                    <p className="mt-3 font-dm text-xs text-amber-300">{r.outToday}</p>
                  ) : null}

                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <div className="min-w-0">
                      {rate > 0 && (
                        <p className="font-syne text-xl font-extrabold leading-none tabular-nums text-offwhite">
                          {convert(rs(rate))}
                          <span className="ml-1 font-dm text-sm font-normal text-muted">{fleetTerm(language, scooter.unit)}</span>
                        </p>
                      )}
                      {scooterRates && rate > 0 && <p className="mt-1 font-dm text-xs text-muted">{r.scooterSub}</p>}
                    </div>
                    <Link
                      href={vehicleHref(scooter)}
                      className="relative z-[2] inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-1 font-dm text-sm text-offwhite/85 underline-offset-4 hover:text-offwhite hover:underline"
                    >
                      {r.details} <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {intro ? <div className="mt-10 max-w-2xl font-dm text-sm leading-relaxed text-muted">{intro}</div> : null}
      </div>
    </section>
  );
}

/**
 * Three chips per card, from the owner's own specs: for a scooter the engine,
 * the gearbox and the riders; for a car the gearbox, the seats and — when the
 * category delivers free — "Delivery included" in place of a third spec.
 * Labels pass through fleetTerm, so a French card reads French.
 */
function cardChips(item: FleetItem, lang: Language, deliveryIncluded: string | null): Spec[] {
  const own = (item.specs ?? []).filter(Boolean);
  const scooterish = isScooterCat(item.category ?? "scooter");
  const base = own.length ? own : scooterish ? SCOOTER_SPECS.map((s) => s.label) : [];
  const pick = (re: RegExp) => base.find((s) => re.test(s));
  const wanted = scooterish
    ? [pick(/cc|engine/i), pick(/auto|manual|gear/i), pick(/rider|seat|person|people/i)]
    : [pick(/auto|manual|gear/i), pick(/seat|place|passenger/i), deliveryIncluded ? null : pick(/air|a\/c|\bac\b|clim/i)];
  const chosen = [...new Set(wanted.filter((s): s is string => Boolean(s)))];
  for (const s of base) if (chosen.length < (deliveryIncluded && !scooterish ? 2 : 3) && !chosen.includes(s)) chosen.push(s);
  const chips: Spec[] = resolveSpecs({ ...item, specs: chosen }, lang);
  if (deliveryIncluded && !scooterish) chips.push({ icon: Truck, label: deliveryIncluded });
  return chips.slice(0, 3);
}
