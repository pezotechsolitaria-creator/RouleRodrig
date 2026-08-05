"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Search, Clock, Check } from "lucide-react";
import { WEEK_ORDER, WEEKDAYS, hhmm, validateWeek, defaultWeek, type DaySchedule } from "@/lib/schedule";

type StoreRow = {
  store_id: string; store_name: string; slug: string; store_status: string;
  merchant_name: string; merchant_status: string; offers_rr_delivery: boolean;
  has_schedule: boolean; is_open: boolean; delivery_available: boolean;
  opens_at: string | null; closes_at: string | null; is_closed: boolean;
  delivery_opens_at: string | null; delivery_closes_at: string | null; delivery_closed: boolean;
  weekday: number; next_open_at: string | null;
};

type Filter = "all" | "open" | "closed" | "no-schedule";

export default function AdminStores() {
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [week, setWeek] = useState<DaySchedule[]>([]);
  const [busy, setBusy] = useState(false);

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

  async function openEditor(storeId: string) {
    setEditing(storeId);
    setWeek(defaultWeek());
    try {
      // Read the shop's real week. The admin list only carries TODAY's row, so
      // opening the editor fetches the full schedule rather than guessing.
      const r = await fetch(`/api/admin/stores/${storeId}/hours`);
      const b = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(b.days) && b.days.length) {
        const byDay = new Map<number, DaySchedule>(b.days.map((d: DaySchedule) => [d.weekday, d]));
        setWeek(WEEK_ORDER.map((wd) => {
          const d = byDay.get(wd);
          return d
            ? { ...d, opens_at: hhmm(d.opens_at) || null, closes_at: hhmm(d.closes_at) || null,
                delivery_opens_at: hhmm(d.delivery_opens_at) || null,
                delivery_closes_at: hhmm(d.delivery_closes_at) || null }
            : { weekday: wd, is_closed: true, opens_at: null, closes_at: null,
                delivery_opens_at: null, delivery_closes_at: null, delivery_closed: false };
        }));
      }
    } catch { /* editor opens on the default week; saving still validates */ }
  }

  const weekError = useMemo(() => (week.length ? validateWeek(week) : null), [week]);

  function patchDay(weekday: number, next: Partial<DaySchedule>) {
    setWeek((w) => w.map((d) => (d.weekday === weekday ? { ...d, ...next } : d)));
  }

  async function saveWeek(storeId: string) {
    if (weekError) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/stores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, days: week }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Couldn't save.");
      toast.success("Hours updated.");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

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
                <p className="font-dm text-xs text-muted">{s.merchant_name} · {s.store_status}</p>
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
                <div className="rounded-lg border border-white/10 bg-dark/50 p-3">
                  <ul className="space-y-2">
                    {week.map((d) => (
                      <li key={d.weekday} className="flex flex-wrap items-center gap-2">
                        <span className="w-20 shrink-0 font-dm text-xs text-offwhite">{WEEKDAYS[d.weekday]}</span>
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox" checked={!d.is_closed}
                            onChange={(e) => patchDay(d.weekday, {
                              is_closed: !e.target.checked,
                              opens_at: e.target.checked ? (d.opens_at ?? "08:00") : d.opens_at,
                              closes_at: e.target.checked ? (d.closes_at ?? "17:00") : d.closes_at,
                            })}
                            className="accent-yellow"
                          />
                          <span className="font-dm text-xs text-muted">Open</span>
                        </label>
                        {!d.is_closed && (
                          <>
                            <input
                              type="time" value={d.opens_at ?? ""} aria-label={`${WEEKDAYS[d.weekday]} opening time`}
                              onChange={(e) => patchDay(d.weekday, { opens_at: e.target.value || null })}
                              className="rounded border border-dark-border bg-dark px-2 py-1 font-dm text-xs text-offwhite focus:border-yellow focus:outline-none"
                            />
                            <span className="font-dm text-xs text-muted">–</span>
                            <input
                              type="time" value={d.closes_at ?? ""} aria-label={`${WEEKDAYS[d.weekday]} closing time`}
                              onChange={(e) => patchDay(d.weekday, { closes_at: e.target.value || null })}
                              className="rounded border border-dark-border bg-dark px-2 py-1 font-dm text-xs text-offwhite focus:border-yellow focus:outline-none"
                            />
                            {s.offers_rr_delivery && (
                              <label className="flex cursor-pointer items-center gap-1.5">
                                <input
                                  type="checkbox" checked={!d.delivery_closed}
                                  onChange={(e) => patchDay(d.weekday, { delivery_closed: !e.target.checked })}
                                  className="accent-yellow"
                                />
                                <span className="font-dm text-xs text-muted">Delivers</span>
                              </label>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {weekError && <p role="alert" className="mt-2 font-dm text-xs text-red-400">{weekError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button" disabled={busy || !!weekError} onClick={() => void saveWeek(s.store_id)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1.5 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save hours
                    </button>
                    <button
                      type="button" onClick={() => setEditing(null)}
                      className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:text-offwhite"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button" onClick={() => void openEditor(s.store_id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow"
                >
                  <Clock size={12} /> {s.has_schedule ? "Edit hours" : "Set hours"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
