"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { LiveDestination } from "@/lib/esim/service";
import { DESTINATIONS, HOME_CODE, destinationPath, type Destination } from "@/lib/esim/destinations";
import { formatEur } from "@/lib/esim/pricing";
import { COPY, type UiLang } from "./copy";

// ── "Travelling beyond Mauritius?" — one swipeable row (M226) ────────────────
//
// The store is a Mauritius & Rodrigues store first; this is the door for the
// second trip (the Réunion weekend, the Paris connection, the flight home).
// It was a 25-tile grid 1,512px tall on a phone — longer than the plans, the
// how-to and the FAQ together. Now it is one row of the same arrivals-board
// tiles that scrolls sideways, with the search above it doing the work of
// the grid: typing "jap" leaves Japan alone in the row. Every destination is
// still a real link in the HTML, so crawlers see the same 25 doors.
//
// Only destinations with a plan on sale appear (public_esim_destinations),
// each with its real "from" price, so no tile leads to an empty shelf.

export default function DestinationGrid({
  lang,
  live,
  current,
}: {
  lang: UiLang;
  live: LiveDestination[];
  current: Destination;
}) {
  const t = COPY[lang];
  const [q, setQ] = useState("");
  const home = current.code === HOME_CODE;

  const items = useMemo(() => {
    const byCode = new Map(live.map((l) => [l.code, l]));
    // Registry order (Indian Ocean first, then the places people fly in from),
    // not alphabetical: the neighbours are what a Rodrigues traveller wants.
    return DESTINATIONS.filter((d) => d.code !== current.code && byCode.has(d.code)).map((d) => ({ d, l: byCode.get(d.code)! }));
  }, [live, current.code]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(({ d }) => `${d.en} ${d.fr} ${d.code}`.toLowerCase().includes(needle));
  }, [items, q]);

  if (items.length === 0) return null;

  return (
    <section id="esim-destinations" aria-labelledby="esim-destinations-title" className="scroll-mt-20 pt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="esim-destinations-title" className="font-syne text-[1.125rem] font-bold leading-tight text-offwhite">
          {home ? t.destTitleHome : t.destTitleWorld}
        </h2>
        <span className="shrink-0 font-dm text-xs text-muted">{t.destCount(items.length)}</span>
      </div>

      {items.length > 8 && (
        <label className="relative mt-3 block">
          <span className="sr-only">{t.destSearch}</span>
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.destSearch}
            className="w-full rounded-xl border border-dark-border bg-dark-card py-2.5 pl-10 pr-4 font-dm text-base text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
          />
        </label>
      )}

      {shown.length === 0 ? (
        <p className="mt-3 font-dm text-sm text-muted">{t.destNone}</p>
      ) : (
        // Bleeds to the screen edges so the next tile peeks in — the cue that
        // the row scrolls — while the first tile still lines up with the page.
        <ul className="rr-esim-rail -mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto overscroll-x-contain px-5 pb-1">
          {shown.map(({ d, l }) => (
            <li key={d.code} className="w-[6.5rem] shrink-0 snap-start">
              {/* The country code is the design (the boarding-pass system's own
                  device), which also sidesteps Windows drawing flag emoji as
                  two plain letters. */}
              <Link
                href={destinationPath(d, lang)}
                className="group flex h-full min-h-[4.75rem] flex-col justify-between rounded-2xl border border-white/10 bg-[#111111] px-3 py-2.5 transition-colors duration-200 hover:border-yellow/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow/60"
              >
                <span className="font-bebas text-[1.5rem] leading-none tracking-[0.08em] text-offwhite transition-colors group-hover:text-yellow">{d.code}</span>
                {/* Wraps rather than truncates ("United Arab Emirates" is wider
                    than the tile); the row stretches every tile to the tallest. */}
                <span className="mt-1.5 block font-dm text-[12px] font-semibold leading-tight text-offwhite/90">{lang === "en" ? d.en : d.fr}</span>
                <span className="font-dm text-[11px] text-muted">{t.destFrom(formatEur(l.fromEurCents, lang))}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
