"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Polyline, CircleMarker } from "leaflet";
import { getTileProvider, RODRIGUES_CENTRE } from "@/lib/tracking/tiles";
import { createSmoothMarker, type SmoothMarker } from "@/lib/tracking/smooth-marker";

// ── THE MAP, FOR EVERY SURFACE THAT NEEDS ONE ───────────────────────────────
//
// One component behind the customer page, the driver's job card and the admin
// operations board. They differ in what they put ON it, not in how it works.
//
// ── WHY RAW LEAFLET AND NOT react-leaflet ───────────────────────────────────
// react-leaflet is in package.json but the existing IslandMap and MapSection use
// the imperative API directly, and this follows them. It is also the right call
// here specifically: smooth movement means writing to the marker sixty times a
// second, and routing that through React state would re-render the tree on every
// frame. The map is imperative; pretending otherwise costs frames.
//
// ── NO EXTERNAL IMAGES ──────────────────────────────────────────────────────
// IslandMap pulls Leaflet's default marker PNGs from unpkg.com. Every marker
// here is a divIcon — inline SVG and CSS — so the map has exactly one external
// dependency (the tiles) and renders fully even if that fails.

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  kind: "driver" | "pickup" | "dropoff";
  /** 0–360. Rotates the vehicle. */
  bearing?: number | null;
  label?: string;
  /** Dims the marker and stops the pulse — for a position we no longer trust. */
  stale?: boolean;
  vehicle?: "car" | "bike" | "van" | "truck";
  onClick?: () => void;
  selected?: boolean;
};

type Props = {
  /** Moves smoothly. At most one; everything else is drawn as a static pin. */
  driver?: MapPin | null;
  pins?: MapPin[];
  /** Real route when a router is configured; a soft dashed direct line otherwise. */
  route?: [number, number][] | null;
  directLine?: [[number, number], [number, number]] | null;
  /** Keep the driver centred. Off the moment the user pans — never fight a thumb. */
  follow?: boolean;
  className?: string;
  /** Fit these on first paint, e.g. driver + destination. */
  fitTo?: [number, number][] | null;
  interactive?: boolean;
};

const VEHICLE_PATH: Record<string, string> = {
  // A simple arrow-car glyph pointing UP (north at 0°), so rotation is honest.
  car: "M12 2.5 4.6 20.2a1 1 0 0 0 1.35 1.27L12 18.6l6.05 2.87a1 1 0 0 0 1.35-1.27Z",
  bike: "M12 2.5 4.6 20.2a1 1 0 0 0 1.35 1.27L12 18.6l6.05 2.87a1 1 0 0 0 1.35-1.27Z",
  van: "M12 2.5 4.6 20.2a1 1 0 0 0 1.35 1.27L12 18.6l6.05 2.87a1 1 0 0 0 1.35-1.27Z",
  truck: "M12 2.5 4.6 20.2a1 1 0 0 0 1.35 1.27L12 18.6l6.05 2.87a1 1 0 0 0 1.35-1.27Z",
};

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));

function driverIconHtml(pin: MapPin): string {
  const path = VEHICLE_PATH[pin.vehicle ?? "car"] ?? VEHICLE_PATH.car;
  const dim = pin.stale ? "opacity:.45;filter:grayscale(.7);" : "";
  return `
    <div class="rr-drv ${pin.stale ? "" : "rr-drv-live"} ${pin.selected ? "rr-drv-sel" : ""}" style="${dim}">
      <span class="rr-drv-halo"></span>
      <span class="rr-drv-body" style="transform:rotate(${Math.round(pin.bearing ?? 0)}deg)">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="${path}" fill="#0a0a0a"/>
        </svg>
      </span>
    </div>`;
}

