"use client";

import "leaflet/dist/leaflet.css"; // bundled locally — no external CDN (CSP-safe)
import { useEffect, useRef, useState } from "react";
import type { MapLocation } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc as localize } from "@/lib/localize";
import type { Language } from "@/lib/i18n";
import {
  getBasemap,
  getBasemaps,
  DEFAULT_BASEMAP,
  BASEMAP_STORAGE_KEY,
  type BasemapId,
} from "@/lib/tracking/tiles";

const CATEGORY_COLOR: Record<string, string> = {
  beach:     "#3B82F6",
  viewpoint: "#F59E0B",
  restaurant:"#10B981",
  landmark:  "#8B5CF6",
  activity:  "#EF4444",
  gas:       "#D946EF",
  shop:      "#2DD4BF",
};

const CATEGORY_LABEL_I18N: Record<Language, Record<string, string>> = {
  en: { beach: "Beach",   viewpoint: "Viewpoint",     restaurant: "Restaurant", landmark: "Landmark", activity: "Activity",  gas: "Petrol station",  shop: "Shop" },
  fr: { beach: "Plage",   viewpoint: "Point de vue",  restaurant: "Restaurant", landmark: "Site",     activity: "Activité",  gas: "Station-service", shop: "Boutique" },
  cr: { beach: "Laplaz",  viewpoint: "Pwin vi",       restaurant: "Restoran",   landmark: "Landmark", activity: "Aktivite",  gas: "Stasion lesans",  shop: "Laboutik" },
};
const DIRECTIONS_LABEL: Record<Language, string> = {
  en: "Get directions",
  fr: "Itinéraire",
  cr: "Gagn direksion",
};

type Leaflet = typeof import("leaflet");
type LMap = import("leaflet").Map;
type LLayerGroup = import("leaflet").LayerGroup;
type LTileLayer = import("leaflet").TileLayer;

type Props = {
  locations: MapLocation[];
};

