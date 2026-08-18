"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_MS, subscribeToTrip, type ChannelState } from "./channel";
import { freshness, shouldAcceptFix, type Fix, type Freshness, type TrackingStatus } from "./model";

// ── THE WATCHER'S HALF ──────────────────────────────────────────────────────
//
// TWO SOURCES, ONE TRUTH. Broadcast supplies the smooth movement; a polled
// server snapshot is the authority. They are not redundant — each covers the
// other's exact failure:
//
//   Broadcast alone   → a dropped socket freezes the dot with no way to know,
//                       and a page opened mid-trip starts blank.
//   Polling alone     → a dot that hops every 25 s. Correct, and cheap-looking.
//
// The snapshot also carries what Broadcast never should: the trip's stage, the
// endpoints, and how old the position really is. A frame on a public channel is
// a position and nothing else.

export type TripSnapshot = {
  ok: boolean;
  status: TrackingStatus;
  endedAt: string | null;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speedKmh: number | null;
  accuracyM: number | null;
  recordedAt: string | null;
  ageSeconds: number | null;
  pickupLat: number | null; pickupLng: number | null;
  dropoffLat: number | null; dropoffLng: number | null;
  pickupLabel: string | null; dropoffLabel: string | null;
  staleAfterSeconds: number;
  eta?: { minutes: number; km: number; source: "route" | "approx" } | null;
};

export type TripTrackingState = {
  snapshot: TripSnapshot | null;
  /** The position to DRAW: the freshest of broadcast and snapshot. */
  fix: Fix | null;
  freshness: Freshness;
  /** Seconds since the position on screen was produced. Counts up on its own. */
  ageSeconds: number | null;
  channel: ChannelState;
  loading: boolean;
  refresh: () => void;
};

/**
 * How often the "last seen" line re-reads the clock.
 *
 * This is not decoration. Without it, freshness is computed once per render and
 * a page nobody is interacting with keeps saying "Live" indefinitely while the
 * driver's phone is off — which is the single failure this whole screen exists
 * to prevent. Five seconds is finer than the 45 s live/delayed boundary.
 */
const AGE_TICK_MS = 5000;

export function useTripTracking(args: {
  /** How the watcher proves it may look. Passed straight through to the API. */
  lookup: Record<string, string> | null;
  /** From the same guarded response that authorised this watcher. */
  channelKey: string | null;
  /** Stop everything once the trip is over. */
  active: boolean;
}): TripTrackingState {
  const { lookup, channelKey, active } = args;
  const [snapshot, setSnapshot] = useState<TripSnapshot | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [socket, setSocket] = useState<ChannelState>("closed");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  // When the last BROADCAST frame arrived, and a clock that ticks on its own.
  // Both are STATE rather than refs: freshness is rendered, and a value the
  // render reads has to be one React knows changed.
  const [lastBroadcastAt, setLastBroadcastAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const fixRef = useRef<Fix | null>(null);
  // The same instant, readable inside callbacks without making them depend on
  // it. Kept in step by the setter below, never read during render.
  const lastBroadcastRef = useRef(0);

  const lookupKey = lookup ? JSON.stringify(lookup) : null;

  const load = useCallback(async () => {
    if (!lookupKey) return;
    try {
      const res = await fetch("/api/tracking/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: lookupKey,
        cache: "no-store",
      });
      const body = (await res.json()) as TripSnapshot;
      if (!body?.ok) { setLoading(false); return; }
      setSnapshot(body);

      if (body.lat != null && body.lng != null) {
        const snapFix: Fix = {
          lat: body.lat, lng: body.lng,
          heading: body.heading, speedKmh: body.speedKmh, accuracyM: body.accuracyM,
          at: body.recordedAt ? Date.parse(body.recordedAt) : Date.now(),
        };
        // A snapshot may only overrule the live stream once the stream has
        // actually gone quiet — otherwise every poll drags the marker back to a
        // position 25 seconds old.
        const streamIsQuiet = Date.now() - lastBroadcastRef.current > 15_000;
        if (!fixRef.current || streamIsQuiet) {
          fixRef.current = snapFix;
          setFix(snapFix);
        }
      }
    } catch {
      // Leave the last good state on screen. A failed poll is not evidence the
      // driver stopped, and blanking the map on a flaky connection is worse than
      // an ageing dot the "last seen" line is already qualifying.
    } finally {
      setLoading(false);
    }
  }, [lookupKey]);

  // First read, and whenever the caller forces one.
  // Synchronising with an external system — the rule's documented escape
  // hatch. This kicks off an async read whose setState calls all happen after
  // an await; the rule cannot see that and flags the call site conservatively.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, tick]);

  // The authoritative poll. Stops dead when the trip ends — a page left open
  // overnight must not poll until morning.
  useEffect(() => {
    if (!active || !lookupKey) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [active, lookupKey, load]);

  // The clock behind "last seen". Also stops when the trip does.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  // The live stream.
  useEffect(() => {
    if (!active || !channelKey) return;
    return subscribeToTrip(
      channelKey,
      (incoming) => {
        lastBroadcastRef.current = Date.now();
        setLastBroadcastAt(lastBroadcastRef.current);
        if (!shouldAcceptFix(fixRef.current, incoming)) return;
        fixRef.current = incoming;
        setFix(incoming);
      },
      setSocket,
    );
  }, [active, channelKey]);

  // Derived, not stored: with no key or an ended trip there is nothing to be
  // connected to, so the socket state is "closed" by definition rather than by
  // an effect remembering to set it.
  const channel: ChannelState = active && channelKey ? socket : "closed";

  // Age is measured from the DATABASE's clock via ageSeconds, then advanced
  // locally by any broadcast frames since. Deriving it from a device timestamp
  // would make a driver with a wrong phone clock look permanently offline.
  const ageSeconds = (() => {
    if (lastBroadcastAt && now - lastBroadcastAt < 60_000) {
      return Math.round((now - lastBroadcastAt) / 1000);
    }
    if (snapshot?.ageSeconds == null) return null;
    // The snapshot's age was true when it was fetched; add the time since.
    const fetchedAgo = snapshot.recordedAt
      ? Math.max(0, Math.round((now - Date.parse(snapshot.recordedAt)) / 1000))
      : snapshot.ageSeconds;
    return Math.max(snapshot.ageSeconds, fetchedAgo);
  })();

  return {
    snapshot,
    fix,
    freshness: freshness(ageSeconds, snapshot?.staleAfterSeconds ?? 600),
    ageSeconds,
    channel,
    loading,
    refresh: useCallback(() => setTick((n) => n + 1), []),
  };
}
