"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Compass, Waves, Mountain, Map as MapIcon, Route as RouteIcon,
  Utensils, BedDouble, Store, CalendarRange, Sparkles, ArrowRight, Star,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import type { Language } from "@/lib/i18n";

// One row/card in the Explore lists. Built entirely from real site content —
// no invented ratings or prices. `price` is only ever the owner-set priceNote.
export type ExploreItem = {
  id: string;
  name: string; nameFr?: string; nameCr?: string;
  description: string; descriptionFr?: string; descriptionCr?: string;
  image?: string;
  href: string;
  external?: boolean;
  filterKey: "beach" | "viewpoint" | "landmark" | "hike" | "ride" | "tour" | "activity";
  tags: string[];      // real meta chips, e.g. ["12 km", "Moderate"] or ["Guided tour"]
  price?: string;      // owner-set price hint only
  featured?: boolean;
};

type Counts = Record<string, number>;

// A browse tile → a real destination page. Counts come from live content, so a
// category with nothing behind it simply reads "Explore".
const TILES: { key: string; label: [string, string, string]; href: string; icon: React.ElementType; countKey?: string }[] = [
  { key: "beaches",   label: ["Beaches", "Plages", "Laplaz"],            href: "/guide/beaches",    icon: Waves,        countKey: "beach" },
  { key: "viewpoints",label: ["Viewpoints", "Points de vue", "Vue"],     href: "/guide/viewpoints", icon: Mountain,     countKey: "viewpoint" },
  { key: "routes",    label: ["Routes & hikes", "Routes & rando", "Rout"], href: "/guide/routes",   icon: RouteIcon,    countKey: "route" },
  { key: "eat",       label: ["Eat & drink", "Manger", "Manze"],          href: "/browse/restaurants", icon: Utensils,  countKey: "restaurant" },
  { key: "stay",      label: ["Places to stay", "Hébergement", "Reste"],  href: "/browse/stays",     icon: BedDouble,    countKey: "hotel" },
  { key: "tours",     label: ["Guided tours", "Excursions", "Tour"],      href: "/browse/tours",     icon: Sparkles,     countKey: "tour" },
  { key: "map",       label: ["Island map", "Carte", "Kart"],             href: "/map",              icon: MapIcon },
  { key: "planner",   label: ["Trip planner", "Planificateur", "Plan"],   href: "/trip-planner",     icon: CalendarRange },
  { key: "shops",     label: ["Local shops", "Boutiques", "Laboutik"],    href: "/guide/shops",      icon: Store },
];

