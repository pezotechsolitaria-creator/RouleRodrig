"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline, CircleMarker, TileLayer } from "leaflet";
import {
  getBasemap, getBasemaps, RODRIGUES_CENTRE,
  BASEMAP_STORAGE_KEY, DEFAULT_BASEMAP, type BasemapId,
} from "@/lib/tracking/tiles";
import { createSmoothMarker, type SmoothMarker } from "@/lib/tracking/smooth-marker";
import { shouldRefit, isFramableSize } from "@/lib/tracking/model";
import { labelsForZoom } from "@/lib/tracking/place-labels";

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
  /**
   * A floating label pinned to a point on the map — the "12 min" pill that sits
   * on the route in the reference design.
   *
   * Given only `text`, it is placed at the MIDPOINT of whatever line is drawn,
   * which is where it reads as belonging to the journey rather than to either
   * end. Pass lat/lng to override.
   */
  bubble?: { text: string; lat?: number; lng?: number; muted?: boolean } | null;
  /**
   * Where the driver has actually BEEN on this job, oldest first.
   *
   * Distinct from `route`, which is where they are going. An operator asking
   * "did he really go via Mont Lubin" is asking about this, and it is the only
   * thing on the map that answers a question about the past.
   */
  trail?: [number, number][] | null;
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
  // Two DIFFERENT shapes, not one shape in two colours. A passenger glancing at
  // a phone in sunlight reads silhouette long before hue, and on a map that is
  // mostly greens and greys, "which end is which" has to survive that glance.
  //
  //   pickup      a small dark square with a flag — a place you leave
  //   destination a teardrop pin — the universal "here is the spot"
  const glyph = isPickup
    ? `<span class="rr-pin rr-pin-from">
         <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
           <path d="M7 3v18M7 4.5h9.2l-2 3.2 2 3.3H7z" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
         </svg>
       </span>`
    : `<span class="rr-pin rr-pin-to">
         <svg viewBox="0 0 28 34" width="26" height="32" aria-hidden="true">
           <path d="M14 1.5c-6.1 0-11 4.8-11 10.8 0 7.9 9.6 18.4 10 18.8a1.4 1.4 0 0 0 2 0c.4-.4 10-10.9 10-18.8 0-6-4.9-10.8-11-10.8Z"
                 fill="currentColor"/>
           <circle cx="14" cy="12" r="4.4" fill="#0a0a0a"/>
         </svg>
       </span>`;
  return `
    <div class="rr-place rr-place-${isPickup ? "from" : "to"}">
      ${glyph}
      ${pin.label ? `<span class="rr-place-lbl">${esc(pin.label)}</span>` : ""}
    </div>`;
}

