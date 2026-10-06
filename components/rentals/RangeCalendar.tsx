"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DATE_LOCALE, RENT_COPY, type RentLang } from "@/lib/rentals/copy";

// ── The rental date picker ──────────────────────────────────────────────────
//
// Built for the booking sheet, not shared with the stay/table calendar
// (components/AvailabilityCalendar keeps its own props and look):
//
//   * Monday first, in English and French alike.
//   * The month name follows the SITE language, not the browser's — the old
//     calendar asked toLocaleDateString(undefined) and an English page in a
//     French-set browser read "Octobre 2026".
//   * Always SIX rows. A five-row month and a six-row month must not change the
//     sheet's height under the customer's thumb when they page between them.
//   * A keyboard can do everything a finger can: arrows move a day/week,
//     Home/End the row, PageUp/PageDown the month, Enter/Space picks.
//
// Pure helpers are exported for lib/rentals/calendar.test.ts.

export function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** The 42 cells (6 weeks, Monday first) of a month: ISO days, or null padding. */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7; // Monday-first offset
  const daysIn = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(isoOf(year, month, d));
  while (cells.length < 42) cells.push(null);
  return cells;
}

/** "October 2026" / "octobre 2026" — never the browser's language. */
export function monthTitle(year: number, month: number, lang: RentLang): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[lang], { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1)),
  );
}

/** Monday-first one-letter weekday heads in the site language. */
export function weekdayHeads(lang: RentLang): { short: string; long: string }[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1 + i));
    return {
      short: new Intl.DateTimeFormat(DATE_LOCALE[lang], { weekday: "narrow", timeZone: "UTC" }).format(d).toUpperCase(),
      long: new Intl.DateTimeFormat(DATE_LOCALE[lang], { weekday: "long", timeZone: "UTC" }).format(d),
    };
  });
}

