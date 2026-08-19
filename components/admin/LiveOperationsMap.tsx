"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Loader2, RefreshCw, Car, Truck, Phone, MessageCircle, MapPin, Navigation,
  Signal, SignalLow, SignalZero, AlertTriangle, X, Eye,
} from "lucide-react";
import { freshness, lastSeenLabel, type Freshness } from "@/lib/tracking/model";
import { subscribeToTrip, watchFleetPresence, type DriverPresence } from "@/lib/tracking/channel";
import { fleetDutyLabel, fleetFilterKey } from "@/lib/delivery/availability";
import type { MapPin as Pin } from "@/components/tracking/TrackingMap";
import LiveTripView from "@/components/tracking/LiveTripView";

const TrackingMap = dynamic(() => import("@/components/tracking/TrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-dark-card">
      <Loader2 size={22} className="animate-spin text-yellow/60" />
    </div>
  ),
});

// ── THE ISLAND, RIGHT NOW ───────────────────────────────────────────────────
//
// One screen that answers "who is out there and what are they doing", which
// until now took three tabs and a phone call.
//
// ── WHY THIS POLLS RATHER THAN STREAMS ──────────────────────────────────────
// Every driver has their own trip channel, and subscribing to all of them would
// mean one socket per driver on a screen that is left open all day — the fastest
// way to spend a 200-connection free tier on a page nobody is watching closely.
// The board therefore reads the DATABASE every 10 s (positions are written every
// 20 s, so nothing is missed), and opens exactly ONE live channel: the driver
// the operator has actually clicked. That driver moves smoothly; the rest tick.

type Job = {
  kind: "ride" | "delivery"; id: string; status: string; ref: string;
  customerName: string | null; customerPhone: string | null;
  pickup: string | null; dropoff: string | null;
  pickupLat: number | null; pickupLng: number | null;
  dropoffLat: number | null; dropoffLng: number | null;
  channelKey: string | null;
};
type Driver = {
  kind: "taxi" | "delivery"; id: string; name: string; phone: string | null;
  vehicle: string | null; vehicleType: string | null;
  availability: string; services: string[];
  lat: number | null; lng: number | null;
  positionSource: "live" | "base" | null;
  heading: number | null; speedKmh: number | null;
  ageSeconds: number | null; trackingStatus: string;
  job: Job | null;
};
type Board = { ok: boolean; staleAfterSeconds: number; at: string; drivers: Driver[] };

type Filter = "all" | "available" | "busy" | "offline" | "taxi" | "transfer" | "delivery";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  // "Busy" rather than "On a job": the bucket holds both a driver on a run and
  // a taxi driver the office marked busy with no ride attached. The second kind
  // used to match no chip at all.
  { key: "busy", label: "Busy" },
  { key: "offline", label: "Offline" },
  { key: "taxi", label: "Taxi" },
  { key: "transfer", label: "Transfer" },
  { key: "delivery", label: "Delivery" },
];

const REFRESH_MS = 10_000;

function matches(d: Driver, f: Filter): boolean {
  switch (f) {
    case "all": return true;
    // "Available" still means available AND NOT already holding a job — an
    // operator asking who can take this run does not want somebody mid-delivery
    // whose switch happens to say available. What changed is that the three
    // buckets now PARTITION the fleet: written as three independent predicates,
    // a driver marked busy with no live job matched none of them and showed up
    // only under "All".
    case "available":
    case "busy":
    case "offline":
      return fleetFilterKey(d.availability, !!d.job) === f;
    case "taxi": return d.kind === "taxi" && d.services.includes("taxi");
    case "transfer":
      return d.kind === "taxi" && (d.services.includes("transfer") || d.services.includes("airport"));
    case "delivery": return d.kind === "delivery";
  }
}

function signalIcon(f: Freshness) {
  if (f === "live") return <Signal size={13} className="text-green-400" />;
  if (f === "delayed") return <SignalLow size={13} className="text-yellow" />;
  return <SignalZero size={13} className="text-muted" />;
}