export default function TrackingMap({
  driver, pins = [], route, directLine, follow = true,
  className, fitTo, interactive = true, bubble = null, trail = null,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  // ── WHY THIS IS STATE AND NOT A REF ──────────────────────────────────────
  // Leaflet is imported dynamically (it touches `window` at module scope, so it
  // cannot be in the server bundle). That import resolves AFTER React has run
  // every effect below once — at which point L.current and map.current are both
  // still null and each of those effects returns having drawn nothing.
  //
  // Nothing re-triggers them on its own. A ref would not: refs do not schedule
  // renders. In the live case the driver's position happens to change every few
  // seconds, which re-runs that one effect and hides the bug — but `pins` comes
  // from a snapshot whose identity may never change again, so the pickup and
  // drop-off markers could stay missing for the whole trip.
  //
  // Flipping a state flag when the import lands re-runs all of them exactly once.
  const [ready, setReady] = useState(false);

  // ── SATELLITE OR MAP ─────────────────────────────────────────────────────
  // Satellite by default. On an island where most roads are unnamed, imagery is
  // what makes a route recognisable — you follow the shape of the coast, not a
  // street name. Remembered per browser so a viewer's choice survives a reload.
  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP);
  const baseLayer = useRef<TileLayer | null>(null);
  const labelLayer = useRef<TileLayer | null>(null);
  /** Our gazetteer drawn over imagery, redrawn on zoom. */
  const placeLabels = useRef<import("leaflet").LayerGroup | null>(null);
  const labelRedraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BASEMAP_STORAGE_KEY);
      // localStorage cannot be read during render: the server has none, so a
      // lazy useState initialiser would hydrate to a different value than it
      // rendered. Reading it in an effect is the correct shape, and the one
      // setState it costs happens once per mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "satellite" || saved === "streets") setBasemapId(saved);
    } catch {
      // Private mode, or storage disabled. The default is a fine answer.
    }
  }, []);

  const driverMarker = useRef<Marker | null>(null);
  const smooth = useRef<SmoothMarker | null>(null);
  const placeMarkers = useRef<Map<string, Marker>>(new globalThis.Map());
  const line = useRef<Polyline | null>(null);
  const bubbleMarker = useRef<Marker | null>(null);
  const trailLine = useRef<Polyline | null>(null);
  const accuracyRing = useRef<CircleMarker | null>(null);
  const userPanned = useRef(false);
  const fitted = useRef(false);
  /** The container size the current framing was computed against, e.g. "446x318". */
  const fittedAt = useRef<string>("");
  const resizeObs = useRef<ResizeObserver | null>(null);
  /**
   * True while WE are moving the map.
   *
   * Leaflet fires `zoomstart` for a programmatic setView exactly as it does for
   * a pinch, so without this flag our own framing would instantly mark the map
   * as user-controlled and no later re-frame could run.
   */
  const selfMoving = useRef(false);
  const fitAttempts = useRef(0);
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Published by the fit effect below so the ResizeObserver can re-frame once
  // the container reports a real size, without duplicating the fit logic.
  const refit = useRef<(() => void) | null>(null);

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

      // Any deliberate pan cancels follow. Nothing is more annoying than a map
      // that yanks itself back while you are looking at something.
      const takeControl = () => {
        userPanned.current = true;
        smooth.current?.setFollow(false);
      };
      m.on("dragstart", takeControl);
      // A zoom is as much a decision as a pan. Without this, a rotation — or the
      // details sheet expanding underneath — re-framed over the zoom the user
      // had just chosen.
      m.on("zoomstart", () => { if (!selfMoving.current) takeControl(); });

      // Leaflet measures its container the moment it is created. Inside a card
      // that is still settling — a dynamic import landing mid-layout, a sheet
      // animating, a font swapping — that measurement is wrong, and every
      // fitBounds afterwards is computed against a viewport that does not
      // exist. The symptom is a destination pin sitting off the bottom of the
      // map.
      //
      // A ResizeObserver rather than requestAnimationFrame: rAF DOES NOT FIRE
      // IN A HIDDEN TAB, so a page opened into a background tab would never
      // finish setting up its map and would show an empty island. (Measured in
      // this project's headless pane: rafFiredCount 0 with document.hidden
      // true.) A ResizeObserver fires on layout regardless of visibility, and
      // it also covers the cases rAF never would — an orientation change, or
      // the details sheet expanding underneath.
      m.invalidateSize({ animate: false });
      setReady(true);

      if (typeof ResizeObserver !== "undefined" && host.current) {
        const ro = new ResizeObserver((entries) => {
          if (cancelled) return;
          m.invalidateSize({ animate: false });
          const box = entries[0]?.contentRect;
          const now = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "";
          // The rule lives in lib/tracking/model.ts and is unit-tested there.
          if (shouldRefit(
                { hasFitted: fitted.current, fittedAt: fittedAt.current, userPanned: userPanned.current },
                now,
              )) {
            fitAttempts.current = 0;   // a new box earns a fresh budget
            fitted.current = false;
            refit.current?.();
          }
        });
        ro.observe(host.current);
        resizeObs.current = ro;
      }
    });

    return () => {
      cancelled = true;
      setReady(false);
      resizeObs.current?.disconnect();
      resizeObs.current = null;
      refit.current = null;
      if (fitTimer.current) clearTimeout(fitTimer.current);
      fitTimer.current = null;
      fitAttempts.current = 0;
      // These describe the MAP, not the component, so they must die with it.
      // `fitted` surviving a remount is why a re-created map silently kept the
      // default island view instead of framing the journey — the second map
      // asked "have I already fitted?" and got the first map's answer.
      fitted.current = false;
      fittedAt.current = "";
      userPanned.current = false;
      smooth.current?.destroy();
      smooth.current = null;
      map.current?.remove();
      map.current = null;
      driverMarker.current = null;
      markers.clear();
    };
  }, [interactive]);

  // ── The basemap, and switching it ────────────────────────────────────────
  // Its own effect so changing basemap swaps two tile layers and touches
  // nothing else — the map, the markers and the route all survive. Recreating
  // the map to change basemap would drop the driver mid-animation.
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;

    const bm = getBasemap(basemapId);
    if (baseLayer.current) { m.removeLayer(baseLayer.current); baseLayer.current = null; }
    if (labelLayer.current) { m.removeLayer(labelLayer.current); labelLayer.current = null; }

    baseLayer.current = leaflet
      .tileLayer(bm.base.url, {
        attribution: bm.base.attribution,
        maxZoom: bm.base.maxZoom,
        ...(bm.base.maxNativeZoom ? { maxNativeZoom: bm.base.maxNativeZoom } : {}),
        ...(bm.base.subdomains ? { subdomains: bm.base.subdomains } : {}),
        // Two extra rings kept around the viewport: panning back and forth then
        // re-requests nothing — faster, and the polite thing to do to a tile
        // server we are a guest of.
        keepBuffer: 2,
        // Only the street sheet may be tinted. Darkening photography does not
        // make it stylish, it makes it muddy.
        className: bm.tintable ? "rr-tiles" : "rr-tiles-plain",
      })
      .addTo(m);

    // The half that makes imagery usable. Google calls this Hybrid: without
    // road and place labels on top, satellite is beautiful and unreadable —
    // you cannot tell which grey line is the road you want.
    if (bm.overlay) {
      labelLayer.current = leaflet
        .tileLayer(bm.overlay.url, {
          attribution: bm.overlay.attribution,
          maxZoom: bm.overlay.maxZoom,
          ...(bm.overlay.maxNativeZoom ? { maxNativeZoom: bm.overlay.maxNativeZoom } : {}),
          keepBuffer: 2,
          className: "rr-tiles-labels",
          pane: "overlayPane",
        })
        .addTo(m);
      // Under the route and the markers, over the imagery.
      labelLayer.current.setZIndex(250);
    }

    // ── PLACE NAMES, FROM OUR OWN GAZETTEER ─────────────────────────────
    // Only over imagery: the street basemap already draws its own names, and
    // two sets of labels on one map is worse than either. Redrawn on zoom
    // because what belongs on screen changes with it — all 35 at once is a word
    // cloud, not a map.
    placeLabels.current?.remove();
    placeLabels.current = null;

    if (!bm.overlay && bm.id === "satellite") {
      const group = leaflet.layerGroup().addTo(m);
      placeLabels.current = group;

      const draw = () => {
        group.clearLayers();
        for (const l of labelsForZoom(m.getZoom())) {
          leaflet
            .marker([l.lat, l.lng], {
              interactive: false,
              keyboard: false,
              // Decorative: the journey's own pins carry the meaning, and a
              // screen reader should not read out thirty village names.
              alt: "",
              icon: leaflet.divIcon({
                className: "rr-divicon",
                html: `<span class="rr-place-name">${esc(l.name)}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
              }),
            })
            .addTo(group);
        }
      };

      draw();
      m.on("zoomend", draw);
      // Captured so the cleanup detaches THIS handler, not a later one.
      labelRedraw.current = draw;
    }

    try {
      window.localStorage.setItem(BASEMAP_STORAGE_KEY, basemapId);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }

    return () => {
      if (labelRedraw.current) m.off("zoomend", labelRedraw.current);
      labelRedraw.current = null;
      placeLabels.current?.remove();
      placeLabels.current = null;
    };
  }, [basemapId, ready]);

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
  }, [driver, follow, ready]);

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
        // A teardrop points at its spot with its TIP; anchoring it centrally
        // would place the point half a pin south of the actual destination.
        iconSize: pin.kind === "driver" ? [44, 44] : [34, 40],
        iconAnchor:
          pin.kind === "driver" ? [22, 22] : pin.kind === "dropoff" ? [17, 34] : [17, 20],
      });
      if (existing) {
        existing.setLatLng([pin.lat, pin.lng]);
        existing.setIcon(icon);
      } else {
        const mk = leaflet
          .marker([pin.lat, pin.lng], {
            icon,
            // Only a pin you can actually DO something with belongs in the tab
            // order. A decorative pickup pin was a focusable "button" that
            // announced a bare place name and did nothing when activated.
            keyboard: Boolean(pin.onClick),
            interactive: Boolean(pin.onClick),
            alt: pin.onClick ? (pin.label ?? pin.kind) : "",
          })
          .addTo(m);
        if (pin.onClick) mk.on("click", pin.onClick);
        placeMarkers.current.set(pin.id, mk);
      }
    }
    for (const [id, mk] of placeMarkers.current) {
      if (!seen.has(id)) { m.removeLayer(mk); placeMarkers.current.delete(id); }
    }
  }, [pins, ready]);

  // ── The line between here and there ──────────────────────────────────────
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    if (line.current) { m.removeLayer(line.current); line.current = null; }

    if (route && route.length > 1) {
      // A REAL ROAD. Drawn the way every navigation app draws one: a dark
      // casing under a solid coloured core. The casing is not decoration — it
      // is what keeps a thin line readable over satellite imagery, where the
      // ground underneath is every colour at once.
      // smoothFactor 0.3, not Leaflet's default 1.0. That default discards
      // vertices aggressively for performance — sensible for a thousand-point
      // GPS track, wrong here: the route arrives already simplified to ~64
      // points by OSRM, and discarding more of them straightens the very bends
      // that show this is a ROAD. Measured at island zoom: 48 supplied points
      // rendered as 8 at the default. The cost of keeping them is nil at this
      // size.
      const casing = leaflet
        .polyline(route, {
          color: "#0a0a0a", weight: 9, opacity: 0.45, smoothFactor: 0.3,
          lineCap: "round", lineJoin: "round", interactive: false,
        })
        .addTo(m);
      const core = leaflet
        .polyline(route, {
          color: "#F5C842", weight: 5, opacity: 1, smoothFactor: 0.3,
          lineCap: "round", lineJoin: "round", interactive: false,
        })
        .addTo(m);
      line.current = leaflet.layerGroup([casing, core]).addTo(m) as unknown as Polyline;
    } else if (directLine) {
      // No router answered. A DASH, not a line — solid would claim to be the
      // road, and this is only the direction. The ETA beside it is labelled
      // "estimated" for the same reason.
      const casing = leaflet
        .polyline(directLine, {
          color: "#0a0a0a", weight: 6, opacity: 0.3, lineCap: "round", interactive: false,
        })
        .addTo(m);
      const dash = leaflet
        .polyline(directLine, {
          color: "#F5C842", weight: 3, opacity: 0.95, dashArray: "1 8",
          lineCap: "round", interactive: false,
        })
        .addTo(m);
      line.current = leaflet.layerGroup([casing, dash]).addTo(m) as unknown as Polyline;
    }
  }, [route, directLine, ready]);

  // ── Where the driver has BEEN ────────────────────────────────────────────
  // Deliberately quieter than the route: thinner, dimmer, and behind it. The
  // route is the thing anyone is acting on; the trail is evidence, and evidence
  // that shouts drowns out the instruction.
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    if (trailLine.current) { m.removeLayer(trailLine.current); trailLine.current = null; }
    if (!trail || trail.length < 2) return;

    trailLine.current = leaflet
      .polyline(trail, {
        color: "#ffffff", weight: 3, opacity: 0.55, lineCap: "round",
        lineJoin: "round", dashArray: "1 6", interactive: false,
      })
      .addTo(m);
    // Under the route and the markers.
    trailLine.current.bringToBack();
  }, [trail, ready]);

  // ── The floating "12 min" pill ───────────────────────────────────────────
  // A divIcon rather than a Leaflet tooltip: a tooltip is tied to another layer,
  // is styled by Leaflet's own CSS, and cannot be positioned at an arbitrary
  // point on a polyline. A marker with no icon image is exactly a floating label.
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;

    if (bubbleMarker.current) { m.removeLayer(bubbleMarker.current); bubbleMarker.current = null; }
    if (!bubble?.text) return;

    // Where the journey is, not where either end is. The midpoint of the drawn
    // line is the only point that means "this is how long the REST takes".
    let lat = bubble.lat;
    let lng = bubble.lng;
    if (lat == null || lng == null) {
      const pts = route && route.length > 1 ? route : directLine;
      if (!pts || pts.length < 2) return;
      const mid = pts[Math.floor(pts.length / 2)];
      // For a two-point direct line, halfway between them reads better than
      // landing exactly on one end.
      if (pts.length === 2) {
        lat = (pts[0][0] + pts[1][0]) / 2;
        lng = (pts[0][1] + pts[1][1]) / 2;
      } else {
        lat = mid[0];
        lng = mid[1];
      }
    }
    if (lat == null || lng == null) return;

    const icon = leaflet.divIcon({
      className: "rr-divicon",
      html: `<span class="rr-bubble${bubble.muted ? " rr-bubble-muted" : ""}">
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path d="M5 17h14v-3.2l-1.6-4.3A2 2 0 0 0 15.5 8h-7a2 2 0 0 0-1.9 1.5L5 13.8Z" fill="currentColor"/>
          <circle cx="8" cy="17.4" r="1.7" fill="currentColor"/>
          <circle cx="16" cy="17.4" r="1.7" fill="currentColor"/>
        </svg>${esc(bubble.text)}</span>`,
      // Sized generously and anchored at its centre; the span inside is
      // inline-flex so the visible pill hugs its text at any length.
      iconSize: [120, 30],
      iconAnchor: [60, 15],
    });
    bubbleMarker.current = leaflet
      .marker([lat, lng], { icon, interactive: false, keyboard: false, zIndexOffset: 900 })
      .addTo(m);
  }, [bubble, route, directLine, ready]);

  // ── Frame the journey ────────────────────────────────────────────────────
  //
  // ── THE BUG THIS SHAPE EXISTS TO FIX ────────────────────────────────────
  // Leaflet decides zoom from the container size it believes it has. That
  // belief is formed when the map is constructed — which here is inside a
  // dynamic import that lands mid-layout, so it is routinely formed against a
  // box that is not final. Measured symptom: the SAME two points, framed three
  // times, produced zoom 13, then 14, then 15 across reloads, and the
  // destination sat off the bottom of the map.
  //
  // The fix is not better arithmetic — it is re-framing when the size the frame
  // was computed against turns out to be wrong. `fittedAt` records that size;
  // the ResizeObserver compares and calls back. It is also what makes an
  // orientation change, or the details sheet expanding underneath, re-frame
  // correctly rather than leaving a journey half off-screen.
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;

    const run = () => {
      const pts = (fitTo ?? []).filter(
        (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]),
      );
      if (pts.length === 0) return;

      // A container with no real box cannot be framed; leave it to the observer.
      const size = m.getSize();
      if (!isFramableSize(size.x, size.y)) return;

      selfMoving.current = true;
      try {
        if (pts.length === 1) {
          m.setView(pts[0], 15, { animate: false });
          fitted.current = true;
        } else {
          const bounds = leaflet.latLngBounds(pts);
          m.invalidateSize({ animate: false });
          m.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: false });

          // ── VERIFY, DO NOT TRUST ──────────────────────────────────────
          // fitBounds is not reliable here. Measured repeatedly: the map
          // reports the correct container size, fitBounds runs without error,
          // and the view does not move — leaving the destination off the
          // bottom of the map. It settles once Leaflet's internal size has
          // caught up, which is a tick or two later.
          //
          // So the fit ASKS whether the journey is actually on screen, and
          // only claims success when it is. A bounded retry (setTimeout, not
          // requestAnimationFrame — rAF does not fire in a hidden tab) covers
          // the not-yet-settled case without looping.
          const contained = m.getBounds().pad(-0.05).contains(bounds);
          if (contained) {
            fitted.current = true;
          } else if (fitAttempts.current < 4) {
            fitAttempts.current += 1;
            if (fitTimer.current) clearTimeout(fitTimer.current);
            fitTimer.current = setTimeout(() => refit.current?.(), 120);
          } else {
            // Out of retries: take what we have rather than retrying forever.
            fitted.current = true;
          }
        }
      } finally {
        selfMoving.current = false;
      }
      fittedAt.current = `${size.x}x${size.y}`;
    };

    refit.current = run;
    if (!fitted.current && !userPanned.current) run();
  }, [fitTo, ready]);

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
  }, [driver, ready]);

  const basemaps = getBasemaps();

  return (
    <div className={`relative ${className ?? "h-full w-full"}`}>
      <div ref={host} className="h-full w-full" role="application" aria-label="Live tracking map" />

      {/* Satellite / Map. Two options, both visible — a toggle that hides the
          alternative behind an icon makes people hunt for it. Bottom-left keeps
          it clear of the zoom control and of the floating status pill. */}
      {interactive && basemaps.length > 1 && (
        <div className="rr-basemap-switch" role="group" aria-label="Map style">
          {basemaps.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBasemapId(b.id)}
              aria-pressed={basemapId === b.id}
              className={basemapId === b.id ? "is-on" : undefined}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
