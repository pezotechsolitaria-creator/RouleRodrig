"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, RefreshCw, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WEEK_ORDER, WEEKDAYS, hhmm, validateWeek, defaultWeek,
  todayLine, deliveryLine, nextOpenLabel,
  type DaySchedule, type ScheduleStatus,
} from "@/lib/schedule";

type Row = DaySchedule & { narrowDelivery: boolean };

function toRows(days: DaySchedule[]): Row[] {
  const byDay = new Map(days.map((d) => [d.weekday, d]));
  return WEEK_ORDER.map((weekday) => {
    const d = byDay.get(weekday);
    if (!d) {
      return {
        weekday, is_closed: true, opens_at: null, closes_at: null,
        delivery_opens_at: null, delivery_closes_at: null, delivery_closed: false,
        narrowDelivery: false,
      };
    }
    return {
      weekday,
      is_closed: d.is_closed,
      opens_at: hhmm(d.opens_at) || null,
      closes_at: hhmm(d.closes_at) || null,
      delivery_opens_at: hhmm(d.delivery_opens_at) || null,
      delivery_closes_at: hhmm(d.delivery_closes_at) || null,
      delivery_closed: d.delivery_closed,
      narrowDelivery: !!(d.delivery_opens_at || d.delivery_closes_at),
    };
  });
}

