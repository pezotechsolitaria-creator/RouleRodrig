"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import type { RidePlace } from "@/lib/rides/places";
import { searchPlaces } from "@/lib/rides/places";

// ── Naming a place on Rodrigues ─────────────────────────────────────────────
//
// Lifted out of app/taxi/book/BookRide.tsx, where it had been doing this job
// well for the ride flow while /deliver asked for the same thing as free text.
// Two surfaces, one question, and only one of them had solved it.
//
// ── WHY NO MAP ─────────────────────────────────────────────────────────────
// A drag-a-pin map is the wrong tool here. There are perhaps forty places
// anyone names, everybody knows them by name, and somebody dragging a pin
// around a coastline they have never seen will drop it in the lagoon. A named
// list is faster on a slow connection, works for a person who has never used a
// map app, and — the part that matters technically — yields EXACT coordinates.
// Free text yields neither, which is why dispatch had no origin to work from
// for a Deliver Anything job (see M145).
//
// ── The three ways in, in the order people use them ────────────────────────
//   1. Type a few letters and pick from the list. searchPlaces() matches the
//      "aka" spellings too, so "aeroport", "airport" and "SZR" all find it.
//   2. "Use where I am now" — for somebody standing at the place itself.
//   3. Anything not on the list still goes through as free text. Refusing
//      somebody who lives up a track is worse than a missing coordinate.
//
// ── SIZED FOR THE PERSON WHO NEEDS IT MOST ─────────────────────────────────
// Rows were py-3 with 14px text — under 40px tall, below even WCAG 2.2 SC
// 2.5.5's 44px AAA target, on the control that carries the single hardest
// question on the form. Every row is now a 56px target at 17px, the
// intensive-reading size for 57–70 year olds (Hou et al. 2020).
//
// The chosen state carries a CHECK as well as the amber: roughly one man in
// twelve cannot rely on hue, and this control is what says "you already
// answered this".

export default function PlacePicker({
  label,
  icon: Icon,
  value,
  onPick,
  placeholder,
}: {
  label: string;
  icon: React.ElementType;
  value: RidePlace | null;
  onPick: (p: RidePlace | null) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const results = useMemo(() => searchPlaces(q), [q]);

  // Their own position, when they are standing where they want collecting from.
  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPick({
          id: "gps",
          name: "My current location",
          area: "",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
        setOpen(false);
      },
      // A refused permission is not an error worth shouting about — the list is
      // right there.
      () => setLocating(false),
      { timeout: 8000 },
    );
  }

  if (value && !open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setQ("");
        }}
        className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-yellow/40 bg-dark-card px-4 py-3.5 text-left"
      >
        {/* A CHECK, not only the amber. Roughly one man in twelve cannot rely on
            hue, and this is the control that says "you answered this already". */}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow text-dark">
          <Check size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bebas text-[11px] tracking-[0.22em] text-muted">{label}</span>
          <span className="block truncate font-dm text-[17px] text-offwhite">{value.name}</span>
          {value.area && <span className="block truncate font-dm text-sm text-muted">{value.area}</span>}
        </span>
        <span className="shrink-0 font-dm text-sm text-yellow underline underline-offset-4">Change</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-yellow/30 bg-dark-card p-4">
      <p className="font-bebas text-[11px] tracking-[0.22em] text-yellow">{label}</p>
      <div className="relative mt-2">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        {/* No autoFocus. On a phone it throws the keyboard up over the very
            list it is meant to help you read — wrong for a first-time older
            user, who wants to SEE the names before deciding to type. Anyone
            who does want to type taps the box, which is the normal gesture. */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="min-h-[56px] w-full rounded-xl border border-white/12 bg-dark py-3 pl-11 pr-3 font-dm text-[17px] text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="mt-2 flex min-h-[56px] w-full items-center gap-2.5 rounded-xl border border-white/12 px-4 font-dm text-[15px] text-offwhite disabled:opacity-50"
      >
        {locating ? (
          <Loader2 size={15} className="animate-spin text-yellow" />
        ) : (
          <LocateFixed size={15} className="text-yellow" />
        )}
        Use where I am now
      </button>

      <div className="mt-2 max-h-80 overflow-y-auto">
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onPick(p);
              setOpen(false);
            }}
            className="flex min-h-[56px] w-full items-center gap-3 border-b border-white/[0.06] px-1 text-left last:border-0"
          >
            <MapPin size={16} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-dm text-[17px] text-offwhite">{p.name}</span>
              {p.area && <span className="block truncate font-dm text-sm text-muted">{p.area}</span>}
            </span>
          </button>
        ))}
        {/* Anywhere we have not named. The job still goes out; it just confirms
            the details rather than refusing somebody who lives up a track. */}
        {q.trim().length > 2 && (
          <button
            type="button"
            onClick={() => {
              onPick({ id: "custom", name: q.trim(), area: "", lat: null, lng: null });
              setOpen(false);
            }}
            className="flex min-h-[56px] w-full items-center gap-3 px-1 text-left"
          >
            <MapPin size={16} className="shrink-0 text-yellow" aria-hidden />
            <span className="font-dm text-[15px] text-yellow">
              Use &ldquo;{q.trim()}&rdquo; — we&apos;ll confirm the price
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
