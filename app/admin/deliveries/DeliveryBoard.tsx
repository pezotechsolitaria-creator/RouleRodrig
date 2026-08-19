"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertTriangle, Phone, RefreshCw, Package,
  UserCheck, UserX, Clock, CheckCircle2,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { stallBoardLine } from "@/lib/delivery/escalation-copy";
import { Button } from "@/components/ui/button";

// ── The control centre ──────────────────────────────────────────────────────
//
// Built around EXCEPTIONS, not around a list. A healthy delivery needs no
// attention; this screen exists to surface the ones that do, before the
// customer notices. So anything late or stuck sorts to the top and is the only
// thing wearing colour — if the page is calm, nothing is wrong.

type Live = {
  id: string; orderNumber: string; status: string;
  storeName: string; storePhone: string | null;
  customerName: string | null; customerPhone: string | null;
  dropoffNote: string | null;
  driverId: string | null; driverName: string | null; driverPhone: string | null;
  earning: number; customerFee: number;
  createdAt: string; assignedAt: string | null;
  reassignments: number; failureReason: string | null; adminNote: string | null;
  lateBy: number; unclaimedFor: number; offersOut: number;
};
type Driver = {
  id: string; name: string; phone: string; status: string; availability: string;
  vehicle: string; appliedAt: string; statusReason: string | null;
  active: number; completed: number; onTime: number;
  cancellations: number; unresponsive: number; offers: number; accepted: number;
};
type Board = {
  live: Live[]; drivers: Driver[];
  counts: { searching: number; inFlight: number; exceptions: number; pendingDrivers: number };
};

const EXCEPTION = new Set([
  "driver_unresponsive", "driver_unavailable", "requires_admin",
  "failed_delivery", "returned_to_merchant",
]);

const LABEL: Record<string, string> = {
  created: "Created", searching_driver: "Looking for a driver", assigned: "Assigned",
  going_to_pickup: "Going to shop", arrived_at_pickup: "At the shop", picked_up: "Collected",
  out_for_delivery: "On the way", arrived: "At the customer", delivered: "Delivered",
  cancelled: "Cancelled", driver_unavailable: "Driver unavailable",
  driver_unresponsive: "Driver not responding", failed_delivery: "Failed",
  returned_to_merchant: "Returned to shop", requires_admin: "Needs you",
};

const CLOSE_OPTIONS = [
  { value: "returned_to_merchant", label: "Returned to the shop" },
  { value: "failed_delivery", label: "Failed — not delivered" },
  { value: "cancelled", label: "Cancel this delivery" },
];

