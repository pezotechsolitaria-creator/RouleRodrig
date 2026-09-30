"use client";

import { ArrowRight } from "lucide-react";
import type { PublicPlan } from "@/lib/esim/service";
import { dataLabel, daysLabel, usageHint } from "@/lib/esim/format";
import { formatEur } from "@/lib/esim/pricing";
import { COPY, type UiLang } from "../copy";

// ── A plan, as a compact boarding pass (M226) ────────────────────────────────
//
// Four of these must fit in the first phone screen under the hero, so a pass
// is ONE row: what you get on the body (data, days, what it covers), what it
// costs and the action on a perforated stub. Everything a shopper compares
// sits on the same two baselines, card after card.
//
// The badge is a tab on the top edge, not a line inside: it marks a pass
// without making it taller. The whole pass is one button (a big, forgiving
// target for a thumb); its accessible name says badge, data, days and price
// in one sentence, because the tab itself is decorative.

export default function Ticket({
  plan: p,
  lang,
  featured,
  onChoose,
  cta,
}: {
  plan: PublicPlan;
  lang: UiLang;
  featured: boolean;
  onChoose: (p: PublicPlan) => void;
  /** The stub's action label; "Notify me" while sales are closed (M229). */
  cta?: string;
}) {
  const t = COPY[lang];
  const data = dataLabel(p.data_mb, lang);
  const days = daysLabel(p.validity_days, lang);
  const price = formatEur(p.retail_eur_cents, lang);
  const badge = p.badge ? (t.badges[p.badge] ?? null) : null;
  const perDay = p.per_day ? (lang === "en" ? " per day" : " par jour") : "";

  return (
    <li className="relative">
      {badge && (
        <span
          aria-hidden
          className={`absolute -top-2 left-4 z-[1] rounded-full px-2 py-[3px] font-bebas text-[10px] leading-none tracking-[0.16em] ${
            featured ? "bg-yellow text-dark" : "border border-white/15 bg-dark text-offwhite/80"
          }`}
        >
          {badge.toUpperCase()}
        </span>
      )}
      <button
        type="button"
        onClick={() => onChoose(p)}
        aria-label={`${badge ? `${badge}: ` : ""}${data}${perDay}, ${days}, ${price}`}
        className={`group relative flex min-h-[4.75rem] w-full overflow-hidden rounded-2xl border text-left transition-[transform,border-color,background-color] duration-200 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow/70 ${
          featured
            ? "border-yellow/50 bg-[linear-gradient(100deg,rgba(245,200,66,0.10),rgba(245,200,66,0.02)_70%),#111111]"
            : "border-white/10 bg-[#111111] hover:border-white/20"
        }`}
      >
        {/* ── Body: what you get ── */}
        <span className="flex min-w-0 flex-1 flex-col justify-center py-3 pl-4 pr-3">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="whitespace-nowrap font-syne text-[1.5rem] font-extrabold leading-none tracking-[-0.01em] text-offwhite">{data}</span>
            <span className="whitespace-nowrap font-dm text-sm text-offwhite/80">{p.per_day ? t.perDayDays(days) : days}</span>
          </span>
          <span className="mt-1.5 font-dm text-xs leading-snug text-muted">{usageHint(p, lang)}</span>
        </span>

        {/* ── Perforation ── */}
        <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-[7rem] top-2.5 border-l border-dashed border-white/15" />
        <span aria-hidden className="pointer-events-none absolute right-[7rem] top-0 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full border border-white/10 bg-dark" />
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-[7rem] h-3.5 w-3.5 translate-x-1/2 translate-y-1/2 rounded-full border border-white/10 bg-dark" />

        {/* ── Stub: what it costs, and the action ── */}
        <span className="flex w-[7rem] shrink-0 flex-col items-center justify-center gap-1.5 px-2 py-2.5">
          {/* DM Sans, tabular: Syne's numerals run ~1em each, so "€23.90" at
              18px was 107px in a 96px stub (MEASURED). At 20px DM Sans every
              price from "€6.90" to "149,90 €" is 57–82px, and the prices line
              up digit for digit down the list. */}
          <span className="whitespace-nowrap font-dm text-[1.25rem] font-semibold leading-none tracking-[-0.01em] text-offwhite tabular-nums">{price}</span>
          <span
            className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 font-syne text-[13px] font-bold transition-colors ${
              featured ? "bg-yellow text-dark group-hover:bg-yellow-dark" : "border border-yellow/35 text-yellow group-hover:bg-yellow/10"
            }`}
          >
            {cta ?? t.choose} <ArrowRight size={13} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </span>
      </button>
    </li>
  );
}
