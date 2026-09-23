"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { FOOD_COPY } from "@/lib/food/copy.i18n";
import { dayLabel } from "@/lib/food/day-label";
import type { ChosenSlot, Fulfilment, WhenState } from "@/lib/checkout/when-gate";

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
//
// M216 — it also REPORTS. Checkout cannot know on its own that a kitchen needs
// notice, so the picker hands up what /api/food/slots said (onState) and the
// form gates the button on it (lib/checkout/when-gate.ts). That is why it stays
// mounted, drawing nothing, when the time does not belong to the order: it is
// the one thing on the page that knows whether it will.

/** The server's instant rides along, so a sentence can be built from it
 *  without any time-zone maths here or in the form. */
export type PickedSlot = ChosenSlot | null;

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
  show = true,
  fulfilment = "pickup",
  onState,
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
  /** False: the time does not belong to this order. Draw nothing, choose nothing. */
  show?: boolean;
  /** How the food leaves the kitchen. Changes the words, never the times. */
  fulfilment?: Fulfilment;
  /** What the server said, for checkout's gate. Pass a stable setter. */
  onState?: (s: WhenState) => void;
}) {
  const { language } = useLanguage();
  const c = FOOD_COPY[language].when;

  const [slots, setSlots] = useState<Slot[] | null>(null);
  // M216 — a failed read is SHOWN, with a Retry. It used to fall back to ASAP
  // silently, "the behaviour before M161, which always works" — and since
  // M216 it does not: a kitchen that needs notice refuses ASAP.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // M216 — a kitchen that needs notice. The SERVER says whether ASAP exists
  // (food_pickup_window refuses it for such a kitchen); the picker only
  // stops drawing an option checkout would refuse.
  const [noticeHours, setNoticeHours] = useState(0);
  const [serverAsap, setServerAsap] = useState(true);

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
        if (cancelled) return;
        if (!r.ok) {
          setFailed(true);
          return;
        }
        setSlots(b.slots ?? []);
        setNoticeHours(Number(b.noticeHours) || 0);
        setServerAsap(b.asap !== false);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, key, attempt]);

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

  // ASAP is offered only when the kitchen is cooking now AND takes walk-up
  // orders. A kitchen that needs notice is often OPEN — that is exactly when a
  // customer would otherwise pick "as soon as it's ready" and be refused.
  const asapOffered = asapAvailable && serverAsap;

  const status: WhenState["status"] = failed ? "failed" : slots === null ? "loading" : "ready";
  const bookable = firstBookable !== null;

  // Up to checkout, on every change. Primitives only in the deps, and onState
  // left out on purpose: an inline callback would re-run this every render.
  useEffect(() => {
    onState?.({ status, noticeHours, asap: serverAsap, bookable });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, noticeHours, serverAsap, bookable]);

  // The chosen day IS the chosen slot's day — one piece of state, so the chips
  // and the time the form will send can never disagree.
  const day = value?.date ?? null;

  useEffect(() => {
    if (!show || slots === null) return;
    // A choice must be one of the times on offer. After a reload (a dish added,
    // a time refused at checkout) a remembered time may not be; drop it rather
    // than send a slot the server will refuse.
    const offered = !!value && days.some((d) => d.date === value.date && d.times.some((t) => t.time === value.time));
    if (value && !offered) {
      onChange(null);
      return;
    }
    // When ASAP is not a thing that can happen, the day chips open on the
    // first day that has anything rather than making the customer discover
    // the option.
    if (!asapOffered && !value && firstBookable) {
      const first = firstBookable.times[0];
      if (first?.time) onChange({ date: firstBookable.date, time: first.time, startsAt: first.startsAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, slots, asapOffered, firstBookable, value]);

  if (!show) return null;

  if (failed) {
    return (
      <section className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <h3 className="flex items-center gap-2 font-syne text-sm font-extrabold uppercase tracking-wide">
          <Clock size={15} className="text-yellow" />
          {c.title}
        </h3>
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2">
          <p className="font-dm text-xs text-red-300">{c.loadFailed}</p>
          <button
            type="button"
            onClick={() => { setFailed(false); setSlots(null); setAttempt((a) => a + 1); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite transition-colors hover:border-white/30"
          >
            <RefreshCw size={12} /> {c.retry}
          </button>
        </div>
      </section>
    );
  }

  if (slots === null) return null;                 // still loading; show nothing
  // A walk-up kitchen that takes no pre-orders: ASAP is the whole story, as in
  // M161. A kitchen that refuses ASAP (M216) and returned no days at all is
  // the opposite — checkout holds the button, so the reason must be drawn
  // here (nothingToChoose, below), not an empty space above a dark button.
  if (days.length === 0 && serverAsap) return null;

  // Today, tomorrow — and since M216 the day after, which used to be labelled
  // "Tomorrow" too because only two days were ever offered.
  const today = days[0]?.date;
  const label = (d: string) => dayLabel(d, today, c);
  // Inside a sentence: "today"/"tomorrow" lower-cased, a weekday as each
  // language writes it ("Friday", "vendredi", "Vandredi" — the same spelling
  // lib/orders/slot.ts gives the booked slot everywhere else).
  const inSentence = (d: string) => {
    const l = label(d);
    return l === c.today || l === c.tomorrow ? l.toLowerCase() : l;
  };

  // Nothing at all can be chosen: no ASAP, and every day in the horizon is too
  // soon or shut. Three dead chips with nothing selected read as a broken
  // control; one sentence reads as the answer.
  const nothingToChoose = !asapOffered && !firstBookable;

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

      {noticeHours > 0 ? (
        // The rule, said once, before the choice — not discovered as a refusal
        // after it. Tinted, because it is the one sentence here that changes
        // what the customer is allowed to do.
        <p className="mt-2 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-3 py-2 font-dm text-xs leading-relaxed text-offwhite">
          {c.needsNotice(kitchenName, noticeHours)}{" "}
          {value && (
            <span className="text-yellow">
              {c.orderingFor(inSentence(value.date), value.time, plus30(value.time))}
            </span>
          )}
        </p>
      ) : !asapAvailable && (
        <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
          {c.closedNow(kitchenName)}{" "}
          {value && (
            <span className="text-offwhite">
              {c.orderingFor(inSentence(value.date), value.time, plus30(value.time))}
            </span>
          )}
        </p>
      )}

      {/* M216 — the same slot, a different meaning. Only a notice kitchen is
          ever asked this for a delivery (lib/checkout/when-gate.ts). */}
      {fulfilment !== "pickup" && (
        <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
          {fulfilment === "rr_delivery" ? c.handToDriver(kitchenName) : c.handToCollector(kitchenName)}
        </p>
      )}

      {nothingToChoose ? (
        <p role="status" className="mt-3 rounded-xl border border-white/10 px-3 py-2 font-dm text-xs leading-relaxed text-offwhite">
          {c.noneBookable(kitchenName)}
        </p>
      ) : (
      <div className="mt-3 flex flex-col gap-2">
        {asapOffered && (
          <button
            type="button"
            onClick={() => onChange(null)}
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
                  const first = d.times[0];
                  if (first?.time) onChange({ date: d.date, time: first.time, startsAt: first.startsAt });
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
                  onClick={() => onChange({ date: day, time: s.time as string, startsAt: s.startsAt })}
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
      )}
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
  // M216 — open, but inside the kitchen's notice. Not "no times left", which
  // reads as sold out.
  if (reason === "notice") return c.bookAhead;
  if (reason === "no_hours") return c.noHours;
  if (reason === "closed") return c.closedDay;
  return c.noSlots;
}
