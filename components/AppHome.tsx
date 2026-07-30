"use client";

import { useState, useEffect, Fragment, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart, MapPin, ChevronDown, Bot, Bike, Car, BedDouble, TreePalm,
  Utensils, Umbrella, Footprints, Fish, Sailboat, Plane, CarTaxiFront, Mountain,
  ShoppingBag, PartyPopper, ArrowRight, Map as MapIcon, CalendarRange, BookOpen,
  Siren, Home, Compass, CalendarCheck, Menu,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFavorites } from "@/context/FavoritesContext";
import { loc } from "@/lib/localize";
import InstallAppButton from "@/components/InstallAppButton";
import { DEFAULT_QUICK_ACCESS, DEFAULT_HOME_CARDS } from "@/lib/defaults";
import type { QuickAccessItem, HomeCard } from "@/lib/defaults";

// Icon keys (admin-selectable) → lucide icons for the "What are you looking for?" tiles.
const LOOKING_ICON: Record<string, React.ElementType> = {
  restaurant: Utensils, beach: Umbrella, hiking: Footprints, fishing: Fish,
  boat: Sailboat, plane: Plane, taxi: CarTaxiFront, viewpoint: Mountain,
  store: ShoppingBag, event: PartyPopper, map: MapIcon, planner: CalendarRange,
  guide: BookOpen, scooter: Bike, car: Car, stay: BedDouble, compass: Compass,
};
// Icon keys for the six home cards.
const HOME_ICON: Record<string, React.ElementType> = {
  scooter: Bike, car: Car, stay: BedDouble, experience: TreePalm, tiroule: Bot,
  store: ShoppingBag, restaurant: Utensils, beach: Umbrella, compass: Compass,
};

type Tri = [string, string, string];
type Card = { id: string; name: string; image?: string; price?: string | null; href: string; tag?: string };
type CardImages = { scooter: string[]; car: string[]; stays: string[]; exp: string[]; stores: string[] };

// Colour tints for the six primary cards (icon badge + gradient fallback).
const TINT: Record<string, { icon: string; grad: string }> = {
  amber: { icon: "text-amber-300", grad: "bg-gradient-to-br from-amber-500/25 to-dark" },
  teal: { icon: "text-teal-200", grad: "bg-gradient-to-br from-teal-500/25 to-dark" },
  indigo: { icon: "text-indigo-200", grad: "bg-gradient-to-br from-indigo-500/30 to-dark" },
  rose: { icon: "text-rose-200", grad: "bg-gradient-to-br from-rose-500/30 to-dark" },
};

