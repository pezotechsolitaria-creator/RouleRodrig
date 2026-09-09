"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  Check,
  Clock,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Search,
} from "lucide-react";
import type { RidePlace } from "@/lib/rides/places";
import { searchPlaces } from "@/lib/rides/places";
import type { PinOnMapCopy } from "@/components/PinOnMap";

// Leaflet and a tile layer are a lot to carry for a control that most people
// answer with one tap on "Port Mathurin". Loaded only when the sheet opens.
// With no `loading:`, tapping "pin on map" showed NOTHING while a
// Leaflet-sized chunk crossed a 3G link — and this is the branch for the 182
// localities with no gazetteer entry, so it serves exactly the people least
// able to type an address instead.
const PinOnMap = dynamic(() => import("@/components/PinOnMap"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-[#B0B0B0]"
    >
      <Loader2 size={24} className="animate-spin text-yellow" aria-hidden />
      <p className="font-dm text-sm">Loading the map…</p>
    </div>
  ),
});
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
// ── A POINT BEATS A PLACE NAME ─────────────────────────────────────────────
// This control used to open on six village chips, with the search box under
// them and the two precise answers — the phone's position, and a pin on a map
// — beneath that again. The chips were not wrong: they read from the same
// gazetteer as the search, so tapping "Mont Lubin" and typing it produced the
// identical coordinate.
//
// The objection, and it is the owner's, is to what that coordinate MEANS.
// Port Mathurin's row is the middle of a town of about five thousand people;
// Mont Lubin's is the middle of a village. A driver given one of those still
// has to telephone to ask WHERE in Port Mathurin — so the fastest control on
// the form was optimising the wrong thing, and the chips made it two taps to
// hand dispatch an answer that would need a phone call anyway.
//
// ── THE WAYS IN, IN THE ORDER THEY NOW APPEAR ──────────────────────────────
//   1. A place you sent to before. Already an exact point, and after one order
//      it is the commonest answer on the panel.
//   2. "Use where I am now" — the phone's own position, for somebody standing
//      at the place. Metres, not a village.
//   3. "Show us on the map" — a pin dropped on a roof. The only answer that
//      works for the 182 localities with no gazetteer entry.
//   4. Type a few letters. searchPlaces() still matches the "aka" spellings,
//      so "aeroport", "airport" and "SZR" all find it — this is how you reach
//      the airport and the ferry, and it is still exact for those.
//   5. A name we do not know goes to the MAP with the words carried across,
//      instead of being accepted with lat and lng null. Backing out of the map
//      still lets the words through: refusing somebody who lives up a track is
//      worse than a missing coordinate, and when the map chunk itself fails to
//      load, typing is the only door left. See M145 — free text with no origin
//      is what dispatch could not work from in the first place.
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
  recent: string;
  choose: string;
  change: string;
  myLocation: string;
  useTyped: (q: string) => string;
  /** The fifth way in — see PinOnMap. Nested so adding it is one edit per
   *  language rather than eight, and so the sheet can be handed its own copy
   *  without this control unpacking it field by field. */
  pin: PinOnMapCopy & { open: string };
};