export default function ExploreClient({
  featured, experiences, counts,
}: {
  featured: ExploreItem | null;
  experiences: ExploreItem[];
  counts: Counts;
}) {
  const { language } = useLanguage();
  const L = (en: string, fr: string, cr: string) => (language === "fr" ? fr : language === "cr" ? cr : en);

  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<string>("all");

  // Only offer filter chips for groups that actually have items, so no chip
  // ever leads to an empty list.
  const chips = useMemo(() => {
    const present = new Set<string>(experiences.map((e) => e.filterKey));
    const defs: { key: string; label: string }[] = [
      { key: "beach", label: L("Beaches", "Plages", "Laplaz") },
      { key: "viewpoint", label: L("Viewpoints", "Vues", "Vue") },
      { key: "hike", label: L("Hikes", "Randos", "Rando") },
      { key: "ride", label: L("Scenic rides", "Balades", "Balad") },
      { key: "tour", label: L("Tours", "Excursions", "Tour") },
      { key: "activity", label: L("Activities", "Activités", "Aktivite") },
      { key: "landmark", label: L("Landmarks", "Sites", "Landmark") },
    ];
    return [{ key: "all", label: L("All", "Tout", "Tou") }, ...defs.filter((d) => present.has(d.key))];
  }, [experiences, language]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return experiences.filter((e) => {
      if (chip !== "all" && e.filterKey !== chip) return false;
      if (!q) return true;
      const name = loc(language, e.name, e.nameFr, e.nameCr).toLowerCase();
      const desc = loc(language, e.description, e.descriptionFr, e.descriptionCr).toLowerCase();
      return name.includes(q) || desc.includes(q) || e.tags.some((t) => t.toLowerCase().includes(q));
    });
  }, [experiences, query, chip, language]);

  return (
    <main className="min-h-screen bg-dark pb-24">
      <div className="mx-auto max-w-3xl px-5 pt-24 md:pt-28">
        {/* Header */}
        <header>
          <p className="font-bebas text-[11px] tracking-[0.35em] text-yellow">RODRIGUES · CURATED BY LOCALS</p>
          <h1 className="mt-1.5 font-syne text-3xl font-extrabold text-offwhite md:text-4xl">
            {L("Explore", "Explorer", "Explor")}
          </h1>
          <p className="mt-1 font-dm text-sm text-muted">
            {L("Beaches, hikes, tours and the best things to do on the island.",
               "Plages, randos, excursions et les meilleures choses à faire sur l’île.",
               "Laplaz, rando, tour ek pli bon kitsoz pou fer lor lil.")}
          </p>

          {/* Search */}
          <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 focus-within:border-yellow/60 transition-colors">
            <Search size={17} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={L("Search beaches, hikes, tours…", "Rechercher plages, randos…", "Rod laplaz, rando, tour…")}
              className="w-full bg-transparent font-dm text-sm text-offwhite placeholder:text-muted/60 focus:outline-none"
            />
          </div>
        </header>

        {/* Filter chips */}
        {chips.length > 1 && (
          <div className="mt-4 -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => setChip(c.key)}
                className={`shrink-0 rounded-full border px-4 py-1.5 font-dm text-xs font-medium transition-colors ${
                  chip === c.key
                    ? "border-yellow bg-yellow text-dark"
                    : "border-white/12 text-muted hover:border-yellow/40 hover:text-yellow"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Featured — top attraction */}
        {featured && chip === "all" && !query && (
          <FeaturedCard item={featured} language={language} label={L("Top attraction", "À ne pas manquer", "Top atraksion")} />
        )}

        {/* Browse by category tiles */}
        {chip === "all" && !query && (
          <section className="mt-8">
            <h2 className="mb-3 font-syne text-lg font-bold text-offwhite">
              {L("Browse by category", "Par catégorie", "Par kategori")}
            </h2>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3">
              {TILES.map((t) => {
                const n = t.countKey ? counts[t.countKey] : undefined;
                return (
                  <Link
                    key={t.key}
                    href={t.href}
                    className="group flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-3.5 transition-colors hover:border-yellow/40"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/15 transition-transform group-hover:scale-105">
                      <t.icon size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-syne text-[13px] font-bold leading-tight text-offwhite">{L(t.label[0], t.label[1], t.label[2])}</span>
                      {typeof n === "number" && n > 0 && (
                        <span className="font-dm text-[11px] text-muted">{n} {L("spots", "lieux", "landrwa")}</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Popular experiences */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-syne text-lg font-bold text-offwhite">
              {chip === "all" && !query
                ? L("Popular experiences", "Expériences populaires", "Bann eksperyans popiler")
                : L("Results", "Résultats", "Rezilta")}
            </h2>
            <span className="font-dm text-xs text-muted">{shown.length}</span>
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-12 text-center">
              <Compass size={28} className="mx-auto mb-3 text-muted/40" />
              <p className="font-dm text-sm text-muted">{L("Nothing matches that search.", "Aucun résultat.", "Nanye pa korespon.")}</p>
              <button onClick={() => { setQuery(""); setChip("all"); }} className="mt-3 font-dm text-xs text-yellow hover:underline">
                {L("Clear filters", "Réinitialiser", "Reinisyalize")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map((e) => (
                <ExperienceRow key={e.id} item={e} language={language} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function FeaturedCard({ item, language, label }: { item: ExploreItem; language: Language; label: string }) {
  const name = loc(language, item.name, item.nameFr, item.nameCr);
  const desc = loc(language, item.description, item.descriptionFr, item.descriptionCr);
  const Wrap = item.external ? "a" : Link;
  const props = item.external ? { href: item.href, target: "_blank", rel: "noopener noreferrer" } : { href: item.href };
  return (
    <section className="mt-6">
      <Wrap {...props} className="group relative block overflow-hidden rounded-3xl border border-white/10">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={name} className="h-56 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-64" loading="lazy" />
        ) : (
          <div className="h-56 w-full bg-gradient-to-br from-yellow/20 to-dark sm:h-64" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="absolute left-0 top-0 m-4 flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1 font-bebas text-[10px] tracking-[0.18em] text-dark">
          <Star size={11} className="fill-dark" /> {label.toUpperCase()}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h3 className="font-syne text-xl font-extrabold text-white drop-shadow sm:text-2xl">{name}</h3>
          <p className="mt-1 line-clamp-2 font-dm text-sm text-white/85">{desc}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 font-dm text-sm font-semibold text-yellow">
            {item.price || " "} <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </Wrap>
    </section>
  );
}

const TYPE_LABELS: Record<ExploreItem["filterKey"], [string, string, string]> = {
  beach: ["Beach", "Plage", "Laplaz"],
  viewpoint: ["Viewpoint", "Point de vue", "Vue"],
  landmark: ["Landmark", "Site", "Landmark"],
  hike: ["Hike", "Randonnée", "Rando"],
  ride: ["Scenic ride", "Balade", "Balad"],
  tour: ["Guided tour", "Excursion", "Tour"],
  activity: ["Activity", "Activité", "Aktivite"],
};

function ExperienceRow({ item, language }: { item: ExploreItem; language: Language }) {
  const name = loc(language, item.name, item.nameFr, item.nameCr);
  const desc = loc(language, item.description, item.descriptionFr, item.descriptionCr);
  const [tEn, tFr, tCr] = TYPE_LABELS[item.filterKey];
  const typeLabel = loc(language, tEn, tFr, tCr);
  const chips = [typeLabel, ...item.tags].slice(0, 3);
  const Wrap = item.external ? "a" : Link;
  const props = item.external ? { href: item.href, target: "_blank", rel: "noopener noreferrer" } : { href: item.href };
  return (
    <Wrap {...props} className="group flex items-stretch gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 transition-colors hover:border-yellow/40 hover:bg-white/[0.05]">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={name} className="h-[88px] w-[88px] shrink-0 rounded-xl object-cover" loading="lazy" />
      ) : (
        <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-xl bg-yellow/8 text-yellow/60">
          <Compass size={22} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-syne text-sm font-bold leading-tight text-offwhite">{name}</h3>
          <ArrowRight size={15} className="mt-0.5 shrink-0 text-muted/50 transition-all group-hover:translate-x-0.5 group-hover:text-yellow" />
        </div>
        <p className="mt-1 line-clamp-2 font-dm text-[12.5px] leading-snug text-muted">{desc}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-2">
          {chips.map((t, i) => (
            <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-dm text-[10.5px] ${i === 0 ? "bg-yellow/12 text-yellow/90" : "bg-white/[0.06] text-muted"}`}>
              {t}
            </span>
          ))}
          {item.price && <span className="ml-auto shrink-0 font-syne text-xs font-bold text-yellow">{item.price}</span>}
        </div>
      </div>
    </Wrap>
  );
}
