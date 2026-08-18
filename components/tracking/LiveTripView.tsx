"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Phone, MessageCircle, Car, Loader2, WifiOff, MapPin, Navigation, Clock,
  CircleDot, Check,
} from "lucide-react";
import { useTripTracking } from "@/lib/tracking/useTripTracking";
import {
  formatDistance, formatEta, lastSeenLabel, TRACKING_CUSTOMER_STATUS,
} from "@/lib/tracking/model";

const TrackingMap = dynamic(() => import("./TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dark-card">
      <Loader2 size={22} className="animate-spin text-yellow/60" />
    </div>
  ),
});

// ── "WHERE IS MY DRIVER" ────────────────────────────────────────────────────
//
// The map is the hero and everything else floats over it, because the question
// this screen answers is spatial. The card is a sheet pinned to the bottom on a
// phone — thumb-reachable, and it leaves the top two-thirds to the thing the
// customer actually came to look at.
//
// ── THE RULE THIS SCREEN FOLLOWS ────────────────────────────────────────────
// NEVER show a confident dot for a position we are not confident about. Three
// distinct states, worded differently on purpose:
//
//   live      a pulsing marker, an ETA, a moving line
//   delayed   the pulse stops, "last seen 3 min ago" appears, the ETA stays
//   stale     the marker greys out, the ETA is REMOVED rather than left to age
//
// A frozen dot that still claims to be live is worse than no map at all: it is
// the thing that makes a customer stand on a kerb watching a car that is not
// coming. lib/tracking/model.ts owns the thresholds so every surface agrees.

export type TripDriver = {
  name: string;
  phone: string | null;
  vehicle: string | null;
  photo?: string | null;
  rating?: number | null;
};

const STEPS = [
  { key: "pending", label: "Driver found", icon: Check },
  { key: "en_route_pickup", label: "On the way to you", icon: Car },
  { key: "at_pickup", label: "Arrived", icon: MapPin },
  { key: "on_trip", label: "On your trip", icon: Navigation },
  { key: "ended", label: "Complete", icon: Check },
] as const;

