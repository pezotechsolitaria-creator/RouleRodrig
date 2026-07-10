"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useEffect, useCallback } from "react";
import { motion, useMotionValue, useSpring, useMotionTemplate } from "framer-motion";
import {
  ArrowRight,
  Bike,
  Car,
  Utensils,
  Waves,
  BedDouble,
  PartyPopper,
  Navigation,
  Compass,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export interface BrowseCategory {
  slug: string;
  label: string;
  image?: string;
  emoji?: string;
  count: number;
  priceFrom?: string; // e.g. "From Rs 599/day" — shown on vehicle tiles
  popular?: boolean;  // most-booked category → "Popular" badge
}

// Pick a recognisable icon per category so the hub is scannable at a glance.
export function iconFor(slug: string, label: string): LucideIcon {
  const s = `${slug} ${label}`.toLowerCase();
  if (/scooter|moto|bike|moped|deux|two.?wheel/.test(s)) return Bike;
  if (/car|voiture|auto|4x4|suv|jeep/.test(s)) return Car;
  if (/restaurant|eat|food|resto|dine|manger/.test(s)) return Utensils;
  if (/activ|tour|dive|kayak|snorkel|excursion|aktivite/.test(s)) return Waves;
  if (/stay|hotel|room|lodge|guest|séjour|sejour/.test(s)) return BedDouble;
  if (/getting|taxi|transport|around|deplac/.test(s)) return Navigation;
  if (/event|what|whats|à l|a l|aktualite/.test(s)) return PartyPopper;
  return Compass;
}

/**
 * A single hub card with an award-site-style 3D tilt toward the cursor and a
 * soft spotlight that follows the mouse (desktop only — touch never fires the
 * move handlers, so it degrades gracefully).
 */
function HubCard({ c }: { c: BrowseCategory }) {
  const { t } = useLanguage();
  const Icon = iconFor(c.slug, c.label);
  const ref = useRef<HTMLAnchorElement>(null);
  const [hover, setHover] = useState(false);

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 170, damping: 18 });
  const sry = useSpring(ry, { stiffness: 170, damping: 18 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const spotlight = useMotionTemplate`radial-gradient(340px circle at ${gx}% ${gy}%, rgba(255,255,255,0.16), transparent 55%)`;

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 9);
    rx.set(-(py - 0.5) * 9);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    setHover(false);
  };

  // Gyroscope tilt on touch devices — the cards lean with the phone (the wow
  // works without a mouse). Android fires this freely; iOS 13+ needs a
  // permission gesture, so it simply stays flat there (no crash).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const clamp = (n: number) => Math.max(-7, Math.min(7, n));
    const onOrient = (e: DeviceOrientationEvent) => {
      ry.set(clamp((e.gamma ?? 0) / 6));
      rx.set(clamp(((e.beta ?? 0) - 45) / 6));
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [rx, ry]);

  return (
    <Link
      ref={ref}
      href={`/browse/${c.slug}`}
      onMouseEnter={() => setHover(true)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="group block [perspective:1100px]"
    >
      <motion.div
        style={{ rotateX: srx, rotateY: sry, transformStyle: "preserve-3d" }}
        className="relative h-[430px] rounded-[28px] overflow-hidden bg-dark-card ring-1 ring-white/10 group-hover:ring-yellow/50 transition-[box-shadow,border-color] duration-300 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.8)] group-hover:shadow-[0_28px_70px_-18px_rgba(0,0,0,0.95)]"
      >
        {c.image ? (
          <Image
            src={c.image}
            alt={c.label}
            fill
            className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.08]"
            sizes="(max-width: 640px) 80vw, 320px"
            unoptimized={c.image.startsWith("/uploads/") || (c.image.startsWith("http") && !c.image.includes("supabase.co"))}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1c1c18] to-dark-card flex items-center justify-center text-7xl">
            {c.emoji ?? "📍"}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/40 via-transparent to-transparent" />

        {/* Cursor spotlight (desktop) */}
        <motion.div
          className="pointer-events-none absolute inset-0 mix-blend-soft-light transition-opacity duration-300"
          style={{ background: spotlight, opacity: hover ? 1 : 0 }}
          aria-hidden="true"
        />

        {/* Category icon — glass badge */}
        <div className="absolute top-5 left-5 w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white shadow-lg" style={{ transform: "translateZ(40px)" }}>
          <Icon size={22} />
        </div>

        {/* Popular badge */}
        {c.popular && (
          <div className="absolute top-6 right-5 inline-flex items-center gap-1.5 bg-yellow text-dark font-bebas text-[11px] tracking-[0.15em] px-3 py-1.5 rounded-full shadow-lg" style={{ transform: "translateZ(40px)" }}>
            <Flame size={12} className="fill-dark" /> {t.explore.popular}
          </div>
        )}

        {/* Content */}
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-7" style={{ transform: "translateZ(30px)" }}>
          <p className="font-bebas text-[11px] tracking-[0.28em] mb-2">
            {c.priceFrom ? (
              <>
                <span className="text-yellow">{c.priceFrom}</span>{" "}
                <span className="text-white/45">· {c.count} {c.count === 1 ? t.explore.option : t.explore.options}</span>
              </>
            ) : (
              <span className="text-white/60">{c.count} {c.count === 1 ? t.explore.option : t.explore.options}</span>
            )}
          </p>
          <h3 className="font-syne font-extrabold text-offwhite uppercase leading-[0.95] mb-4" style={{ fontSize: "clamp(28px, 5.5vw, 40px)" }}>
            {c.label}
          </h3>
          <span className="inline-flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full transition-all group-hover:pl-6">
            {t.explore.cta}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </motion.div>
    </Link>
  );
}

