"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { FOOD_COPY } from "@/lib/food/copy.i18n";

// ── "WHEN DO YOU WANT IT?" (M161) ───────────────────────────────────────────
//
// It lives at CHECKOUT, not on the menu. A tourist browsing does not yet know
// what they want, let alone when, and asking twice is how you lose them.
//
// This component DECIDES NOTHING. Every offered time comes from
// food_pickup_slots(), and create_food_order re-derives the window and refuses
// (RR030) anything it would not have offered. If the maths ever moves in here,
// the picker and checkout can start disagreeing about what is bookable — which
// is the one failure this split exists to prevent.

export type PickedSlot = { date: string; time: string } | null;

type Slot = {
  date: string;
  time: string | null;
  startsAt: string | null;
  reason: string | null;
};

export default function WhenPicker({
  storeId,
  variantIds,
  kitchenName,
  asapAvailable,
  prepMin = 15,
  prepMax = 30,
  value,
  onChange,
}: {
  storeId: string;
  variantIds: string[];
  kitchenName: string;
  /** Is the kitchen cooking right now? When it is not, ASAP is not offered. */
  asapAvailable: boolean;
  prepMin?: number;
  prepMax?: number;
  value: PickedSlot;
  onChange: (v: PickedSlot) => void;
}) {
  const { language } = useLanguage();
  const c = FOOD_COPY[language].when;

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const key = variantIds.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/food/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, variantIds }),
        });
        const b = await r.json().catch(() => ({}));
        if (!cancelled) setSlots(r.ok ? (b.slots ?? []) : []);
      } catch {
        // A picker that cannot load its times must not block checkout: the
        // customer falls back to ASAP, which is the behaviour before M161.
        if (!cancelled) setSlots([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, key]);

  const days = useMemo(() => {
    const out = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const list = out.get(s.date) ?? [];
      list.push(s);
      out.set(s.date, list);
    }
    return [...out.entries()].map(([date, rows]) => ({
      date,
      times: rows.filter((r) => r.time),
      blocked: rows.find((r) => !r.time && r.reason)?.reason ?? null,
    }));
  }, [slots]);

  const firstBookable = days.find((d) => d.times.length > 0) ?? null;

  // When the kitchen is shut, ASAP is not a thing that can happen, so the day
  // chips open on the first day that has anything rather than making the
  // customer discover the option.
  useEffect(() => {
    if (!asapAvailable && !day && firstBookable) {
      setDay(firstBookable.date);
      const first = firstBookable.times[0];
      if (first?.time) onChange({ date: firstBookable.date, time: first.time });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asapAvailable, firstBookable]);

  if (slots === null) return null;                 // still loading; show nothing
  if (days.length === 0) return null;              // kitchen takes no pre-orders

  const today = days[0]?.date;
  const label = (d: string) => (d === today ? c.today : c.tomorrow);

  const ready = (() => {
    const now = new Date();
    const f = new Date(now.getTime() + prepMin * 60_000);
    const t = new Date(now.getTime() + prepMax * 60_000);
    const hm = (x: Date) =>
      `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
    return c.asapReady(hm(f), hm(t));
  })();

  return (
    <section className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <h3 className="flex items-center gap-2 font-syne text-sm font-extrabold uppercase tracking-wide">
        <Clock size={15} className="text-yellow" />
        {c.title}
      </h3>

      {!asapAvailable && (
        <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
          {c.closedNow(kitchenName)}{" "}
          {value && (
            <span className="text-offwhite">
              {c.orderingFor(label(value.date), value.time, plus30(value.time))}
            </span>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {asapAvailable && (
          <button
            type="button"
            onClick={() => { onChange(null); setDay(null); }}
            aria-pressed={value === null}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              value === null
                ? "border-yellow bg-yellow/10"
                : "border-white/10 hover:border-white/25"
            }`}
          >
            <span className="block font-dm text-sm font-medium text-offwhite">{c.asap}</span>
            <span className="mt-0.5 block font-dm text-xs text-muted">{ready}</span>
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          {days.map((d) => {
            const on = day === d.date;
            const dead = d.times.length === 0;
            return (
              <button
                key={d.date}
                type="button"
                disabled={dead}
                onClick={() => {
                  setDay(d.date);
                  const first = d.times[0];
                  if (first?.time) onChange({ date: d.date, time: first.time });
                }}
                aria-pressed={on}
                className={`rounded-full border px-3.5 py-2 font-dm text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? "border-yellow bg-yellow text-dark" : "border-white/10 text-muted hover:border-white/25"
                }`}
              >
                {label(d.date)}
                {dead && ` · ${reasonWord(d.blocked, c)}`}
              </button>
            );
          })}
        </div>

        {day && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(days.find((d) => d.date === day)?.times ?? []).map((s) => {
              const on = value?.date === day && value.time === s.time;
              return (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => onChange({ date: day, time: s.time as string })}
                  aria-pressed={on}
                  className={`min-w-[68px] rounded-lg border px-3 py-2 font-dm text-xs tabular-nums transition-colors ${
                    on ? "border-yellow bg-yellow/15 text-yellow" : "border-white/10 text-muted hover:border-white/25"
                  }`}
                >
                  {s.time}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** The window is 30 minutes wide, fixed in food_pickup_window(). */
function plus30(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + 30);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function reasonWord(reason: string | null, c: (typeof FOOD_COPY)["en"]["when"]): string {
  if (reason === "no_hours") return c.noHours;
  if (reason === "closed") return c.closedDay;
  return c.noSlots;
}
