"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTripPublisher, joinFleetPresence, PERSIST_MS,
} from "./channel";
import {
  filterFix, isOnRodrigues, publishIntervalMs,
  type Fix, type TrackingStatus,
} from "./model";

// ── THE DRIVER'S HALF OF TRACKING ───────────────────────────────────────────
//
// One hook for both kinds of driver. The only difference between a taxi driver
// and a delivery driver here is the credential the ping carries, which is a
// parameter — everything else (permission, accuracy, publishing, persisting,
// backing off in the background) is identical, so it is written once.
//
// ── WHAT THE BROWSER WILL AND WILL NOT DO ───────────────────────────────────
// This is the honest limit of any web-based driver app, and it is stated in the
// UI as well as here:
//
//   · While the page is OPEN and visible, watchPosition() runs normally.
//   · Backgrounded (another app on top, screen locked), browsers throttle or
//     suspend timers and may stop delivering positions entirely. iOS Safari is
//     the strictest; Android Chrome is better but not guaranteed.
//   · Once the tab or PWA is CLOSED, tracking stops completely. There is no
//     web API for background geolocation — the Geolocation API has no service
//     worker access, and Background Sync cannot read location.
//
// So the driver is told to keep the screen on during a job. Everything below is
// built to degrade honestly rather than pretend: the last good fix is persisted
// to the database every 20 s, so even a phone that sleeps leaves a truthful
// "last seen 3 min ago" behind instead of a frozen dot claiming to be live.

export type GpsState =
  | "idle"           // not tracking
  | "prompting"      // permission dialog is up
  | "denied"         // the user (or the OS) said no
  | "unsupported"    // no Geolocation API at all
  | "searching"      // permission granted, no fix yet
  | "poor"           // fixes arriving, but too imprecise to be useful
  | "live"           // working
  | "paused"         // the page is backgrounded; the browser has stopped us
  | "off_island";    // a real fix, nowhere near Rodrigues

export type DriverTrackingCredential =
  | { kind: "taxi"; token: string }
  | { kind: "delivery" };

export type UseDriverTrackingArgs = {
  /** Master switch. False stops the watch and clears the server-side position. */
  enabled: boolean;
  credential: DriverTrackingCredential;
  /** Who this is, for fleet presence. Omit and presence is simply not joined. */
  driverKind?: "taxi" | "delivery";
  driverId?: string | null;
  /** Null while the driver has no job: we still persist, but broadcast nothing. */
  channelKey: string | null;
  trip: { kind: "ride" | "delivery"; id: string } | null;
  trackingStatus: TrackingStatus;
};

export type DriverTrackingState = {
  gps: GpsState;
  lastFix: Fix | null;
  /** Metres. Shown to the driver when it is bad, so "the map is wrong" has a cause. */
  accuracyM: number | null;
  /** True once at least one ping has reached the server. */
  reported: boolean;
  /** Set when the server refused a ping — a stale link, or a job that ended. */
  serverError: string | null;
  retry: () => void;
};