export default function StoreHoursForm({ offersRrDelivery }: { offersRrDelivery: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The previous error is cleared by the retry button rather than here — a
    // synchronous setState in an effect body causes a cascading render.
    fetch("/api/merchant/store-hours")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || "Couldn't load your opening hours.");
        return b;
      })
      .then((b) => {
        if (cancelled) return;
        // A shop that has never set hours starts from a sensible week rather
        // than seven blank rows — but nothing is saved until they press save.
        setRows(toRows((b.days ?? []).length ? b.days : defaultWeek()));
        setStatus(b.status ?? null);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load your opening hours.");
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const validationError = useMemo(
    () => (rows ? validateWeek(rows.map(({ narrowDelivery, ...d }) => ({
      ...d,
      delivery_opens_at: narrowDelivery ? d.delivery_opens_at : null,
      delivery_closes_at: narrowDelivery ? d.delivery_closes_at : null,
    }))) : null),
    [rows],
  );

  function patch(weekday: number, next: Partial<Row>) {
    setRows((rs) => rs?.map((r) => (r.weekday === weekday ? { ...r, ...next } : r)) ?? rs);
  }

  /** Copy the first open day's times down the rest of the week. */
  function applyToAll() {
    setRows((rs) => {
      if (!rs) return rs;
      const src = rs.find((r) => !r.is_closed);
      if (!src) return rs;
      return rs.map((r) => (r.is_closed ? r : {
        ...r,
        opens_at: src.opens_at,
        closes_at: src.closes_at,
        narrowDelivery: src.narrowDelivery,
        delivery_opens_at: src.delivery_opens_at,
        delivery_closes_at: src.delivery_closes_at,
        delivery_closed: src.delivery_closed,
      }));
    });
    toast.success("Copied to every open day.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!rows || validationError) return;
    setSaving(true);
    setError(null);
    try {
      const days = rows.map(({ narrowDelivery, ...d }) => ({
        weekday: d.weekday,
        is_closed: d.is_closed,
        opens_at: d.is_closed ? null : d.opens_at,
        closes_at: d.is_closed ? null : d.closes_at,
        delivery_opens_at: d.is_closed || !narrowDelivery ? null : d.delivery_opens_at,
        delivery_closes_at: d.is_closed || !narrowDelivery ? null : d.delivery_closes_at,
        delivery_closed: d.delivery_closed,
      }));
      const r = await fetch("/api/merchant/store-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Couldn't save.");
      setStatus(b.status ?? null);
      toast.success("Opening hours saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
        <AlertTriangle className="mx-auto text-red-400" size={22} />
        <p className="mt-2 font-dm text-sm text-red-300">{loadError}</p>
        <button
          onClick={() => { setLoadError(null); setReloadKey((k) => k + 1); }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow"
        >
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading opening hours">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {status && (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <p className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
            <Clock size={14} className="text-yellow" /> Right now
          </p>
          <p className="mt-1.5 font-dm text-sm">
            <span className={status.is_open ? "text-green-400" : "text-red-400"}>
              {status.has_schedule ? (status.is_open ? "Open" : "Closed") : "Hours not set"}
            </span>
            <span className="text-muted"> · today {todayLine(status)}</span>
          </p>
          {offersRrDelivery && (
            <p className="font-dm text-xs text-muted">
              Delivery: {status.delivery_available ? "running now" : "not running"}
              {deliveryLine(status) && ` · ${deliveryLine(status)}`}
            </p>
          )}
          {!status.is_open && nextOpenLabel(status) && (
            <p className="font-dm text-xs text-muted">{nextOpenLabel(status)}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="font-dm text-xs text-muted">
          Times are Rodrigues local time. Customers can&apos;t order while you&apos;re closed.
        </p>
        <button
          type="button" onClick={applyToAll}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-yellow/50 hover:text-yellow"
        >
          <Copy size={12} /> Copy to all
        </button>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.weekday} className="rounded-xl border border-white/10 bg-dark-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 shrink-0 font-dm text-sm text-offwhite">{WEEKDAYS[r.weekday]}</span>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox" checked={!r.is_closed}
                  onChange={(e) => patch(r.weekday, {
                    is_closed: !e.target.checked,
                    opens_at: e.target.checked ? (r.opens_at ?? "08:00") : r.opens_at,
                    closes_at: e.target.checked ? (r.closes_at ?? "17:00") : r.closes_at,
                  })}
                  className="accent-yellow"
                />
                <span className="font-dm text-xs text-muted">Open</span>
              </label>

              {r.is_closed ? (
                <span className="font-dm text-xs text-muted">Closed all day</span>
              ) : (
                <>
                  <label className="sr-only" htmlFor={`o-${r.weekday}`}>{WEEKDAYS[r.weekday]} opening time</label>
                  <input
                    id={`o-${r.weekday}`} type="time" value={r.opens_at ?? ""}
                    onChange={(e) => patch(r.weekday, { opens_at: e.target.value || null })}
                    className="rounded-lg border border-dark-border bg-dark px-2.5 py-1.5 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
                  />
                  <span className="font-dm text-xs text-muted">to</span>
                  <label className="sr-only" htmlFor={`c-${r.weekday}`}>{WEEKDAYS[r.weekday]} closing time</label>
                  <input
                    id={`c-${r.weekday}`} type="time" value={r.closes_at ?? ""}
                    onChange={(e) => patch(r.weekday, { closes_at: e.target.value || null })}
                    className="rounded-lg border border-dark-border bg-dark px-2.5 py-1.5 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
                  />
                </>
              )}
            </div>

            {/* Delivery is only meaningful for shops in the RR delivery network. */}
            {offersRrDelivery && !r.is_closed && (
              <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-white/5 pt-2.5 pl-1">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox" checked={!r.delivery_closed}
                    onChange={(e) => patch(r.weekday, { delivery_closed: !e.target.checked })}
                    className="accent-yellow"
                  />
                  <span className="font-dm text-xs text-muted">Delivering</span>
                </label>

                {!r.delivery_closed && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox" checked={r.narrowDelivery}
                      onChange={(e) => patch(r.weekday, {
                        narrowDelivery: e.target.checked,
                        delivery_opens_at: e.target.checked ? (r.delivery_opens_at ?? r.opens_at) : null,
                        delivery_closes_at: e.target.checked ? (r.delivery_closes_at ?? r.closes_at) : null,
                      })}
                      className="accent-yellow"
                    />
                    <span className="font-dm text-xs text-muted">
                      {r.narrowDelivery ? "Only between" : "Whenever open"}
                    </span>
                  </label>
                )}

                {!r.delivery_closed && r.narrowDelivery && (
                  <>
                    <label className="sr-only" htmlFor={`do-${r.weekday}`}>{WEEKDAYS[r.weekday]} delivery start</label>
                    <input
                      id={`do-${r.weekday}`} type="time" value={r.delivery_opens_at ?? ""}
                      onChange={(e) => patch(r.weekday, { delivery_opens_at: e.target.value || null })}
                      className="rounded-lg border border-dark-border bg-dark px-2.5 py-1.5 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
                    />
                    <span className="font-dm text-xs text-muted">to</span>
                    <label className="sr-only" htmlFor={`dc-${r.weekday}`}>{WEEKDAYS[r.weekday]} delivery end</label>
                    <input
                      id={`dc-${r.weekday}`} type="time" value={r.delivery_closes_at ?? ""}
                      onChange={(e) => patch(r.weekday, { delivery_closes_at: e.target.value || null })}
                      className="rounded-lg border border-dark-border bg-dark px-2.5 py-1.5 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
                    />
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {validationError && (
        <p role="alert" className="font-dm text-sm text-red-400">{validationError}</p>
      )}
      {error && <p role="alert" className="font-dm text-sm text-red-400">{error}</p>}

      <Button type="submit" className="w-full" disabled={saving || !!validationError}>
        {saving && <Loader2 size={15} className="animate-spin" />} Save opening hours
      </Button>
    </form>
  );
}
