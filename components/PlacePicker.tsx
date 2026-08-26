"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Check,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
} from "lucide-react";
import type { RidePlace } from "@/lib/rides/places";
import { commonPlaces, searchPlaces } from "@/lib/rides/places";
import {
  placesServerSnapshot,
  placesSnapshot,
  subscribePlaces,
} from "@/lib/delivery/remembered";

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
// ── THE FOUR WAYS IN, IN THE ORDER PEOPLE USE THEM ─────────────────────────
//   1. TAP A COMMON PLACE. Eight villages, no typing, no reading a list of
//      thirty-five. This is new, and it is the change that matters most: the
//      old open state put a search box above every beach and viewpoint on the
//      island, so the commonest answer — "Port Mathurin" — cost either six
//      keystrokes or a scan of the whole gazetteer. For a delivery the answer
//      is nearly always somewhere people LIVE, and there are eight of those.
//   2. Type a few letters. searchPlaces() matches the "aka" spellings too, so
//      "aeroport", "airport" and "SZR" all find it.
//   3. "Use where I am now" — for somebody standing at the place itself.
//   4. Anything not on the list still goes through as free text. Refusing
//      somebody who lives up a track is worse than a missing coordinate.
//
// ── SIZED FOR THE PERSON WHO NEEDS IT MOST ─────────────────────────────────
// Rows were py-3 with 14px text — under 40px tall, on the control that carries
// the single hardest question on the form. Every target here is at least 48px
// (Material's accessibility floor) and the rows are 56px at 17px, the
// intensive-reading size for 57–70 year olds (Hou et al. 2020).
//
// The chosen state carries a CHECK as well as the amber: roughly one man in
// twelve cannot rely on hue, and this control is what says "you already
// answered this".

/** Only the strings this control needs. Narrow on purpose — a picker that
 *  takes the whole `where` dictionary is a picker coupled to one screen. */
export type PlacePickerCopy = {
  useMyLocation: string;
  nearby: string;
  recent: string;
  choose: string;
  change: string;
  myLocation: string;
  useTyped: (q: string) => string;
};

const DEFAULT_COPY: PlacePickerCopy = {
  useMyLocation: "Use where I am now",
  nearby: "Common places",
  recent: "You used recently",
  choose: "Choose",
  change: "Change",
  myLocation: "My current location",
  useTyped: (q) => `Use “${q}” — we’ll confirm the price`,
};

