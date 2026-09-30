"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { LiveDestination } from "@/lib/esim/service";
import { DESTINATIONS, HOME_CODE, destinationPath, type Destination } from "@/lib/esim/destinations";
import { formatEur } from "@/lib/esim/pricing";
import { COPY, type UiLang } from "./copy";

// ── "Travelling beyond Mauritius?" ───────────────────────────────────────────
//
// Below the fold on purpose: the store is a Mauritius & Rodrigues store first,
// and this is the door for the second trip — the Réunion weekend, the Paris
// connection, the flight home. Only destinations with a plan on sale appear
// (public_esim_destinations), each with its real "from" price, so there is
// never a card leading to an empty shelf.

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
    <section id="esim-destinations" aria-labelledby="esim-destinations-title" className="scroll-mt-32 pt-16">
      <h2 id="esim-destinations-title" className="font-syne text-[1.625rem] font-bold leading-tight text-offwhite">
        {home ? t.destTitleHome : t.destTitleWorld}
      </h2>
      <p className="mt-1.5 max-w-[56ch] font-dm text-sm leading-relaxed text-offwhite/65">{home ? t.destSubHome : t.destSubWorld}</p>

      {items.length > 8 && (
        <label className="relative mt-4 block">
          <span className="sr-only">{t.destSearch}</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.destSearch}
            className="w-full rounded-xl border border-dark-border bg-dark-card py-3 pl-10 pr-4 font-dm text-base text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
          />
        </label>
      )}

      {shown.length === 0 ? (
        <p className="mt-4 font-dm text-sm text-muted">{t.destNone}</p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {shown.map(({ d, l }) => (
            <li key={d.code}>
              {/* An arrivals-board tile: the country code is the design (the
                  boarding-pass system's own device), which also sidesteps
                  Windows drawing flag emoji as two plain letters. */}
              <Link
                href={destinationPath(d, lang)}
                className="group flex h-full min-h-[5.25rem] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-3.5 py-3 transition-[border-color,transform] duration-300 ease-out hover:-translate-y-0.5 hover:border-yellow/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow/60"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-bebas text-[1.75rem] leading-none tracking-[0.08em] text-offwhite transition-colors group-hover:text-yellow">
                    {d.code}
                  </span>
                  <span className="pt-1 font-dm text-[11px] text-muted">{t.destFrom(formatEur(l.fromEurCents, lang))}</span>
                </span>
                <span className="mt-2 block font-dm text-[13px] font-semibold leading-tight text-offwhite/90">{lang === "en" ? d.en : d.fr}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!home && (
        <Link
          href={destinationPath(DESTINATIONS[0], lang)}
          className="mt-4 inline-flex min-h-11 items-center font-dm text-sm text-yellow/80 underline underline-offset-4 hover:text-yellow"
        >
          {lang === "en" ? "Mauritius & Rodrigues eSIM (my.t 4G)" : "eSIM Maurice et Rodrigues (my.t 4G)"}
        </Link>
      )}
    </section>
  );
}