/**
 * "What are you looking for?" — the homepage's main entry point. A premium,
 * swipeable carousel of category cards with 3D tilt + spotlight micro-
 * interactions, glass icons, price transparency and dot indicators (no arrows).
 */
export default function WhatLookingFor({ categories }: { categories: BrowseCategory[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { t } = useLanguage();

  const cardStep = useCallback(() => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>("[data-card]");
    return card ? card.getBoundingClientRect().width + 20 : el?.clientWidth ?? 1;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => setActive(Math.round(el.scrollLeft / cardStep()));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [cardStep, categories.length]);

  if (!categories.length) return null;

  const goTo = (i: number) => scroller.current?.scrollTo({ left: i * cardStep(), behavior: "smooth" });

  return (
    <section id="explore" className="relative bg-dark py-20 md:py-28 scroll-mt-24 overflow-hidden" aria-label="What are you looking for">
      {/* Ambient glow for depth */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute -top-24 right-[-10%] w-[55vw] h-[55vw] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(245,200,66,0.08), transparent 65%)" }}
        />
        <div
          className="absolute bottom-[-20%] left-[-10%] w-[45vw] h-[45vw] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.05), transparent 65%)" }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />
            <span className="font-bebas text-yellow text-[11px] tracking-[0.3em]">{t.explore.eyebrow}</span>
          </div>
          <h2
            className="font-syne font-extrabold text-offwhite leading-[0.92] tracking-tight"
            style={{ fontSize: "clamp(34px, 7vw, 72px)" }}
          >
            {t.explore.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-xl">{t.explore.subtitle}</p>
        </motion.div>
      </div>

      {/* Full-bleed scroller, padded to align with the container */}
      <div
        ref={scroller}
        className="relative flex gap-5 overflow-x-auto pb-2 px-6 lg:px-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((c, i) => (
          <motion.div
            key={c.slug}
            data-card
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3) }}
            className="snap-center shrink-0 w-[80vw] max-w-[360px] sm:w-[320px]"
          >
            <HubCard c={c} />
          </motion.div>
        ))}
        {/* trailing spacer so the last card can snap centre on wide screens */}
        <div className="shrink-0 w-px" aria-hidden="true" />
      </div>

      {categories.length > 1 && (
        <div className="relative flex justify-center gap-2 mt-7">
          {categories.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? "bg-yellow w-8" : "bg-white/15 w-2.5 hover:bg-white/30"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