export default function PlacePicker({
  label,
  icon: Icon,
  value,
  onPick,
  placeholder,
  shortLabel,
  required,
  autoOpen = true,
  copy = DEFAULT_COPY,
}: {
  label: string;
  icon: React.ElementType;
  value: RidePlace | null;
  onPick: (p: RidePlace | null) => void;
  placeholder: string;
  /**
   * The label for an ANSWERED place, shown on the SAME line as the value.
   *
   * MEASURED: stacking "Where do we collect it?" above "Port Mathurin" made a
   * collapsed row 77px, and there are two of them on that screen. Inline, with
   * a short word, it is 56px and it reads as a route rather than as two form
   * fields that happen to be adjacent. Falls back to the full label.
   */
  shortLabel?: string;
  /** Draws the red mark the form's banner explains, and sets aria-required. */
  required?: boolean;
  /**
   * May this picker stand OPEN while it has no answer?
   *
   * MEASURED: with two pickers on screen 2 both opening themselves, that screen
   * was 1661px tall against 599px of usable space — nearly three phone screens,
   * because each open panel is a search box, a location button and eight
   * village chips. Two of them at once is two lists to read before answering
   * either.
   *
   * The parent hands this to ONE picker at a time: whichever question is next.
   * The others sit as a 64px row that opens on a tap, so nothing is hidden and
   * only one thing is asking.
   */
  autoOpen?: boolean;
  copy?: PlacePickerCopy;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const typing = q.trim().length > 0;
  const results = useMemo(() => (typing ? searchPlaces(q) : []), [q, typing]);
  // The server has no idea what is on this phone, so it renders nothing and
  // the client fills it in on hydration — without an on-mount setState, and
  // with two open pickers kept in step. See remembered.ts.
  const recent = useSyncExternalStore(
    subscribePlaces,
    placesSnapshot,
    placesServerSnapshot,
  );

  // Yours first, then the island's — and never the same place in both lists.
  const recentKeys = useMemo(
    () => new Set(recent.map((p) => p.name.trim().toLowerCase())),
    [recent],
  );
  const common = useMemo(
    () =>
      commonPlaces().filter(
        (p) => !recentKeys.has(p.name.trim().toLowerCase()),
      ),
    [recentKeys],
  );

  // Their own position, when they are standing where they want collecting from.
  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPick({
          id: "gps",
          name: copy.myLocation,
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

  function choose(p: RidePlace) {
    onPick(p);
    setOpen(false);
    setQ("");
  }

  // Closed and unanswered: a row, not a panel. Tapping it asks the question.
  if (!value && !open && !autoOpen) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-2.5 rounded-2xl border border-[#6E6E6E] bg-dark-card px-3.5 py-2.5 text-left"
      >
        <Icon size={18} className="shrink-0 text-yellow" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-dm text-[17px] font-semibold text-offwhite">
          {shortLabel ?? label}
          {required && (
            <span className="font-bold text-red-400" aria-hidden>
              {" *"}
            </span>
          )}
        </span>
        <span className="shrink-0 font-dm text-[16px] text-yellow underline underline-offset-4">
          {copy.choose}
        </span>
      </button>
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
        className="flex min-h-14 w-full items-center gap-2.5 rounded-2xl border border-yellow/40 bg-dark-card px-3.5 py-2.5 text-left"
      >
        {/* A CHECK, not only the amber. */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow text-dark">
          <Check size={16} aria-hidden />
        </span>
        {/* Label and value on ONE line. Stacked, this row was 77px, twice. */}
        <span className="min-w-0 flex-1 truncate font-dm text-[17px] text-offwhite">
          <span className="text-[#B0B0B0]">{shortLabel ?? label}: </span>
          <span className="font-semibold">{value.name}</span>
        </span>
        <span className="shrink-0 font-dm text-[16px] text-yellow underline underline-offset-4">
          {copy.change}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-yellow/30 bg-dark-card p-3.5">
      <p className="flex items-center gap-2 font-dm text-[18px] font-semibold text-offwhite">
        <Icon size={18} className="shrink-0 text-yellow" aria-hidden />
        <span>
          {label}
          {required && (
            <span className="font-bold text-red-400" aria-hidden>
              {" *"}
            </span>
          )}
        </span>
      </p>

      {/* ── The eight, before any typing ─────────────────────────────────
          For a delivery the answer is nearly always somewhere people live.
          Two taps beats six keystrokes, and it beats reading thirty-five
          rows to find out that typing was the only option. */}
      {!typing && (
        <>
          {/* YOURS first. The eight below are the island's answer; these are the
              places this person actually sends things to, and after one order
              the commonest answer is a single tap at the top of the panel. */}
          {recent.length > 0 && (
            <>
              <p className="mt-3 font-dm text-[16px] text-[#B0B0B0]">
                {copy.recent}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {recent.map((p) => (
                  <Chip
                    key={`r-${p.id}-${p.name}`}
                    place={p}
                    icon={Clock}
                    onPick={choose}
                  />
                ))}
              </div>
            </>
          )}
          {common.length > 0 && (
            <>
              {/* The heading only earns its 30px when there is a SECOND list to
                  tell it apart from. Under "Where do we collect it?" with
                  nothing else on screen, "Common places" is a label for the
                  only thing there. */}
              {recent.length > 0 && (
                <p className="mt-3 font-dm text-[16px] text-[#B0B0B0]">
                  {copy.nearby}
                </p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {common.map((p) => (
                  <Chip key={p.id} place={p} icon={MapPin} onPick={choose} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="relative mt-3">
        <Search
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0B0]"
          aria-hidden
        />
        {/* No autoFocus. On a phone it throws the keyboard up over the very
            list it is meant to help you read — wrong for a first-time older
            user, who wants to SEE the names before deciding to type. */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          aria-required={required}
          className="min-h-14 w-full rounded-xl border border-[#6E6E6E] bg-dark py-3 pl-11 pr-3 font-dm text-[18px] text-offwhite placeholder:text-[#B0B0B0] focus:border-yellow/60 focus:outline-none"
        />
      </div>

      {!typing && (
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="mt-2 flex min-h-14 w-full items-center gap-2.5 rounded-xl border border-[#6E6E6E] px-4 font-dm text-[16px] text-offwhite disabled:opacity-50"
        >
          {locating ? (
            <Loader2 size={17} className="animate-spin text-yellow" />
          ) : (
            <LocateFixed size={17} className="text-yellow" />
          )}
          {copy.useMyLocation}
        </button>
      )}

      {typing && (
        <div className="mt-2 max-h-72 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              className="flex min-h-14 w-full items-center gap-3 border-b border-white/[0.06] px-1 text-left last:border-0"
            >
              <MapPin
                size={16}
                className="shrink-0 text-[#B0B0B0]"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate font-dm text-[18px] text-offwhite">
                  {p.name}
                </span>
                {p.area && (
                  <span className="block truncate font-dm text-[16px] text-[#B0B0B0]">
                    {p.area}
                  </span>
                )}
              </span>
            </button>
          ))}
          {/* Anywhere we have not named. The job still goes out; it just
              confirms the details rather than refusing somebody who lives up
              a track. 35 names against 182 localities — this branch is not an
              edge case here, it is a large minority of the island. */}
          {q.trim().length > 2 && (
            <button
              type="button"
              onClick={() =>
                choose({
                  id: "custom",
                  name: q.trim(),
                  area: "",
                  lat: null,
                  lng: null,
                })
              }
              className="flex min-h-14 w-full items-center gap-3 px-1 text-left"
            >
              <MapPin size={16} className="shrink-0 text-yellow" aria-hidden />
              <span className="font-dm text-[16px] text-yellow">
                {copy.useTyped(q.trim())}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** One tappable place. 48px is Material's accessibility floor and this is a
 *  control people hit one-handed, outdoors, sometimes in the rain. */
function Chip({
  place,
  icon: Icon,
  onPick,
}: {
  place: RidePlace;
  icon: React.ElementType;
  onPick: (p: RidePlace) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(place)}
      className="flex min-h-12 items-center gap-2 rounded-xl border border-[#6E6E6E] px-3 text-left font-dm text-[16px] text-offwhite transition-colors active:border-yellow"
    >
      <Icon size={15} className="shrink-0 text-yellow" aria-hidden />
      <span className="min-w-0 truncate">{place.name}</span>
    </button>
  );
}
