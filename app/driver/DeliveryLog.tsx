"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  History,
  Loader2,
  Package,
  XCircle,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { ERRAND_LABEL, isErrandKind } from "@/lib/delivery/kind";

// ── The last 30 days ────────────────────────────────────────────────────────
//
// The owner: "for delivery dashboards, logs should be kept for 30 days."
//
// There was no log at all. The dashboard shows work IN FLIGHT, two counters for
// TODAY and lifetime totals — so the moment a job was delivered it left the only
// screen a driver has. Somebody asking "how much did I make last week" or "did
// I ever take something to that address" had nowhere to look, and neither did
// the owner when a driver queried their pay.
//
// Nothing had to be retained to fix it: `deliveries` has kept every row all
// along. What was missing was a way to READ it.
//
// ── CLOSED BY DEFAULT, AND LOADED ONLY WHEN OPENED ────────────────────────
// The dashboard polls every 20 seconds. A month of finished work does not
// change on that cadence, and shipping it on every tick would spend a driver's
// island data re-downloading history they are not looking at. So the fetch
// happens on the first open, once.

type Row = {
  id: string;
  status: string;
  finishedAt: string | null;
  earning: number | null;
  what: string;
  requestKind: string | null;
  errandKind: string | null;
  jobKind: "direct" | "store";
  failureReason: string | null;
};

type Totals = {
  jobs: number;
  delivered: number;
  earned: number;
  errands: number;
};

type Log = { days: number; rows: Row[]; totals: Totals | null };

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

export default function DeliveryLog({ only }: { only?: "errand" }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<Log | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/driver/log?days=30", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load your history.");
      setLog(body as Log);
      setError(null);
    } catch (e) {
      // Named, never swallowed: an empty history and a failed request look
      // identical on screen, and telling a driver they earned nothing last
      // month when the fetch simply failed is the worse of the two.
      setError(e instanceof Error ? e.message : "Could not load your history.");
    } finally {
      setBusy(false);
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !log && !busy) void load();
  }

  const rows = (log?.rows ?? []).filter((r) =>
    only === "errand" ? r.requestKind === "errand" : true,
  );

  return (
    <section className="mt-6">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-dark-card px-4 text-left transition-colors hover:border-yellow/40"
      >
        <History size={16} className="shrink-0 text-yellow" aria-hidden />
        <span className="flex-1 font-syne text-sm font-bold text-offwhite">
          Last 30 days
        </span>
        {log?.totals && (
          <span className="font-dm text-xs tabular-nums text-muted">
            {only === "errand" ? rows.length : log.totals.jobs} job
            {(only === "errand" ? rows.length : log.totals.jobs) === 1 ? "" : "s"}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          {busy && !log && (
            <p className="flex items-center gap-2 px-1 py-3 font-dm text-sm text-muted">
              <Loader2 size={15} className="animate-spin" /> Loading your history…
            </p>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="font-dm text-sm text-red-200">{error}</p>
              <button
                onClick={() => void load()}
                className="mt-2 rounded-full border border-white/15 px-3 py-1 font-dm text-xs text-offwhite hover:border-yellow/40"
              >
                Try again
              </button>
            </div>
          )}

          {log && !error && rows.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-dark-card px-4 py-6 text-center font-dm text-sm text-muted">
              Nothing finished in the last 30 days yet.
            </p>
          )}

          {log?.totals && rows.length > 0 && (
            <>
              {/* Earnings first: it is the number a driver opened this for.
                  Counted from DELIVERED jobs only — a cancelled job still
                  carries an earning on its row, and including it would show
                  somebody money they were never paid. */}
              <div className="flex items-baseline justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3">
                <span className="font-dm text-sm text-muted">
                  {log.totals.delivered} completed
                  {only !== "errand" && log.totals.errands > 0 && (
                    <> · {log.totals.errands} errands</>
                  )}
                </span>
                <span className="font-syne text-lg font-bold tabular-nums text-yellow">
                  Rs {centsToDecimalString(log.totals.earned)}
                </span>
              </div>

              <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                {rows.map((r) => {
                  const done = r.status === "delivered";
                  const Icon = r.requestKind === "errand" ? ClipboardCheck : Package;
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                      <Icon
                        size={15}
                        className={`mt-0.5 shrink-0 ${done ? "text-muted" : "text-red-400/70"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-dm text-sm text-offwhite">
                          {r.what}
                        </span>
                        <span className="mt-0.5 block font-dm text-xs text-muted">
                          {day(r.finishedAt)}
                          {isErrandKind(r.errandKind) && (
                            <> · {ERRAND_LABEL[r.errandKind]}</>
                          )}
                          {!done && (
                            <>
                              {" · "}
                              <span className="text-red-300">
                                {r.status.replace(/_/g, " ")}
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
                          // Never a number here. A cancelled job's row still
                          // carries driver_earning, and printing it beside the
                          // word "cancelled" reads as money owed.
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
