"use client";

import "leaflet/dist/leaflet.css"; // bundled locally — no external CDN (CSP-safe)
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import {
  getBasemap,
  getBasemaps,
  DEFAULT_BASEMAP,
  BASEMAP_STORAGE_KEY,
  RODRIGUES_BOUNDS,
  RODRIGUES_CENTRE,
  type BasemapId,
} from "@/lib/tracking/tiles";

// ── SHOWING US WHERE, WHEN THE NAME IS NOT ENOUGH ───────────────────────────
//
// PlacePicker's own comment argues against a map, and it is right about the
// case it is arguing about: for the forty places everyone names, a list is
// faster, works on a slow connection, and yields exact coordinates. A tourist
// dragging a pin along a coast they have never seen drops it in the lagoon.
//
// This is the OTHER case, the one that comment ends on: "35 names against 182
// localities — this branch is not an edge case here, it is a large minority of
// the island." Those people type their address as free text and the job leaves
// with pickup_lat and pickup_lng null. Dispatch then has no origin, quote_ride()
// refuses with need_locations, and the price becomes "on request" — for a large
// minority of Rodrigues, permanently.
//
// So the map is not offered INSTEAD of the list. It is offered exactly where
// the list has already given up, to somebody pinning a place they know better
// than we do: their own house. That inverts the lagoon objection — the person
// using this is the one person who cannot get it wrong.
//
// ── THE MAP MOVES, THE PIN DOES NOT ─────────────────────────────────────────
// A draggable marker asks for fine motor precision on a touchscreen, one-handed,
// from the demographic this whole flow is sized for. Instead the pin is welded
// to the centre of the frame and the island slides underneath it — the same
// gesture as looking at a map, with no target to hit.
//
// ── THE WORDS SURVIVE ───────────────────────────────────────────────────────
// Pinning does NOT replace the written address. The name field comes with it and
// stays required, because a driver reads "Chez Marie, blue gate, up from the
// church" and a dispatcher reads -19.72, 63.42, and the job needs both. This is
// an addition to the traditional way of answering, never a replacement for it.

export type PinOnMapCopy = {
  title: string;
  hint: string;
  nameLabel: string;
  namePlaceholder: string;
  confirm: string;
  cancel: string;
  recentre: string;
};

type Leaflet = typeof import("leaflet");
type LMap = import("leaflet").Map;
type LTileLayer = import("leaflet").TileLayer;