function stepIndex(status: string): number {
  const i = STEPS.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

export default function LiveTripView({
  lookup, channelKey, driver, active, pickupLabel, dropoffLabel, headerSlot,
}: {
  /** The credential that authorised this watcher, replayed on every poll. */
  lookup: Record<string, string> | null;
  channelKey: string | null;
  driver: TripDriver | null;
  active: boolean;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  headerSlot?: React.ReactNode;
}) {
  const { snapshot, fix, freshness, ageSeconds, channel, loading } = useTripTracking({
    lookup, channelKey, active,
  });
  const [expanded, setExpanded] = useState(true);

  const stale = freshness === "stale" || freshness === "unknown";
  const status = snapshot?.status ?? "pending";
  const at = stepIndex(status);

  const pins = useMemo(() => {
    const out: { id: string; lat: number; lng: number; kind: "pickup" | "dropoff"; label?: string }[] = [];
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
  // destination after it. Getting this backwards shows a passenger an ETA to
  // the kerb they are already standing on.
  const target =
    status === "on_trip"
      ? { lat: snapshot?.dropoffLat, lng: snapshot?.dropoffLng }
      : { lat: snapshot?.pickupLat, lng: snapshot?.pickupLng };

  const directLine =
    fix && target.lat != null && target.lng != null && !stale
      ? ([[fix.lat, fix.lng], [target.lat, target.lng]] as [[number, number], [number, number]])
      : null;

  const fitTo = useMemo(() => {
    const pts: [number, number][] = [];
    if (fix) pts.push([fix.lat, fix.lng]);
    if (target.lat != null && target.lng != null) pts.push([target.lat, target.lng]);
    return pts.length ? pts : null;
  }, [fix, target.lat, target.lng]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-dark-card">
      {/* ── The map ─────────────────────────────────────────────────────── */}
      <div className="h-[420px] w-full sm:h-[480px]">
        {fix ? (
          <TrackingMap
            driver={{
              id: "driver", lat: fix.lat, lng: fix.lng, kind: "driver",
              bearing: fix.heading, stale, vehicle: "car",
            }}
            pins={pins}
            directLine={directLine}
            fitTo={fitTo}
            follow
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-dark px-8 text-center">
            {loading ? (
              <Loader2 size={26} className="animate-spin text-yellow/70" />
            ) : (
              <>
                <MapPin size={26} className="text-muted" />
                <p className="font-dm text-sm text-muted">
                  {/* Honest about WHY there is no map, rather than an empty grey
                      box the customer reads as broken. */}
                  {active
                    ? "Your driver hasn't shared their location yet. It appears here as soon as they set off."
                    : "This trip has finished."}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Status pill, floating ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-4">
        {headerSlot}
        <span
          className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-4 py-2 font-dm text-[13px] font-bold shadow-lg backdrop-blur ${
            stale
              ? "border-white/15 bg-dark/85 text-muted"
              : "border-yellow/35 bg-dark/85 text-yellow"
          }`}
        >
          {!stale && <CircleDot size={13} className="animate-pulse" />}
          {TRACKING_CUSTOMER_STATUS[status as keyof typeof TRACKING_CUSTOMER_STATUS] ?? "Tracking"}
        </span>

        {/* Only ever shown when it is TRUE — a permanent "connection" chip
            trains people to ignore it. */}
        {channel === "error" && active && (
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-dark/85 px-3 py-1.5 font-dm text-[11px] text-orange-300 backdrop-blur">
            <WifiOff size={11} /> Reconnecting — the map may lag
          </span>
        )}
      </div>

      {/* ── The floating card ───────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="rounded-2xl border border-white/12 bg-dark/92 p-4 shadow-2xl backdrop-blur-md">
          {/* Driver identity + the two numbers that matter */}
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-yellow/30 bg-yellow/10">
              {driver?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={driver.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <Car size={20} className="text-yellow" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-syne text-base font-extrabold text-offwhite">
                {driver?.name ?? "Your driver"}
              </p>
              <p className="truncate font-dm text-xs text-muted">
                {driver?.vehicle ?? "—"}
                {driver?.rating != null && ` · ★ ${driver.rating.toFixed(1)}`}
              </p>
            </div>

            {/* ETA. Removed entirely when the position is stale rather than
                left to quietly age into a lie. */}
            <div className="shrink-0 text-right">
              {snapshot?.eta && !stale ? (
                <>
                  <p className="font-syne text-xl font-extrabold leading-none text-yellow">
                    {formatEta(snapshot.eta.minutes)}
                  </p>
                  <p className="mt-0.5 font-dm text-[10px] text-muted">
                    {formatDistance(snapshot.eta.km)}
                    {/* The brief asked for this explicitly: an approximation must
                        say so. "approx" is the difference between a number a
                        customer can trust and one they learn to discount. */}
                    {snapshot.eta.source === "approx" && " · approx"}
                  </p>
                </>
              ) : (
                <p className="font-dm text-[11px] text-muted">
                  {stale ? "No live position" : "—"}
                </p>
              )}
            </div>
          </div>

          {/* Freshness, always. This is the line that stops somebody standing on
              a kerb watching a dot that stopped updating ten minutes ago. */}
          <p
            className={`mt-2.5 flex items-center gap-1.5 font-dm text-[11px] ${
              freshness === "live" ? "text-green-400"
                : freshness === "delayed" ? "text-yellow/90" : "text-muted"
            }`}
          >
            <Clock size={11} />
            {freshness === "live"
              ? "Live"
              : lastSeenLabel(ageSeconds)}
            {freshness === "stale" && " — we've lost their signal, they're probably still on the way"}
          </p>

          {/* ── The journey ────────────────────────────────────────────── */}
          {expanded && (
            <>
              <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                <p className={`flex items-start gap-2 font-dm text-[13px] ${status === "on_trip" ? "opacity-40" : ""}`}>
                  <MapPin size={13} className="mt-0.5 shrink-0 text-yellow" />
                  <span className="text-offwhite/85">
                    {pickupLabel ?? snapshot?.pickupLabel ?? "Pickup"}
                  </span>
                </p>
                <p className="flex items-start gap-2 font-dm text-[13px]">
                  <Navigation size={13} className="mt-0.5 shrink-0 text-green-400" />
                  <span className="text-offwhite/85">
                    {dropoffLabel ?? snapshot?.dropoffLabel ?? "Destination"}
                  </span>
                </p>
              </div>

              {/* ── Timeline ─────────────────────────────────────────────
                  Four dots, not a progress bar: a customer wants to know WHICH
                  stage, and a bar only says how far along. */}
              <ol className="mt-3 flex items-center gap-1" aria-label="Trip progress">
                {STEPS.slice(0, 4).map((s, i) => (
                  <li key={s.key} className="flex flex-1 items-center gap-1">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] ${
                        i <= at
                          ? "border-yellow bg-yellow text-dark"
                          : "border-white/15 bg-transparent text-muted"
                      }`}
                      aria-current={i === at ? "step" : undefined}
                    >
                      <s.icon size={12} />
                    </span>
                    {i < 3 && (
                      <span
                        className={`h-[2px] flex-1 rounded-full ${i < at ? "bg-yellow" : "bg-white/12"}`}
                      />
                    )}
                  </li>
                ))}
              </ol>
              <p className="mt-1 font-dm text-[10px] text-muted">
                {STEPS[Math.min(at, 3)].label}
              </p>
            </>
          )}

          {/* ── Reach them ─────────────────────────────────────────────── */}
          {driver?.phone && active && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`tel:${driver.phone}`}
                className="flex items-center justify-center gap-2 rounded-xl bg-yellow py-3 font-dm text-sm font-bold text-dark"
              >
                <Phone size={15} /> Call
              </a>
              <a
                href={`https://wa.me/${driver.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 font-dm text-sm font-bold text-black"
              >
                <MessageCircle size={15} /> Message
              </a>
            </div>
          )}

          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 w-full font-dm text-[11px] text-muted underline underline-offset-2 hover:text-yellow"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>
    </div>
  );
}
