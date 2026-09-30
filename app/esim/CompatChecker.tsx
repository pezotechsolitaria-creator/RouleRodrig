"use client";

import { useMemo, useState } from "react";
import { Check, Search, Smartphone } from "lucide-react";
import { searchDevices, ESIM_DEVICES } from "@/lib/esim/devices";
import { esimTrack } from "@/lib/esim/analytics";
import { COPY, type UiLang } from "./copy";

// "Will it work on my phone?" — the question that decides whether a sale
// becomes a refund. The *#06# test comes FIRST because it is the one answer
// that is never wrong; the model list is the quick reassurance for everybody
// who already knows their phone is recent.

export default function CompatChecker({ lang, compact = false }: { lang: UiLang; compact?: boolean }) {
  const t = COPY[lang];
  const [q, setQ] = useState("");
  const results = useMemo(() => searchDevices(q), [q]);
  const searching = q.trim().length > 0;

  return (
    <div className={compact ? "" : "rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5"}>
      <p className="flex items-start gap-2.5 font-dm text-sm text-offwhite/90">
        <Smartphone size={18} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
        <span>{t.compatTest}</span>
      </p>
      <p className="mt-2 pl-7 font-dm text-xs text-muted">{t.compatUnlocked}</p>

      <label className="relative mt-4 block">
        <span className="sr-only">{t.compatSearch}</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => {
            if (searching) esimTrack.compatChecked({ query_len: q.trim().length, results: results.length });
          }}
          placeholder={t.compatSearch}
          className="w-full rounded-xl border border-dark-border bg-dark-card py-3 pl-10 pr-4 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
        />
      </label>

      {searching && (
        <div className="mt-3" aria-live="polite">
          {results.length === 0 ? (
            <p className="font-dm text-sm text-muted">{t.compatNone}</p>
          ) : (
            <ul className="space-y-3">
              {results.map((f) => (
                <li key={f.brand}>
                  <p className="font-bebas text-[11px] tracking-[0.25em] text-muted">{f.brand.toUpperCase()}</p>
                  <ul className="mt-1 space-y-1">
                    {f.models.map((m) => (
                      <li key={m} className="flex items-start gap-2 font-dm text-sm text-offwhite/90">
                        <Check size={15} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
                        {m}
                      </li>
                    ))}
                  </ul>
                  {f.note && <p className="mt-1 font-dm text-xs text-muted">{f.note[lang]}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!searching && !compact && (
        <p className="mt-3 font-dm text-xs text-muted">
          {ESIM_DEVICES.map((f) => f.brand).join(" · ")}
        </p>
      )}
    </div>
  );
}
