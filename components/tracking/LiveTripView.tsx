"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Phone, MessageCircle, Car, Loader2, WifiOff, MapPin, Navigation, Star,
  CircleDot, ChevronDown,
} from "lucide-react";
import { useTripTracking } from "@/lib/tracking/useTripTracking";
import {
  formatDistance, formatEta, lastSeenLabel, TRACKING_CUSTOMER_STATUS,
} from "@/lib/tracking/model";
import JourneyTrack, { type JourneyStage } from "./JourneyTrack";

const TrackingMap = dynamic(() => import("./TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dark-card">
      <Loader2 size={22} className="animate-spin text-yellow" />
    </div>
  ),
});

// ── "WHERE IS MY DRIVER" ────────────────────────────────────────────────────
//
// Map on top, one solid sheet underneath — the composition of a tracking screen
// people already know, so nobody has to learn this one. The sheet overlaps the
// map by 20px with a 28px rounded top, which is what makes it read as a sheet
// lifted over the map rather than two stacked boxes.
//
// Reading order is the order the questions arrive:
//   who is driving        → photo, name, standing, and the two buttons to reach them
//   how long              → the status line, and the pill sitting ON the route
//   which booking is this → the reference, large, because it is read down a phone
//   how far along         → the journey as one horizontal line with the car on it
//   where, and what for   → from/to, then fare and passenger
//
// ── LIGHT MODE ──────────────────────────────────────────────────────────────
// app/globals.css implements light by RE-DECLARING specific utilities under
// `html.light`, and anything it does not list simply stays dark. So this file
// uses only utilities that layer covers — bg-dark-card, border-white/10,
// text-offwhite(/70,/60), text-muted, bg-yellow, text-yellow, bg-white/5,/10.
// The previous version used bg-dark/92 and border-white/12, neither of which is
// covered, so the sheet stayed black on a white page.
//
// ── THE RULE THIS SCREEN FOLLOWS ────────────────────────────────────────────
// NEVER show a confident number for a position we are not confident about.
//   live      pulsing marker, ETA, the route pill
//   delayed   pulse stops, "last seen 3 min ago" appears, ETA stays
//   stale     marker greys, the ETA and the route pill are REMOVED, not aged
// A frozen dot still claiming to be live is what makes somebody stand on a kerb
// watching a car that is not coming.

export type TripDriver = {
  name: string;
  phone: string | null;
  vehicle: string | null;
  photo?: string | null;
  /** Null when nobody has reviewed them — NOT zero. See M110. */
  rating?: number | null;
  ratingCount?: number | null;
  ridesCompleted?: number | null;
};

/**
 * Four stages, not the six the old vertical list had.
 *
 * "Requested" and "Driver found" are both behind the customer by the time a map
 * exists — this component only renders once somebody is driving — so showing
 * them spends a quarter of the track on history. What is left is the part still
 * to happen.
 */
const STAGES: (JourneyStage & { status: string })[] = [
  { key: "pending", status: "pending", label: "Confirmed" },
  { key: "en_route_pickup", status: "en_route_pickup", label: "On the way" },
  { key: "at_pickup", status: "at_pickup", label: "At pickup" },
  { key: "on_trip", status: "on_trip", label: "On trip" },
  { key: "ended", status: "ended", label: "Arrived" },
];

function stageIndex(status: string): number {
  const i = STAGES.findIndex((s) => s.status === status);
  return i < 0 ? 0 : i;
}

/** The dark chip on the right of the booking row. Two words, never a sentence. */
const BADGE: Record<string, string> = {
  pending: "Confirmed",
  en_route_pickup: "On the way",
  at_pickup: "At pickup",
  on_trip: "On trip",
  ended: "Complete",
};