// Roulé Rodrigues 2.0 — app-style homepage (preview). Header → hero → six cards
// → "What are you looking for?" → Discover → Featured Experiences → Top Stays →
// Reviews → Footer, with a FIXED bottom (Travel Tools strip + app nav where
// Ti Roulé lives). Real content only. `hero`, `reviews`, `footer` are passed in.
export default function AppHome({
  hero, reviews, footer, lookingFor, homeCards, experiences, stays, discover, cardImages, mascot, logo,
}: {
  hero: ReactNode;
  reviews?: ReactNode;
  footer?: ReactNode;
  lookingFor?: QuickAccessItem[];
  homeCards?: HomeCard[];
  experiences: Card[];
  stays: Card[];
  discover: Card[];
  cardImages: CardImages;
  mascot?: string;
  logo?: string;
}) {
  const { language, setLanguage } = useLanguage();
  const { count } = useFavorites();
  const pathname = usePathname() || "/v2";
  const L = (t: Tri) => (language === "fr" ? t[1] : language === "cr" ? t[2] : t[0]);
  const cycle = () => setLanguage(language === "en" ? "fr" : language === "fr" ? "cr" : "en");
  const openSaved = () => window.dispatchEvent(new CustomEvent("rr:open-saved"));

  // The primary photo cards — admin-editable (content.homeCards). Each card's
  // auto-cycling photos come from its imageSource category (the owner's real
  // photos). Falls back to sensible defaults.
  const cardGallery: Record<string, string[]> = {
    scooter: cardImages.scooter, car: cardImages.car, stays: cardImages.stays,
    exp: cardImages.exp, stores: cardImages.stores, none: [],
  };
  const BIG = (homeCards && homeCards.length ? homeCards : DEFAULT_HOME_CARDS)
    .filter((c) => c.enabled !== false)
    .map((c) => ({
      key: c.id,
      icon: HOME_ICON[c.icon] ?? Compass,
      tint: (c.tint ?? "amber") as keyof typeof TINT,
      label: [c.label, c.labelFr ?? c.label, c.labelCr ?? c.label] as Tri,
      href: c.action === "tiroule" ? undefined : c.href,
      onClick: c.action === "tiroule" ? () => window.dispatchEvent(new CustomEvent("tiroule:open")) : undefined,
      images: cardGallery[c.imageSource] ?? [],
      popular: c.popular,
      centerImage: c.action === "tiroule" ? mascot : undefined,
    }));

  // "What are you looking for?" tiles — admin-editable (falls back to defaults).
  const lookItems = (lookingFor && lookingFor.length ? lookingFor : DEFAULT_QUICK_ACCESS).filter((x) => x.enabled !== false);

  // Travel Tools — utilities only (no duplicates of the tiles above; Emergency
  // opens its own page rather than a section on the home).
  const TOOLS: { icon: React.ElementType; label: Tri; href: string }[] = [
    { icon: MapIcon, label: ["Map", "Carte", "Kart"], href: "/map" },
    { icon: CalendarRange, label: ["Planner", "Planifier", "Plan"], href: "/trip-planner" },
    { icon: BookOpen, label: ["Guide", "Guide", "Gid"], href: "/guide/rodrigues" },
    { icon: Siren, label: ["Emergency", "Urgences", "Irzans"], href: "/emergency" },
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
          <Link href="/" className="mr-2 flex items-center" aria-label="Roule Rodrigues home">
            <span className="rr-logo-anim inline-flex">
              <span className="rr-logo-bob inline-flex">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="Roule Rodrigues" className="h-8 w-auto object-contain" />
                ) : (
                  <span className="flex items-baseline gap-1.5 font-syne font-extrabold leading-none">
                    <span className="text-lg text-offwhite">Roulé</span>
                    <span className="text-lg text-yellow">Rodrigues</span>
                  </span>
                )}
              </span>
            </span>
          </Link>
          <button className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 font-dm text-xs text-offwhite/90" aria-label="Rodrigues Island">
            <MapPin size={13} className="text-yellow" /> Rodrigues Island <ChevronDown size={13} className="text-muted" />
          </button>
          <InstallAppButton variant="icon" />
          <button onClick={cycle} aria-label="Change language" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 font-bebas text-[11px] tracking-widest text-muted transition-colors hover:text-yellow">
            {language.toUpperCase()}
          </button>
          <button onClick={openSaved} aria-label={`Saved (${count})`} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-yellow">
            <Heart size={17} className={count > 0 ? "fill-red-500 text-red-500" : ""} />
            {count > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow px-1 font-syne text-[10px] font-bold text-dark">{count}</span>}
          </button>
        </div>
      </header>

      {/* ── Hero (kept — passed in) ────────────────────────── */}
      {/* Keyed: hero/reviews/footer are server-component elements created in
          Home. Crossing the RSC boundary strips React's dev "validated" flag,
          so rendered bare among siblings the reconciler flags them as keyless
          list children ("a child from Home"). A stable key silences it. */}
      <Fragment key="hero">{hero}</Fragment>

      {/* pb clears the fixed bottom bar (tools strip + nav). */}
      <main className="mx-auto max-w-5xl px-4 pb-[128px]">
        {/* Six primary cards — v1 photo-card design, auto-cycling images. */}
        <section className="rr-home-cards-sec pt-3">
          <div className="rr-home-cards grid grid-cols-3 gap-2.5">
            {BIG.map((c) => (
              <AutoImageCard key={c.key} card={c} L={L} />
            ))}
          </div>
        </section>

        {/* What are you looking for? */}
        <section className="rr-home-tiles-sec mt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="font-syne text-base font-bold text-offwhite">{L(["What are you looking for?", "Que cherchez-vous ?", "Ki ou pe rode?"])}</h2>
            <Link href="/explore" className="inline-flex items-center gap-1 font-dm text-xs text-yellow hover:underline">{L(["See all", "Voir tout", "Get tou"])} <ArrowRight size={13} /></Link>
          </div>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {lookItems.map((c) => {
              const Icon = LOOKING_ICON[c.icon] ?? Compass;
              return (
                <Link key={c.id} href={c.href} className="group flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-yellow/40">
                  <Icon size={19} className="text-yellow" />
                  <span className="font-dm text-[10.5px] font-medium leading-tight text-offwhite/90">{loc(language, c.label, c.labelFr, c.labelCr)}</span>
                </Link>
              );
            })}
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

        {/* Reviews + Footer (from v1) — keyed for the same RSC-boundary reason
            as hero above (server elements from Home, rendered among siblings). */}
        <Fragment key="reviews">{reviews}</Fragment>
        <Fragment key="footer">{footer}</Fragment>
      </main>

      {/* ── Floating bottom: Travel Tools strip + app nav ─────
          Detached from the screen edge — a floating rounded panel with a small
          gap on the sides and below (respecting the safe area). */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/12 bg-dark/90 backdrop-blur-xl shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)]">
          <div className="rr-tools-row flex items-stretch gap-2 overflow-x-auto border-b border-white/10 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="flex shrink-0 items-center pr-1 font-bebas text-[9px] tracking-[0.2em] text-muted/60">{L(["TOOLS", "OUTILS", "ZOUTI"])}</span>
            {TOOLS.map((t) => (
              <Link key={t.href + t.label[0]} href={t.href} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 transition-colors hover:border-yellow/40">
                <t.icon size={14} className="text-yellow" />
                <span className="font-dm text-[11px] font-medium text-offwhite/90">{L(t.label)}</span>
              </Link>
            ))}
          </div>
          <nav aria-label="Primary" className="bg-dark/95">
            <div className="rr-nav-row flex items-center justify-around px-2 py-1.5">
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
      </div>
    </>
  );
}

