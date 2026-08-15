"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AutoPhotos from "@/components/AutoPhotos";
import {
  Star, Clock, Users, MapPin, ArrowRight, SlidersHorizontal, Sparkles, ImageOff,
} from "lucide-react";
import type { RecommendedPlace } from "@/lib/defaults";
import { type ExperienceCopy, formatDuration, matchesFilter } from "@/lib/experiences";
import { countByMode, defaultMode, matchesMode, modeCue, type Mode } from "@/lib/time-of-day";
import DayNightSwitch from "@/components/experiences/DayNightSwitch";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import PlaceBookingModal from "@/components/PlaceBookingModal";
import PlaceDetailModal from "@/components/PlaceDetailModal";

// The discovery + booking surface shared by massage, fishing and sea trips.
//
// ── WHAT THE CARD HAS TO ANSWER, IN ORDER ──────────────────────────────────
// The brief's own example is the specification: a photo, what it is, how long,
// how many people, what it costs, and whether it can be booked. Not a
// paragraph. Somebody deciding between two charters is comparing four numbers,
// and every sentence between them and those numbers is friction.
//
//   [ PHOTO ]
//   Blue Ocean Fishing            ★ 4.9
//   Big game · 5h · up to 6
//   From Rs 4,500                 [See the trip]
//
// ── WHY THE BOOKING IS THE EXISTING MODAL ──────────────────────────────────
// PlaceBookingModal already does capacity, time slots, deposits and the live
// availability calendar, and it has been in production for months. Writing a
// second booking form for these verticals would have duplicated the one piece
// of this system that most deserves not to be duplicated.

export default function ExperienceMarket({
  copy,
  places,
  whatsapp,
}: {
  copy: ExperienceCopy;
  places: RecommendedPlace[];
  whatsapp?: string;
}) {
  const { language } = useLanguage();
  const fr = language === "fr";
  const [active, setActive] = useState<string | null>(null);
  // Day / night. Initialised from the ISLAND clock, not the visitor's — a
  // traveller browsing from Paris before they fly should see what is happening
  // in Rodrigues, which is the whole point of defaulting at all. Set lazily so
  // the first client render already has the right one; the server renders
  // nothing mode-specific, so there is no markup to mismatch.
  const [mode, setMode] = useState<Mode>(() => defaultMode());
  const [bookingPlace, setBookingPlace] = useState<RecommendedPlace | null>(null);
  const [detailPlace, setDetailPlace] = useState<RecommendedPlace | null>(null);

  // WHEN comes before WHAT: a night fishing trip has no business in a list
  // somebody is reading at ten in the morning, and no chip below should be able
  // to bring it back. So the mode narrows the catalogue first and everything
  // else filters within it.
  const inMode = useMemo(
    () => places.filter((p) => matchesMode(p.timeOfDay, mode)),
    [places, mode],
  );

  // Both sides of the switch, counted across the WHOLE catalogue rather than
  // the filtered view — the number answers "is there anything at night at all",
  // which must not change because a category chip is active.
  const counts = useMemo(() => countByMode(places, (p) => p.timeOfDay), [places]);

  // Only offer a filter that would actually return something IN THIS MODE. A
  // chip that always yields "no results" teaches people the filters are
  // decorative, and that is doubly true once the mode has already narrowed
  // things.
  const usableFilters = useMemo(
    () => copy.filters.filter((f) => inMode.some((p) => matchesFilter(p, f.key))),
    [copy.filters, inMode],
  );

  const visible = useMemo(
    () => (active ? inMode.filter((p) => matchesFilter(p, active)) : inMode),
    [inMode, active],
  );

  if (places.length === 0) {
    return (
      <div className="mt-8 overflow-hidden rounded-3xl border border-yellow/20 bg-gradient-to-b from-yellow/10 to-transparent px-6 py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow/10 text-2xl ring-1 ring-inset ring-yellow/20">
          {copy.emoji}
        </span>
        <h2 className="mt-5 font-syne text-2xl font-extrabold text-offwhite">{copy.emptyTitle}</h2>
        <p className="mx-auto mt-3 max-w-md font-dm text-sm leading-relaxed text-muted">{copy.emptyBody}</p>
        <Link
          href="/explore"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow px-5 py-3 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
        >
          {fr ? "Explorer Rodrigues" : "Explore Rodrigues"} <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* WHEN, then WHAT. Above the category chips because it narrows the
          catalogue they filter within — putting it beside them would suggest
          they are peers. */}
      <DayNightSwitch
        mode={mode}
        onChange={(m) => {
          setMode(m);
          // Drop the category filter when the catalogue underneath changes.
          // Keeping it is how somebody lands on "nothing matches that" holding
          // a chip that was perfectly reasonable a moment ago.
          setActive(null);
        }}
        counts={counts}
        cue={modeCue(mode, language === "fr" ? "fr" : language === "cr" ? "cr" : "en")}
        labels={{
          day: fr ? "Jour" : language === "cr" ? "Lizour" : "Day",
          night: fr ? "Nuit" : language === "cr" ? "Aswar" : "Night",
        }}
      />

      {usableFilters.length > 0 && (
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActive(null)}
            className={chip(active === null)}
          >
            {fr ? "Tout" : "All"}
          </button>
          {usableFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActive(active === f.key ? null : f.key)}
              className={chip(active === f.key)}
            >
              {fr ? f.labelFr : f.label}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow/10 text-yellow">
            <SlidersHorizontal size={19} />
          </span>
          <p className="mt-3 font-syne text-lg font-bold text-offwhite">
            {fr ? "Rien ne correspond" : "Nothing matches that"}
          </p>
          <button onClick={() => setActive(null)} className="mt-3 font-dm text-sm font-bold text-yellow hover:underline">
            {fr ? "Voir tout" : "Show everything"}
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p, i) => (
            <ExperienceCard
              key={p.id}
              place={p}
              copy={copy}
              fr={fr}
              language={language}
              index={i}
              onOpen={() => setDetailPlace(p)}
              onBook={() => setBookingPlace(p)}
            />
          ))}
        </div>
      )}

      {detailPlace && (
        <PlaceDetailModal
          place={detailPlace}
          whatsapp={whatsapp}
          onBook={() => { setBookingPlace(detailPlace); setDetailPlace(null); }}
          onClose={() => setDetailPlace(null)}
        />
      )}
      {bookingPlace && (
        <PlaceBookingModal
          place={bookingPlace}
          whatsapp={whatsapp}
          onClose={() => setBookingPlace(null)}
        />
      )}
    </>
  );
}