function longDate(day: string, lang: RentLang): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(DATE_LOCALE[lang], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * What a tap does to the range. Pure, so the rules are tested:
 *   nothing chosen / a full range chosen  -> start again here
 *   only a start, tap on or before it     -> move the start
 *   only a start, the span crosses a taken day -> start again here
 *   only a start, tap after it            -> that is the return
 * A start with no return is a one-day rental (the sheet prices it as one).
 */
export function pickDay(
  day: string,
  start: string,
  end: string,
  blocked: (d: string) => boolean,
): { start: string; end: string } {
  if (!start || end) return { start: day, end: "" };
  if (day <= start) return { start: day, end: "" };
  for (let d = start; d <= day; d = addDays(d, 1)) {
    if (blocked(d)) return { start: day, end: "" };
  }
  return { start, end: day };
}

export default function RangeCalendar({
  start,
  end,
  minDate,
  isUnavailable,
  onChange,
  lang,
}: {
  start: string;
  end: string;
  /** Today in Rodrigues, YYYY-MM-DD. */
  minDate: string;
  isUnavailable: (day: string) => boolean;
  onChange: (start: string, end: string) => void;
  lang: RentLang;
}) {
  const c = RENT_COPY[lang];
  const anchor = start || minDate;
  const [view, setView] = useState(() => ({ y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 }));
  const [focusDay, setFocusDay] = useState<string>(start || minDate);
  const gridRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);

  const cells = useMemo(() => monthCells(view.y, view.m), [view]);
  const heads = useMemo(() => weekdayHeads(lang), [lang]);
  const minY = Number(minDate.slice(0, 4));
  const minM = Number(minDate.slice(5, 7)) - 1;
  const canPrev = view.y > minY || (view.y === minY && view.m > minM);
  const past = (d: string) => d < minDate;
  const blocked = (d: string) => past(d) || isUnavailable(d);
  const last = end || start;

  // Keep the roving focus target inside the visible month.
  useEffect(() => {
    const inView = cells.includes(focusDay);
    if (!inView) {
      const firstFree = cells.find((d) => d && !past(d)) ?? cells.find(Boolean);
      if (firstFree) setFocusDay(firstFree);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  // Dates set from outside the grid — kept from an earlier vehicle, the trip
  // planner's prefill — move the month and the keyboard target to the pickup,
  // unless the reader is moving through the grid right now.
  useEffect(() => {
    if (!start) return;
    if (gridRef.current?.contains(document.activeElement)) return;
    setFocusDay(start);
    setView({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  }, [start]);

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDay}"]`)?.focus();
  }, [focusDay, view]);

  function go(dm: number) {
    setView((v) => {
      const m = v.m + dm;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  function moveFocus(to: string) {
    if (to < minDate) to = minDate;
    const y = Number(to.slice(0, 4));
    const m = Number(to.slice(5, 7)) - 1;
    if (y !== view.y || m !== view.m) setView({ y, m });
    wantFocus.current = true;
    setFocusDay(to);
  }

  function choose(day: string) {
    if (blocked(day)) return;
    const next = pickDay(day, start, end, blocked);
    onChange(next.start, next.end);
  }

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, day: string) {
    const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) {
      e.preventDefault();
      moveFocus(addDays(day, map[e.key]));
    } else if (e.key === "Home") {
      e.preventDefault();
      moveFocus(addDays(day, -dow));
    } else if (e.key === "End") {
      e.preventDefault();
      moveFocus(addDays(day, 6 - dow));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const [y, m, d] = day.split("-").map(Number);
      const dm = e.key === "PageUp" ? -1 : 1;
      const target = new Date(Date.UTC(y, m - 1 + dm, 1));
      const daysIn = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      moveFocus(isoOf(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, daysIn)));
    }
  }

  const rows = Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  const today = minDate;

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => canPrev && go(-1)}
          disabled={!canPrev}
          aria-label={c.prevMonth}
          className="flex h-11 w-11 items-center justify-center rounded-full text-offwhite/80 transition-colors hover:bg-white/[0.06] hover:text-offwhite disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <p className="font-syne text-[15px] font-bold text-offwhite" aria-live="polite">
          {monthTitle(view.y, view.m, lang)}
        </p>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={c.nextMonth}
          className="flex h-11 w-11 items-center justify-center rounded-full text-offwhite/80 transition-colors hover:bg-white/[0.06] hover:text-offwhite"
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      <div ref={gridRef} role="grid" aria-label={monthTitle(view.y, view.m, lang)}>
        <div role="row" className="grid grid-cols-7">
          {heads.map((h, i) => (
            <span
              key={i}
              role="columnheader"
              aria-label={h.long}
              className="flex h-8 items-center justify-center font-dm text-[11px] font-medium text-muted"
            >
              {h.short}
            </span>
          ))}
        </div>
        {rows.map((row, r) => (
          <div role="row" key={r} className="grid grid-cols-7">
            {row.map((day, i) => {
              if (!day) return <span role="gridcell" key={i} className="h-11" />;
              const isPast = past(day);
              const off = isUnavailable(day);
              const isStart = day === start;
              const isEnd = !!end && day === end;
              const inside = !!start && !!end && day > start && day < end;
              const chosen = isStart || isEnd || inside;
              // The continuous band behind a range: full width inside, half
              // width out of each end, nothing for a one-day pick.
              const band = !!end && (inside || isStart || isEnd);
              const bandCls = inside
                ? "inset-x-0"
                : isStart && end
                  ? "left-1/2 right-0"
                  : isEnd
                    ? "left-0 right-1/2"
                    : "";
              const state = off ? c.unavailable : chosen ? c.selected : isPast ? null : c.available;
              return (
                <span role="gridcell" key={i} className="relative flex h-11 items-center justify-center">
                  {band && <span aria-hidden className={`absolute inset-y-1 ${bandCls} bg-yellow/40`} />}
                  <button
                    type="button"
                    data-date={day}
                    tabIndex={day === focusDay ? 0 : -1}
                    disabled={isPast || off}
                    onClick={() => choose(day)}
                    onKeyDown={(e) => onKey(e, day)}
                    onFocus={() => setFocusDay(day)}
                    aria-pressed={isPast || off ? undefined : chosen}
                    aria-label={`${longDate(day, lang)}${state ? ` — ${state}` : ""}${day === today ? ` — ${c.today}` : ""}`}
                    className={[
                      "relative flex h-10 w-10 items-center justify-center rounded-full font-dm text-[14px] tabular-nums transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offwhite focus-visible:ring-offset-2 focus-visible:ring-offset-dark-card",
                      isStart || isEnd
                        ? "bg-yellow font-semibold text-dark"
                        : inside
                          ? "font-medium text-offwhite"
                          : isPast
                            ? "cursor-not-allowed text-muted"
                            : off
                              ? "cursor-not-allowed text-muted line-through decoration-muted/70"
                              : "text-offwhite hover:bg-white/[0.08]",
                      day === today && !(isStart || isEnd) ? "ring-1 ring-inset ring-offwhite/50" : "",
                    ].join(" ")}
                  >
                    {Number(day.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {/* Sized the same with or without the hint text, so a first tap does not
          move anything below it. */}
      <p className="mt-1 h-5 font-dm text-xs text-muted" aria-live="polite">
        {!start ? c.tapHint : !end ? c.tapReturnHint : ""}
      </p>
      {/* For the summary's own sake: the last day the range covers. */}
      <span className="sr-only">{last}</span>
    </div>
  );
}
