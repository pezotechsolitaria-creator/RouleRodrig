"use client";

import { useEffect, useState } from "react";
import { Clock, ChevronDown } from "lucide-react";
import {
  WEEK_ORDER, WEEKDAYS, hhmm, nowInRodrigues,
  type DaySchedule, type ScheduleStatus,
} from "@/lib/schedule";

// Opening hours on the storefront.
//
// This is a Client Component ON PURPOSE. app/shop/[storeSlug] is ISR with
// revalidate = 60, so an Open/Closed badge rendered on the server would be
// frozen into the cached HTML and could be up to a minute wrong — worst of all
// exactly at 08:00 or 18:00, the moments it matters. The weekly rules are
// static and cache happily; only the "is it open right now" verdict is derived
// in the browser, and it re-derives itself every minute.
//
// The badge is presentation only. Whether an order is actually accepted is
// decided by store_schedule_status() inside create_order(), so a stale or
// tampered badge cannot let anyone order from a closed shop.
export default function StoreHoursCard({
  days, initialStatus,
}: { days: DaySchedule[]; initialStatus: ScheduleStatus | null }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!days.length) return null;

  // Re-derived in the browser each minute so the badge crosses opening and
  // closing times without a page reload. `tick` is the dependency that drives it.
  void tick;
  const now = nowInRodrigues();
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = days.find((d) => d.weekday === dow) ?? null;

  const toM = (t: string | null) => {
    const s = hhmm(t);
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };

  const o = today && !today.is_closed ? toM(today.opens_at) : null;
  const c = today && !today.is_closed ? toM(today.closes_at) : null;
  const isOpen = o !== null && c !== null && mins >= o && mins < c;

  const dOpen = today && !today.delivery_closed ? (toM(today.delivery_opens_at) ?? o) : null;
  const dClose = today && !today.delivery_closed ? (toM(today.delivery_closes_at) ?? c) : null;
  const deliveryOn = isOpen && dOpen !== null && dClose !== null && mins >= dOpen && mins < dClose;

  const fmt = (t: string | null, fallback: string | null) => hhmm(t) || hhmm(fallback) || "";
  const todayText = !today || today.is_closed
    ? "Closed today"
    : `${hhmm(today.opens_at)} – ${hhmm(today.closes_at)}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Clock size={15} className="text-yellow" />
          <span className="font-dm text-sm text-offwhite">
            <span className={isOpen ? "text-green-400" : "text-red-400"}>
              {isOpen ? "Open now" : "Closed"}
            </span>
            <span className="text-muted"> · {todayText}</span>
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Delivery is a separate promise from being open, so it gets its own line. */}
      {today && !today.is_closed && !today.delivery_closed && dOpen !== null && (
        <p className="mt-1.5 font-dm text-xs text-muted">
          Delivery {deliveryOn ? "available" : "unavailable"} ·{" "}
          {fmt(today.delivery_opens_at, today.opens_at)} – {fmt(today.delivery_closes_at, today.closes_at)}
        </p>
      )}
      {today && !today.is_closed && today.delivery_closed && (
        <p className="mt-1.5 font-dm text-xs text-muted">No delivery today</p>
      )}

      {open && (
        <ul className="mt-3 space-y-1 border-t border-white/5 pt-3">
          {WEEK_ORDER.map((wd) => {
            const d = days.find((x) => x.weekday === wd);
            return (
              <li key={wd} className="flex justify-between gap-3 font-dm text-xs">
                <span className={wd === dow ? "text-offwhite" : "text-muted"}>{WEEKDAYS[wd]}</span>
                <span className={wd === dow ? "text-offwhite" : "text-muted"}>
                  {!d || d.is_closed ? "Closed" : `${hhmm(d.opens_at)} – ${hhmm(d.closes_at)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <span className="sr-only" aria-live="polite">
        {isOpen ? "Shop is open" : "Shop is closed"}
      </span>
      {initialStatus && !initialStatus.has_schedule && (
        <p className="mt-2 font-dm text-xs text-muted">This shop hasn&apos;t published its hours yet.</p>
      )}
    </div>
  );
}