const DEFAULT_COPY: PlacePickerCopy = {
  useMyLocation: "Use where I am now",
  recent: "You used recently",
  choose: "Choose",
  change: "Change",
  myLocation: "My current location",
  useTyped: (q) => `Show us where “${q}” is on the map`,
  pin: {
    open: "Show us on the map",
    title: "Point to the place",
    hint: "Move the map so the pin sits on the spot. Pinch to zoom in.",
    nameLabel: "What is this place called?",
    namePlaceholder: "e.g. Chez Marie, blue gate",
    confirm: "Use this spot",
    cancel: "Close",
    recentre: "Where I am",
  },
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
  const [pinning, setPinning] = useState(false);
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

  /**
   * A place they showed us rather than named.
   *
   * `id: "pin"` deliberately is not "custom": custom means "typed, and we have
   * no idea where it is", and the whole point of this branch is that we now do.
   * It is not "gps" either — remembered.ts drops those, correctly, because a
   * one-off reading of where somebody stood is not a place they will send
   * things to again. A pinned house is exactly that, and gets remembered under
   * the name they gave it.
   */
  function pinned(p: { name: string; lat: number; lng: number }) {
    setPinning(false);
    choose({ id: "pin", name: p.name, area: "", lat: p.lat, lng: p.lng });
  }

  /**
   * Backing out of the map.
   *
   * When the sheet was opened by TYPING a place we do not know, the typed
   * words are the person's answer and closing a map must not silently discard
   * them — especially where the map failed to load at all, which is the one
   * case where the sheet's own advice is "go back and type the place name
   * instead". So the free-text answer goes through here, coordinate-less, the
   * way it always did.
   */
  function cancelPin() {
    setPinning(false);
    const typed = q.trim();
    if (typed.length > 2) {
      choose({ id: "custom", name: typed, area: "", lat: null, lng: null });
    }
  }

  const pinSheet = pinning ? (
    <PinOnMap
      initialName={q.trim() || value?.name || ""}
      copy={copy.pin}
      onConfirm={pinned}
      onCancel={cancelPin}
    />
  ) : null;

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

      {/* ── YOURS, BEFORE ANY TYPING ─────────────────────────────────────
          Where the six village chips used to be. These are not a shortlist of
          the island — they are the places THIS phone has already sent things
          to, so each one carries the exact point it was answered with the
          first time, pin or GPS. After one order the commonest answer here is
          a single tap, and it is a doorway rather than a village. */}
      {!typing && recent.length > 0 && (
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

      {/* ── A POINT, NOT A VILLAGE NAME ──────────────────────────────────
          These two were under the search box and under a grid of village
          chips. They are now the first thing offered, because they are the
          only two that produce the spot the driver actually has to reach.

          "Port Mathurin" is a settlement of some five thousand people. As an
          answer it is a name, not an address, and the driver's next move is a
          phone call — which is the failure this reorder is here to remove. */}
      {!typing && (
        <>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="mt-3 flex min-h-14 w-full items-center gap-2.5 rounded-xl border border-yellow/60 bg-yellow/[0.07] px-4 font-dm text-[17px] font-semibold text-offwhite disabled:opacity-50"
          >
            {locating ? (
              <Loader2 size={18} className="animate-spin text-yellow" />
            ) : (
              <LocateFixed size={18} className="text-yellow" />
            )}
            {copy.useMyLocation}
          </button>

          <button
            type="button"
            onClick={() => setPinning(true)}
            className="mt-2 flex min-h-14 w-full items-center gap-2.5 rounded-xl border border-yellow/60 bg-yellow/[0.07] px-4 font-dm text-[17px] font-semibold text-offwhite"
          >
            <MapIcon size={18} className="text-yellow" />
            {copy.pin.open}
          </button>
        </>
      )}

      {/* The name is now the FALLBACK, not the front door. It still has to be
          here — 35 gazetteer names against 182 localities, and refusing
          somebody who lives up a track is worse than a rough coordinate — but
          whatever it produces goes on to the map before it counts as an
          answer. */}
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
          {/* Anywhere we have not named — 35 gazetteer names against 182
              localities, so a large minority of the island, not an edge case.

              This used to accept the typed words with lat and lng NULL, which
              is the vaguest answer the form can produce and the one that ends
              in the driver phoning to ask where. It now carries the words
              STRAIGHT to the map, pre-filled, so the answer arrives as words
              AND a point. Cancelling the map still lets the words through —
              see onCancel — because refusing somebody who lives up a track is
              worse than a missing coordinate, and because when the map chunk
              itself fails, typing is the only door left. */}
          {q.trim().length > 2 && (
            <button
              type="button"
              onClick={() => setPinning(true)}
              className="flex min-h-14 w-full items-center gap-3 px-1 text-left"
            >
              <MapIcon size={16} className="shrink-0 text-yellow" aria-hidden />
              <span className="font-dm text-[16px] text-yellow">
                {copy.useTyped(q.trim())}
              </span>
            </button>
          )}
        </div>
      )}

      {pinSheet}
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
