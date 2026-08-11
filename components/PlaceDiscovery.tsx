"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Search, Navigation, Images, MapPin, SlidersHorizontal } from "lucide-react";
import type { MapLocation } from "@/lib/defaults";
import { availableBadges, badgesFor, filterPlaces, photoCount } from "@/lib/place-discovery";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

// ── CARDS FIRST, PROSE UNDERNEATH ──────────────────────────────────────────
//
// The complaint was exact: "user clicks Plages and gets dumped into long
// paragraphs". Nobody reads three paragraphs to pick a beach.
//
// But the prose below this component is ~1,300 words of genuinely local writing
// that earns real search traffic, so it is not deleted — it is DEMOTED. This
// grid answers the question ("which beach do I go to?") in about two seconds,
// and the article is still there for anyone who wants it, and still there for
// Google, which reads the whole page either way.
//
// ── WHAT A CARD HAS TO SAY ─────────────────────────────────────────────────
// A photograph, a name, and two or three badges that let two beaches be
// compared without reading either description. The badges come from the text
// the owner already wrote (lib/place-discovery.ts), so all 19 beaches and 10
// viewpoints are filterable today with no data entry.

export default function PlaceDiscovery({
  places,
  guideHref,
}: {
  places: MapLocation[];
  /** Anchor of the long-form section, so "read more" has somewhere to go. */
  guideHref: string;
}) {
  const { language } = useLanguage();
  const fr = language === "fr";
  const [query, setQuery] = useState("");
  const [badge, setBadge] = useState<string | null>(null);

  const chips = useMemo(() => availableBadges(places), [places]);
  const visible = useMemo(() => filterPlaces(places, { query, badge }), [places, query, badge]);

  if (places.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-5 pb-4 pt-6">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={fr ? "Chercher un endroit…" : "Search for a place…"}
            aria-label={fr ? "Chercher" : "Search"}
            className="w-full rounded-2xl border border-white/10 bg-dark-card py-3 pl-10 pr-4 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
          />
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setBadge(null)} className={chip(badge === null)}>
            {fr ? "Tout" : "All"}
          </button>
          {chips.map((b) => (
            <button
              key={b.key}
              onClick={() => setBadge(badge === b.key ? null : b.key)}
              className={chip(badge === b.key)}
            >
              <span aria-hidden>{b.emoji} </span>
              {fr ? b.labelFr : b.label}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 font-dm text-xs text-muted">
        {visible.length} {fr ? "endroits" : "places"}
      </p>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow/10 text-yellow">
            <SlidersHorizontal size={19} />
          </span>
          <p className="mt-3 font-syne text-lg font-bold text-offwhite">
            {fr ? "Rien ne correspond" : "Nothing matches that"}
          </p>
          <button
            onClick={() => { setQuery(""); setBadge(null); }}
            className="mt-3 font-dm text-sm font-bold text-yellow hover:underline"
          >
            {fr ? "Tout afficher" : "Show everything"}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => (
            <PlaceCard key={p.id} place={p} fr={fr} language={language} guideHref={guideHref} />
          ))}
        </div>
      )}
    </section>
  );
}

const chip = (on: boolean) =>
  `shrink-0 rounded-full border px-3.5 py-2 font-dm text-xs font-medium transition-colors ${
    on
      ? "border-yellow/60 bg-yellow/15 text-yellow"
      : "border-white/10 bg-dark-card text-muted hover:border-white/25 hover:text-offwhite"
  }`;

function PlaceCard({
  place, fr, language, guideHref,
}: {
  place: MapLocation;
  fr: boolean;
  language: string;
  guideHref: string;
}) {
  const cover = place.image || place.images?.[0];
  const badges = badgesFor(place, 3);
  const photos = photoCount(place);
  const name = loc(language as never, place.name, place.nameFr, place.nameCr);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-colors hover:border-white/25">
      {/* The whole card links into the long-form entry for this place, which is
          where the owner's story and the rest of the photos live. */}
      <a href={`${guideHref}#${place.id}`} className="relative block aspect-[4/3] w-full overflow-hidden bg-dark">
        {cover ? (
          <Image
            src={cover}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, 260px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized={cover.startsWith("/uploads/") || (cover.startsWith("http") && !cover.includes("supabase.co"))}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted/40">
            <MapPin size={22} />
          </span>
        )}
        {photos > 1 && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-dark/80 px-2 py-1 font-dm text-[10px] text-offwhite backdrop-blur-sm">
            <Images size={10} /> {photos}
          </span>
        )}
      </a>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-syne text-sm font-extrabold leading-tight text-offwhite">{name}</h3>

        {badges.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span
                key={b.key}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-dm text-[10px] text-muted"
              >
                <span aria-hidden>{b.emoji} </span>
                {fr ? b.labelFr : b.label}
              </span>
            ))}
          </p>
        )}

        {/* Directions, not a description. The decision this card supports is
            "shall I go there", and the next action after yes is getting there. */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&dir_action=navigate`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 pt-2.5 font-dm text-xs font-bold text-yellow hover:underline"
        >
          <Navigation size={12} /> {fr ? "Y aller" : "Directions"}
        </a>
      </div>
    </article>
  );
}