function placeIconHtml(pin: MapPin): string {
  const isPickup = pin.kind === "pickup";
  const ring = isPickup ? "#F5C842" : "#22c55e";
  const glyph = isPickup
    ? `<circle cx="12" cy="12" r="4.5" fill="${ring}"/>`
    : `<path d="M12 4.5c-3.3 0-6 2.6-6 5.9 0 4.3 5.2 9 5.5 9.2a.8.8 0 0 0 1 0c.3-.2 5.5-4.9 5.5-9.2 0-3.3-2.7-5.9-6-5.9Zm0 8.2a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Z" fill="${ring}"/>`;
  return `
    <div class="rr-place">
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#0a0a0a" opacity=".82"/>
        ${glyph}
      </svg>
      ${pin.label ? `<span class="rr-place-lbl">${esc(pin.label)}</span>` : ""}
    </div>`;
}

export default function TrackingMap({
  driver, pins = [], route, directLine, follow = true,
  className, fitTo, interactive = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);

  const driverMarker = useRef<Marker | null>(null);
  const smooth = useRef<SmoothMarker | null>(null);
  const placeMarkers = useRef<Map<string, Marker>>(new globalThis.Map());
  const line = useRef<Polyline | null>(null);
  const accuracyRing = useRef<CircleMarker | null>(null);
  const userPanned = useRef(false);
  const fitted = useRef(false);

  // ── Create once ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!host.current || map.current) return;
    // Captured now: the cleanup below must not reach through the ref, which by
    // then may point somewhere else. The Map instance itself never changes.
    const markers = placeMarkers.current;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !host.current || map.current) return;
      L.current = leaflet;
      const tiles = getTileProvider();

      const m = leaflet.map(host.current, {
        center: RODRIGUES_CENTRE,
        zoom: 13,
        zoomControl: interactive,
        // A tracking map inside a scrolling page must not eat the scroll. The
        // user zooms with the +/− buttons or two fingers, both of which are
        // unambiguous; a wheel over a map they were scrolling past is not.
        scrollWheelZoom: false,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        attributionControl: true,
      });
      map.current = m;

      leaflet
        .tileLayer(tiles.url, {
          attribution: tiles.attribution,
          maxZoom: tiles.maxZoom,
          ...(tiles.subdomains ? { subdomains: tiles.subdomains } : {}),
          // Two extra rings of tiles kept around the viewport: panning back and
          // forth then re-requests nothing, which is both faster and the polite
          // thing to do to a tile server we are a guest of.
          keepBuffer: 2,
          className: "rr-tiles",
        })
        .addTo(m);

      // Any deliberate pan cancels follow. Nothing is more annoying than a map
      // that yanks itself back while you are looking at something.
      m.on("dragstart", () => { userPanned.current = true; smooth.current?.setFollow(false); });
    });

    return () => {
      cancelled = true;
      smooth.current?.destroy();
      smooth.current = null;
      map.current?.remove();
      map.current = null;
      driverMarker.current = null;
      markers.clear();
    };
  }, [interactive]);

  // ── The moving driver ────────────────────────────────────────────────────
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;

    if (!driver) {
      if (driverMarker.current) { m.removeLayer(driverMarker.current); driverMarker.current = null; }
      if (accuracyRing.current) { m.removeLayer(accuracyRing.current); accuracyRing.current = null; }
      smooth.current?.destroy();
      smooth.current = null;
      return;
    }

    if (!driverMarker.current) {
      const icon = leaflet.divIcon({
        className: "rr-divicon",
        html: driverIconHtml(driver),
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const mk = leaflet.marker([driver.lat, driver.lng], {
        icon, zIndexOffset: 1000, keyboard: false,
        alt: driver.label ?? "Driver",
      }).addTo(m);
      if (driver.onClick) mk.on("click", driver.onClick);
      driverMarker.current = mk;

      smooth.current = createSmoothMarker(m, mk, {
        follow: follow && !userPanned.current,
        onBearing: (deg) => {
          const el = mk.getElement()?.querySelector<HTMLElement>(".rr-drv-body");
          // Rotating only the inner glyph leaves the halo unrotated, so the
          // pulse stays a circle instead of visibly wobbling.
          if (el) el.style.transform = `rotate(${Math.round(deg)}deg)`;
        },
      });
      smooth.current.snapTo(driver.lat, driver.lng, driver.bearing ?? null);
    } else {
      smooth.current?.moveTo(driver.lat, driver.lng, driver.bearing ?? null);
      const el = driverMarker.current.getElement();
      if (el) {
        const body = el.querySelector<HTMLElement>(".rr-drv");
        if (body) {
          body.style.opacity = driver.stale ? "0.45" : "";
          body.style.filter = driver.stale ? "grayscale(.7)" : "";
          body.classList.toggle("rr-drv-live", !driver.stale);
        }
      }
    }
    smooth.current?.setFollow(follow && !userPanned.current);
  }, [driver, follow]);

  // ── Static pins ──────────────────────────────────────────────────────────
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;

    const seen = new Set<string>();
    for (const pin of pins) {
      seen.add(pin.id);
      const existing = placeMarkers.current.get(pin.id);
      const html = pin.kind === "driver" ? driverIconHtml(pin) : placeIconHtml(pin);
      const icon = leaflet.divIcon({
        className: "rr-divicon",
        html,
        iconSize: pin.kind === "driver" ? [44, 44] : [30, 30],
        iconAnchor: pin.kind === "driver" ? [22, 22] : [15, 15],
      });
      if (existing) {
        existing.setLatLng([pin.lat, pin.lng]);
        existing.setIcon(icon);
      } else {
        const mk = leaflet
          .marker([pin.lat, pin.lng], { icon, alt: pin.label ?? pin.kind })
          .addTo(m);
        if (pin.onClick) mk.on("click", pin.onClick);
        placeMarkers.current.set(pin.id, mk);
      }
    }
    for (const [id, mk] of placeMarkers.current) {
      if (!seen.has(id)) { m.removeLayer(mk); placeMarkers.current.delete(id); }
    }
  }, [pins]);

  // ── The line between here and there ──────────────────────────────────────
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    if (line.current) { m.removeLayer(line.current); line.current = null; }

    if (route && route.length > 1) {
      line.current = leaflet
        .polyline(route, { color: "#F5C842", weight: 4, opacity: 0.85, lineCap: "round" })
        .addTo(m);
    } else if (directLine) {
      // Dashed and dim ON PURPOSE. A solid line between two points would read as
      // "this is the road", and it is not — it is a direction. The ETA beside it
      // is labelled "approx" for the same reason.
      line.current = leaflet
        .polyline(directLine, {
          color: "#F5C842", weight: 3, opacity: 0.38, dashArray: "2 9", lineCap: "round",
        })
        .addTo(m);
    }
  }, [route, directLine]);

  // ── Frame the journey, once ──────────────────────────────────────────────
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m || fitted.current) return;
    const pts = (fitTo ?? []).filter(
      (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]),
    );
    if (pts.length === 0) return;
    if (pts.length === 1) {
      m.setView(pts[0], 15);
    } else {
      m.fitBounds(leaflet.latLngBounds(pts), { padding: [56, 56], maxZoom: 16 });
    }
    fitted.current = true;
  }, [fitTo]);

  // Accuracy is drawn only when it is BAD. A 5-metre circle is invisible noise;
  // a 400-metre one explains why the dot is not where the customer expects.
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m || !driver) return;
    const acc = (driver as MapPin & { accuracyM?: number }).accuracyM;
    if (accuracyRing.current) { m.removeLayer(accuracyRing.current); accuracyRing.current = null; }
    if (acc && acc > 120) {
      accuracyRing.current = leaflet
        .circle([driver.lat, driver.lng], {
          radius: acc, color: "#F5C842", weight: 1, opacity: 0.3,
          fillColor: "#F5C842", fillOpacity: 0.07, interactive: false,
        })
        .addTo(m) as unknown as CircleMarker;
    }
  }, [driver]);

  return (
    <div
      ref={host}
      className={className ?? "h-full w-full"}
      role="application"
      aria-label="Live tracking map"
    />
  );
}
