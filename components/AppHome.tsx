"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart, MapPin, ChevronDown, User, Bike, Car, BedDouble, TreePalm, Bot, Gift,
  Utensils, Umbrella, Footprints, Fish, Sailboat, Plane, CarTaxiFront, Mountain,
  ShoppingBag, PartyPopper, ArrowRight, Map as MapIcon, CalendarRange, BookOpen,
  Siren, Home, Compass, CalendarCheck, Menu,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFavorites } from "@/context/FavoritesContext";
import type { BrowseCategory } from "@/components/WhatLookingFor";

type Tri = [string, string, string];
type Card = { id: string; name: string; image?: string; price?: string | null; href: string; tag?: string };

const TINT: Record<string, { icon: string; badge: string }> = {
  amber: { icon: "text-amber-400", badge: "bg-amber-400/12 ring-amber-400/25" },
  teal: { icon: "text-teal-300", badge: "bg-teal-400/12 ring-teal-400/25" },
  indigo: { icon: "text-indigo-300", badge: "bg-indigo-400/12 ring-indigo-400/25" },
  rose: { icon: "text-rose-300", badge: "bg-rose-400/12 ring-rose-400/25" },
};

// Roulé Rodrigues 2.0 — app-style homepage (preview). Header → hero → six cards
// → "What are you looking for?" → Discover → Featured Experiences → Top Stays →
// Reviews → Footer, with a FIXED bottom (Travel Tools strip + app nav where
// Ti Roulé lives). Real content only. `hero`, `reviews`, `footer` are passed in.
export default function AppHome({
  hero, reviews, footer, cats, experiences, stays, discover, mascot, logo,
}: {
  hero: ReactNode;
  reviews?: ReactNode;
  footer?: ReactNode;
  cats: BrowseCategory[];
  experiences: Card[];
  stays: Card[];
  discover: Card[];
  mascot?: string;
  logo?: string;
}) {
  const { language, setLanguage } = useLanguage();
  const { count } = useFavorites();
  const pathname = usePathname() || "/v2";
  const L = (t: Tri) => (language === "fr" ? t[1] : language === "cr" ? t[2] : t[0]);
  const cycle = () => setLanguage(language === "en" ? "fr" : language === "fr" ? "cr" : "en");
  const countFor = (slug: string) => cats.find((c) => c.slug === slug)?.count ?? 0;
  const openTiRoule = () => window.dispatchEvent(new CustomEvent("tiroule:open"));
  const openSaved = () => window.dispatchEvent(new CustomEvent("rr:open-saved"));

  const BIG: { key: string; icon: React.ElementType; tint: keyof typeof TINT; label: Tri; sub: Tri; href?: string; onClick?: () => void; countSlug?: string }[] = [
    { key: "scooter", icon: Bike, tint: "amber", label: ["Scooters", "Scooters", "Skooter"], sub: ["Rent a scooter", "Louer un scooter", "Loue enn skooter"], href: "/browse/scooter", countSlug: "scooter" },
    { key: "car", icon: Car, tint: "amber", label: ["Cars", "Voitures", "Loto"], sub: ["Rent a car", "Louer une voiture", "Loue enn loto"], href: "/browse/car", countSlug: "car" },
    { key: "stay", icon: BedDouble, tint: "amber", label: ["Stays", "Séjours", "Lozman"], sub: ["Hotels & villas", "Hôtels & villas", "Lotel & vila"], href: "/browse/stays", countSlug: "stays" },
    { key: "exp", icon: TreePalm, tint: "teal", label: ["Experiences", "Expériences", "Eksperyans"], sub: ["Tours & activities", "Tours & activités", "Tour & aktivite"], href: "/explore" },
    { key: "tiroule", icon: Bot, tint: "indigo", label: ["Ask Ti Roulé", "Demander Ti Roulé", "Demann Ti Roulé"], sub: ["AI travel assistant", "Assistant IA voyage", "Asistan IA vwayaz"], onClick: () => window.dispatchEvent(new CustomEvent("tiroule:open")) },
    { key: "offers", icon: Gift, tint: "rose", label: ["Special Offers", "Offres spéciales", "Bann Ofer"], sub: ["Deals & discounts", "Bons plans & remises", "Bann bon deal"], href: "/explore" },
  ];

  const LOOKING: { icon: React.ElementType; label: Tri; href: string }[] = [
    { icon: Utensils, label: ["Restaurants", "Restaurants", "Restoran"], href: "/food" },
    { icon: Umbrella, label: ["Beaches", "Plages", "Laplaz"], href: "/guide/beaches" },
    { icon: Footprints, label: ["Hiking", "Randonnée", "Rando"], href: "/guide/routes" },
    { icon: Fish, label: ["Fishing", "Pêche", "Lapes"], href: "/browse/tours" },
    { icon: Sailboat, label: ["Boat Trips", "Sorties mer", "Sorti lamer"], href: "/browse/tours" },
    { icon: Plane, label: ["Airport Transfer", "Transfert", "Transfer"], href: "/taxi" },
    { icon: CarTaxiFront, label: ["Taxi", "Taxi", "Taksi"], href: "/taxi" },
    { icon: Mountain, label: ["Viewpoints", "Points de vue", "Vue"], href: "/guide/viewpoints" },
    { icon: ShoppingBag, label: ["Local Store", "Boutiques", "Laboutik"], href: "/guide/shops" },
    { icon: PartyPopper, label: ["What's on", "Événements", "Levennman"], href: "/browse/events" },
  ];

  const TOOLS: { icon: React.ElementType; label: Tri; href: string }[] = [
    { icon: MapIcon, label: ["Map", "Carte", "Kart"], href: "/map" },
    { icon: CalendarRange, label: ["Planner", "Planifier", "Plan"], href: "/trip-planner" },
    { icon: BookOpen, label: ["Guide", "Guide", "Gid"], href: "/guide/rodrigues" },
    { icon: Siren, label: ["Emergency", "Urgences", "Irzans"], href: "/#useful" },
    { icon: Utensils, label: ["Food", "Manger", "Manze"], href: "/food" },
  ];

  const NAV: { key: string; icon: React.ElementType; label: Tri; href?: string; onClick?: () => void }[] = [
    { key: "home", icon: Home, label: ["Home", "Accueil", "Lakaz"], href: "/" },
    { key: "explore", icon: Compass, label: ["Explore", "Explorer", "Explor"], href: "/explore" },
    { key: "tiroule", icon: Bot, label: ["Ti Roulé", "Ti Roulé", "Ti Roulé"], onClick: () => window.dispatchEvent(new CustomEvent("tiroule:open")) },
    { key: "bookings", icon: CalendarCheck, label: ["Bookings", "Réserv.", "Rezerv."], href: "/manage-booking" },
    { key: "more", icon: Menu, label: ["More", "Plus", "Plis"], href: "/more" },
  ];

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-dark/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <Link href="/" className="mr-2 flex items-center gap-2" aria-label="Roule Rodrigues home">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Roule Rodrigues" className="h-8 w-auto object-contain" />
            ) : (
              <span className="flex items-baseline gap-1.5 font-syne font-extrabold leading-none">
                <span className="text-lg text-offwhite">Roulé</span>
                <span className="text-lg text-yellow">Rodrigues</span>
              </span>
            )}
          </Link>
          <button className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 font-dm text-xs text-offwhite/90" aria-label="Rodrigues Island">
            <MapPin size={13} className="text-yellow" /> Rodrigues Island <ChevronDown size={13} className="text-muted" />
          </button>
          <button onClick={cycle} aria-label="Change language" className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 font-bebas text-[11px] tracking-widest text-muted transition-colors hover:text-yellow sm:flex">
            {language.toUpperCase()}
          </button>
          <button onClick={openSaved} aria-label={`Saved (${count})`} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-yellow">
            <Heart size={17} className={count > 0 ? "fill-red-500 text-red-500" : ""} />
            {count > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow px-1 font-syne text-[10px] font-bold text-dark">{count}</span>}
          </button>
          <Link href="/manage-booking" aria-label="Your trips" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-yellow">
            <User size={17} />
          </Link>
        </div>
      </header>

      {/* ── Hero (kept — passed in) ────────────────────────── */}
      {hero}

      {/* pb clears the fixed bottom bar (tools strip + nav). */}
      <main className="mx-auto max-w-5xl px-4 pb-[150px]">
        {/* Six primary cards */}
        <section className="pt-4">
          <div className="grid grid-cols-3 gap-2.5">
            {BIG.map((a) => {
              const n = a.countSlug ? countFor(a.countSlug) : 0;
              const tint = TINT[a.tint];
              const inner = (
                <>
                  {n > 0 && <span className="absolute right-2.5 top-2.5 rounded-full bg-white/[0.06] px-1.5 py-0.5 font-syne text-[9px] font-bold text-offwhite/80">{n}</span>}
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-inset transition-transform group-hover:scale-105 ${tint.badge} ${tint.icon}`}>
                    <a.icon size={22} />
                  </span>
                  <span className="mt-2 block font-syne text-[14px] font-bold leading-tight text-offwhite">{L(a.label)}</span>
                  <span className="mt-0.5 block font-dm text-[10.5px] leading-tight text-muted">{L(a.sub)}</span>
                </>
              );
              const cls = "group relative flex min-h-[118px] flex-col rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-3 transition-all hover:-translate-y-0.5 hover:border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50";
              return a.href ? <Link key={a.key} href={a.href} className={cls}>{inner}</Link> : <button key={a.key} type="button" onClick={a.onClick} className={`${cls} text-left`}>{inner}</button>;
            })}
          </div>
        </section>

        {/* What are you looking for? */}
        <section className="mt-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="font-syne text-base font-bold text-offwhite">{L(["What are you looking for?", "Que cherchez-vous ?", "Ki ou pe rode?"])}</h2>
            <Link href="/explore" className="inline-flex items-center gap-1 font-dm text-xs text-yellow hover:underline">{L(["See all", "Voir tout", "Get tou"])} <ArrowRight size={13} /></Link>
          </div>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {LOOKING.map((c) => (
              <Link key={c.href + c.label[0]} href={c.href} className="group flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-yellow/40">
                <c.icon size={19} className="text-yellow" />
                <span className="font-dm text-[10.5px] font-medium leading-tight text-offwhite/90">{L(c.label)}</span>
              </Link>
            ))}
          </div>
        </section>

        {discover.length > 0 && (
          <Rail title={L(["Discover Rodrigues", "Découvrir Rodrigues", "Dekouver Rodrig"])} subtitle={L(["Beaches, culture & hidden gems.", "Plages, culture & trésors cachés.", "Laplaz, kiltir & bann trezor kase."])} seeAll="/explore" seeAllLabel={L(["View all", "Voir tout", "Get tou"])}>
            {discover.map((d) => (
              <Link key={d.id} href={d.href} className="group relative flex h-36 w-36 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl border border-white/10">
                {d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image} alt={d.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                ) : <span className="absolute inset-0 bg-gradient-to-br from-yellow/20 to-dark" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <span className="relative p-2.5 font-syne text-sm font-bold leading-tight text-white">{d.name}</span>
              </Link>
            ))}
          </Rail>
        )}

        {experiences.length > 0 && (
          <Rail title={L(["Featured Experiences", "Expériences à la une", "Bann eksperyans"])} subtitle={L(["Handpicked activities you'll love.", "Des activités triées sur le volet.", "Bann aktivite swazir pou ou."])} seeAll="/browse/tours" seeAllLabel={L(["View all", "Voir tout", "Get tou"])}>
            {experiences.map((e) => <PriceCard key={e.id} card={e} />)}
          </Rail>
        )}

        {stays.length > 0 && (
          <Rail title={L(["Top Stays", "Où dormir", "Kot reste"])} subtitle={L(["Handpicked places to stay.", "Des hébergements triés pour vous.", "Bann lozman swazir pou ou."])} seeAll="/browse/stays" seeAllLabel={L(["View all", "Voir tout", "Get tou"])}>
            {stays.map((s) => <PriceCard key={s.id} card={s} />)}
          </Rail>
        )}

        {/* Reviews + Footer (from v1) */}
        {reviews}
        {footer}
      </main>

      {/* ── Fixed bottom: Travel Tools strip + app nav ─────── */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="border-t border-white/10 bg-dark/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-stretch gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="flex shrink-0 items-center pr-1 font-bebas text-[9px] tracking-[0.2em] text-muted/60">{L(["TOOLS", "OUTILS", "ZOUTI"])}</span>
            {TOOLS.map((t) => (
              <Link key={t.href + t.label[0]} href={t.href} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 transition-colors hover:border-yellow/40">
                <t.icon size={14} className="text-yellow" />
                <span className="font-dm text-[11px] font-medium text-offwhite/90">{L(t.label)}</span>
              </Link>
            ))}
          </div>
        </div>
        <nav aria-label="Primary" className="border-t border-white/10 bg-dark/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-5xl items-center justify-around px-2 py-1.5">
            {NAV.map((it) => {
              const active = it.href ? (it.href === "/" ? false : pathname.startsWith(it.href)) : false;
              const isTi = it.key === "tiroule";
              const inner = (
                <>
                  <it.icon size={isTi ? 22 : 20} className={isTi ? "text-dark" : active ? "text-yellow" : ""} />
                  <span className={`font-dm text-[10px] font-medium leading-none ${isTi ? "text-dark" : active ? "text-yellow" : "text-muted"}`}>{L(it.label)}</span>
                </>
              );
              const base = "flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors";
              const tiCls = "flex min-w-[56px] flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-yellow to-yellow-dark px-2 py-1.5 shadow-[0_6px_18px_-4px_rgba(245,200,66,0.55)]";
              return it.href ? (
                <Link key={it.key} href={it.href} aria-current={active ? "page" : undefined} className={`${base} ${active ? "text-yellow" : "text-muted hover:text-offwhite"}`}>{inner}</Link>
              ) : (
                <button key={it.key} type="button" onClick={it.onClick} aria-label="Ti Roulé" className={isTi ? tiCls : base}>{inner}</button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}

function Rail({ title, subtitle, seeAll, seeAllLabel, children }: { title: string; subtitle: string; seeAll: string; seeAllLabel: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-syne text-base font-bold text-offwhite">{title}</h2>
          <p className="font-dm text-xs text-muted">{subtitle}</p>
        </div>
        <Link href={seeAll} className="inline-flex shrink-0 items-center gap-1 font-dm text-xs text-yellow hover:underline">{seeAllLabel} <ArrowRight size={13} /></Link>
      </div>
      <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

function PriceCard({ card }: { card: Card }) {
  return (
    <Link href={card.href} className="group flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all hover:-translate-y-0.5 hover:border-yellow/40">
      <div className="relative h-24 w-full overflow-hidden">
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image} alt={card.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : <span className="block h-full w-full bg-gradient-to-br from-yellow/20 to-dark" />}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-2 font-syne text-[13px] font-bold leading-tight text-offwhite">{card.name}</h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          {card.price && <span className="font-syne text-xs font-bold text-yellow">{card.price}</span>}
          <ArrowRight size={14} className="ml-auto text-muted/50 transition-all group-hover:translate-x-0.5 group-hover:text-yellow" />
        </div>
      </div>
    </Link>
  );
}
