"use client";

import { useMemo, useState } from "react";
import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
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
// This is a PURE EXTRACTION: the markup is byte-for-byte what BookRide had, so
// the ride flow cannot have changed behaviour. Restyling belongs to a separate
// pass with its own reasoning.

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
        className="flex w-full items-center gap-3 rounded-2xl border border-white/12 bg-dark-card px-4 py-3.5 text-left"
      >
        <Icon size={18} className="shrink-0 text-yellow" />
        <span className="min-w-0 flex-1">
          <span className="block font-bebas text-[10px] tracking-[0.22em] text-muted">{label}</span>
          <span className="block truncate font-dm text-base text-offwhite">{value.name}</span>
          {value.area && <span className="block truncate font-dm text-xs text-muted">{value.area}</span>}
        </span>
        <span className="font-dm text-xs text-yellow">Change</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-yellow/30 bg-dark-card p-4">
      <p className="font-bebas text-[10px] tracking-[0.22em] text-yellow">{label}</p>
      <div className="relative mt-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="w-full rounded-xl border border-white/12 bg-dark py-3 pl-9 pr-3 font-dm text-base text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="mt-2 flex w-full items-center gap-2 rounded-xl border border-white/12 px-3 py-2.5 font-dm text-sm text-offwhite/85 disabled:opacity-50"
      >
        {locating ? (
          <Loader2 size={15} className="animate-spin text-yellow" />
        ) : (
          <LocateFixed size={15} className="text-yellow" />
        )}
        Use where I am now
      </button>

      <div className="mt-2 max-h-64 overflow-y-auto">
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onPick(p);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 border-b border-white/[0.06] px-1 py-3 text-left last:border-0"
          >
            <MapPin size={14} className="shrink-0 text-muted" />
            <span className="min-w-0">
              <span className="block truncate font-dm text-sm text-offwhite">{p.name}</span>
              {p.area && <span className="block truncate font-dm text-xs text-muted">{p.area}</span>}
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
            className="flex w-full items-center gap-2.5 px-1 py-3 text-left"
          >
            <MapPin size={14} className="shrink-0 text-yellow" />
            <span className="font-dm text-sm text-yellow">
              Use &ldquo;{q.trim()}&rdquo; — we&apos;ll confirm the price
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
