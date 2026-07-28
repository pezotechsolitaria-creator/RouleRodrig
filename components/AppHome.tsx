"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search, Heart, Menu, MapPin, Bike, Car, BedDouble, Compass, CarTaxiFront,
  Ship, Utensils, Store, Bot, Waves, Mountain, Route as RouteIcon, Map as MapIcon,
  CalendarRange, BookOpen, PartyPopper, Sparkles, ArrowRight, ShieldCheck, Star,
  Languages,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFavorites } from "@/context/FavoritesContext";
import type { BrowseCategory } from "@/components/WhatLookingFor";

type Tri = [string, string, string];

// Roulé Rodrigues 2.0 — app-style homepage (preview). A travel-app dashboard:
// compact header, one universal search, a quick-action hub, an explore grid and
// a light discover + trust strip. Real destinations only; pure CSS transitions
// (no runtime animation lib) so it stays fast.
export default function AppHome({ cats }: { cats: BrowseCategory[] }) {
  const { language, setLanguage } = useLanguage();
  const { count } = useFavorites();
  const router = useRouter();
  const cycle = () => setLanguage(language === "en" ? "fr" : language === "fr" ? "cr" : "en");
  const [q, setQ] = useState("");

  const L = (t: Tri) => (language === "fr" ? t[1] : language === "cr" ? t[2] : t[0]);
  const countFor = (slug: string) => cats.find((c) => c.slug === slug)?.count ?? 0;
  const openSaved = () => window.dispatchEvent(new CustomEvent("rr:open-saved"));
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/explore");
  };

  const ACTIONS: { key: string; icon: React.ElementType; label: Tri; sub: Tri; href?: string; onClick?: () => void; hot?: boolean; countSlug?: string }[] = [
    { key: "scooter", icon: Bike, label: ["Rent Scooter", "Louer scooter", "Loue skooter"], sub: ["From Rs 599/day", "Dès Rs 599/j", "Depi Rs 599"], href: "/browse/scooter", hot: true, countSlug: "scooter" },
    { key: "car", icon: Car, label: ["Rent Car", "Louer voiture", "Loue loto"], sub: ["Explore in comfort", "Tout confort", "Konfor"], href: "/browse/car", countSlug: "car" },
    { key: "stay", icon: BedDouble, label: ["Book Stay", "Hébergement", "Lozman"], sub: ["Hotels & guesthouses", "Hôtels & pensions", "Lotel & pansion"], href: "/browse/stays", countSlug: "stays" },
    { key: "exp", icon: Compass, label: ["Experiences", "Expériences", "Eksperyans"], sub: ["Tours & activities", "Excursions & activités", "Tour & aktivite"], href: "/explore", countSlug: "activities" },
    { key: "taxi", icon: CarTaxiFront, label: ["Taxi & Transfer", "Taxi & transfert", "Taksi"], sub: ["Airport & island", "Aéroport & île", "Erport & lil"], href: "/taxi" },
    { key: "boat", icon: Ship, label: ["Boat Trips", "Sorties en mer", "Sorti lamer"], sub: ["Île aux Cocos & more", "Île aux Cocos…", "Île aux Cocos…"], href: "/browse/tours", countSlug: "tours" },
    { key: "food", icon: Utensils, label: ["Restaurants", "Restaurants", "Restoran"], sub: ["Free table concierge", "Concierge gratuit", "Konsyerj gratis"], href: "/food" },
    { key: "store", icon: Store, label: ["Local Store", "Boutiques", "Laboutik"], sub: ["Island-made goods", "Produits locaux", "Prodwi lokal"], href: "/guide/shops" },
    { key: "tiroule", icon: Bot, label: ["Ask Ti Roulé", "Demander Ti Roulé", "Demann Ti Roulé"], sub: ["Your AI island guide", "Votre guide IA", "Ou gid IA"], onClick: () => window.dispatchEvent(new CustomEvent("tiroule:open")) },
  ];

  const CATS: { icon: React.ElementType; label: Tri; href: string; slug?: string }[] = [
    { icon: Waves, label: ["Beaches", "Plages", "Laplaz"], href: "/guide/beaches" },
    { icon: Mountain, label: ["Viewpoints", "Points de vue", "Vue"], href: "/guide/viewpoints" },
    { icon: RouteIcon, label: ["Routes & hikes", "Routes & rando", "Rout"], href: "/guide/routes" },
    { icon: Sparkles, label: ["Guided tours", "Excursions", "Tour"], href: "/browse/tours" },
    { icon: MapIcon, label: ["Island map", "Carte", "Kart"], href: "/map" },
    { icon: CalendarRange, label: ["Trip planner", "Planifier", "Plan"], href: "/trip-planner" },
    { icon: BookOpen, label: ["Island guide", "Guide", "Gid"], href: "/guide/rodrigues" },
    { icon: PartyPopper, label: ["What's on", "Événements", "Levennman"], href: "/browse/events" },
  ];

  const TRENDING: { label: Tri; href: string }[] = [
    { label: ["Beaches", "Plages", "Laplaz"], href: "/guide/beaches" },
    { label: ["Île aux Cocos", "Île aux Cocos", "Île aux Cocos"], href: "/browse/tours" },
    { label: ["Scooters", "Scooters", "Skooter"], href: "/browse/scooter" },
    { label: ["Trip planner", "Planifier", "Plan"], href: "/trip-planner" },
  ];

  const TRUST: { icon: React.ElementType; label: Tri }[] = [
    { icon: Star, label: ["5.0 · verified reviews", "5.0 · avis vérifiés", "5.0 · lavi verifye"] },
    { icon: ShieldCheck, label: ["Secure card payment", "Paiement sécurisé", "Peyman sekirize"] },
    { icon: MapPin, label: ["Booked direct with locals", "Réservé chez l'habitant", "Rezerve ar bann lokal"] },
    { icon: Languages, label: ["English · Français · Kreol", "English · Français · Kreol", "English · Français · Kreol"] },
  ];

  return (
    <>
      {/* ── Compact app header ─────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-dark/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="mr-auto flex items-baseline gap-1.5 font-syne font-extrabold leading-none">
            <span className="text-lg text-offwhite">Roulé</span>
            <span className="text-lg text-yellow">Rodrigues</span>
          </Link>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-dm text-xs text-muted sm:inline-flex">
            <MapPin size={13} className="text-yellow" /> Rodrigues Island
          </span>
          <button onClick={cycle} aria-label="Change language" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-yellow">
            <Languages size={17} />
          </button>
          <button onClick={openSaved} aria-label={`Saved (${count})`} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-yellow">
            <Heart size={17} className={count > 0 ? "fill-red-500 text-red-500" : ""} />
            {count > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow px-1 font-syne text-[10px] font-bold text-dark">{count}</span>}
          </button>
          <Link href="/more" aria-label="Menu" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-yellow">
            <Menu size={17} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6">
        {/* ── Greeting + universal search ──────────────────── */}
        <section>
          <p className="font-bebas text-[11px] tracking-[0.35em] text-yellow/90">{L(["BONZOUR 👋 WELCOME TO RODRIGUES", "BONZOUR 👋 BIENVENUE À RODRIGUES", "BONZOUR 👋 BYENVENI RODRIG"])}</p>
          <h1 className="mt-2 max-w-xl font-syne text-[28px] font-extrabold leading-[1.05] text-offwhite md:text-4xl">
            {L(["Plan, book & explore your whole trip.", "Planifiez, réservez & explorez tout votre séjour.", "Planifye, rezerv & explor tou ou vwayaz."])}
          </h1>

          <form onSubmit={submitSearch} className="mt-4 flex items-center gap-2.5 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3.5 transition-colors focus-within:border-yellow/60">
            <Search size={18} className="shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={L(["Search scooters, beaches, tours, hotels…", "Rechercher scooters, plages, tours…", "Rod skooter, laplaz, tour…"])}
              className="w-full bg-transparent font-dm text-sm text-offwhite placeholder:text-muted/60 focus:outline-none"
              aria-label="Search Rodrigues"
            />
            <button type="submit" className="shrink-0 rounded-xl bg-yellow px-3.5 py-1.5 font-syne text-xs font-bold text-dark transition-transform hover:scale-105">{L(["Go", "OK", "Ale"])}</button>
          </form>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="font-dm text-[11px] text-muted/70">{L(["Trending:", "Tendances :", "Popiler :"])}</span>
            {TRENDING.map((t) => (
              <Link key={t.href + t.label[0]} href={t.href} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-dm text-[11px] text-muted transition-colors hover:border-yellow/40 hover:text-yellow">
                {L(t.label)}
              </Link>
            ))}
          </div>
        </section>

        {/* ── Quick actions hub ────────────────────────────── */}
        <section className="mt-8">
          <h2 className="mb-3 font-syne text-lg font-bold text-offwhite">{L(["Quick actions", "Accès rapide", "Aksyon rapid"])}</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {ACTIONS.map((a) => {
              const n = a.countSlug ? countFor(a.countSlug) : 0;
              const inner = (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow/12 text-yellow ring-1 ring-inset ring-yellow/20 transition-transform group-hover:scale-105">
                    <a.icon size={20} />
                  </span>
                  {n > 0 && <span className="absolute right-3 top-3 rounded-full bg-white/[0.06] px-1.5 py-0.5 font-syne text-[10px] font-bold text-yellow">{n}</span>}
                  <span className="mt-auto block">
                    <span className="flex items-center gap-1.5">
                      <span className="font-syne text-[13px] font-bold leading-tight text-offwhite">{L(a.label)}</span>
                      {a.hot && <span className="rounded-full bg-yellow/15 px-1.5 py-0.5 font-bebas text-[8px] tracking-[0.15em] text-yellow">POPULAR</span>}
                    </span>
                    <span className="mt-0.5 block font-dm text-[11px] leading-snug text-muted">{L(a.sub)}</span>
                  </span>
                </>
              );
              const cls = "group relative flex min-h-[124px] flex-col gap-2 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-yellow/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50";
              return a.href ? (
                <Link key={a.key} href={a.href} className={cls}>{inner}</Link>
              ) : (
                <button key={a.key} type="button" onClick={a.onClick} className={cls}>{inner}</button>
              );
            })}
          </div>
        </section>

        {/* ── Explore by category ──────────────────────────── */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-syne text-lg font-bold text-offwhite">{L(["Explore Rodrigues", "Explorer Rodrigues", "Explor Rodrig"])}</h2>
            <Link href="/explore" className="inline-flex items-center gap-1 font-dm text-xs text-yellow hover:underline">{L(["See all", "Voir tout", "Get tou"])} <ArrowRight size={13} /></Link>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {CATS.map((c) => (
              <Link key={c.href} href={c.href} className="group flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center transition-all hover:-translate-y-0.5 hover:border-yellow/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/15 transition-transform group-hover:scale-105">
                  <c.icon size={18} />
                </span>
                <span className="font-dm text-[11px] font-medium leading-tight text-offwhite/90">{L(c.label)}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Discover teaser ──────────────────────────────── */}
        <section className="mt-8">
          <h2 className="mb-3 font-syne text-lg font-bold text-offwhite">{L(["Discover the island", "Découvrir l'île", "Dekouver lil"])}</h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Link href="/explore" className="group relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0e6b68] to-[#07201f] p-4 transition-transform hover:-translate-y-0.5">
              <span className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{L(["TOP ATTRACTIONS", "À NE PAS MANQUER", "TOP ATRAKSION"])}</span>
              <span className="font-syne text-lg font-extrabold text-white">{L(["Must-see places", "Lieux incontournables", "Bann pli zoli plas"])}</span>
              <span className="mt-1 inline-flex items-center gap-1 font-dm text-xs font-semibold text-yellow">{L(["Open the map", "Voir la carte", "Get lakart"])} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
            <Link href="/trip-planner" className="group relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#6a5230] to-[#171208] p-4 transition-transform hover:-translate-y-0.5">
              <span className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{L(["PLAN SMART", "PLANIFIER", "PLANIFYE"])}</span>
              <span className="font-syne text-lg font-extrabold text-white">{L(["Build a day-by-day trip", "Créez un itinéraire", "Fer ou program"])}</span>
              <span className="mt-1 inline-flex items-center gap-1 font-dm text-xs font-semibold text-yellow">{L(["Trip planner", "Planificateur", "Planifikater"])} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          </div>
        </section>

        {/* ── Trust strip ──────────────────────────────────── */}
        <section className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {TRUST.map((t) => (
            <div key={t.label[0]} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
              <t.icon size={15} className="shrink-0 text-yellow" />
              <span className="font-dm text-[11px] leading-tight text-muted">{L(t.label)}</span>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
