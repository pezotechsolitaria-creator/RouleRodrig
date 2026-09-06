"use client";

import { useCallback, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import DeliveryLogView, {
  type DeliveryLogData,
} from "@/components/delivery/DeliveryLogView";

// ── One driver's last 30 days, on the owner's side ──────────────────────────
//
// The owner: "add the driver 30 day log to admin too."
//
// The reason it belongs here is the reason it exists at all. A driver asks what
// they are owed for last week; until now the only person who could see that was
// the driver, on their own phone, and the owner had to take their word for it or
// go reading the deliveries table. Both people now open the same numbers.
//
// "The same" is load-bearing, not a figure of speech. admin_driver_log and
// driver_delivery_log both call delivery_log_for, and both screens draw the
// rows with DeliveryLogView — so a change to what counts as finished, or to
// whether a cancelled job's earning is summed, cannot land on one side only.
// A pay dispute settled by two screens that disagree is worse than no screen.
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
  const [log, setLog] = useState<DeliveryLogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/deliveries?driverLog=${encodeURIComponent(driverId)}&days=30`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load that history.");
      setLog(body as DeliveryLogData);
      setError(null);
    } catch (e) {
      // Named. "This driver did nothing for a month" and "the request failed"
      // look identical, and the first is the one you must not say by accident
      // about somebody asking to be paid.
      setError(e instanceof Error ? e.message : "Could not load that history.");
    } finally {
      setBusy(false);
    }
  }, [driverId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !log && !busy) void load();
  }

  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-[38px] w-full items-center gap-2 rounded-xl border border-white/10 px-3 text-left font-dm text-xs text-muted transition-colors hover:border-yellow/40 hover:text-offwhite"
      >
        <History size={13} className="shrink-0 text-yellow/70" aria-hidden />
        <span className="flex-1">Last 30 days</span>
        {log?.totals && (
          <span className="tabular-nums">
            {log.totals.delivered} completed
          </span>
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          {busy && !log && (
            <p className="flex items-center gap-2 px-1 py-2 font-dm text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="font-dm text-xs text-red-200">{error}</p>
              <button
                onClick={() => void load()}
                className="mt-1.5 rounded-full border border-white/15 px-2.5 py-1 font-dm text-[11px] text-offwhite hover:border-yellow/40"
              >
                Try again
              </button>
            </div>
          )}

          {log && !error && (
            <DeliveryLogView
              data={log}
              emptyText={`${driverName} has finished nothing in the last 30 days.`}
            />
          )}
        </div>
      )}
    </div>
  );
}