const chip = (on: boolean) =>
  `shrink-0 rounded-full border px-3.5 py-2 font-dm text-xs font-medium transition-colors ${
    on
      ? "border-yellow/60 bg-yellow/15 text-yellow"
      : "border-white/10 bg-dark-card text-muted hover:border-white/25 hover:text-offwhite"
  }`;

function ExperienceCard({
  place, copy, fr, language, onOpen, onBook, index = 0,
}: {
  place: RecommendedPlace;
  copy: ExperienceCopy;
  fr: boolean;
  language: string;
  onOpen: () => void;
  onBook: () => void;
  /** Position in the grid — offsets this card's photo cycle. */
  index?: number;
}) {
  const duration = formatDuration(place.durationMinutes);
  const cover = place.image || place.images?.[0];
  // The facts a customer compares, on one line, in the order they compare them.
  const facts = [
    duration,
    place.maxGuests ? (fr ? `jusqu'à ${place.maxGuests}` : `up to ${place.maxGuests}`) : null,
  ].filter(Boolean);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-colors hover:border-white/25">
      <button
        onClick={onOpen}
        className="relative aspect-[4/3] w-full overflow-hidden bg-dark text-left"
        aria-label={place.name}
      >
        {cover ? (
          <AutoPhotos
            images={[place.image, ...(place.images ?? [])]}
            alt={place.name}
            sizes="(max-width: 640px) 100vw, 340px"
            stagger={index}
            className="transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted/40">
            <ImageOff size={24} />
          </span>
        )}
        {place.featured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-dark/80 px-2 py-1 font-bebas text-[10px] tracking-[0.15em] text-yellow backdrop-blur-sm">
            <Sparkles size={9} /> {fr ? "À LA UNE" : "FEATURED"}
          </span>
        )}
        {/* Photo count, so a gallery announces itself rather than hiding behind
            a tap nobody makes. */}
        {(place.images?.length ?? 0) > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-dark/80 px-2 py-1 font-dm text-[10px] text-offwhite backdrop-blur-sm">
            {place.images!.length} photos
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="font-syne text-base font-extrabold leading-tight text-offwhite">{place.name}</h3>

        {place.providerName && (
          <p className="mt-0.5 font-dm text-xs text-muted">
            {fr ? "avec" : "with"} {place.providerName}
          </p>
        )}

        {facts.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-xs text-muted">
            {duration && (
              <span className="inline-flex items-center gap-1"><Clock size={11} /> {duration}</span>
            )}
            {place.maxGuests && (
              <span className="inline-flex items-center gap-1"><Users size={11} /> {place.maxGuests}</span>
            )}
          </p>
        )}

        {/* One line of description, never a paragraph. The detail modal is
            where the long version lives, and it is one tap away. */}
        <p className="mt-1.5 line-clamp-2 font-dm text-xs leading-snug text-muted">
          {loc(language as never, place.description, place.descriptionFr, place.descriptionCr)}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            {place.priceNote ? (
              <p className="truncate font-syne text-sm font-extrabold text-yellow">{place.priceNote}</p>
            ) : (
              <p className="font-dm text-xs text-muted">{fr ? "Prix sur demande" : "Price on request"}</p>
            )}
          </div>
          <button
            onClick={place.bookable ? onBook : onOpen}
            className="shrink-0 rounded-xl bg-yellow px-3.5 py-2 font-dm text-xs font-bold text-dark transition-opacity hover:opacity-90"
          >
            {place.bookable ? (fr ? "Réserver" : "Book") : fr ? copy.ctaFr : copy.cta}
          </button>
        </div>
      </div>
    </article>
  );
}