export default function DeliveryBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmForce, setConfirmForce] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [closeStatus, setCloseStatus] = useState("returned_to_merchant");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"live" | "drivers">("live");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deliveries", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load the board.");
      setBoard(body as Board);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // A control centre showing five-minute-old state is worse than useless —
    // it tells an operator a problem is handled when it is not.
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function act(key: string, payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.needsForce) {
        // Not a failure — the guard doing its job. Ask the real question.
        setConfirmForce(String(payload.deliveryId));
        setError(body.error);
        return;
      }
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      setConfirmForce(null);
      setClosing(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="flex items-center gap-2 font-dm text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>;
  }

  const live = board?.live ?? [];
  const drivers = board?.drivers ?? [];
  const c = board?.counts;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["live", "drivers"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 font-dm text-sm font-medium transition-colors ${
                tab === t ? "bg-yellow text-dark" : "border border-white/12 text-muted hover:text-offwhite"}`}>
              {t === "live" ? `Deliveries (${live.length})` : `Drivers (${drivers.length})`}
              {t === "drivers" && (c?.pendingDrivers ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-orange-400 px-1.5 text-[10px] font-bold text-dark">
                  {c?.pendingDrivers}
                </span>
              )}
            </button>
          ))}
        </div>
        <button onClick={() => void act("sweep", { action: "sweep" })} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow disabled:opacity-40">
          {busy === "sweep" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Check for stalls
        </button>
      </div>

      {c && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { n: c.searching, l: "Looking for a driver", warn: c.searching > 0 },
            { n: c.inFlight, l: "On the way", warn: false },
            { n: c.exceptions, l: "Need you", warn: c.exceptions > 0 },
          ].map((s) => (
            <div key={s.l} className={`rounded-xl border p-3 ${s.warn && s.l === "Need you" ? "border-red-500/40 bg-red-500/[0.07]" : "border-white/10 bg-dark-card"}`}>
              <p className={`font-syne text-2xl font-extrabold ${s.warn && s.l === "Need you" ? "text-red-400" : ""}`}>{s.n}</p>
              <p className="font-dm text-[11px] text-muted">{s.l}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-orange-400/30 bg-orange-400/[0.07] px-4 py-3 font-dm text-sm text-orange-200">
          {error}
        </p>
      )}

      {tab === "live" ? (
        live.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
            <CheckCircle2 size={26} className="mx-auto text-green-400" />
            <p className="mt-2 font-syne text-base font-bold">Nothing in flight</p>
            <p className="mt-1 font-dm text-xs text-muted">Deliveries appear here the moment one is created.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {live.map((d) => {
              const isException = EXCEPTION.has(d.status);
              const isLate = d.lateBy > 0 || d.unclaimedFor > 10;
              return (
                <div key={d.id}
                  className={`rounded-2xl border p-4 ${
                    isException ? "border-red-500/40 bg-red-500/[0.06]"
                    : isLate ? "border-orange-400/35 bg-orange-400/[0.05]"
                    : "border-white/10 bg-dark-card"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{d.orderNumber}</p>
                      <p className="font-syne text-base font-bold">{d.storeName}</p>
                      {d.dropoffNote && <p className="font-dm text-xs text-muted">→ {d.dropoffNote}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 font-dm text-[11px] font-semibold ${
                      isException ? "bg-red-500/20 text-red-300"
                      : isLate ? "bg-orange-400/20 text-orange-200"
                      : "bg-white/10 text-offwhite"}`}>
                      {LABEL[d.status] ?? d.status}
                    </span>
                  </div>

                  {/* The one line that says why this row is here at all. */}
                  {(isLate || isException) && (
                    <p className="mt-2 flex items-center gap-1.5 font-dm text-xs text-orange-200">
                      <AlertTriangle size={12} />
                      {stallBoardLine(d)}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-dm text-xs text-muted">
                    <span>{d.driverName ? `Driver: ${d.driverName}` : "No driver yet"}</span>
                    <span>Rs {centsToDecimalString(d.customerFee)} · driver Rs {centsToDecimalString(d.earning)}</span>
                    {d.reassignments > 0 && <span className="text-orange-300">reassigned ×{d.reassignments}</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {d.driverPhone && (
                      <a href={`tel:${d.driverPhone.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs hover:border-yellow/50 hover:text-yellow">
                        <Phone size={12} /> Driver
                      </a>
                    )}
                    {d.customerPhone && (
                      <a href={`tel:${d.customerPhone.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs hover:border-yellow/50 hover:text-yellow">
                        <Phone size={12} /> Customer
                      </a>
                    )}
                    {d.storePhone && (
                      <a href={`tel:${d.storePhone.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs hover:border-yellow/50 hover:text-yellow">
                        <Phone size={12} /> Shop
                      </a>
                    )}
                    <button onClick={() => void act(`re-${d.id}`, { action: "reassign", deliveryId: d.id })}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs hover:border-yellow/50 hover:text-yellow disabled:opacity-40">
                      {busy === `re-${d.id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reassign
                    </button>
                    <button onClick={() => { setClosing(d.id); setNote(""); }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-3 py-1.5 font-dm text-xs text-red-400 hover:bg-red-500/10">
                      <Package size={12} /> Close out
                    </button>
                  </div>

                  {/* Forcing a reassignment when the driver holds the goods.
                      Asked as a question about the PACKAGE, not about the app. */}
                  {confirmForce === d.id && (
                    <div className="mt-3 rounded-xl border border-orange-400/40 bg-orange-400/[0.08] p-3">
                      <p className="font-dm text-xs text-orange-100">
                        Only do this once you know where the package is. The new driver will be sent to the
                        shop, not to {d.driverName ?? "the current driver"}.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setConfirmForce(null); setError(null); }}>
                          Cancel
                        </Button>
                        <button
                          onClick={() => void act(`ref-${d.id}`, { action: "reassign", deliveryId: d.id, force: true, note: "Admin confirmed package location" })}
                          disabled={busy !== null}
                          className="rounded-lg bg-orange-500 px-4 py-2 font-dm text-xs font-bold text-dark disabled:opacity-40">
                          {busy === `ref-${d.id}` ? <Loader2 size={12} className="animate-spin" /> : "I know where it is — reassign"}
                        </button>
                      </div>
                    </div>
                  )}

                  {closing === d.id && (
                    <div className="mt-3 rounded-xl border border-white/15 bg-dark p-3">
                      <p className="font-dm text-xs text-muted">How did this end?</p>
                      <select value={closeStatus} onChange={(e) => setCloseStatus(e.target.value)}
                        className="mt-2 min-h-[40px] w-full rounded-lg border border-dark-border bg-dark-card px-3 font-dm text-sm text-offwhite">
                        {CLOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (kept on the record)"
                        className="mt-2 w-full rounded-lg border border-dark-border bg-dark-card px-3 py-2 font-dm text-sm text-offwhite" />
                      <p className="mt-2 font-dm text-[11px] text-muted/70">
                        &ldquo;Delivered&rdquo; isn&apos;t here on purpose — only the customer&apos;s PIN can mark that.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setClosing(null)}>Cancel</Button>
                        <button onClick={() => void act(`cl-${d.id}`, { action: "force_status", deliveryId: d.id, status: closeStatus, note: note || undefined })}
                          disabled={busy !== null}
                          className="rounded-lg bg-red-500 px-4 py-2 font-dm text-xs font-bold text-white disabled:opacity-40">
                          {busy === `cl-${d.id}` ? <Loader2 size={12} className="animate-spin" /> : "Close it out"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="mt-5 space-y-3">
          {drivers.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center font-dm text-sm text-muted">
              No drivers yet. Applications arrive at /driver/apply.
            </p>
          )}
          {drivers.map((dr) => (
            <div key={dr.id} className={`rounded-2xl border p-4 ${
              dr.status === "pending" ? "border-orange-400/35 bg-orange-400/[0.05]" : "border-white/10 bg-dark-card"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-syne text-base font-bold">{dr.name}</p>
                  <p className="font-dm text-xs text-muted">{dr.phone} · {dr.vehicle}</p>
                  {dr.statusReason && <p className="mt-1 font-dm text-xs text-muted/80">{dr.statusReason}</p>}
                </div>
                <span className={`rounded-full px-3 py-1 font-dm text-[11px] font-semibold ${
                  dr.status === "approved" ? "bg-green-500/15 text-green-300"
                  : dr.status === "pending" ? "bg-orange-400/20 text-orange-200"
                  : "bg-white/10 text-muted"}`}>
                  {dr.status}{dr.status === "approved" ? ` · ${dr.availability}` : ""}
                </span>
              </div>

              {/* The numbers behind reliability, not a score. An operator
                  deciding whether to suspend someone needs the evidence. */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-dm text-xs text-muted">
                <span>{dr.completed} completed</span>
                <span>{dr.onTime} on time</span>
                <span className={dr.cancellations > 0 ? "text-orange-300" : ""}>{dr.cancellations} cancelled</span>
                <span className={dr.unresponsive > 0 ? "text-red-400" : ""}>{dr.unresponsive} no-shows</span>
                <span>{dr.accepted}/{dr.offers} offers taken</span>
                {dr.active > 0 && <span className="text-yellow">{dr.active} active now</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {dr.status !== "approved" && (
                  <button onClick={() => void act(`ap-${dr.id}`, { action: "driver_status", driverId: dr.id, status: "approved" })}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-1.5 font-dm text-xs font-bold text-dark disabled:opacity-40">
                    {busy === `ap-${dr.id}` ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Approve
                  </button>
                )}
                {dr.status === "approved" && (
                  <button onClick={() => void act(`su-${dr.id}`, { action: "driver_status", driverId: dr.id, status: "suspended", reason: "Suspended from the delivery board" })}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-4 py-1.5 font-dm text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                    <UserX size={12} /> Suspend
                  </button>
                )}
                {dr.status === "pending" && (
                  <button onClick={() => void act(`rj-${dr.id}`, { action: "driver_status", driverId: dr.id, status: "rejected", reason: "Not approved" })}
                    disabled={busy !== null}
                    className="rounded-full border border-white/15 px-4 py-1.5 font-dm text-xs text-muted hover:text-offwhite disabled:opacity-40">
                    Reject
                  </button>
                )}
                {dr.active > 0 && dr.status === "approved" && (
                  <span className="inline-flex items-center gap-1 font-dm text-[11px] text-orange-300">
                    <Clock size={11} /> suspending won&apos;t move their {dr.active} active deliver{dr.active === 1 ? "y" : "ies"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
