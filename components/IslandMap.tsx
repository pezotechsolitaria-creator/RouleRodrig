"use client";

import "leaflet/dist/leaflet.css"; // bundled locally — no external CDN (CSP-safe)
import { useEffect, useRef } from "react";
import type { MapLocation } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc as localize } from "@/lib/localize";
import type { Language } from "@/lib/i18n";

const CATEGORY_COLOR: Record<string, string> = {
  beach:     "#3B82F6",
  viewpoint: "#F59E0B",
  restaurant:"#10B981",
  landmark:  "#8B5CF6",
  activity:  "#EF4444",
  gas:       "#D946EF",
};

const CATEGORY_LABEL_I18N: Record<Language, Record<string, string>> = {
  en: { beach: "Beach",   viewpoint: "Viewpoint",     restaurant: "Restaurant", landmark: "Landmark", activity: "Activity",  gas: "Petrol station" },
  fr: { beach: "Plage",   viewpoint: "Point de vue",  restaurant: "Restaurant", landmark: "Site",     activity: "Activité",  gas: "Station-service" },
  cr: { beach: "Laplaz",  viewpoint: "Pwin vi",       restaurant: "Restoran",   landmark: "Landmark", activity: "Aktivite",  gas: "Stasion lesans" },
};
const DIRECTIONS_LABEL: Record<Language, string> = {
  en: "Get directions",
  fr: "Itinéraire",
  cr: "Gagn direksion",
};

type Props = {
  locations: MapLocation[];
};

export default function IslandMapInner({ locations }: Props) {
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapInst = useRef<unknown>(null);
  const { language } = useLanguage();

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    // Dynamically load Leaflet (browser only)
    import("leaflet").then((L) => {
      if (!mapRef.current || mapInst.current) return;

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

      mapInst.current = map;

      // OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Escape user/admin text before injecting into popup HTML
      const esc = (s: string) =>
        String(s ?? "").replace(/[&<>"]/g, (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)
        );

      // Custom circle markers for each location
      locations.forEach((loc) => {
        const color = CATEGORY_COLOR[loc.category] ?? "#F59E0B";
        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius: 9,
          fillColor: color,
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        // Photo gallery: swipeable horizontal strip when there are several photos
        const pics = (loc.images && loc.images.length > 0 ? loc.images : loc.image ? [loc.image] : []).filter(Boolean);
        const photo =
          pics.length > 1
            ? `<div style="display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;border-radius:8px;margin-bottom:8px;">${pics
                .map(
                  (p) =>
                    `<img src="${esc(p)}" alt="${esc(loc.name)}" loading="lazy" style="width:186px;height:120px;object-fit:cover;border-radius:8px;flex-shrink:0;scroll-snap-align:start;display:block;" />`,
                )
                .join("")}</div><p style="margin:0 0 6px;font-size:10px;color:#9ca3af;">◂ ${pics.length} photos — swipe ▸</p>`
            : pics.length === 1
            ? `<img src="${esc(pics[0])}" alt="${esc(loc.name)}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block;" />`
            : "";
        const directions = `<a href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:11px;font-weight:700;color:#0a0a0a;background:#F5C842;padding:6px 12px;border-radius:20px;text-decoration:none;">${DIRECTIONS_LABEL[language]} →</a>`;

        const locName = localize(language, loc.name, loc.nameFr, loc.nameCr);
        const locDesc = localize(language, loc.description, loc.descriptionFr, loc.descriptionCr);
        const catLabel = CATEGORY_LABEL_I18N[language][loc.category] ?? loc.category;

        marker.bindPopup(
          `<div style="font-family: sans-serif; width:220px;">
            ${photo}
            <p style="font-weight:700;margin:0 0 3px;font-size:14px;color:#111;">${esc(locName)}</p>
            <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:${color};font-weight:700;">${esc(catLabel)}</p>
            <p style="margin:0;font-size:12px;line-height:1.45;color:#374151;">${esc(locDesc)}</p>
            ${directions}
          </div>`,
          { maxWidth: 260 }
        );
      });

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
                  L.popup()
                    .setLatLng([-19.7024, 63.4105])
                    .setContent('<div style="font-family:sans-serif;font-size:12px;max-width:200px;">Live location only works while you are on Rodrigues Island.</div>')
                    .openOn(map);
                  return;
                }
                if (youMarker) youMarker.remove();
                youMarker = L.circleMarker([lat, lng], {
                  radius: 8, fillColor: "#2563EB", color: "#fff", weight: 3, fillOpacity: 1,
                }).addTo(map);
                youMarker.bindPopup('<div style="font-family:sans-serif;font-size:12px;font-weight:700;">You are here</div>').openPopup();
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
    });

    return () => {
      if (mapInst.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapInst.current as any).remove();
        mapInst.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-2xl overflow-hidden"
      style={{ minHeight: 420 }}
    />
  );
}
