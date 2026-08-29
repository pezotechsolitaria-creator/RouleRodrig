"use client";

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  Fragment,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Heart,
  MapPin,
  ChevronDown,
  Bot,
  Bike,
  Car,
  BedDouble,
  TreePalm,
  Utensils,
  Umbrella,
  Footprints,
  Fish,
  Sailboat,
  Plane,
  CarTaxiFront,
  Mountain,
  ShoppingBag,
  PartyPopper,
  ArrowRight,
  Map as MapIcon,
  CalendarRange,
  BookOpen,
  Siren,
  Compass,
  Truck,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFavorites } from "@/context/FavoritesContext";
import { loc } from "@/lib/localize";
import { NAV_TABS, isTabActive, tabLabel, openTiRoule } from "@/lib/nav-tabs";
import InstallAppButton from "@/components/InstallAppButton";
import AccountButton from "@/components/AccountButton";
import WorldSwitcher from "@/components/world/WorldSwitcher";
import { useActiveWorld } from "@/context/ExperienceWorldContext";
import { forWorld } from "@/lib/worlds";
import EventsPromo, { type PromoEvent } from "@/components/EventsPromo";
import CuratedTeaser from "@/components/CuratedTeaser";
import { HeartHandshake } from "lucide-react";
import { DEFAULT_QUICK_ACCESS, DEFAULT_HOME_CARDS } from "@/lib/defaults";
import type { QuickAccessItem, HomeCard } from "@/lib/defaults";

// Icon keys (admin-selectable) → lucide icons for the "What are you looking for?" tiles.
const LOOKING_ICON: Record<string, React.ElementType> = {
  restaurant: Utensils,
  beach: Umbrella,
  hiking: Footprints,
  fishing: Fish,
  boat: Sailboat,
  plane: Plane,
  taxi: CarTaxiFront,
  viewpoint: Mountain,
  store: ShoppingBag,
  event: PartyPopper,
  map: MapIcon,
  planner: CalendarRange,
  guide: BookOpen,
  scooter: Bike,
  car: Car,
  stay: BedDouble,
  compass: Compass,
  // Added with the massage vertical. Without it the tile silently fell through
  // to the Compass fallback — the same icon as three of its neighbours.
  massage: HeartHandshake,
  // Deliver Anything. Truck rather than a box: the tile is about the ERRAND
  // being run, not the parcel — and a box would read as "track my order",
  // which is a different tab.
  delivery: Truck,
};
// Icon keys for the six home cards.
const HOME_ICON: Record<string, React.ElementType> = {
  scooter: Bike,
  car: Car,
  stay: BedDouble,
  experience: TreePalm,
  tiroule: Bot,
  store: ShoppingBag,
  restaurant: Utensils,
  beach: Umbrella,
  compass: Compass,
  // `event` was missing while the admin icon picker already offered it, so an
  // Events card silently fell through to the Compass fallback — the same icon
  // as Experiences, on the card right beside it.
  event: PartyPopper,
};

type Tri = [string, string, string];
type Card = {
  id: string;
  name: string;
  image?: string;
  price?: string | null;
  href: string;
  tag?: string;
  // Optional world metadata. Absent means "both", which is every card that
  // predates the world system — see lib/worlds.ts.
  world?: "authentic" | "curated" | "both";
  worldPriority?: number;
  featuredAuthentic?: boolean;
  featuredCurated?: boolean;
  heroAuthentic?: boolean;
  heroCurated?: boolean;
};
type CardImages = {
  scooter: string[];
  car: string[];
  stays: string[];
  exp: string[];
  stores: string[];
  food?: string[];
};