export default function IslandMapInner({ locations }: Props) {
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapInst = useRef<LMap | null>(null);
  const leaflet = useRef<Leaflet | null>(null);
  const markers = useRef<LLayerGroup | null>(null);
  const baseLayer = useRef<LTileLayer | null>(null);
  const { t, language } = useLanguage();

  // ── WHY AN EPOCH AND NOT A BOOLEAN ──────────────────────────────────────
  // Leaflet arrives through a dynamic import, so the map does not exist on the
  // first render and the effects that draw ONTO it have to wait. A counter
  // bumped when the map is (re)built is what those effects depend on; a plain
  // `ready` boolean cannot express "it was torn down and built again", which is
  // exactly what happens when the language changes.
  const [epoch, setEpoch] = useState(0);
  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP);

  // Remembered per browser, same key the tracking map uses, so a viewer who
  // chose satellite once gets satellite everywhere.
  useEffect(() => {
    let cancelled = false;
    // Read in a microtask: this repo lints synchronous setState in an effect as
    // an error, and the answer genuinely comes from outside React.
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

  function chooseBasemap(id: BasemapId) {
    setBasemapId(id);
    try {
      localStorage.setItem(BASEMAP_STORAGE_KEY, id);
    } catch {
      /* nothing to remember it with; the choice still applies for this visit */
    }
  }

  // ── 1. THE MAP ITSELF ───────────────────────────────────────────────────
  // Built once per language. Deliberately owns no tile layer and no markers:
  // those are separate effects because they change on their own schedule, and
  // rebuilding the whole map to change one of them would throw away the
  // viewer's pan and zoom and re-request every tile.
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInst.current) return;

      // Fix default icon paths (Leaflet + bundlers issue)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Rodrigues Island center
      const map = L.map(mapRef.current!, {
        center: [-19.7024, 63.4105],
        zoom: 12,
        scrollWheelZoom: false,
        zoomControl: true,
      });

      leaflet.current = L;
      mapInst.current = map;
      markers.current = L.layerGroup().addTo(map);

      // ── Live "you are here" position — Rodrigues only ──
      // Rodrigues bounding box (with a small margin)
      const RODRIGUES_BOUNDS = { minLat: -19.78, maxLat: -19.61, minLng: 63.33, maxLng: 63.50 };
      let youMarker: ReturnType<typeof L.circleMarker> | null = null;

      // Lucide-style "locate" crosshair (SVG string — Leaflet controls take HTML).
      const LOCATE_SVG =
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="12" r="7"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>';

      const LocateControl = L.Control.extend({
        options: { position: "topleft" as const },
        onAdd: function () {
          const btn = L.DomUtil.create("button", "");
          btn.innerHTML = LOCATE_SVG;
          btn.title = "Show my location (Rodrigues only)";
          btn.setAttribute("type", "button");
          Object.assign(btn.style, {
            width: "34px", height: "34px", fontSize: "16px", cursor: "pointer",
            background: "#fff", border: "2px solid rgba(0,0,0,0.2)", borderRadius: "6px",
            lineHeight: "30px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          });
          L.DomEvent.on(btn, "click", (e: Event) => {
            L.DomEvent.stop(e);
            if (!navigator.geolocation) return;
            btn.innerHTML = "…";
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                btn.innerHTML = LOCATE_SVG;
                const { latitude: lat, longitude: lng } = pos.coords;
                const inRodrigues =
                  lat >= RODRIGUES_BOUNDS.minLat && lat <= RODRIGUES_BOUNDS.maxLat &&
                  lng >= RODRIGUES_BOUNDS.minLng && lng <= RODRIGUES_BOUNDS.maxLng;
                if (!inRodrigues) {
                  // These two strings used to be the LITERAL text
                  // "{t.common.liveLocationOnly}" — a template placeholder
                  // inside a single-quoted JavaScript string, so the popup
                  // showed a variable name to the viewer. The translations
                  // existed the whole time; nothing was ever reading them.
                  L.popup()
                    .setLatLng([-19.7024, 63.4105])
                    .setContent(
                      `<div style="font-family:sans-serif;font-size:12px;max-width:200px;">${escapeHtml(t.common.liveLocationOnly)}</div>`,
                    )
                    .openOn(map);
                  return;
                }
                if (youMarker) youMarker.remove();
                youMarker = L.circleMarker([lat, lng], {
                  radius: 8, fillColor: "#2563EB", color: "#fff", weight: 3, fillOpacity: 1,
                }).addTo(map);
                youMarker
                  .bindPopup(
                    `<div style="font-family:sans-serif;font-size:12px;font-weight:700;">${escapeHtml(t.common.youAreHere)}</div>`,
                  )
                  .openPopup();
                map.setView([lat, lng], 14);
              },
              () => { btn.innerHTML = LOCATE_SVG; },
              { enableHighAccuracy: true, timeout: 8000 }
            );
          });
          return btn;
        },
      });
      map.addControl(new LocateControl());

      setEpoch((n) => n + 1);
    });

    return () => {
      cancelled = true;
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }
      markers.current = null;
      baseLayer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // ── 2. THE SHEET UNDERNEATH ─────────────────────────────────────────────
  // Swapped in place. Every URL comes from lib/tracking/tiles.ts, the module
  // whose stated rule is "no component imports a tile URL, and none should" —
  // this one used to, which is why setting NEXT_PUBLIC_MAP_TILE_URL re-tiled
  // the tracking maps and silently did nothing here.
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
      // The tracking map also passes `className: tintable ? "rr-tiles" : …`.
      // Not copied: this map has always drawn untinted tiles, and adopting the
      // dark treatment here would change how /map looks.
    }).addTo(map);
  }, [epoch, basemapId]);

  // ── 3. THE PINS ─────────────────────────────────────────────────────────
  // THE FILTER BUG LIVED HERE. Markers used to be drawn inside the map-creation
  // effect, which was guarded by `if (mapInst.current) return` and depended on
  // [language] alone. So the pins were whatever `locations` held on first
  // render — every category — and choosing "Beaches" filtered the list beneath
  // the map while the map itself kept showing all seven categories. The list
  // and the map disagreed, and the map was the one lying.
  //
  // Keyed by id rather than by array identity: MapSection rebuilds the array on
  // every render (`locs.filter(...)`), and depending on the array itself would
  // redraw every pin — closing whatever popup the viewer had open — each time
  // an unrelated piece of state changed.
  const locationKey = locations.map((l) => l.id).join("|");
  useEffect(() => {
    const L = leaflet.current;
    const group = markers.current;
    if (!L || !group) return;

    group.clearLayers();

    locations.forEach((loc) => {
      const color = CATEGORY_COLOR[loc.category] ?? "#F59E0B";
      const marker = L.circleMarker([loc.lat, loc.lng], {
        radius: 9,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      // Photo gallery: swipeable horizontal strip when there are several photos
      const pics = (loc.images && loc.images.length > 0 ? loc.images : loc.image ? [loc.image] : []).filter(Boolean);
      const photo =
        pics.length > 1
          ? `<div style="display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;border-radius:8px;margin-bottom:8px;">${pics
              .map(
                (p) =>
                  `<img src="${escapeHtml(p)}" alt="${escapeHtml(loc.name)}" loading="lazy" style="width:186px;height:120px;object-fit:cover;border-radius:8px;flex-shrink:0;scroll-snap-align:start;display:block;" />`,
              )
              .join("")}</div><p style="margin:0 0 6px;font-size:10px;color:#9ca3af;">◂ ${pics.length} ${language === "fr" ? "photos — glissez" : language === "cr" ? "foto — glise" : "photos — swipe"} ▸</p>`
          : pics.length === 1
          ? `<img src="${escapeHtml(pics[0])}" alt="${escapeHtml(loc.name)}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block;" />`
          : "";
      const directions = `<a href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:11px;font-weight:700;color:#0a0a0a;background:#F5C842;padding:6px 12px;border-radius:20px;text-decoration:none;">${DIRECTIONS_LABEL[language]} →</a>`;

      const locName = localize(language, loc.name, loc.nameFr, loc.nameCr);
      const locDesc = localize(language, loc.description, loc.descriptionFr, loc.descriptionCr);
      const catLabel = CATEGORY_LABEL_I18N[language][loc.category] ?? loc.category;
      const locStory = localize(language, loc.story, loc.storyFr, loc.storyCr);
      const storyLabel = language === "fr" ? "L'histoire de Ti Roulé" : language === "cr" ? "Zistwar Ti Roulé" : "Ti Roulé's story";
      const story = locStory
        ? `<div style="margin-top:8px;padding:8px 10px;background:#FBF3D9;border:1px solid #F0D68A;border-radius:8px;">
            <p style="margin:0 0 3px;font-size:10px;font-weight:700;letter-spacing:.04em;color:#8a6d1e;">🐢 ${escapeHtml(storyLabel)}</p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#4b463a;">${escapeHtml(locStory)}</p>
          </div>`
        : "";

      marker.bindPopup(
        `<div style="font-family: sans-serif; width:230px;">
          ${photo}
          <p style="font-weight:700;margin:0 0 3px;font-size:14px;color:#111;">${escapeHtml(locName)}</p>
          <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:${color};font-weight:700;">${escapeHtml(catLabel)}</p>
          <p style="margin:0;font-size:12px;line-height:1.45;color:#374151;">${escapeHtml(locDesc)}</p>
          ${story}
          ${directions}
        </div>`,
        { maxWidth: 270 }
      );

      group.addLayer(marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, locationKey, language]);

  const basemaps = getBasemaps();

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapRef}
        className="w-full h-full rounded-2xl overflow-hidden"
        style={{ minHeight: 420 }}
      />

      {/* Satellite / Map. Both options visible rather than one behind an icon —
          the same control, in the same place, as the tracking map, so it is
          learned once. */}
      {basemaps.length > 1 && (
        <div className="rr-basemap-switch" role="group" aria-label={t.a11yMore.mapStyle}>
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
    </div>
  );
}

/** Escape user/admin text before injecting into popup HTML. */
function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)
  );
}
