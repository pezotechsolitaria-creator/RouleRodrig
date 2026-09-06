"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

// ── What sold, after today ──────────────────────────────────────────────────
//
// The board is capped at 24 hours, and that cap is right: it is a live service
// screen, and a two-week-old ticket on it is noise a cook has to look past
// mid-rush. But it meant a kitchen could never answer the question it actually
// plans around — WHAT SHOULD I PREP ON FRIDAY — because everything it ever sold
// disappeared the next morning.
//
// Nothing had to be retained to fix that. The orders were always kept; there
// was no way to read them.
//
// ── TWO THINGS THIS DELIBERATELY DOES NOT SAY ──────────────────────────────
// There is no completion timestamp on an order — `collected` is a status, not a
// time — so TIME SPENT COOKING cannot be computed and is not shown. What the
// data honestly knows is how long a customer waited for somebody to say yes,
// which is a real number about a real failure, so that is the one reported.
//
// And money counts COLLECTED orders only. On the live rows this was the
// difference between Rs 5,330 and Rs 8,850 — one cancelled order would have
// overstated a kitchen's earnings by two thirds.

type Totals = {
  orders: number;
  collected: number;
  cancelled: number;
  earned: number;
  medianMinutesToAccept: number | null;
};

type Dish = {
  name: string;
  variant: string | null;
  qty: number;
  earned: number;
};

type Day = { date: string; orders: number; earned: number };

type Log = { days: number; totals: Totals | null; dishes: Dish[]; byDay: Day[] };

const RANGES = [7, 30, 90] as const;

/** "Fri 5 Sep" from a YYYY-MM-DD the server already put in island time. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function HistoryPanel() {
  const [days, setDays] = useState<number>(30);
  const [cache, setCache] = useState<Record<number, Log>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const log = cache[days] ?? null;

  const load = useCallback(async (d: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/kitchen?log=1&days=${d}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load the history.");
      setCache((c) => ({ ...c, [d]: body as Log }));
      setError(null);
    } catch (e) {
      // Named. An empty month and a failed request look identical, and telling
      // a cook they sold nothing is the worse thing to say by accident.
      setError(e instanceof Error ? e.message : "Could not load the history.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled && !cache[days]) await load(days);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, load]);

  const t = log?.totals;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`min-h-[36px] rounded-full px-3.5 font-dm text-xs transition-colors ${
                days === d
                  ? "bg-yellow font-bold text-dark"
                  : "border border-white/15 text-muted hover:border-yellow/40"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
        <button
          onClick={() => void load(days)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-yellow/40 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="flex items-start gap-2 font-dm text-sm text-red-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        </div>
      )}

      {busy && !log && (
        <p className="flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      )}

      {log && !error && (t?.orders ?? 0) === 0 && (
        <p className="rounded-2xl border border-white/10 bg-dark-card px-4 py-8 text-center font-dm text-sm text-muted">
          Nothing sold in the last {days} days.
        </p>
      )}

      {log && !error && (t?.orders ?? 0) > 0 && (
        <>
          <div className="flex items-baseline justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3">
            <span className="font-dm text-sm text-muted">
              {t?.collected} collected
              {(t?.cancelled ?? 0) > 0 && (
                <span className="text-red-300"> · {t?.cancelled} cancelled</span>
              )}
            </span>
            <span className="font-syne text-lg font-bold tabular-nums text-yellow">
              Rs {centsToDecimalString(t?.earned ?? 0)}
            </span>
          </div>

          {t?.medianMinutesToAccept != null && (
            // Not "how long the food took" — nothing records that. How long a
            // customer waited to hear yes, which is the number a kitchen can
            // actually act on.
            <p className="px-1 font-dm text-xs text-muted">
              Orders answered after{" "}
              <span className="text-offwhite">{t.medianMinutesToAccept} min</span> (median)
            </p>
          )}

          {/* The reason to open this screen at all. */}
          {log.dishes.length > 0 && (
            <section>
              <h3 className="px-1 font-syne text-sm font-bold text-offwhite">
                What sold
              </h3>
              <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                {log.dishes.map((d) => (
                  <li
                    key={`${d.name}|${d.variant ?? ""}`}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-[3ch] shrink-0 text-center font-syne text-lg font-extrabold tabular-nums text-yellow">
                      {d.qty}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-dm text-sm text-offwhite">
                        {d.name}
                      </span>
                      {d.variant && (
                        <span className="block font-dm text-xs text-muted">{d.variant}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-dm text-xs tabular-nums text-muted">
                      Rs {centsToDecimalString(d.earned)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {log.byDay.length > 0 && (
            <section>
              <h3 className="px-1 font-syne text-sm font-bold text-offwhite">By day</h3>
              <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                {log.byDay.map((d) => (
                  <li key={d.date} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="font-dm text-sm text-offwhite">{dayLabel(d.date)}</span>
                    <span className="font-dm text-xs tabular-nums text-muted">
                      {d.orders} order{d.orders === 1 ? "" : "s"} · Rs{" "}
                      {centsToDecimalString(d.earned)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
