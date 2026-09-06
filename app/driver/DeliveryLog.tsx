"use client";

import { useCallback, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import DeliveryLogView from "@/components/delivery/DeliveryLogView";
import {
  useDeliveryLog,
  LOG_RANGES,
  type LogRange,
} from "@/components/delivery/useDeliveryLog";

// ── What this driver actually did ───────────────────────────────────────────
//
// The owner: "for delivery dashboards, logs should be kept for 30 days."
//
// There was no log at all. The dashboard shows work IN FLIGHT, two counters for
// TODAY and lifetime totals — so a job left the only screen a driver has the
// moment it was delivered. "How much did I make last week" had nowhere to look,
// and neither did the owner when a driver queried their pay.
//
// Nothing had to be retained to fix it: `deliveries` has kept every row all
// along. What was missing was a way to READ it — so 30 days is a window, not a
// retention policy, and the other two ranges cost nothing to offer.
//
// ── CLOSED BY DEFAULT, AND LOADED ONLY WHEN OPENED ────────────────────────
// The dashboard polls every 20 seconds. A month of finished work does not
// change on that cadence, and shipping it on every tick would spend a driver's
// island data re-downloading history they are not looking at.
//
// The rows are drawn by the shared view and fetched through the shared hook,
// both of which /admin/deliveries also uses — the same commitment the SQL makes
// by sending both callers through delivery_log_for.

export default function DeliveryLog({ only }: { only?: "errand" }) {
  const [open, setOpen] = useState(false);
  const urlFor = useCallback((d: number) => `/api/driver/log?days=${d}`, []);
  const { days, log, error, busy, load, choose } = useDeliveryLog(
    urlFor,
    "Could not load your history.",
  );

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !log && !busy) void load(days);
  }

  const count =
    log === null
      ? null
      : only === "errand"
        ? log.rows.filter((r) => r.requestKind === "errand").length
        : (log.totals?.jobs ?? 0);

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
        {count !== null && (
          <span className="font-dm text-xs tabular-nums text-muted">
            {count} job{count === 1 ? "" : "s"}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          {/* The window. Inside the panel rather than on the header, so the
              collapsed row stays one line and one tap. */}
          <div className="mb-2 flex gap-1.5">
            {LOG_RANGES.map((d) => (
              <button
                key={d}
                onClick={() => choose(d as LogRange)}
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
              <Loader2 size={15} className="animate-spin" /> Loading your history…
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

          {log && !error && (
            <DeliveryLogView
              data={log}
              only={only}
              emptyText={`Nothing finished in the last ${days} days yet.`}
            />
          )}
        </div>
      )}
    </section>
  );
}
