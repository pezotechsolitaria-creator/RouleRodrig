"use client";

import { useCallback, useState } from "react";
import {
  Car,
  CheckCircle2,
  ChevronDown,
  History,
  Loader2,
  XCircle,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

// ── A taxi driver's last 30 days ────────────────────────────────────────────
//
// The owner: "DO LOGS FOR TAXI TOO."
//
// The third console to get one. Same story as the delivery and kitchen logs:
// nothing needed retaining, `ride_requests` has kept every row all along — the
// driver's home just shows what is happening NOW, so "how many airport runs did
// I do this month" had no answer anywhere.
//
// Closed by default and fetched on the first open. The home screen re-reads
// itself while a driver is working; a month of finished rides does not change
// on that cadence and would be re-downloaded for nothing.
//
// ── THE SAME MONEY RULE AS THE OTHER TWO ───────────────────────────────────
// `earned` counts COMPLETED rides only. A cancelled ride still carries
// quoted_price on its row, and this is the number a driver would quote back at
// the platform — so it may never be the optimistic reading.

type Row = {
  id: string;
  status: string;
  service: string;
  finishedAt: string | null;
  earning: number | null;
  from: string | null;
  to: string | null;
  passengers: number | null;
  noShow: boolean;
};

type Totals = {
  jobs: number;
  completed: number;
  cancelled: number;
  noShows: number;
  earned: number;
};

type ByService = { service: string; jobs: number; earned: number };

type Log = { days: number; rows: Row[]; totals: Totals | null; byService: ByService[] };

const RANGES = [7, 30, 90] as const;

const SERVICE_LABEL: Record<string, string> = {
  taxi: "Taxi",
  airport: "Airport",
  hotel: "Hotel",
  ferry: "Ferry",
  private: "Private hire",
};

/** "Fri 5 Sep" — the day is what a driver is looking for, not the minute. */
function day(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Indian/Mauritius",
  });
}

export default function RideLog({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(30);
  const [cache, setCache] = useState<Record<number, Log>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const log = cache[days] ?? null;

  const load = useCallback(
    async (d: number) => {
      setBusy(true);
      try {
        const res = await fetch(
          `/api/driver-home?log=1&t=${encodeURIComponent(token)}&days=${d}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Could not load your history.");
        const body = (await res.json()) as Log;
        setCache((c) => ({ ...c, [d]: body }));
        setError(null);
      } catch (e) {
        // Named. An empty month and a failed request look identical, and
        // "you earned nothing" is the worse of the two to say by accident.
        setError(e instanceof Error ? e.message : "Could not load your history.");
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !log && !busy) void load(days);
  }

  function choose(d: number) {
    setDays(d);
    setError(null);
    if (!cache[d]) void load(d);
  }

  const t = log?.totals;

  return (
    <section className="mt-6">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-dark-card px-4 text-left transition-colors hover:border-yellow/40"
      >
        <History size={16} className="shrink-0 text-yellow" aria-hidden />
        <span className="flex-1 font-syne text-sm font-bold text-offwhite">
          Last {days} days
        </span>
        {t && (
          <span className="font-dm text-xs tabular-nums text-muted">
            {t.completed} ride{t.completed === 1 ? "" : "s"}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          <div className="mb-2 flex gap-1.5">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => choose(d)}
                aria-pressed={days === d}
                className={`min-h-[36px] flex-1 rounded-xl font-dm text-xs transition-colors ${
                  days === d
                    ? "bg-yellow font-bold text-dark"
                    : "border border-white/15 text-muted hover:border-yellow/40"
                }`}
              >
                {d} days
              </button>
            ))}
          </div>

          {busy && !log && (
            <p className="flex items-center gap-2 px-1 py-3 font-dm text-sm text-muted">
              <Loader2 size={15} className="animate-spin" /> Loading…
            </p>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="font-dm text-sm text-red-200">{error}</p>
              <button
                onClick={() => void load(days)}
                className="mt-2 rounded-full border border-white/15 px-3 py-1 font-dm text-xs text-offwhite hover:border-yellow/40"
              >
                Try again
              </button>
            </div>
          )}

          {log && !error && (t?.jobs ?? 0) === 0 && (
            <p className="rounded-2xl border border-white/10 bg-dark-card px-4 py-6 text-center font-dm text-sm text-muted">
              No finished rides in the last {days} days.
            </p>
          )}

          {log && !error && (t?.jobs ?? 0) > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3">
                <span className="font-dm text-sm text-muted">
                  {t?.completed} completed
                  {(t?.cancelled ?? 0) > 0 && (
                    <span className="text-red-300"> · {t?.cancelled} cancelled</span>
                  )}
                </span>
                <span className="font-syne text-lg font-bold tabular-nums text-yellow">
                  Rs {centsToDecimalString(t?.earned ?? 0)}
                </span>
              </div>

              {/* Which work actually pays. An airport run and a town taxi are
                  different afternoons, and the split is the thing a driver
                  plans around. */}
              {log.byService.length > 1 && (
                <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                  {log.byService.map((s) => (
                    <li
                      key={s.service}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="font-dm text-sm text-offwhite">
                        {SERVICE_LABEL[s.service] ?? s.service}
                      </span>
                      <span className="font-dm text-xs tabular-nums text-muted">
                        {s.jobs} · Rs {centsToDecimalString(s.earned)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                {log.rows.map((r) => {
                  const done = r.status === "completed";
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                      <Car
                        size={15}
                        className={`mt-0.5 shrink-0 ${done ? "text-muted" : "text-red-400/70"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-dm text-sm text-offwhite">
                          {r.from} → {r.to}
                        </span>
                        <span className="mt-0.5 block font-dm text-xs text-muted">
                          {day(r.finishedAt)} · {SERVICE_LABEL[r.service] ?? r.service}
                          {!done && (
                            <>
                              {" · "}
                              <span className="text-red-300">
                                {r.noShow ? "no show" : "cancelled"}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {done ? (
                          <span className="font-dm text-sm tabular-nums text-offwhite">
                            Rs {centsToDecimalString(r.earning ?? 0)}
                          </span>
                        ) : (
                          // Never a number here. A cancelled ride still carries
                          // its quoted price, and printing it beside the word
                          // "cancelled" reads as money owed.
                          <span className="font-dm text-xs text-muted">—</span>
                        )}
                        <span className="mt-0.5 block">
                          {done ? (
                            <CheckCircle2 size={12} className="ml-auto text-green-400/70" />
                          ) : (
                            <XCircle size={12} className="ml-auto text-red-400/60" />
                          )}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
