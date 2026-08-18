"use client";

import type { Map as LeafletMap, Marker } from "leaflet";
import { bearingDeg, haversineKm, shortestTurn } from "./model";

// ── MOVEMENT THAT LOOKS LIKE DRIVING ────────────────────────────────────────
//
// A GPS fix every four seconds, drawn naively, is a dot that teleports. The fix
// is to draw the journey BETWEEN fixes instead of the fixes themselves: hold the
// newest position as a target and walk the marker towards it on every animation
// frame. That is what makes a tracking map feel like Uber rather than like a
// refreshing table.
//
// ── WHY NOT A PLUGIN ────────────────────────────────────────────────────────
// The known Leaflet options all animate along a KNOWN path: Leaflet.MovingMarker
// (last released 2015) and Leaflet.MarkerMotion take a polyline and a duration
// and play it. Live tracking is the opposite problem — the path is not known in
// advance, each fix arrives late, and the animation must retarget mid-flight
// without restarting. Marker.SlideTo is closer but is a single unmaintained
// gist, and the whole technique is the sixty lines below.
//
// Adding an unmaintained dependency to avoid sixty lines would be the wrong
// trade on a codebase that has to keep working for years, and the brief asked
// for minimal dependencies. What is borrowed is the technique, not the code:
// L.Util.requestAnimFrame, linear interpolation, retarget on arrival.
//
// ── THE TWO JUDGEMENT CALLS ─────────────────────────────────────────────────
// 1. A big jump is NOT animated. If the new fix is far away, the driver did not
//    drive there in four seconds — the phone regained signal, or the page was
//    backgrounded and is catching up. Animating it draws a fictional journey
//    across the lagoon; snapping tells the truth.
// 2. Rotation takes the SHORT way round. 350°→10° is a 20° turn, not 340°.

/** Past this, a fix is a correction, not movement. Snap instead of animating. */
const SNAP_ABOVE_KM = 0.5;

/** Below this, the "movement" is accuracy noise. Hold the last real bearing. */
const MIN_BEARING_MOVE_KM = 0.008;

export type SmoothMarkerOptions = {
  /**
   * How long to take reaching the new fix. Slightly longer than the publish
   * interval so the marker is still gliding when the next fix lands and the
   * motion never visibly stops between updates.
   */
  durationMs?: number;
  /** Called with 0–360 whenever the facing changes, for rotating an icon. */
  onBearing?: (deg: number) => void;
  /** Keep the map centred on the marker as it moves. */
  follow?: boolean;
};

export type SmoothMarker = {
  /** Feed a new authoritative position. Safe to call at any rate. */
  moveTo: (lat: number, lng: number, heading?: number | null) => void;
  /** Jump with no animation — for the very first fix, and for corrections. */
  snapTo: (lat: number, lng: number, heading?: number | null) => void;
  setFollow: (follow: boolean) => void;
  destroy: () => void;
};

export function createSmoothMarker(
  map: LeafletMap,
  marker: Marker,
  opts: SmoothMarkerOptions = {},
): SmoothMarker {
  const duration = opts.durationMs ?? 4600;
  let follow = opts.follow ?? false;

  let fromLat = marker.getLatLng().lat;
  let fromLng = marker.getLatLng().lng;
  let toLat = fromLat;
  let toLng = fromLng;
  let startedAt = 0;
  let raf: number | null = null;
  let bearing = 0;
  let destroyed = false;

  function setBearing(next: number) {
    // Rotate the short way, then normalise. Feeding the raw value straight to a
    // CSS transform is what makes an icon spin the wrong way at north.
    bearing = (bearing + shortestTurn(bearing, next) + 360) % 360;
    opts.onBearing?.(bearing);
  }

  function place(lat: number, lng: number) {
    marker.setLatLng([lat, lng]);
    if (follow) {
      // panTo, not setView: setView re-renders every tile layer at the new
      // centre, which on a 4-second cadence is a request storm against a tile
      // server we are a guest of. panTo reuses what is already drawn.
      map.panTo([lat, lng], { animate: true, duration: 0.5, noMoveStart: true });
    }
  }

  function step(now: number) {
    if (destroyed) return;
    const t = Math.min(1, (now - startedAt) / duration);
    // easeOutQuad. A vehicle arriving at a fix decelerates into it; linear
    // motion that stops dead reads as mechanical.
    const e = 1 - (1 - t) * (1 - t);
    place(fromLat + (toLat - fromLat) * e, fromLng + (toLng - fromLng) * e);
    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else {
      raf = null;
      fromLat = toLat;
      fromLng = toLng;
    }
  }

  function stop() {
    if (raf != null) cancelAnimationFrame(raf);
    raf = null;
  }

  function snapTo(lat: number, lng: number, heading?: number | null) {
    stop();
    if (heading != null && Number.isFinite(heading)) setBearing(heading);
    fromLat = toLat = lat;
    fromLng = toLng = lng;
    place(lat, lng);
  }

  return {
    moveTo(lat, lng, heading) {
      if (destroyed) return;
      const current = marker.getLatLng();
      const km = haversineKm(current.lat, current.lng, lat, lng);

      // Judgement call 1: too far to be four seconds of driving.
      if (km > SNAP_ABOVE_KM) {
        snapTo(lat, lng, heading);
        return;
      }

      // Judgement call 2: the device's own heading wins when it has one, because
      // it is a compass reading rather than an inference. Otherwise derive it
      // from the movement — but only if the movement is bigger than the noise.
      if (heading != null && Number.isFinite(heading)) {
        setBearing(heading);
      } else if (km > MIN_BEARING_MOVE_KM) {
        setBearing(bearingDeg(current.lat, current.lng, lat, lng));
      }

      // Retarget from wherever the marker actually IS, not from the previous
      // target — otherwise a fix arriving mid-animation rewinds the marker to
      // where the last leg started and it visibly stutters backwards.
      stop();
      fromLat = current.lat;
      fromLng = current.lng;
      toLat = lat;
      toLng = lng;
      startedAt = performance.now();
      raf = requestAnimationFrame(step);
    },
    snapTo,
    setFollow(next) {
      follow = next;
    },
    destroy() {
      destroyed = true;
      stop();
    },
  };
}