export default function PinOnMap({
  initialName,
  copy,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  copy: PinOnMapCopy;
  onConfirm: (p: { name: string; lat: number; lng: number }) => void;
  onCancel: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapInst = useRef<LMap | null>(null);
  const leaflet = useRef<Leaflet | null>(null);
  const baseLayer = useRef<LTileLayer | null>(null);

  const [epoch, setEpoch] = useState(0);
  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP);
  const [name, setName] = useState(initialName);
  const [centre, setCentre] = useState<{ lat: number; lng: number }>({
    lat: RODRIGUES_CENTRE[0],
    lng: RODRIGUES_CENTRE[1],
  });
  const [locating, setLocating] = useState(false);
  /** The map code itself never arrived. Nothing on this screen works without
   *  it, so it says so and offers the way out rather than sitting blank. */
  const [chunkFailed, setChunkFailed] = useState(false);

  // Same key as every other map on the site, so a viewer who chose satellite
  // once is still on satellite here — which is the sheet that actually helps
  // somebody recognise their own roof.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(BASEMAP_STORAGE_KEY);
      } catch {
        /* private mode — the default stands */
      }
      if (cancelled) return;
      if (stored === "satellite" || stored === "streets") setBasemapId(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes, and the page behind does not scroll while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  // ── The map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!host.current || mapInst.current) return;
    let cancelled = false;

    // ── A CHUNK THAT NEVER ARRIVES ────────────────────────────────────
    // This had no .catch. A rejected promise inside an effect cannot be
    // caught by a React error boundary, so on a dropped 3G connection — or
    // after a deploy swapped the chunk out from under a phone that has been
    // open for a while — the sheet opened onto a blank grey box, for ever,
    // saying nothing. The cancel button is the only way out and nothing
    // explains why there is no map.
    void import("leaflet")
      .then((L) => {
      if (cancelled || !host.current || mapInst.current) return;

      const bounds = L.latLngBounds(
        [RODRIGUES_BOUNDS.minLat, RODRIGUES_BOUNDS.minLng],
        [RODRIGUES_BOUNDS.maxLat, RODRIGUES_BOUNDS.maxLng],
      );

      const map = L.map(host.current, {
        center: RODRIGUES_CENTRE,
        zoom: 13,
        zoomControl: true,
        // The island is 108 km². Letting the frame wander into open ocean, or
        // as far as Mauritius, can only ever produce a coordinate no driver can
        // reach — so it simply cannot happen.
        maxBounds: bounds,
        maxBoundsViscosity: 1,
        minZoom: 11,
      });

      leaflet.current = L;
      mapInst.current = map;

      const report = () => {
        const c = map.getCenter();
        setCentre({ lat: c.lat, lng: c.lng });
      };
      map.on("moveend", report);
      report();

      setEpoch((n) => n + 1);
    })
      .catch(() => {
        if (!cancelled) setChunkFailed(true);
      });

    return () => {
      cancelled = true;
      if (mapInst.current) {
        // Tear down in the right order. Removing a map that is still animating
        // — a pan with inertia, or a drag whose pointerup never arrived because
        // the browser was backgrounded — throws inside Leaflet's own cleanup
        // ("Cannot read properties of undefined (reading 'baseVal')"), and this
        // component unmounts on the confirm tap, which is exactly when a frame
        // is most likely to still be moving.
        mapInst.current.stop();
        mapInst.current.dragging?.disable();
        mapInst.current.remove();
        mapInst.current = null;
      }
      baseLayer.current = null;
    };
  }, []);

  // ── The sheet underneath, swapped in place ─────────────────────────────
  useEffect(() => {
    const L = leaflet.current;
    const map = mapInst.current;
    if (!L || !map) return;

    if (baseLayer.current) {
      map.removeLayer(baseLayer.current);
      baseLayer.current = null;
    }
    const base = getBasemap(basemapId).base;
    baseLayer.current = L.tileLayer(base.url, {
      attribution: base.attribution,
      maxZoom: base.maxZoom,
      ...(base.maxNativeZoom ? { maxNativeZoom: base.maxNativeZoom } : {}),
      ...(base.subdomains ? { subdomains: base.subdomains } : {}),
    }).addTo(map);
  }, [epoch, basemapId]);

  function chooseBasemap(id: BasemapId) {
    setBasemapId(id);
    try {
      localStorage.setItem(BASEMAP_STORAGE_KEY, id);
    } catch {
      /* the choice still applies for this visit */
    }
  }

  /** Jump the frame to where the phone says it is — if that is on Rodrigues. */
  function recentre() {
    const map = mapInst.current;
    if (!map || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        const here =
          lat >= RODRIGUES_BOUNDS.minLat &&
          lat <= RODRIGUES_BOUNDS.maxLat &&
          lng >= RODRIGUES_BOUNDS.minLng &&
          lng <= RODRIGUES_BOUNDS.maxLng;
        // Off-island, this button can only move the frame somewhere wrong, so
        // it does nothing rather than explaining itself. The map is already
        // showing the island; that is the answer.
        if (here) map.setView([lat, lng], 16);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const basemaps = getBasemaps();
  const canConfirm = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-dark"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <p className="min-w-0 flex-1 font-syne text-[17px] font-extrabold text-offwhite">
          {copy.title}
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label={copy.cancel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-muted"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={host} className="h-full w-full" />

        {/* The map code never arrived. Everything on this screen depends on
            it, so say so and point at the way out — a blank grey box with a
            cancel button explains nothing. */}
        {chunkFailed && (
          <div
            role="alert"
            className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-3 bg-dark px-8 text-center"
          >
            <MapPin size={26} className="text-[#B0B0B0]" aria-hidden />
            <p className="font-syne text-base font-bold text-offwhite">
              The map could not load
            </p>
            <p className="font-dm text-sm text-[#B0B0B0]">
              That is the connection, not your phone. Go back and type the
              place name instead — a driver reads it either way.
            </p>
          </div>
        )}

        {/* The pin. Welded to the centre, never a drag target. The dot marks the
            exact point so the tip of the teardrop is not mistaken for it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full"
        >
          <svg width="34" height="46" viewBox="0 0 34 46" fill="none">
            <path
              d="M17 45s14-16.5 14-28A14 14 0 1 0 3 17c0 11.5 14 28 14 28Z"
              fill="#F5C842"
              stroke="#0a0a0a"
              strokeWidth="2.5"
            />
            <circle cx="17" cy="17" r="5" fill="#0a0a0a" />
          </svg>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-[500] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-dark ring-2 ring-yellow"
        />

        {basemaps.length > 1 && (
          <div
              // --below because the recentre button owns the corner above it.
              className="rr-basemap-switch rr-basemap-switch--below"
              role="group"
              aria-label={copy.title}
            >
            {basemaps.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => chooseBasemap(b.id)}
                aria-pressed={basemapId === b.id}
                className={basemapId === b.id ? "is-on" : undefined}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={recentre}
          disabled={locating}
          className="absolute right-3 top-3 z-[500] flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-dark-card/95 px-4 font-dm text-[15px] text-offwhite shadow-lg backdrop-blur disabled:opacity-50"
        >
          {locating ? (
            <Loader2 size={16} className="animate-spin text-yellow" />
          ) : (
            <LocateFixed size={16} className="text-yellow" />
          )}
          {copy.recentre}
        </button>
      </div>

      <div className="border-t border-white/10 p-4">
        <p className="font-dm text-[15px] leading-relaxed text-muted">
          {copy.hint}
        </p>

        {/* The written address does not go away. A driver navigates by words
            and landmarks; the coordinates are for dispatch. Both, or neither
            is much use. */}
        <label className="mt-3 block font-dm text-[16px] text-offwhite">
          {copy.nameLabel}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={copy.namePlaceholder}
            className="mt-1.5 min-h-14 w-full rounded-xl border border-[#6E6E6E] bg-dark px-3.5 font-dm text-[18px] text-offwhite placeholder:text-[#B0B0B0] focus:border-yellow/60 focus:outline-none"
          />
        </label>

        <button
          type="button"
          disabled={!canConfirm}
          onClick={() =>
            onConfirm({
              name: name.trim(),
              // Six decimals is about 11 cm. Anything beyond it is noise from a
              // phone GPS and noise in the database.
              lat: Number(centre.lat.toFixed(6)),
              lng: Number(centre.lng.toFixed(6)),
            })
          }
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-yellow font-dm text-[18px] font-bold text-dark disabled:opacity-40"
        >
          <Check size={18} />
          {copy.confirm}
        </button>
      </div>
    </div>
  );
}