export function useDriverTracking({
  enabled, credential, channelKey, trip, trackingStatus, driverKind, driverId,
}: UseDriverTrackingArgs): DriverTrackingState {
  const [gpsState, setGps] = useState<GpsState>("idle");
  const [lastFix, setLastFix] = useState<Fix | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [reported, setReported] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const watchId = useRef<number | null>(null);
  const fixRef = useRef<Fix | null>(null);
  const lastPublish = useRef(0);
  const lastPersist = useRef(0);
  const publisher = useRef<ReturnType<typeof createTripPublisher> | null>(null);
  const inflight = useRef(false);

  // Latest values, read inside the geolocation callback without making the
  // callback a dependency — re-registering watchPosition on every status change
  // would drop the GPS lock and restart the acquisition each time.
  //
  // Written in an effect rather than during render: a ref assigned while
  // rendering is a side effect React may discard or replay, and the value here
  // decides which TRIP a position is published to.
  const ctx = useRef({ credential, channelKey, trip, trackingStatus });
  useEffect(() => {
    ctx.current = { credential, channelKey, trip, trackingStatus };
  });

  const persist = useCallback(async (fix: Fix) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const c = ctx.current;
      const res = await fetch("/api/tracking/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // keepalive so the final ping still lands if the driver closes the tab
        // mid-request. Without it the last position before "I'm off" is lost.
        keepalive: true,
        body: JSON.stringify({
          token: c.credential.kind === "taxi" ? c.credential.token : undefined,
          lat: fix.lat, lng: fix.lng,
          heading: fix.heading, speedKmh: fix.speedKmh, accuracyM: fix.accuracyM,
          trackingStatus: c.trackingStatus,
          tripKind: c.trip?.kind ?? null,
          tripId: c.trip?.id ?? null,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string } | null;
      if (res.ok && body?.ok) {
        setReported(true);
        setServerError(null);
      } else {
        setServerError(body?.error ?? "Could not report your position.");
      }
    } catch {
      // Offline. Not an error worth shouting about — the next fix retries in
      // four seconds, and the driver can see their own signal bars.
    } finally {
      inflight.current = false;
    }
  }, []);

  // ── PRESENCE: "somebody is there" ────────────────────────────────────────
  // Separate from position on purpose. The database's timestamp cannot tell a
  // dead phone from a quiet minute until `stale_location_minutes` has elapsed;
  // a dropped socket fires a presence `leave` in seconds. One is the authority
  // on WHERE, the other on WHETHER.
  //
  // Keyed on the driver, and torn down when they go off duty — so pressing
  // "I'M OFF" removes them from the admin board at once rather than when a
  // heartbeat eventually times out.
  const presence = useRef<ReturnType<typeof joinFleetPresence> | null>(null);
  useEffect(() => {
    if (!enabled || !driverKind || !driverId) return;
    const handle = joinFleetPresence({
      driverKind, driverId, onJob: Boolean(trip), since: Date.now(),
    });
    presence.current = handle;
    return () => {
      handle.close();
      presence.current = null;
    };
    // `trip` deliberately absent: a driver picking up a job must not drop and
    // rejoin the fleet channel. The effect below updates it in place instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, driverKind, driverId]);

  useEffect(() => {
    presence.current?.update(Boolean(trip));
  }, [trip]);

  // ── The publisher lives as long as the job does ──────────────────────────
  useEffect(() => {
    if (!enabled || !channelKey) {
      publisher.current?.close();
      publisher.current = null;
      return;
    }
    publisher.current = createTripPublisher(channelKey);
    return () => {
      publisher.current?.close();
      publisher.current = null;
    };
  }, [enabled, channelKey]);

  // ── The watch ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      if (watchId.current != null) navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
      // No setGps here: "idle" is what `enabled === false` MEANS, and deriving
      // it below removes a whole state transition that could be observed
      // half-applied.
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      // A browser capability check, which cannot run during render without
      // risking a hydration mismatch — the server has no `navigator`. This is
      // the rule's "synchronising with an external system" case.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGps("unsupported");
      return;
    }

    setGps((s) => (s === "live" || s === "poor" ? s : "prompting"));

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed, accuracy } = pos.coords;
        const fix: Fix = {
          lat: latitude,
          lng: longitude,
          heading: heading != null && Number.isFinite(heading) ? heading : null,
          // The API reports metres per second; everything else here is km/h.
          speedKmh: speed != null && Number.isFinite(speed) ? speed * 3.6 : null,
          accuracyM: Number.isFinite(accuracy) ? accuracy : null,
          at: pos.timestamp || Date.now(),
        };

        setAccuracyM(fix.accuracyM);

        // A driver testing the app from Mauritius or Europe would otherwise pin
        // themselves on the customer's map 2,000 km away. Say so instead.
        if (!isOnRodrigues(fix.lat, fix.lng)) {
          setGps("off_island");
          return;
        }
        // ── THE QUALITY PIPELINE ──────────────────────────────────────
        // Nothing is broadcast, drawn or written until it has survived this.
        // The rules and their reasoning live in lib/tracking/model.ts and are
        // unit-tested there; this is only where the answer is acted on.
        const decision = filterFix(fixRef.current, fix);

        if (!decision.accept) {
          // A REFUSAL IS INFORMATION. Going quiet is what makes a driver think
          // the app is broken when their signal is simply poor.
          if (decision.reason === "imprecise") setGps("poor");
          // Drift and out-of-order frames are normal and constant; they are not
          // worth telling anybody about, and saying "weak signal" every time a
          // parked car twitches would train drivers to ignore the message.
          return;
        }

        const good = decision.fix;
        setGps("live");
        fixRef.current = good;
        setLastFix(good);

        const now = Date.now();
        const c = ctx.current;
        // Cadence follows SPEED, not a constant: 3 s on the open road where the
        // customer is watching the dot travel, 15 s when stopped. A rank full
        // of idling taxis is exactly how a 2,000,000-message monthly allowance
        // gets spent on nothing happening.
        const interval = publishIntervalMs(good.speedKmh);
        if (c.channelKey && now - lastPublish.current >= interval) {
          lastPublish.current = now;
          publisher.current?.publish(good);
        }
        if (now - lastPersist.current >= PERSIST_MS) {
          lastPersist.current = now;
          void persist(good);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGps("denied");
        else if (err.code === err.POSITION_UNAVAILABLE) setGps("searching");
        else setGps("searching"); // TIMEOUT: keep waiting, watchPosition retries
      },
      {
        enableHighAccuracy: true,
        // 15 s: long enough for a cold GPS lock under trees, short enough that a
        // driver pressing GO ONLINE sees something happen.
        timeout: 15_000,
        // 0 — never hand back a cached fix. A five-minute-old position presented
        // as live is the failure this whole module exists to prevent.
        maximumAge: 0,
      },
    );

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled, persist, attempt]);

  // ── Persist immediately when the job's stage changes ─────────────────────
  // Otherwise the map keeps saying "on the way to you" for up to 20 s after the
  // driver has pressed ARRIVED, which is exactly when the customer is looking.
  useEffect(() => {
    if (!enabled || !fixRef.current) return;
    lastPersist.current = Date.now();
    void persist(fixRef.current);
  }, [trackingStatus, trip?.id, enabled, persist]);

  // ── BACKGROUNDED: the failure a driver will actually hit ─────────────────
  // Every other GPS state here is something the phone tells us. This one is
  // something the BROWSER does to us: once the page is not visible, timers are
  // throttled and position callbacks slow to a crawl or stop. The driver has
  // done nothing wrong and their phone is fine — they switched to WhatsApp.
  //
  // Reported as its own state rather than letting the dot silently go stale,
  // because the fix is a sentence ("come back to this page") and nobody can act
  // on a fix they are not told about.
  const [backgrounded, setBackgrounded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      setBackgrounded(!visible);
      if (!visible) return;
      // Coming back: a suspended tab wakes holding a position that may be
      // minutes old. Force a fresh fix and a fresh write rather than letting
      // the stale one look current.
      lastPersist.current = 0;
      lastPublish.current = 0;
      navigator.geolocation?.getCurrentPosition(
        () => {}, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  const retry = useCallback(() => {
    setServerError(null);
    setGps("prompting");
    setAttempt((n) => n + 1);
  }, []);

  // Derived rather than stored: a driver who is off duty is idle by
  // definition, so there is no moment where `enabled` is false and the reported
  // state still says "live".
  // `paused` outranks whatever the last fix said: a live-looking dot on a
  // backgrounded page is precisely the lie this screen exists to prevent.
  const gps: GpsState = !enabled ? "idle" : backgrounded ? "paused" : gpsState;

  return { gps, lastFix, accuracyM, reported, serverError, retry };
}
