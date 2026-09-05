"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { Ticket, ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { centsToDecimalString } from "@/lib/money";

// ── "You can buy tickets here" ─────────────────────────────────────────────
//
// Events used to hold one of the six cards above the fold, and a card cannot
// say the one thing that matters: that the ticket is BOUGHT on this site, right
// now, rather than on a poster with a phone number. A visitor who does not
// already know the platform sells tickets reads "Events" as a listings page and
// never taps it.
//
// So events trades a card for a strip that can actually make the offer — the
// real next event, its date, its venue, and the price it starts at, with a
// button that says Buy tickets. That is the difference between a category and a
// product.
//
// It renders NOTHING when there is no upcoming event. An empty "Events"
// heading on the homepage is worse than no section: it advertises that the
// island has nothing on.

export type PromoEvent = {
  slug: string;
  name: string;
  coverUrl: string | null;
  startsAt: string;
  venueName: string | null;
  fromPrice: number | null;
  soldOut: boolean;
};

function dayLabel(iso: string, locale: string): { day: string; month: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString(locale, { day: "numeric", timeZone: "Indian/Mauritius" }),
    month: d.toLocaleDateString(locale, { month: "short", timeZone: "Indian/Mauritius" }).replace(".", ""),
  };
}

export default function EventsPromo({ events }: { events: PromoEvent[] }) {
  const { language } = useLanguage();
  const railRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  // Which card is centred, derived from scroll position rather than tracked by
  // a timer — the dots must follow the FINGER, not a schedule, or they lie the
  // moment somebody swipes.
  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    const step = card.offsetWidth + 12; // card + gap-3
    setPage(Math.round(el.scrollLeft / step));
  }, []);
  const L = (t: [string, string, string]) => (language === "fr" ? t[1] : language === "cr" ? t[2] : t[0]);
  const locale = language === "fr" ? "fr-FR" : "en-GB";

  if (events.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="font-syne text-base font-bold text-offwhite">
          {L(["Buy tickets on Roulé Rodrigues", "Billets sur Roulé Rodrigues", "Aste tiket lor Roulé Rodrigues"])}
        </h2>
        <Link href="/events" className="inline-flex items-center gap-1 font-dm text-xs text-yellow hover:underline">
          {L(["See all", "Voir tout", "Get tou"])} <ArrowRight size={13} />
        </Link>
      </div>

      {/* The promise, stated once and plainly — this is the line that tells a
          first-time visitor the platform sells tickets at all. */}
      <p className="mb-3 font-dm text-xs leading-relaxed text-muted">
        {L([
          "Reserve in seconds, then show the QR code at the gate. No paper ticket, no queue.",
          "Réservez en quelques secondes, puis présentez le QR code à l'entrée. Sans billet papier, sans file.",
          "Rezerv an detrwa segonn, apre montre QR code la ler ou rantre. Pena papie, pena lakhe.",
        ])}
      </p>

      <div
        ref={railRef}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {events.map((e) => {
          const { day, month } = dayLabel(e.startsAt, locale);
          return (
            <Link
              key={e.slug}
              href={`/events/${e.slug}`}
              className="group relative flex w-[290px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-colors hover:border-yellow/40 sm:w-[330px]"
            >
              <div className="relative h-[124px] w-[112px] shrink-0 overflow-hidden bg-dark">
                {e.coverUrl ? (
                  <Image
                    src={e.coverUrl}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-muted/40">
                    <Ticket size={20} />
                  </span>
                )}
                {/* The date block sits ON the image so the card reads as a
                    ticket stub rather than a generic listing tile. */}
                <span className="absolute left-1.5 top-1.5 flex flex-col items-center rounded-lg bg-dark/85 px-1.5 py-1 backdrop-blur-sm">
                  <span className="font-syne text-sm font-extrabold leading-none text-yellow">{day}</span>
                  <span className="font-bebas text-[9px] uppercase leading-none tracking-widest text-offwhite/80">
                    {month}
                  </span>
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center p-2.5">
                <p className="line-clamp-2 font-syne text-sm font-extrabold leading-tight text-offwhite">{e.name}</p>
                {e.venueName && (
                  <p className="mt-1 inline-flex items-center gap-1 truncate font-dm text-[11px] text-muted">
                    <MapPin size={10} className="shrink-0" /> {e.venueName}
                  </p>
                )}
                <p className="mt-auto pt-1.5 font-dm text-xs">
                  {e.soldOut ? (
                    <span className="font-semibold text-orange-300">{L(["Sold out", "Complet", "Fini vande"])}</span>
                  ) : e.fromPrice !== null ? (
                    <span className="inline-flex items-center gap-1 font-bold text-yellow">
                      <Ticket size={11} />
                      {L(["From", "Dès", "Depi"])} Rs {centsToDecimalString(e.fromPrice)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <CalendarDays size={11} /> {L(["Details", "Détails", "Detay"])}
                    </span>
                  )}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Dots, only when there is more than one card — a single dot is not a
          control, it is a full stop. Presentational: the rail is already
          keyboard- and screen-reader-navigable as a list of links. */}
      {events.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden>
          {events.map((e, i) => (
            <span
              key={e.slug}
              className={`h-1.5 rounded-full transition-all ${
                i === page ? "w-5 bg-yellow" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