export default function LiveOperationsMap() {
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The one driver we stream, overlaid on their polled position.
  const [streamed, setStreamed] = useState<
    { key: string; lat: number; lng: number; heading: number | null } | null
  >(null);
  /** The driver whose customer-facing tracking screen the operator is watching. */
  const [watching, setWatching] = useState<Driver | null>(null);
  // ── PRESENCE ───────────────────────────────────────────────────────────
  // The board polls the DATABASE every 10 s, which is the authority on where
  // everyone is — but a last-known timestamp cannot tell a dead phone from a
  // quiet minute until stale_location_minutes has elapsed. Presence fires a
  // `leave` in seconds. One socket for the whole fleet, not one per driver.
  const [present, setPresent] = useState<Set<string>>(new Set());
  useEffect(
    () =>
      watchFleetPresence((list: DriverPresence[]) =>
        setPresent(new Set(list.map((p) => `${p.driverKind}:${p.driverId}`))),
      ),
    [],
  );
  const isTransmitting = useCallback(
    (d: Driver) => present.has(`${d.kind}:${d.id}`),
    [present],
  );

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch("/api/admin/live-map", { cache: "no-store" });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(b.error ?? "Could not load the live map.");
        return;
      }
      setBoard((await res.json()) as Board);
      setErr(null);
    } catch {
      setErr("No connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Quiet: `loading` already starts true, so the first read must not set it
  // again on the way in.
  // Synchronising with an external system — the rule's documented escape
  // hatch. This kicks off an async read whose setState calls all happen after
  // an await; the rule cannot see that and flags the call site conservatively.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const id = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Wrapped so the memos below do not see a new array identity every render.
  const drivers = useMemo(() => board?.drivers ?? [], [board]);
  const selected = drivers.find((d) => d.id === selectedId) ?? null;

  // ── THE RECENT PATH ────────────────────────────────────────────────────
  // Accumulated HERE, in the operator's browser, from the positions we are
  // already receiving — not stored anywhere.
  //
  // That is a deliberate choice, not a shortcut. driver_locations is one row
  // per driver, upserted, precisely so there is nowhere to keep a trail; the
  // engine's own comment calls that the cheapest way to honour "do not track
  // drivers forever". Persisting a breadcrumb table would quietly undo it. A
  // trail that lives only as long as somebody is watching answers "did he
  // really go via Mont Lubin" without building a history of anyone's movements.
  // Tagged with the channel it belongs to, the same way `streamed` is: a
  // different driver's path is discarded by COMPARISON rather than by an effect
  // racing to clear it.
  const [trail, setTrail] = useState<{ key: string; points: [number, number][] } | null>(null);

  // One socket, for the selected driver only.
  useEffect(() => {
    const key = selected?.job?.channelKey;
    if (!key) return;
    return subscribeToTrip(key, (fix) => {
      setStreamed({ key, lat: fix.lat, lng: fix.lng, heading: fix.heading });
      setTrail((prev) => {
        const points = prev?.key === key ? prev.points : [];
        const last = points[points.length - 1];
        // Skip near-duplicates: a stationary driver would otherwise pile
        // thousands of identical points into the array.
        if (last && Math.abs(last[0] - fix.lat) < 1e-5 && Math.abs(last[1] - fix.lng) < 1e-5) {
          return prev;
        }
        // Capped: this is a "recent" path, and an unbounded array on a screen
        // left open all day is a leak with a nice name.
        const next: [number, number][] = [...points, [fix.lat, fix.lng]];
        return { key, points: next.length > 300 ? next.slice(next.length - 300) : next };
      });
    });
  }, [selected?.job?.channelKey]);

  // Tagging each frame with its channel means selecting another driver discards
  // the old stream by comparison rather than by an effect racing to null it.
  const livePos =
    streamed && streamed.key === selected?.job?.channelKey ? streamed : null;

  const visible = useMemo(
    () => drivers.filter((d) => matches(d, filter) && d.lat != null && d.lng != null),
    [drivers, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = drivers.filter((d) => matches(d, f.key)).length;
    return c;
  }, [drivers]);

  const stale = board?.staleAfterSeconds ?? 600;

  // Is ANYBODY transmitting, anywhere in the fleet? Distinct from "in this
  // filter", and the difference decides what the empty map should say.
  const anyoneSharing = drivers.some((d) => d.positionSource === "live");
  // Taxi drivers with neither a live fix nor a base. Until one or the other
  // exists they cannot be ranked by distance OR drawn, so dispatch silently
  // scores them "position unknown" and an operator has no way to see why.
  const taxiWithoutBase = drivers.filter(
    (d) => d.kind === "taxi" && d.positionSource === null,
  );

  const pins: Pin[] = useMemo(
    () =>
      visible.map((d) => {
        const isSel = d.id === selectedId;
        const pos = isSel && livePos ? livePos : { lat: d.lat!, lng: d.lng!, heading: d.heading };
        return {
          id: `${d.kind}-${d.id}`,
          lat: pos.lat, lng: pos.lng,
          kind: "driver" as const,
          bearing: pos.heading,
          // A driver with no live fix is drawn from their BASE, which is where
          // they usually wait rather than where they are. Greyed for the same
          // reason a stale fix is: an operator must never mistake one for the
          // other.
          stale: d.positionSource !== "live" || freshness(d.ageSeconds, stale) === "stale",
          vehicle: d.kind === "delivery" ? "bike" : "car",
          selected: isSel,
          label: d.name,
          onClick: () => setSelectedId(d.id),
        };
      }),
    [visible, selectedId, livePos, stale],
  );

  // Frame once, when drivers first appear. Refitting every 10 s would yank the
  // map away from whatever the operator is looking at. TrackingMap itself only
  // honours the first non-empty fitTo, so this only has to stop CHANGING.
  const hasAnyVisible = visible.length > 0;
  const fitTo = useMemo(
    () => (hasAnyVisible ? visible.map((d) => [d.lat!, d.lng!] as [number, number]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasAnyVisible],
  );

  const withoutPosition = drivers.filter(
    (d) => matches(d, filter) && (d.lat == null || d.lng == null),
  );

  return (
    <div className="space-y-3">
      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3 py-1.5 font-dm text-xs font-bold transition-colors ${
              filter === f.key
                ? "border-yellow bg-yellow text-dark"
                : "border-white/15 bg-dark-card text-offwhite/80 hover:border-yellow/50"
            }`}
          >
            {f.label}
            <span className={`ml-1.5 tabular-nums ${filter === f.key ? "text-dark/60" : "text-muted"}`}>
              {counts[f.key] ?? 0}
            </span>
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-yellow/50 hover:text-yellow"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {err && (
        <p role="alert" className="rounded-xl border border-orange-400/30 bg-orange-400/[0.07] px-4 py-3 font-dm text-sm text-orange-300">
          {err}
        </p>
      )}

      {/* ── Map + detail ─────────────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="h-[480px] overflow-hidden rounded-2xl border border-white/10 lg:h-[620px]">
          {loading && !board ? (
            <div className="flex h-full items-center justify-center bg-dark-card">
              <Loader2 size={24} className="animate-spin text-yellow/60" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-dark-card px-8 text-center">
              <MapPin size={26} className="text-muted" />
              {/* Three different situations that all used to look like one
                  empty map. An operator opening this on the first driving day
                  needs to know which of them they are looking at, because each
                  has a different next action — add a driver, wait, or check
                  that somebody actually pressed I'M WORKING. */}
              <p className="font-dm text-sm font-bold text-offwhite">
                {drivers.length === 0
                  ? "No drivers on the platform yet"
                  : anyoneSharing
                    ? "Nobody in this filter has a position"
                    : "No drivers sharing location yet"}
              </p>
              <p className="max-w-[42ch] font-dm text-xs leading-relaxed text-muted">
                {drivers.length === 0
                  ? "Add a taxi driver or approve a delivery partner, and they appear here once they go on duty."
                  : anyoneSharing
                    ? "Try the All filter — somebody is sharing, just not in this group."
                    : "A driver appears the moment they open their own page, press I'M WORKING and allow location. Nobody has done that yet."}
              </p>
            </div>
          ) : (
            <TrackingMap
              pins={pins}
              driver={
                selected && selected.lat != null && selected.lng != null
                  ? {
                      id: "sel",
                      lat: livePos?.lat ?? selected.lat,
                      lng: livePos?.lng ?? selected.lng,
                      kind: "driver",
                      bearing: livePos?.heading ?? selected.heading,
                      stale: selected.positionSource !== "live",
                      vehicle: selected.kind === "delivery" ? "bike" : "car",
                      selected: true,
                    }
                  : null
              }
              fitTo={fitTo}
              follow={false}
              trail={
                trail && trail.key === selected?.job?.channelKey && trail.points.length > 1
                  ? trail.points
                  : null
              }
            />
          )}
        </div>

        {/* ── Detail panel ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
          {selected ? (
            <DriverDetail
              d={selected}
              stale={stale}
              live={livePos}
              onClose={() => setSelectedId(null)}
              onWatch={setWatching}
            />
          ) : (
            <>
              <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">ON DUTY</p>
              <p className="mt-1 font-dm text-xs text-muted">
                Tap a driver on the map, or pick one below.
              </p>
              <ul className="mt-3 max-h-[520px] space-y-1 overflow-y-auto">
                {drivers.filter((d) => matches(d, filter)).map((d) => {
                  const f = freshness(d.ageSeconds, stale);
                  return (
                    <li key={`${d.kind}-${d.id}`}>
                      <button
                        onClick={() => setSelectedId(d.id)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        {d.kind === "delivery" ? (
                          <Truck size={15} className="shrink-0 text-muted" />
                        ) : (
                          <Car size={15} className="shrink-0 text-muted" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-dm text-[13px] text-offwhite">{d.name}</span>
                          <span className="block truncate font-dm text-[10px] text-muted">
                            {d.job ? `On ${d.job.ref}` : fleetDutyLabel(d.availability, false).short}
                            {d.positionSource === "base" && " · base only"}
                            {isTransmitting(d) && " · transmitting"}
                          </span>
                        </span>
                        {signalIcon(d.positionSource === "live" ? f : "unknown")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ── THE CUSTOMER'S OWN SCREEN ────────────────────────────────────
          Admin authorises with the ADMIN_PASSWORD cookie, which
          /api/tracking/trip already accepts alongside a trip id — so this needs
          no new endpoint and no new credential. */}
      {watching?.job && (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
                WHAT {watching.name.toUpperCase()}&apos;S CUSTOMER SEES
              </p>
              <p className="font-dm text-[11px] text-muted">
                {watching.job.ref} · the same screen, live
              </p>
            </div>
            <button
              onClick={() => setWatching(null)}
              aria-label="Close the customer view"
              className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-offwhite"
            >
              <X size={15} />
            </button>
          </div>
          <LiveTripView
            lookup={{ kind: watching.job.kind, tripId: watching.job.id }}
            channelKey={watching.job.channelKey}
            active
            driver={{
              name: watching.name,
              phone: watching.phone,
              vehicle: watching.vehicle,
              photo: null,
              rating: null,
              ratingCount: 0,
              ridesCompleted: null,
            }}
            pickupLabel={watching.job.pickup}
            dropoffLabel={watching.job.dropoff}
            reference={watching.job.ref}
            passengerName={watching.job.customerName}
          />
        </div>
      )}

      {/* ── THE ONE SETTING THAT HAS TO BE FILLED IN ──────────────────────
          A taxi driver with no live fix AND no base location is invisible to
          both the map and to distance ranking — dispatch scores them "position
          unknown" and offers them work as if they were nowhere. It is one field
          in their record, and nothing else surfaces that it is empty. */}
      {taxiWithoutBase.length > 0 && (
        <div className="rounded-2xl border border-yellow/30 bg-yellow/[0.06] px-4 py-3">
          <p className="flex items-center gap-1.5 font-dm text-xs font-bold text-offwhite">
            <AlertTriangle size={13} className="text-yellow" />
            {taxiWithoutBase.length} taxi driver{taxiWithoutBase.length === 1 ? " has" : "s have"} no
            base location
          </p>
          <p className="mt-1 font-dm text-[11px] leading-relaxed text-muted">
            {taxiWithoutBase.map((d) => d.name).join(", ")} — until they share a live position or you
            set where they usually wait, they cannot be ranked by distance and will not appear on
            this map. Set it in their driver record.
          </p>
        </div>
      )}

      {/* Drivers a map cannot show. Silently omitting them is how an operator
          concludes somebody is not working when they simply have no GPS. */}
      {withoutPosition.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-dark-card px-4 py-3">
          <p className="flex items-center gap-1.5 font-dm text-xs font-bold text-offwhite">
            <AlertTriangle size={13} className="text-yellow" />
            {withoutPosition.length} not on the map
          </p>
          <p className="mt-1 font-dm text-[11px] leading-relaxed text-muted">
            {withoutPosition.map((d) => d.name).join(", ")} — no position shared and no base
            location set. Add a base in their driver record so they can still be ranked by
            distance, or ask them to open their link and go on duty.
          </p>
        </div>
      )}
    </div>
  );
}

function DriverDetail({
  d, stale, live, onClose, onWatch,
}: {
  d: Driver;
  stale: number;
  live: { lat: number; lng: number; heading: number | null } | null;
  onClose: () => void;
  onWatch: (d: Driver) => void;
}) {
  const f = d.positionSource === "live" ? freshness(d.ageSeconds, stale) : "unknown";
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
            {d.kind === "taxi" ? "TAXI / TRANSFER" : "DELIVERY"}
          </p>
          <p className="truncate font-syne text-lg font-extrabold text-offwhite">{d.name}</p>
          {d.vehicle && <p className="truncate font-dm text-xs text-muted">{d.vehicle}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Close driver details"
          className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-offwhite"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-dark px-3 py-2.5">
        {signalIcon(f)}
        <span className="min-w-0 flex-1">
          <span className="block font-dm text-xs font-bold text-offwhite">
            {d.positionSource === "live"
              ? lastSeenLabel(d.ageSeconds)
              : d.positionSource === "base"
                ? "Shown at their base"
                : "No position"}
          </span>
          <span className="block font-dm text-[10px] text-muted">
            {d.positionSource === "live"
              ? d.speedKmh != null && d.speedKmh > 3
                ? `Moving · ${Math.round(d.speedKmh)} km/h`
                : "Stationary"
              : d.positionSource === "base"
                ? "Where they usually wait — not a live fix"
                : "They have not gone on duty with their page open"}
            {live && " · streaming"}
          </span>
        </span>
      </div>

      {/* ── The job ────────────────────────────────────────────────────── */}
      {d.job ? (
        <div className="mt-3 rounded-xl border border-green-500/25 bg-green-500/[0.06] p-3">
          <p className="font-bebas text-[10px] tracking-[0.22em] text-green-400">
            {d.job.ref} · {d.job.status.replace(/_/g, " ")}
          </p>
          {d.job.customerName && (
            <p className="mt-1 font-dm text-sm font-bold text-offwhite">{d.job.customerName}</p>
          )}
          <div className="mt-1.5 space-y-1 font-dm text-[11px]">
            <p className="flex items-start gap-1.5">
              <MapPin size={11} className="mt-0.5 shrink-0 text-yellow" />
              <span className="text-offwhite/80">{d.job.pickup ?? "—"}</span>
            </p>
            <p className="flex items-start gap-1.5">
              <Navigation size={11} className="mt-0.5 shrink-0 text-green-400" />
              <span className="text-offwhite/80">{d.job.dropoff ?? "—"}</span>
            </p>
          </div>
          {d.job.customerPhone && (
            <a
              href={`tel:${d.job.customerPhone}`}
              className="mt-2 inline-flex items-center gap-1.5 font-dm text-[11px] font-bold text-yellow underline underline-offset-2"
            >
              <Phone size={11} /> Call the customer
            </a>
          )}

          {/* ── SEE WHAT THE CUSTOMER SEES ──────────────────────────────
              The owner asked to be able to watch the tracking too. This opens
              the EXACT screen the customer has — same map, same route, same
              ETA, same stale wording — rather than an admin-flavoured
              approximation of it. When a customer phones to say "it says he's
              five minutes away and he isn't", the answer is on the same pixels
              they are looking at.

              It is the same component, so nothing here can drift from it. */}
          <button
            onClick={() => onWatch(d)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2.5 font-dm text-[11px] font-bold text-offwhite hover:border-yellow/50 hover:text-yellow"
          >
            <Eye size={12} /> See what the customer sees
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-white/10 bg-dark px-3 py-2.5 font-dm text-xs text-muted">
          {fleetDutyLabel(d.availability, false).long}
        </p>
      )}

      {/* ── Reach the driver ───────────────────────────────────────────── */}
      {d.phone && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={`tel:${d.phone}`}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-yellow py-2.5 font-dm text-xs font-bold text-dark"
          >
            <Phone size={13} /> Call
          </a>
          <a
            href={`https://wa.me/${d.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2.5 font-dm text-xs font-bold text-black"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