// A v1-style photo card whose background auto-cycles through the real photos of
// that category's contents. Falls back to a tinted gradient (Ti Roulé / Offers).
function AutoImageCard({
  card, L,
}: {
  card: { key: string; icon: React.ElementType; tint: keyof typeof TINT; label: Tri; href?: string; onClick?: () => void; images: string[]; popular?: boolean; centerImage?: string };
  L: (t: Tri) => string;
}) {
  const [idx, setIdx] = useState(0);
  const imgs = card.images;
  useEffect(() => {
    if (imgs.length <= 1) return;
    const t = setInterval(() => setIdx((x) => (x + 1) % imgs.length), 3400);
    return () => clearInterval(t);
  }, [imgs.length]);
  const tint = TINT[card.tint] ?? TINT.amber;
  const body = (
    <>
      {imgs.length > 0 ? (
        imgs.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src + i} src={src} alt="" loading="lazy" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ${i === idx ? "opacity-100" : "opacity-0"}`} />
        ))
      ) : (
        <span className={`absolute inset-0 ${tint.grad}`} />
      )}
      {card.centerImage && imgs.length === 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.centerImage} alt="" loading="lazy" className="absolute inset-x-0 bottom-0 mx-auto h-[80%] w-auto object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <span className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-md ${tint.icon}`}>
        <card.icon size={16} />
      </span>
      {card.popular && (
        <span className="absolute right-2 top-2 rounded-full bg-yellow px-2 py-0.5 font-bebas text-[8px] tracking-[0.12em] text-dark">POPULAR</span>
      )}
      <span className="absolute inset-x-0 bottom-0 p-2.5">
        <span className="block font-syne text-[13px] font-bold leading-tight text-white drop-shadow">{L(card.label)}</span>
        <span className="mt-0.5 inline-flex items-center gap-1 font-dm text-[10px] font-semibold text-yellow">
          {L(["Explore", "Explorer", "Explor"])} <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </>
  );
  const cls = "group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 transition-all hover:-translate-y-0.5 hover:border-yellow/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50";
  return card.href ? (
    <Link href={card.href} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={card.onClick} className={`${cls} w-full text-left`}>{body}</button>
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
