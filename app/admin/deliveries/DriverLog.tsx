"use client";

import { useCallback, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import DeliveryLogView from "@/components/delivery/DeliveryLogView";
import {
  useDeliveryLog,
  LOG_RANGES,
  type LogRange,
} from "@/components/delivery/useDeliveryLog";

// ── One driver's history, on the owner's side ───────────────────────────────
//
// The owner: "add the driver 30 day log to admin too."
//
// The reason it belongs here is the reason it exists at all. A driver asks what
// they are owed for last week; until now the only person who could see that was
// the driver, on their own phone, and the owner had to take their word for it or
// go reading the deliveries table.
//
// "The same numbers" is load-bearing, not a figure of speech. admin_driver_log
// and driver_delivery_log both call delivery_log_for; both screens draw the rows
// with DeliveryLogView and fetch them through useDeliveryLog. So a change to
// what counts as finished, or to whether a cancelled job's earning is summed,
// cannot land on one side only. A pay dispute settled by two screens that
// disagree is worse than no screen.
//
// Fetched on demand, never with the board. The control centre re-reads itself
// every 15 seconds; loading a month of history for every driver on the roster,
// every tick, to render something nobody has opened is how a small admin page
// becomes a slow one.

export default function DriverLog({
  driverId,
  driverName,
}: {
  driverId: string;
  driverName: string;
}) {
  const [open, setOpen] = useState(false);
  const urlFor = useCallback(
    (d: number) =>
      `/api/admin/deliveries?driverLog=${encodeURIComponent(driverId)}&days=${d}`,
    [driverId],
  );
  const { days, log, error, busy, load, choose } = useDeliveryLog(
    urlFor,
    "Could not load that history.",
  );

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !log && !busy) void load(days);
  }

  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-[38px] w-full items-center gap-2 rounded-xl border border-white/10 px-3 text-left font-dm text-xs text-muted transition-colors hover:border-yellow/40 hover:text-offwhite"
      >
        <History size={13} className="shrink-0 text-yellow/70" aria-hidden />
        <span className="flex-1">Last {days} days</span>
        {log?.totals && (
          <span className="tabular-nums">{log.totals.delivered} completed</span>
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          <div className="mb-2 flex gap-1.5">
            {LOG_RANGES.map((d) => (
              <button
                key={d}
                onClick={() => choose(d as LogRange)}
                aria-pressed={days === d}
                className={`min-h-[32px] flex-1 rounded-lg font-dm text-[11px] transition-colors ${
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
            <p className="flex items-center gap-2 px-1 py-2 font-dm text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="font-dm text-xs text-red-200">{error}</p>
              <button
                onClick={() => void load(days)}
                className="mt-1.5 rounded-full border border-white/15 px-2.5 py-1 font-dm text-[11px] text-offwhite hover:border-yellow/40"
              >
                Try again
              </button>
            </div>
          )}

          {log && !error && (
            <DeliveryLogView
              data={log}
              emptyText={`${driverName} has finished nothing in the last ${days} days.`}
            />
          )}
        </div>
      )}
    </div>
  );
}
