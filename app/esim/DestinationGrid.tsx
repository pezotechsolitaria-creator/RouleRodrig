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
    <section aria-labelledby="esim-destinations" className="pt-12">
      <h2 id="esim-destinations" className="font-syne text-2xl font-bold text-offwhite">
        {home ? t.destTitleHome : t.destTitleWorld}
      </h2>
      <p className="mt-1 font-dm text-sm text-muted">{home ? t.destSubHome : t.destSubWorld}</p>

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
        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {shown.map(({ d, l }) => (
            <li key={d.code}>
              <Link
                href={destinationPath(d, lang)}
                className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors hover:border-yellow/40 focus-visible:ring-2 focus-visible:ring-yellow/60"
              >
                {/* Fixed width: Windows draws flag emoji as two letters, and
                    the names should line up whichever it draws. */}
                <span className="w-8 shrink-0 text-center text-2xl leading-none" aria-hidden>
                  {d.flag}
                </span>
                <span className="min-w-0">
                  <span className="block font-dm text-sm font-semibold leading-tight text-offwhite">{lang === "en" ? d.en : d.fr}</span>
                  <span className="mt-0.5 block font-dm text-xs text-muted">{t.destFrom(formatEur(l.fromEurCents, lang))}</span>
                </span>
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
          {DESTINATIONS[0].flag} {lang === "en" ? "Mauritius & Rodrigues eSIM (my.t 4G)" : "eSIM Maurice et Rodrigues (my.t 4G)"}
        </Link>
      )}
    </section>
  );
}
