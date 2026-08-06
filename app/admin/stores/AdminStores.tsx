"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Search, Pencil } from "lucide-react";
import { hhmm } from "@/lib/schedule";
import StoreEditor from "./StoreEditor";

type StoreRow = {
  store_id: string; store_name: string; slug: string; store_status: string;
  merchant_id: string; merchant_name: string; merchant_status: string;
  offers_rr_delivery: boolean; offers_pickup: boolean; offers_customer_delivery: boolean;
  accepts_cash: boolean; accepts_bank_transfer: boolean; has_bank_details: boolean;
  has_schedule: boolean; is_open: boolean; delivery_available: boolean;
  opens_at: string | null; closes_at: string | null; is_closed: boolean;
  delivery_opens_at: string | null; delivery_closes_at: string | null; delivery_closed: boolean;
  weekday: number; next_open_at: string | null;
  sub_plan: string | null; sub_status: string | null; sub_period_end: string | null;
  sub_grace_days: number | null; sub_started_at: string | null; sub_cancelled_at: string | null;
  selling: boolean;
  last_paid_at: string | null; last_paid_amount: number | null;
};

type Filter = "all" | "open" | "closed" | "no-schedule";

export default function AdminStores() {
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    // The error is cleared on success (and by the retry button), not
    // synchronously here — that would cascade a render from the effect body.
    try {
      const r = await fetch("/api/admin/stores");
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Failed to load shops.");
      setStores(b.stores);
      setError(null);
    } catch (e) {
      setStores(null);
      setError(e instanceof Error ? e.message : "Failed to load shops.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (stores ?? []).filter((s) => {
      if (needle && !`${s.store_name} ${s.merchant_name} ${s.slug}`.toLowerCase().includes(needle)) return false;
      if (filter === "open") return s.is_open;
      if (filter === "closed") return !s.is_open;
      if (filter === "no-schedule") return !s.has_schedule;
      return true;
    });
  }, [stores, q, filter]);

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <p className="flex items-center gap-2 font-dm text-sm text-red-300"><AlertTriangle size={15} /> {error}</p>
        <button onClick={() => { setError(null); void load(); }} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow">
          <RefreshCw size={12} /> Try again
        </button>
      </div>
    );
  }

  if (!stores) {
    return <p className="flex items-center gap-2 font-dm text-sm text-muted" aria-busy="true"><Loader2 size={15} className="animate-spin" /> Loading shops…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search shops or merchants…" aria-label="Search shops"
            className="w-full rounded-full border border-white/15 bg-dark py-2 pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
          />
        </div>
        {(["all", "open", "closed", "no-schedule"] as Filter[]).map((f) => (
          <button
            key={f} type="button" onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full border px-3 py-1.5 font-dm text-xs transition-colors ${
              filter === f ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 text-muted hover:text-offwhite"
            }`}
          >
            {f === "no-schedule" ? "No hours set" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="font-dm text-sm text-muted">No shops match.</p>}

      <ul className="space-y-2">
        {visible.map((s) => (
          <li key={s.store_id} className="rounded-xl border border-white/10 bg-dark-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-syne text-sm font-bold text-offwhite">{s.store_name}</p>
                <p className="font-dm text-xs text-muted">
                  {s.merchant_name}
                  {/* Merchant approval and shop visibility are DIFFERENT axes —
                      an approved merchant can still have a paused shop. */}
                  <span className={s.merchant_status === "approved" ? "text-muted" : " text-orange-300"}>
                    {" "}· merchant {s.merchant_status}
                  </span>
                  <span className={s.store_status === "active" ? "text-muted" : " text-orange-300"}>
                    {" "}· shop {s.store_status}
                  </span>
                </p>
                <p className="mt-0.5 font-dm text-[11px] text-muted/80">
                  {s.sub_plan ? `${s.sub_plan} · ${s.sub_status}` : "no subscription"}
                  {s.sub_period_end && ` · ends ${new Date(s.sub_period_end).toLocaleDateString("en-GB")}`}
                  {" · "}
                  {/* merchant_subscription_active() — the same predicate checkout
                      gates on, so this can never disagree with reality. */}
                  <span className={s.selling ? "text-green-400" : "text-red-400"}>
                    {s.selling ? "selling" : "blocked"}
                  </span>
                </p>
                <p className="font-dm text-[11px] text-muted/70">
                  {[s.offers_pickup && "pickup", s.offers_customer_delivery && "own driver", s.offers_rr_delivery && "RR delivery"]
                    .filter(Boolean).join(" · ") || "no fulfillment methods"}
                  {" · "}
                  {[s.accepts_cash && "cash", s.accepts_bank_transfer && "bank"].filter(Boolean).join(" + ") || "no payment method"}
                  {s.accepts_bank_transfer && !s.has_bank_details && (
                    <span className="text-red-400"> · bank details missing</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-dm text-sm ${!s.has_schedule ? "text-muted" : s.is_open ? "text-green-400" : "text-red-400"}`}>
                  {!s.has_schedule ? "Hours not set" : s.is_open ? "Open" : "Closed"}
                </p>
                <p className="font-dm text-xs text-muted">
                  {s.is_closed || !s.opens_at ? "Closed today" : `Today ${hhmm(s.opens_at)} – ${hhmm(s.closes_at)}`}
                </p>
                {s.offers_rr_delivery && (
                  <p className={`font-dm text-xs ${s.delivery_available ? "text-green-400/80" : "text-muted"}`}>
                    Delivery {s.delivery_available ? "available" : "unavailable"}
                    {!s.is_closed && !s.delivery_closed && s.opens_at &&
                      ` · ${hhmm(s.delivery_opens_at) || hhmm(s.opens_at)} – ${hhmm(s.delivery_closes_at) || hhmm(s.closes_at)}`}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3">
              {editing === s.store_id ? (
                <StoreEditor
                  storeId={s.store_id}
                  storeName={s.store_name}
                  onClose={() => setEditing(null)}
                  onSaved={() => void load()}
                />
              ) : (
                <button
                  type="button" onClick={() => setEditing(s.store_id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow"
                >
                  <Pencil size={12} /> Manage shop
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