export default function LiveTripView({
  lookup, channelKey, driver, active, pickupLabel, dropoffLabel,
  reference, fare, passengerName, headerSlot,
}: {
  /** The credential that authorised this watcher, replayed on every poll. */
  lookup: Record<string, string> | null;
  channelKey: string | null;
  driver: TripDriver | null;
  active: boolean;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  /** "RR-4F2A91" — the thing a customer reads down a phone line. */
  reference?: string | null;
  /** Already formatted for display, e.g. "Rs 1,200". */
  fare?: string | null;
  passengerName?: string | null;
  headerSlot?: React.ReactNode;
}) {
  const { snapshot, fix, freshness, ageSeconds, channel, loading } = useTripTracking({
    lookup, channelKey, active,
  });
  const [open, setOpen] = useState(true);

  const stale = freshness === "stale" || freshness === "unknown";
  const status = snapshot?.status ?? "pending";
  const at = stageIndex(status);

  // ── WHEN AN ETA MEANS SOMETHING, AND WHEN IT IS A LIE ──────────────────
  // Freshness is not enough. The server computes an ETA whenever it has a
  // target and a fresh fix, and the target is the pickup for every stage
  // except on_trip — so without this gate the screen says:
  //
  //   "Getting ready · arriving in 12 min"   for a driver who has been
  //                                          assigned but has not set off,
  //                                          possibly for a ride scheduled
  //                                          days from now;
  //   "Waiting for you · arriving in 1 min"  forever, for a driver parked at
  //                                          the kerb — a countdown to an
  //                                          arrival that already happened
  //                                          (distance ~0 clamps to 1 min /
  //                                          50 m).
  //
  // An ETA is honest only while a journey is actually underway.
  const journeyUnderway = status === "en_route_pickup" || status === "on_trip";
  const eta = stale || !journeyUnderway ? null : (snapshot?.eta ?? null);
  // A trip that has ended is not being tracked, whatever the last fix said.
  const finished = status === "ended" || Boolean(snapshot?.endedAt);

  const pins = useMemo(() => {
    const out: { id: string; lat: number; lng: number; kind: "pickup" | "dropoff"; label?: string }[] = [];
    // The pickup stops mattering the moment the passenger is aboard.
    if (snapshot?.pickupLat != null && snapshot.pickupLng != null && status !== "on_trip") {
      out.push({
        id: "pickup", lat: snapshot.pickupLat, lng: snapshot.pickupLng,
        kind: "pickup", label: pickupLabel ?? snapshot.pickupLabel ?? undefined,
      });
    }
    if (snapshot?.dropoffLat != null && snapshot.dropoffLng != null) {
      out.push({
        id: "dropoff", lat: snapshot.dropoffLat, lng: snapshot.dropoffLng,
        kind: "dropoff", label: dropoffLabel ?? snapshot.dropoffLabel ?? undefined,
      });
    }
    return out;
  }, [snapshot, status, pickupLabel, dropoffLabel]);

  // Where the driver is heading NOW: the customer before pickup, the
  // destination after it. Backwards, this shows a passenger an ETA to the kerb
  // they are already standing on.
  const target =
    status === "on_trip"
      ? { lat: snapshot?.dropoffLat, lng: snapshot?.dropoffLng }
      : { lat: snapshot?.pickupLat, lng: snapshot?.pickupLng };

  // THE ROAD, when a router answered — and only a dashed hint when none did.
  // The two are drawn differently on purpose (TrackingMap): a solid line means
  // "this is the way", a faint dash means "this is the direction".
  const showLine = Boolean(fix) && !stale && !finished;
  const route = showLine ? (snapshot?.route ?? null) : null;
  const directLine =
    showLine && !route && fix && target.lat != null && target.lng != null
      ? ([[fix.lat, fix.lng], [target.lat, target.lng]] as [[number, number], [number, number]])
      : null;

  const fitTo = useMemo(() => {
    // Frame the ROAD when we have one. A route that loops around a headland
    // bulges well outside the box that holds only its two ends, and half the
    // journey would sit off-screen.
    if (route && route.length > 1) return route;
    const pts: [number, number][] = [];
    if (fix) pts.push([fix.lat, fix.lng]);
    if (target.lat != null && target.lng != null) pts.push([target.lat, target.lng]);
    return pts.length ? pts : null;
  }, [route, fix, target.lat, target.lng]);

  const statusText =
    TRACKING_CUSTOMER_STATUS[status as keyof typeof TRACKING_CUSTOMER_STATUS] ?? "Tracking";

  // The driver's standing, and never an invented one. A rating only exists once
  // somebody has actually left one; until then the honest number is the count of
  // rides they have completed, which the platform has tracked since day one.
  const standing =
    driver?.rating != null && (driver.ratingCount ?? 0) > 0
      ? { star: true, text: `${driver.rating.toFixed(1)} · ${driver.ratingCount} review${driver.ratingCount === 1 ? "" : "s"}` }
      : (driver?.ridesCompleted ?? 0) > 0
        ? { star: false, text: `${driver!.ridesCompleted} rides with Roulé Rodrigues` }
        : { star: false, text: "Your driver" };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-dark-card">
      {/* The one thing a screen-reader user cannot see happen. Polite, and
          only the sentence that changed — not the whole card. */}
      <p aria-live="polite" className="sr-only">
        {statusText}
        {eta ? `, arriving in ${formatEta(eta.minutes)}` : ""}
      </p>

      {/* ══ MAP ══════════════════════════════════════════════════════════
          `isolate` is load-bearing: Leaflet gives its controls z-index 1000 and
          its marker pane 600. Without a stacking context here those numbers are
          compared against the SHEET, and the attribution and place labels paint
          straight through the 20px overlap. Isolating the map contains them. */}
      <div className="relative isolate h-[46vh] max-h-[430px] min-h-[280px] w-full">
        {fix ? (
          <TrackingMap
            driver={{
              id: "driver", lat: fix.lat, lng: fix.lng, kind: "driver",
              bearing: fix.heading, stale, vehicle: "car",
            }}
            pins={pins}
            route={route}
            directLine={directLine}
            fitTo={fitTo}
            follow
            // The pill that sits ON the route — the reference's "🚚 12 min".
            // Null while stale, for the same reason the ETA is.
            bubble={eta ? { text: formatEta(eta.minutes) } : null}
            // A finished trip keeps its map (people re-open it) but stops
            // asserting movement.
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-dark px-8 text-center">
            {loading ? (
              <Loader2 size={26} className="animate-spin text-yellow" />
            ) : (
              <>
                <MapPin size={26} className="text-muted" />
                <p className="font-dm text-sm text-muted">
                  {active
                    ? "Your driver hasn't shared their location yet. It appears here the moment they set off."
                    : "This trip has finished."}
                </p>
              </>
            )}
          </div>
        )}

        {/* Floating status pill */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-3">
          {headerSlot}
          <span
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-4 py-2 font-dm text-[13px] font-bold shadow-lg ${
              stale
                ? "border-white/10 bg-dark-card text-muted"
                : "border-yellow bg-dark-card text-yellow"
            }`}
          >
            {!stale && <CircleDot size={13} className="animate-pulse" />}
            {statusText}
          </span>

          {/* Said only when true — a permanent "connection" chip trains people
              to ignore it. */}
          {channel === "error" && active && (
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-dark-card px-3 py-1.5 font-dm text-[11px] text-muted">
              <WifiOff size={11} /> Reconnecting — the map may lag
            </span>
          )}
        </div>
      </div>

      {/* ══ SHEET ════════════════════════════════════════════════════════
          Lifted 20px over the map with a 28px rounded top. That overlap is the
          whole reason it reads as a sheet rather than a second box. */}
      <div className="relative z-10 -mt-5 rounded-t-[28px] bg-dark-card px-5 pb-5 pt-3">
        <div className="mx-auto h-1 w-9 rounded-full bg-white/10" aria-hidden="true" />

        {/* ── Who is driving ─────────────────────────────────────────── */}
        <div className="mt-4 flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white/5">
            {driver?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driver.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Car size={20} className="text-yellow" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-dm text-[11px] text-muted">
              {standing.star && <Star size={11} className="shrink-0 fill-yellow text-yellow" />}
              <span className="min-w-0 break-words">{standing.text}</span>
            </p>
            {/* NOT truncated. A person's name is the one string on this screen
                that must arrive whole — "Jean-Marc Ravina" cut to "Jean-…" is
                worse than two lines. */}
            <p className="font-syne text-lg font-extrabold leading-tight text-offwhite">
              {driver?.name ?? "Your driver"}
            </p>
            {driver?.vehicle && (
              <p className="break-words font-dm text-[11px] text-muted">{driver.vehicle}</p>
            )}
          </div>

          {/* Circular, like the reference. Only rendered when there is genuinely
              a number to reach — a disabled-looking button is worse than none. */}
          {driver?.phone && active && (
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`tel:${driver.phone}`}
                aria-label={`Call ${driver.name ?? "your driver"}`}
                className="grid h-11 w-11 place-items-center rounded-full bg-yellow text-dark"
              >
                <Phone size={17} />
              </a>
              <a
                href={`https://wa.me/${driver.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Message ${driver.name ?? "your driver"} on WhatsApp`}
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-offwhite"
              >
                <MessageCircle size={17} />
              </a>
            </div>
          )}
        </div>

        {/* ── How long ──────────────────────────────────────────────────
            Its own full-width row, and NOT truncated. Squeezed beside the
            distance it clipped to "arriving in 1…" for a 12-minute ETA at
            360px — a truncated numeral does not look truncated, it looks like
            a smaller number. */}
        <p className="mt-3.5 flex items-start gap-1.5 font-dm text-[13px] text-offwhite/70">
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              stale ? "bg-white/10" : "bg-yellow"
            }`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            {eta ? `${statusText} · arriving in ${formatEta(eta.minutes)}` : statusText}
            {eta && (
              <span className="font-bold text-offwhite"> · {formatDistance(eta.km)} left</span>
            )}
          </span>
        </p>

        {/* Freshness. The line that stops somebody watching a dot that stopped
            updating ten minutes ago. */}
        <p className="mt-1.5 font-dm text-[11px] text-muted">
          {freshness === "live" ? (
            <span className="text-yellow">Live</span>
          ) : (
            <>
              {lastSeenLabel(ageSeconds)}
              {freshness === "stale" &&
                " — we've lost their signal. They're most likely still on the way."}
            </>
          )}
          {eta?.source === "approx" && !stale && " · times are estimated"}
        </p>

        {/* ── Which booking ───────────────────────────────────────────── */}
        {(reference || open) && <div className="mt-4 h-px bg-white/10" />}

        {reference && (
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">BOOKING</p>
              {/* 22px, and never truncated: rideReference() is always exactly
                  "RR-" + 6 characters, and a booking number missing its last
                  character is the one thing on this screen a customer will
                  read down a phone line. */}
              <p className="mt-0.5 font-syne text-[22px] font-extrabold leading-none text-offwhite sm:text-[26px]">
                {reference}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 font-dm text-[11px] font-bold text-offwhite">
              {BADGE[status] ?? "Tracking"}
            </span>
          </div>
        )}

        {open && (
          <>
            {/* ── How far along ───────────────────────────────────────── */}
            <JourneyTrack
              stages={STAGES}
              at={at}
              calloutLabel={eta ? `${formatEta(eta.minutes)} away` : null}
              stalled={stale}
            />

            {/* ── Where ───────────────────────────────────────────────── */}
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">FROM</p>
                <p
                  className={`mt-1 flex items-start gap-1.5 font-dm text-[13px] ${
                    status === "on_trip" ? "text-muted" : "text-offwhite"
                  }`}
                >
                  <MapPin size={12} className="mt-0.5 shrink-0 text-yellow" />
                  <span className="min-w-0 break-words">
                    {pickupLabel ?? snapshot?.pickupLabel ?? "Pickup"}
                  </span>
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">TO</p>
                <p className="mt-1 flex items-start gap-1.5 font-dm text-[13px] text-offwhite">
                  <Navigation size={12} className="mt-0.5 shrink-0 text-yellow" />
                  <span className="min-w-0 break-words">
                    {dropoffLabel ?? snapshot?.dropoffLabel ?? "Destination"}
                  </span>
                </p>
              </div>
            </div>

            {/* ── What for ────────────────────────────────────────────── */}
            {(fare || passengerName) && (
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                {fare && (
                  <div className="min-w-0">
                    <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">FARE</p>
                    <p className="mt-0.5 truncate font-syne text-base font-extrabold text-offwhite">
                      {fare}
                    </p>
                  </div>
                )}
                {passengerName && (
                  <div className="min-w-0">
                    <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">PASSENGER</p>
                    <p className="mt-0.5 truncate font-syne text-base font-extrabold text-offwhite">
                      {passengerName}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          // py-3.5 takes an 11px line to a ~44px target. It was 16.5px — the
          // only control for the whole details section, and too small to hit.
          className="mt-2 flex w-full items-center justify-center gap-1 py-3.5 font-dm text-[11px] text-muted hover:text-yellow"
        >
          {open ? "Hide details" : "Show details"}
          <ChevronDown
            size={13}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
