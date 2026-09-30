"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { searchDevices, ESIM_DEVICES } from "@/lib/esim/devices";
import { esimTrack } from "@/lib/esim/analytics";
import { COPY, type UiLang } from "./copy";

// "Will it work on my phone?" — the question that decides whether a sale
// becomes a refund. The *#06# test comes FIRST, set as the one large object in
// the panel, because it is the one answer that is never wrong; the model list
// is the quick reassurance for everybody who already knows their phone is
// recent.
//
// `searchOnly` drops the *#06# block for places that already state the test in
// their own words (the FAQ answer it sits under) — never say it twice.

export default function CompatChecker({
  lang,
  compact = false,
  searchOnly = false,
}: {
  lang: UiLang;
  compact?: boolean;
  searchOnly?: boolean;
}) {
  const t = COPY[lang];
  const [q, setQ] = useState("");
  const results = useMemo(() => searchDevices(q), [q]);
  const searching = q.trim().length > 0;

  return (
    <div className={compact || searchOnly ? "" : "overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]"}>
      {!searchOnly && (
      <div className={compact ? "" : "px-5 pt-5"}>
        <div className="flex items-center gap-4">
          <span className="font-bebas text-[12px] tracking-[0.24em] text-muted">{t.compatDial.toUpperCase()}</span>
          <span className="rounded-xl border border-yellow/35 bg-yellow/[0.06] px-3.5 py-1.5 font-syne text-2xl font-extrabold leading-none tracking-[0.08em] text-yellow">
            *#06#
          </span>
        </div>
        <p className="mt-3 font-dm text-sm leading-relaxed text-offwhite/85">{t.compatCleared}</p>
        <p className="mt-1.5 font-dm text-xs leading-relaxed text-offwhite/55">{t.compatUnlocked}</p>
      </div>
      )}

      <div className={searchOnly ? "" : compact ? "mt-4" : "mt-5 border-t border-white/10 bg-black/40 px-5 pb-5 pt-4"}>
        <label className="relative block">
          <span className="sr-only">{t.compatSearch}</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => {
              if (searching) esimTrack.compatChecked({ query_len: q.trim().length, results: results.length });
            }}
            placeholder={t.compatSearch}
            className="w-full rounded-xl border border-dark-border bg-dark-card py-3 pl-10 pr-4 font-dm text-base text-offwhite placeholder:text-muted/70 focus:border-yellow focus:outline-none"
          />
        </label>

        {searching ? (
          <div className="mt-3" aria-live="polite">
            {results.length === 0 ? (
              <p className="font-dm text-sm text-offwhite/65">{t.compatNone}</p>
            ) : (
              <ul className="space-y-3">
                {results.map((f) => (
                  <li key={f.brand}>
                    <p className="font-bebas text-[12px] tracking-[0.22em] text-muted">{f.brand.toUpperCase()}</p>
                    <ul className="mt-1 space-y-1">
                      {f.models.map((m) => (
                        <li key={m} className="flex items-start gap-2 font-dm text-sm text-offwhite/90">
                          <Check size={15} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
                          {m}
                        </li>
                      ))}
                    </ul>
                    {f.note && <p className="mt-1 font-dm text-xs text-offwhite/55">{f.note[lang]}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          !compact && !searchOnly && (
            <p className="mt-3 font-dm text-xs leading-relaxed text-muted">{ESIM_DEVICES.map((f) => f.brand).join(" · ")}</p>
          )
        )}
      </div>
    </div>
  );
}
