"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BookedRange {
  start: string;
  end: string;
  confirmed: boolean;
}

interface Props {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  minDate: string; // today, YYYY-MM-DD
  bookedRanges: BookedRange[];
  capacity?: number; // number of units of this model (default 1)
  onChange: (start: string, end: string) => void;
  labels: { booked: string; available: string; selected: string; hint: string };
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export default function AvailabilityCalendar({
  startDate,
  endDate,
  minDate,
  bookedRanges,
  capacity = 1,
  onChange,
  labels,
}: Props) {
  const anchor = startDate ? new Date(startDate) : new Date(minDate);
  const [view, setView] = useState(new Date(anchor.getFullYear(), anchor.getMonth(), 1));

  // Both pending holds and confirmed bookings reserve a date.
  const blocked = bookedRanges;
  // A day is fully booked when active bookings on it reach the unit count.
  const cap = Math.max(1, capacity);
  const isBooked = (day: string) =>
    blocked.reduce((n, r) => (day >= r.start && day <= r.end ? n + 1 : n), 0) >= cap;
  const isPast = (day: string) => day < minDate;

  function rangeHasBooked(a: string, b: string): boolean {
    const d = new Date(a);
    const end = new Date(b);
    while (d <= end) {
      if (isBooked(iso(d))) return true;
      d.setDate(d.getDate() + 1);
    }
    return false;
  }

  function pick(day: string) {
    if (isPast(day) || isBooked(day)) return;
    if (!startDate || (startDate && endDate)) {
      onChange(day, ""); // begin a new range
    } else if (day <= startDate) {
      onChange(day, "");
    } else if (rangeHasBooked(startDate, day)) {
      onChange(day, ""); // can't span a booked date — restart
    } else {
      onChange(startDate, day);
    }
  }

  // Build the visible month grid
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(iso(new Date(year, month, d)));

  const monthTitle = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const canGoPrev = new Date(year, month, 1) > new Date(new Date(minDate).getFullYear(), new Date(minDate).getMonth(), 1);

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => canGoPrev && setView(new Date(year, month - 1, 1))}
          disabled={!canGoPrev}
          className="p-1.5 rounded-lg text-muted hover:text-yellow disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="font-syne font-bold text-offwhite text-sm capitalize">{monthTitle}</p>
        <button
          type="button"
          onClick={() => setView(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg text-muted hover:text-yellow transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d, i) => (
          <div key={i} className="text-center font-bebas text-muted/50 text-[10px] tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const past = isPast(day);
          const booked = isBooked(day);
          const isStart = day === startDate;
          const isEnd = day === endDate;
          const inRange = startDate && endDate && day > startDate && day < endDate;
          const disabled = past || booked;
          const num = Number(day.slice(-2));

          let cls = "text-offwhite/80 hover:bg-yellow/15";
          if (disabled) cls = "text-muted/25 cursor-not-allowed line-through";
          if (booked) cls = "text-red-400/40 cursor-not-allowed line-through bg-red-500/5";
          if (inRange) cls = "bg-yellow/20 text-yellow";
          if (isStart || isEnd) cls = "bg-yellow text-dark font-bold";

          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(day)}
              disabled={disabled}
              className={`aspect-square rounded-lg text-xs font-dm flex items-center justify-center transition-colors ${cls}`}
              aria-label={day}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-dark-border">
        <span className="flex items-center gap-1.5 text-[10px] font-dm text-muted">
          <span className="w-3 h-3 rounded bg-yellow inline-block" /> {labels.selected}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-dm text-muted">
          <span className="w-3 h-3 rounded bg-red-500/30 inline-block" /> {labels.booked}
        </span>
        <span className="text-[10px] font-dm text-muted/60 ml-auto">{labels.hint}</span>
      </div>
    </div>
  );
}
