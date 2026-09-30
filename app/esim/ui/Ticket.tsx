"use client";

import { ArrowRight } from "lucide-react";
import type { PublicPlan } from "@/lib/esim/service";
import { dataLabel, daysLabel, usageHint } from "@/lib/esim/format";
import { formatEur, eurCentsPerGb } from "@/lib/esim/pricing";
import { COPY, type UiLang } from "../copy";

// ── A plan, as a boarding pass ───────────────────────────────────────────────
//
// The motif is literal: this is the document that gets you onto the network
// when you land. The main body carries what you get (data, days, network);
// a perforated stub carries what it costs and the action. The perforation is
// drawn with two punched notches in the page colour and a dashed 1px rule —
// structure, not ornament: it separates the two things a shopper compares.
//
// The whole ticket is one button (a big, forgiving target on a phone); its
// accessible name states data, days and price in one sentence.

export default function Ticket({
  plan: p,
  lang,
  code,
  networks,
  index,
  featured,
  onChoose,
}: {
  plan: PublicPlan;
  lang: UiLang;
  /** Short destination code on the pass: "RRG" for Rodrigues, else ISO-2. */
  code: string;
  networks: string[];
  index: number;
  featured: boolean;
  onChoose: (p: PublicPlan) => void;
}) {
  const t = COPY[lang];
  const data = dataLabel(p.data_mb, lang);
  const days = daysLabel(p.validity_days, lang);
  const price = formatEur(p.retail_eur_cents, lang);
  const perGb = !p.per_day ? eurCentsPerGb(p.retail_eur_cents, p.data_mb) : null;
  const abroad = p.country_codes.length - 1;
  const badge = p.badge ? (t.badges[p.badge] ?? null) : null;

  return (
    <li className="rr-esim-ticket" style={{ ["--i" as string]: index }}>
      <button
        type="button"
        onClick={() => onChoose(p)}
        aria-label={`${data}${p.per_day ? (lang === "en" ? " per day" : " par jour") : ""}, ${days}, ${price}`}
        className={`group relative flex w-full overflow-hidden rounded-2xl border text-left transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow/70 ${
          featured
            ? "border-yellow/45 bg-[linear-gradient(180deg,rgba(245,200,66,0.09),rgba(245,200,66,0.02)_60%),#111111] shadow-[0_18px_40px_-24px_rgba(245,200,66,0.45)]"
            : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01)_60%),#111111] hover:border-white/20"
        }`}
      >
        {/* ── Main body ── */}
        <span className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3.5">
          <span className="flex items-center gap-2">
            <span className="font-bebas text-[11px] leading-none tracking-[0.24em] text-muted">
              {t.pass} · {code}
            </span>
            {badge && (
              <span
                className={`rounded-full px-2 py-[3px] font-bebas text-[10px] leading-none tracking-[0.16em] ${
                  featured ? "bg-yellow text-dark" : "border border-white/15 text-offwhite/85"
                }`}
              >
                {badge.toUpperCase()}
              </span>
            )}
          </span>
          <span
            className={`mt-2.5 whitespace-nowrap font-syne font-extrabold leading-none tracking-[-0.01em] text-offwhite ${
              data.length > 5 ? "text-[1.75rem]" : "text-[2.125rem]"
            }`}
          >
            {data}
          </span>
          <span className="mt-2 font-dm text-sm text-offwhite/85">
            {p.per_day ? t.perDayDays(days) : days}
            {networks.length > 0 && <span className="text-muted"> · {networks.slice(0, 2).join(" · ")}</span>}
          </span>
          <span className="mt-1 font-dm text-xs leading-snug text-muted">{usageHint(p, lang)}</span>
          {abroad > 0 && <span className="mt-1 font-dm text-[11px] text-muted">{t.abroad(abroad)}</span>}
        </span>

        {/* ── Perforation ── */}
        <span aria-hidden className="pointer-events-none absolute bottom-3 right-[7.75rem] top-3 border-l border-dashed border-white/15" />
        <span aria-hidden className="pointer-events-none absolute right-[7.75rem] top-0 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border border-white/10 bg-dark" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-[7.75rem] h-4 w-4 translate-x-1/2 translate-y-1/2 rounded-full border border-white/10 bg-dark" />

        {/* ── Stub ── */}
        <span className="flex w-[7.75rem] shrink-0 flex-col items-center justify-center gap-1 px-2.5 py-4 text-center">
          {/* MEASURED at 375px: Syne's wide numerals put "€23.90" at 1.3rem past a
              7rem stub. Longer prices step down; the stub is 7.75rem. */}
          <span className={`whitespace-nowrap font-syne font-extrabold leading-none text-offwhite ${price.length > 6 ? "text-[1.05rem]" : "text-[1.2rem]"}`}>
            {price}
          </span>
          {perGb && (
            <span className="font-dm text-[11px] text-muted">
              {formatEur(perGb, lang)} {t.perGb}
            </span>
          )}
          <span
            className={`mt-2.5 inline-flex min-h-9 items-center gap-1 rounded-full px-3.5 font-syne text-[13px] font-bold transition-colors ${
              featured ? "bg-yellow text-dark group-hover:bg-yellow-dark" : "border border-yellow/35 text-yellow group-hover:bg-yellow/10"
            }`}
          >
            {t.choose} <ArrowRight size={13} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </span>
      </button>
    </li>
  );
}
