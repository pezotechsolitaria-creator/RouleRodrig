"use client";

import { useCallback, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import DeliveryLogView, {
  type DeliveryLogData,
} from "@/components/delivery/DeliveryLogView";

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
//
// The rows are drawn by the SHARED view, which /admin/deliveries also uses —
// the same commitment the SQL makes by having both callers go through
// delivery_log_for. Two screens that exist to settle "what am I owed" must not
// be able to answer it differently.

export default function DeliveryLog({ only }: { only?: "errand" }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<DeliveryLogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/driver/log?days=30", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load your history.");
      setLog(body as DeliveryLogData);
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
          Last 30 days
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

          {log && !error && <DeliveryLogView data={log} only={only} />}
        </div>
      )}
    </section>
  );
}