// Depth tints for the six primary cards (icon badge + gradient fallback).
//
// These were four saturated accent hues — amber, teal, indigo, rose — on the
// six cards above the fold, which DESIGN.md forbids by name ("Don't introduce a
// second saturated accent"). More practically: with four competing colours
// shouting at once, gold stopped meaning anything, so the eye had nothing to
// follow and the page read as a template grid rather than a designed system.
//
// The tints now vary by DEPTH, not hue — one warm gold ramp, each card sitting
// a little further into the dark. The admin's existing tint keys are preserved
// so no content needs re-saving; they simply now select a position in the ramp
// rather than a different colour. Gold is reserved for wayfinding again.
const TINT: Record<string, { icon: string; grad: string }> = {
  amber: {
    icon: "text-yellow",
    grad: "bg-gradient-to-br from-yellow/25 to-dark",
  },
  teal: {
    icon: "text-yellow/80",
    grad: "bg-gradient-to-br from-yellow/[0.14] to-dark",
  },
  indigo: {
    icon: "text-offwhite/75",
    grad: "bg-gradient-to-br from-white/[0.10] to-dark",
  },
  rose: {
    icon: "text-offwhite/60",
    grad: "bg-gradient-to-br from-white/[0.06] to-dark",
  },
};

// Roulé Rodrigues 2.0 — app-style homepage (preview). Header → hero → six cards
// → "What are you looking for?" → Discover → Featured Experiences → Top Stays →
// Reviews → Footer, with a FIXED bottom (Travel Tools strip + app nav where
// Ti Roulé lives). Real content only. `hero`, `reviews`, `footer` are passed in.
export default function AppHome({
  hero,
  reviews,
  footer,
  lookingFor,
  homeCards,
  experiences,
  stays,
  discover,
  islandLife,
  outdoors,
  cardImages,
  mascot,
  logo,
  promoEvents,
  about,
}: {
  hero: ReactNode;
  reviews?: ReactNode;
  footer?: ReactNode;
  /** One-paragraph business description, identical to the JSON-LD's — rendered
      visibly so extraction sees what the schema claims. */
  about?: string;
  lookingFor?: QuickAccessItem[];
  homeCards?: HomeCard[];
  experiences: Card[];
  stays: Card[];
  discover: Card[];
  /** Culture, villages, crafts — the Authentic taxonomy's "real island life". */
  islandLife: Card[];
  /** Trails, fishing and sea trips — its "nature & outdoor adventure". */
  outdoors: Card[];
  cardImages: CardImages;
  /** Upcoming ticketed events for the promo strip. Empty renders nothing. */
  promoEvents: PromoEvent[];
  mascot?: string;
  logo?: string;
}) {
  const { language, setLanguage } = useLanguage();
  const { count } = useFavorites();
  const pathname = usePathname() || "/v2";
  const L = (t: Tri) =>
    language === "fr" ? t[1] : language === "cr" ? t[2] : t[0];
  const cycle = () =>
    setLanguage(language === "en" ? "fr" : language === "fr" ? "cr" : "en");
  const openSaved = () =>
    window.dispatchEvent(new CustomEvent("rr:open-saved"));
  // Which Rodrigues this visitor is in. Falls back to Curated — the near-black
  // world is this site's existing identity, so anyone who has not chosen sees
  // the page they already know rather than a stranger.
  const activeWorld = useActiveWorld();

  // ── THE WORLD REORDERS THE PAGE, NOT JUST ITS COLOURS ─────────────────────
  // This is what stops the switcher being a theme toggle with extra steps: the
  // rails are filtered to the world and ranked by the owner's featured flags
  // and priorities, so Authentic and Curated genuinely offer different things
  // in a different order.
  //
  // Untagged content still appears in both, so an owner who has tagged nothing
  // sees exactly what they see today — the difference grows as they tag.
  const worldExperiences = useMemo(
    () => forWorld(experiences, activeWorld),
    [experiences, activeWorld],
  );
  const worldStays = useMemo(
    () => forWorld(stays, activeWorld),
    [stays, activeWorld],
  );
  // Ranked like the others, so tagging a boat trip "curated" in admin moves it
  // here too rather than only on the pages that were wired first.
  const worldOutdoors = useMemo(
    () => forWorld(outdoors, activeWorld),
    [outdoors, activeWorld],
  );

  // The primary photo cards — admin-editable (content.homeCards). Each card's
  // auto-cycling photos come from its imageSource category (the owner's real
  // photos). Falls back to sensible defaults.
  const cardGallery: Record<string, string[]> = {
    scooter: cardImages.scooter,
    car: cardImages.car,
    stays: cardImages.stays,
    exp: cardImages.exp,
    stores: cardImages.stores,
    food: cardImages.food ?? [],
    none: [],
  };
  const BIG = (homeCards && homeCards.length ? homeCards : DEFAULT_HOME_CARDS)
    .filter((c) => c.enabled !== false)
    .map((c) => ({
      key: c.id,
      icon: HOME_ICON[c.icon] ?? Compass,
      tint: (c.tint ?? "amber") as keyof typeof TINT,
      label: [c.label, c.labelFr ?? c.label, c.labelCr ?? c.label] as Tri,
      href: c.action === "tiroule" ? undefined : c.href,
      onClick:
        c.action === "tiroule"
          ? () => window.dispatchEvent(new CustomEvent("tiroule:open"))
          : undefined,
      images: cardGallery[c.imageSource] ?? [],
      popular: c.popular,
      centerImage: c.action === "tiroule" ? mascot : undefined,
    }));

  // "What are you looking for?" tiles — admin-editable (falls back to defaults).
  const lookItems = (
    lookingFor && lookingFor.length ? lookingFor : DEFAULT_QUICK_ACCESS
  ).filter((x) => x.enabled !== false);

  // Stop the logo cube while nobody can see it. It is a decorative loop that
  // would otherwise composite a new frame forever, including while the visitor
  // is far down the page — and the primary scene here is a phone on battery.
  // A hidden TAB is already handled by the browser, which suspends animations;
  // this covers the case the browser does not, which is the header simply being
  // scrolled out of view.
  //
  // The observer is the only thing driving this, so a browser without
  // IntersectionObserver just keeps animating — the fallback is the old
  // behaviour, never a stopped cube.
  const cubeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = cubeRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => el.classList.toggle("is-paused", !entry.isIntersecting),
      // A little slack so a sticky header hovering at the boundary does not
      // toggle the class on every scroll frame.
      { rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Travel Tools strip (utilities). No "TOOLS" label — the chips speak for
  // themselves and dropping it frees room so Emergency shows fully.
  const TOOLS: { icon: React.ElementType; label: Tri; href: string }[] = [
    { icon: MapIcon, label: ["Map", "Carte", "Kart"], href: "/map" },
    {
      icon: CalendarRange,
      label: ["Planner", "Planifier", "Plan"],
      href: "/trip-planner",
    },
    {
      icon: BookOpen,
      label: ["Guide", "Guide", "Gid"],
      href: "/guide/rodrigues",
    },
    {
      icon: Siren,
      label: ["Emergency", "Urgences", "Irzans"],
      href: "/emergency",
    },
  ];

  return (
    <>
      {/* "/" answering with the visitor's world is handled in middleware now —
          before the page renders, so there is no flash of the wrong one. */}

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-dark/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <Link
            href="/"
            className="mr-2 flex items-center"
            aria-label="Roule Rodrigues home"
          >
            {/* The mark as a solid rotating cube. Four sides carry the artwork;
                the top and bottom close the box so it never turns edge-on and
                vanishes the way a single flipping image does.

                Every face points at the SAME src, so this is one download and
                one decode however many faces exist — the rest come from cache.
                Only the front face is `priority`: marking all four would emit
                four preload hints for one URL.

                alt="" on all of them, deliberately. The <Link> already carries
                aria-label="Roule Rodrigues home", so labelling the faces would
                make a screen reader announce the brand four more times for a
                single link. The cube is decoration around an already-named
                control.

                next/image, not a raw <img>: the owner-uploaded logo is a 1.24 MB
                PNG rendered at 44px on EVERY page. Supabase-hosted URLs are
                excluded from `unoptimized` so the optimizer actually runs on
                them (remotePatterns already allows *.supabase.co). It falls back
                to the shipped app icon rather than to text — that icon IS the
                brand mark now, generated from the same master as every PWA
                icon. */}
            <span className="rr-logo-anim inline-flex">
              <span className="rr-logo-cube">
                <span ref={cubeRef} className="rr-logo-cube-inner">
                  {(["front", "right", "back", "left"] as const).map((face) => (
                    <span
                      key={face}
                      className={`rr-logo-cube-face rr-cube-${face}`}
                    >
                      <Image
                        src={logo || "/icon-192.png"}
                        alt=""
                        width={132}
                        height={132}
                        priority={face === "front"}
                        sizes="44px"
                        unoptimized={
                          !!logo &&
                          (logo.startsWith("/uploads/") ||
                            (logo.startsWith("http") &&
                              !logo.includes("supabase.co")))
                        }
                      />
                    </span>
                  ))}
                  <span className="rr-logo-cube-face rr-cube-top" />
                  <span className="rr-logo-cube-face rr-cube-bottom" />
                </span>
              </span>
            </span>
          </Link>
          {/* ── THE WORLD LIVES WHERE THE LOCATION PILL WAS ────────────────
              "Rodrigues Island" was a label, not a control: it named the only
              place this site covers and opened nothing. The world switcher is a
              real choice and it belongs in the most prominent slot in the
              header, so it takes that space rather than adding a second row
              beneath it. */}
          <WorldSwitcher strip={false} className="mx-auto" />
          <button className="hidden" aria-hidden tabIndex={-1}>
            <MapPin size={13} className="text-yellow" />{" "}
            <ChevronDown size={13} className="text-muted" />
          </button>
          <InstallAppButton variant="icon" />
          <button
            onClick={cycle}
            aria-label="Change language"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 font-bebas text-[11px] tracking-widest text-muted transition-colors hover:text-yellow"
          >
            {language.toUpperCase()}
          </button>
          <button
            onClick={openSaved}
            aria-label={`Saved (${count})`}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:text-yellow"
          >
            <Heart
              size={17}
              className={count > 0 ? "fill-red-500 text-red-500" : ""}
            />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow px-1 font-syne text-[10px] font-bold text-dark">
                {count}
              </span>
            )}
          </button>
          {/* Last in the row, beside the other identity controls. This was a
              sixth tab in the bottom bar; the bar is for where you are going,
              and an account is who you are. */}
          <AccountButton />
        </div>

        {/* ── DESKTOP NAVIGATION ─────────────────────────────────────────────
            A laptop should not be given a phone's thumb dock. The bottom bar
            exists because a thumb reaches the bottom of a phone and not the
            top; neither is true of a mouse, and a floating pill across a wide
            screen reads as an unfinished mobile port.

            So above md: the same tabs and tools appear here, in the header,
            where a website keeps its navigation — and the dock below is hidden
            entirely. One list drives both (lib/nav-tabs.ts), so the two chromes
            can never drift apart or disagree about what exists. */}
        <nav
          aria-label="Primary"
          className="hidden border-t border-white/10 md:block"
        >
          <div className="mx-auto flex max-w-6xl items-center gap-1 px-5 py-2">
            {NAV_TABS.map((tab) => {
              const label = tabLabel(tab, language);
              if (tab.action === "tiroule") {
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={openTiRoule}
                    className="ml-1 flex items-center gap-2 rounded-full bg-gradient-to-b from-yellow to-yellow-dark px-4 py-2 font-dm text-[13px] font-bold text-dark shadow-[0_6px_18px_-6px_rgba(245,200,66,0.6)] transition-transform hover:scale-[1.03]"
                  >
                    <tab.icon className="h-[18px] w-[18px]" />
                    {label}
                  </button>
                );
              }
              const active = isTabActive(tab, pathname);
              return (
                <Link
                  key={tab.key}
                  href={tab.href ?? "/"}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 font-dm text-[13px] font-semibold transition-colors ${
                    active
                      ? "bg-yellow/12 text-yellow"
                      : "text-muted hover:bg-white/[0.05] hover:text-offwhite"
                  }`}
                >
                  <tab.icon className="h-[18px] w-[18px]" />
                  {label}
                </Link>
              );
            })}

            {/* The tools that live in the dock's top row on a phone. On a wide
                screen there is room for them on the same line, pushed right. */}
            <span className="ml-auto flex items-center gap-1">
              {TOOLS.map((t) => (
                <Link
                  key={t.href + t.label[0]}
                  href={t.href}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-dm text-xs font-medium text-offwhite/90 transition-colors hover:border-yellow/40 hover:text-yellow"
                >
                  <t.icon className="h-4 w-4 text-yellow" />
                  {L(t.label)}
                </Link>
              ))}
            </span>
          </div>
        </nav>
      </header>

      {/* ── Hero (kept — passed in) ────────────────────────── */}
      {/* Keyed: hero/reviews/footer are server-component elements created in
          Home. Crossing the RSC boundary strips React's dev "validated" flag,
          so rendered bare among siblings the reconciler flags them as keyless
          list children ("a child from Home"). A stable key silences it. */}
      <Fragment key="hero">{hero}</Fragment>

      {/* NO world headline here. The owner's instruction, with a picture:
          the page looks the same in both worlds and the switcher at the top is
          the only thing that changes. A line naming the world was one more
          thing to read above the cards, and this homepage has spent the whole
          session trying to get those cards onto the first screen. */}

      {/* pb clears the fixed bottom bar on a phone. Above md: the dock is gone
          and the navigation is in the header, so the reserved strip goes too. */}
      <main className="mx-auto max-w-5xl px-4 pb-[124px] md:pb-16">
        {/* Six primary cards — v1 photo-card design, auto-cycling images. */}
        <section className="rr-home-cards-sec pt-2">
          <div className="rr-home-cards grid grid-cols-3 gap-2.5">
            {BIG.map((c) => (
              <AutoImageCard key={c.key} card={c} L={L} />
            ))}
          </div>
        </section>

        {/* What are you looking for?
            id="explore" is the anchor 11 links across the site point at —
            BrowseBackBar, the Navbar (desktop + mobile drawer), FavoritesPanel,
            three Ti Roulé CTAs, both /browse back arrows and two guide-page
            CTAs all use "/#explore". The element carrying it was removed with
            the old homepage and never re-added, so every one of those silently
            dumped the visitor at the top of the page instead of at the hub.
            app/globals.css:125 still reserves its scroll-margin. */}
        <section id="explore" className="rr-home-tiles-sec mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-syne text-[15px] font-bold text-offwhite">
              {L([
                "What are you looking for?",
                "Que cherchez-vous ?",
                "Ki ou pe rode?",
              ])}
            </h2>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1 font-dm text-xs text-yellow hover:underline"
            >
              {L(["See all", "Voir tout", "Get tou"])} <ArrowRight size={13} />
            </Link>
          </div>

          {/* A GRID, not a scroller.
              As a horizontal rail this showed four and a half of ten tiles, and
              the half-tile was the only hint the rest existed — so six entry
              points to the site were invisible unless you happened to swipe a
              row that does not look swipeable. A grid shows every one of them
              at once and costs about the same vertical space as the rail plus
              the swipe nobody made.

              Four columns on a phone, more as the screen allows; `auto-rows-fr`
              keeps every tile the same height so a two-line label ("Airport
              transfer") does not make its row taller than its neighbours. */}
          <div className="grid auto-rows-fr grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {lookItems.map((c) => {
              const Icon = LOOKING_ICON[c.icon] ?? Compass;
              return (
                <Link
                  key={c.id}
                  href={c.href}
                  className="group flex flex-col items-center justify-start gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-1.5 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-yellow/40"
                >
                  <Icon size={19} className="shrink-0 text-yellow" />
                  <span className="font-dm text-[10.5px] font-medium leading-tight text-offwhite/90">
                    {loc(language, c.label, c.labelFr, c.labelCr)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* The door into the Curated world. It sits directly under the
            category tiles because it answers the question they cannot: not
            "what do you want", but "what is worth doing". */}
        <CuratedTeaser />

        {/* Events, promoted where a card could not do the job — see EventsPromo. */}
        <EventsPromo events={promoEvents} />

        {discover.length > 0 && (
          <Rail
            title={L([
              "Discover Rodrigues",
              "Découvrir Rodrigues",
              "Dekouver Rodrig",
            ])}
            subtitle={L([
              "Beaches, viewpoints & hidden gems.",
              "Plages, points de vue & trésors cachés.",
              "Laplaz, bann vi & trezor kase.",
            ])}
            seeAll="/explore"
            seeAllLabel={L(["View all", "Voir tout", "Get tou"])}
          >
            {discover.map((d) => (
              <Link
                key={d.id}
                href={d.href}
                className="group relative flex h-36 w-36 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl border border-white/10"
              >
                {d.image ? (
                  <Image
                    src={d.image}
                    alt={d.name}
                    fill
                    sizes="(max-width:768px) 45vw, 220px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    unoptimized={
                      d.image.startsWith("/uploads/") ||
                      (d.image.startsWith("http") &&
                        !d.image.includes("supabase.co"))
                    }
                  />
                ) : (
                  <span className="absolute inset-0 bg-gradient-to-br from-yellow/20 to-dark" />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <span className="relative p-2.5 font-syne text-sm font-bold leading-tight text-white">
                  {d.name}
                </span>
              </Link>
            ))}
          </Rail>
        )}

        {/* ── Nature & the outdoors ────────────────────────────────────
            Trails and boats, which the owner keeps in two different tables and
            a visitor thinks of as one afternoon. */}
        {worldOutdoors.length > 0 && (
          <Rail
            title={L([
              "On foot & on the water",
              "À pied & sur l'eau",
              "Apie & lor dilo",
            ])}
            subtitle={L([
              "Trails, fishing and sea trips.",
              "Sentiers, pêche et sorties en mer.",
              "Semin, lapes ek sorti lamer.",
            ])}
            seeAll="/guide/routes"
            seeAllLabel={L(["View all", "Voir tout", "Get tou"])}
          >
            {worldOutdoors.map((o) => (
              <PriceCard key={o.id} card={o} />
            ))}
          </Rail>
        )}

        {/* ── Culture, villages, crafts ────────────────────────────────────
            The half of "live the island as it truly is" that is about people
            rather than scenery, and had nowhere to appear before. */}
        {islandLife.length > 0 && (
          <Rail
            title={L([
              "Real island life",
              "La vraie vie de l'île",
              "Vre lavi lil",
            ])}
            subtitle={L([
              "Culture, villages and the people who make things.",
              "Culture, villages et ceux qui fabriquent.",
              "Kiltir, vilaz ek bann ki fer kitsoz.",
            ])}
            seeAll="/map"
            seeAllLabel={L(["View all", "Voir tout", "Get tou"])}
          >
            {islandLife.map((d) => (
              <Link
                key={d.id}
                href={d.href}
                className="group relative flex h-36 w-36 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl border border-white/10"
              >
                {d.image ? (
                  <Image
                    src={d.image}
                    alt={d.name}
                    fill
                    sizes="(max-width:768px) 45vw, 220px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    unoptimized={
                      d.image.startsWith("/uploads/") ||
                      (d.image.startsWith("http") &&
                        !d.image.includes("supabase.co"))
                    }
                  />
                ) : (
                  <span className="absolute inset-0 bg-gradient-to-br from-yellow/20 to-dark" />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <span className="relative p-2.5 font-syne text-sm font-bold leading-tight text-white">
                  {d.name}
                </span>
              </Link>
            ))}
          </Rail>
        )}

        {worldExperiences.length > 0 && (
          <Rail
            title={L([
              "Featured Experiences",
              "Expériences à la une",
              "Bann eksperyans",
            ])}
            subtitle={L([
              "Handpicked activities you'll love.",
              "Des activités triées sur le volet.",
              "Bann aktivite swazir pou ou.",
            ])}
            seeAll="/browse/tours"
            seeAllLabel={L(["View all", "Voir tout", "Get tou"])}
          >
            {worldExperiences.map((e) => (
              <PriceCard key={e.id} card={e} />
            ))}
          </Rail>
        )}

        {worldStays.length > 0 && (
          <Rail
            title={L(["Top Stays", "Où dormir", "Kot reste"])}
            subtitle={L([
              "Handpicked places to stay.",
              "Des hébergements triés pour vous.",
              "Bann lozman swazir pou ou.",
            ])}
            seeAll="/browse/stays"
            seeAllLabel={L(["View all", "Voir tout", "Get tou"])}
          >
            {worldStays.map((s) => (
              <PriceCard key={s.id} card={s} />
            ))}
          </Rail>
        )}

        {/* ── What Roule Rodrigues is, in the page's own words ──────────────
            The sentence a search snippet or an AI answer quotes about this
            business lived ONLY inside the JSON-LD — the visible page opened
            with a marquee and a review ticker, so text-extraction surfaced
            testimonials instead of what the site IS. Same string as the
            structured data (passed down from Home), so the two cannot drift.
            It sits below the rails on purpose: the first screen belongs to
            the cards (owner's instruction, above). */}
        {about && (
          <section aria-label="About Roule Rodrigues" className="mt-10">
            <h2 className="font-syne text-[15px] font-bold text-offwhite">
              Roule Rodrigues
            </h2>
            <p className="mt-2 max-w-2xl font-dm text-sm leading-relaxed text-muted">
              {about}
            </p>
          </section>
        )}

        {/* Reviews + Footer (from v1) — keyed for the same RSC-boundary reason
            as hero above (server elements from Home, rendered among siblings). */}
        <Fragment key="reviews">{reviews}</Fragment>
        <Fragment key="footer">{footer}</Fragment>
      </main>

      {/* ── Floating bottom app nav ─────────────────────────
          A detached rounded panel with a small gap on the sides and below
          (respecting the safe area). */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        {/* ── THE DOCK IS PHONE-SIZED, SO IT MUST GROW ON A BIG SCREEN ───────
            Every measurement in here was fixed at phone scale: 20px icons and
            10px labels. On a phone that is right. Stretched across a laptop it
            becomes a row of faint specks in a very wide bar — which is exactly
            how it was reported, as the buttons "not being visible".
            So the pill tightens and everything inside it steps up from sm:. */}
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-white/12 bg-dark/90 backdrop-blur-xl shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] md:max-w-3xl">
          <div className="rr-tools-row flex items-stretch gap-2 overflow-x-auto border-b border-white/10 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3 sm:px-4 sm:py-2.5">
            {TOOLS.map((t) => (
              <Link
                key={t.href + t.label[0]}
                href={t.href}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 transition-colors hover:border-yellow/40 sm:gap-2 sm:px-4 sm:py-2"
              >
                <t.icon className="h-3.5 w-3.5 text-yellow sm:h-[18px] sm:w-[18px]" />
                <span className="font-dm text-[11px] font-medium text-offwhite/90 sm:text-[13px]">
                  {L(t.label)}
                </span>
              </Link>
            ))}
          </div>
          {/* Same five tabs as the global BottomNav — one list, two chromes.
              See lib/nav-tabs.ts for why the tabs are not defined here. */}
          <nav aria-label="Primary">
            <div className="rr-nav-row flex items-center justify-around px-2 py-1.5 sm:px-4 sm:py-2.5">
              {NAV_TABS.map((tab) => {
                const label = tabLabel(tab, language);
                const base =
                  "flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors sm:min-w-[76px] sm:gap-1.5 sm:px-3 sm:py-2";
                if (tab.action === "tiroule") {
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={openTiRoule}
                      aria-label={label}
                      className="flex min-w-[56px] flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-yellow to-yellow-dark px-2 py-1.5 shadow-[0_6px_18px_-4px_rgba(245,200,66,0.55)] sm:min-w-[80px] sm:gap-1.5 sm:px-3 sm:py-2.5"
                    >
                      <tab.icon className="h-[22px] w-[22px] text-dark sm:h-7 sm:w-7" />
                      <span className="font-dm text-[10px] font-medium leading-none text-dark sm:text-[13px]">
                        {label}
                      </span>
                    </button>
                  );
                }
                const active = isTabActive(tab, pathname);
                return (
                  <Link
                    key={tab.key}
                    href={tab.href ?? "/"}
                    aria-current={active ? "page" : undefined}
                    className={`${base} ${active ? "text-yellow" : "text-muted hover:text-offwhite"}`}
                  >
                    <tab.icon
                      className={`h-5 w-5 sm:h-6 sm:w-6 ${active ? "text-yellow" : ""}`}
                    />
                    <span
                      className={`font-dm text-[10px] font-medium leading-none sm:text-[13px] ${active ? "text-yellow" : "text-muted"}`}
                    >
                      {label}
                    </span>
                  </Link>
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
  card,
  L,
}: {
  card: {
    key: string;
    icon: React.ElementType;
    tint: keyof typeof TINT;
    label: Tri;
    href?: string;
    onClick?: () => void;
    images: string[];
    popular?: boolean;
    centerImage?: string;
  };
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
        // Only the visible frame of the crossfade is fetched eagerly; the rest
        // stay lazy. Previously every image of every card mounted at once with
        // loading="lazy" — so N×6 images competed for bandwidth while the one
        // actually on screen, directly under a compact hero, was deprioritised.
        imgs.map((src, i) => (
          <Image
            key={src + i}
            src={src}
            alt=""
            fill
            sizes="(max-width:768px) 50vw, 320px"
            priority={i === 0}
            loading={i === 0 ? undefined : "lazy"}
            className={`object-cover transition-opacity duration-[900ms] ${i === idx ? "opacity-100" : "opacity-0"}`}
            unoptimized={
              src.startsWith("/uploads/") ||
              (src.startsWith("http") && !src.includes("supabase.co"))
            }
          />
        ))
      ) : (
        <span className={`absolute inset-0 ${tint.grad}`} />
      )}
      {card.centerImage && imgs.length === 0 && (
        <Image
          src={card.centerImage}
          alt=""
          width={200}
          height={160}
          sizes="200px"
          className="absolute inset-x-0 bottom-0 mx-auto h-[80%] w-auto object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]"
          unoptimized={
            card.centerImage.startsWith("/uploads/") ||
            (card.centerImage.startsWith("http") &&
              !card.centerImage.includes("supabase.co"))
          }
        />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <span
        className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-md ${tint.icon}`}
      >
        <card.icon size={16} />
      </span>
      {card.popular && (
        <span className="absolute right-2 top-2 rounded-full bg-yellow px-2 py-0.5 font-bebas text-[8px] tracking-[0.12em] text-dark">
          POPULAR
        </span>
      )}
      {/* rr-on-media: this block sits on the card's photo, under a black
          gradient. Its colours belong to the IMAGE, not to the theme — the
          accent flipped to blue in light mode and measured ~2.8:1 against that
          dark gradient, which is the same class of bug as the dark-on-dark
          headline. Over media, white. */}
      <span className="rr-on-media absolute inset-x-0 bottom-0 p-2.5">
        <span className="block font-syne text-[13px] font-bold leading-tight text-white drop-shadow">
          {L(card.label)}
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1 font-dm text-[10px] font-semibold text-yellow">
          {L(["Explore", "Explorer", "Explor"])}{" "}
          <ArrowRight
            size={11}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </span>
    </>
  );
  const cls =
    "group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 transition-all hover:-translate-y-0.5 hover:border-yellow/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50";
  return card.href ? (
    <Link href={card.href} className={cls}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={card.onClick}
      className={`${cls} w-full text-left`}
    >
      {body}
    </button>
  );
}

function Rail({
  title,
  subtitle,
  seeAll,
  seeAllLabel,
  children,
}: {
  title: string;
  subtitle: string;
  seeAll: string;
  seeAllLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-syne text-base font-bold text-offwhite">
            {title}
          </h2>
          <p className="font-dm text-xs text-muted">{subtitle}</p>
        </div>
        <Link
          href={seeAll}
          className="inline-flex shrink-0 items-center gap-1 font-dm text-xs text-yellow hover:underline"
        >
          {seeAllLabel} <ArrowRight size={13} />
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

function PriceCard({ card }: { card: Card }) {
  return (
    <Link
      href={card.href}
      className="group flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all hover:-translate-y-0.5 hover:border-yellow/40"
    >
      <div className="relative h-24 w-full overflow-hidden">
        {card.image ? (
          <Image
            src={card.image}
            alt={card.name}
            fill
            sizes="(max-width:768px) 45vw, 240px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized={
              card.image.startsWith("/uploads/") ||
              (card.image.startsWith("http") &&
                !card.image.includes("supabase.co"))
            }
          />
        ) : (
          <span className="block h-full w-full bg-gradient-to-br from-yellow/20 to-dark" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-2 font-syne text-[13px] font-bold leading-tight text-offwhite">
          {card.name}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          {card.price && (
            <span className="font-syne text-xs font-bold text-yellow">
              {card.price}
            </span>
          )}
          <ArrowRight
            size={14}
            className="ml-auto text-muted/50 transition-all group-hover:translate-x-0.5 group-hover:text-yellow"
          />
        </div>
      </div>
    </Link>
  );
}
