"use client";

import "leaflet/dist/leaflet.css"; // bundled locally — no external CDN (CSP-safe)
import { useEffect, useRef } from "react";
import type { MapLocation } from "@/lib/defaults";

const CATEGORY_COLOR: Record<string, string> = {
  beach:     "#3B82F6",
  viewpoint: "#F59E0B",
  restaurant:"#10B981",
  landmark:  "#8B5CF6",
  activity:  "#EF4444",
  gas:       "#F97316",
};

const CATEGORY_LABEL: Record<string, string> = {
  beach:     "Beach",
  viewpoint: "Viewpoint",
  restaurant:"Restaurant",
  landmark:  "Landmark",
  activity:  "Activity",
  gas:       "Petrol station",
};

type Props = {
  locations: MapLocation[];
};

export default function IslandMapInner({ locations }: Props) {
  const mapRef  = useRef<HTMLDivElement>(null);
  const mapInst = useRef<unknown>(null);

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

        const photo = loc.image
          ? `<img src="${esc(loc.image)}" alt="${esc(loc.name)}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block;" />`
          : "";
        const directions = `<a href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:11px;font-weight:700;color:#0a0a0a;background:#F5C842;padding:6px 12px;border-radius:20px;text-decoration:none;">Get directions →</a>`;

        marker.bindPopup(
          `<div style="font-family: sans-serif; width:220px;">
            ${photo}
            <p style="font-weight:700;margin:0 0 3px;font-size:14px;color:#111;">${esc(loc.name)}</p>
            <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:${color};font-weight:700;">${esc(CATEGORY_LABEL[loc.category] ?? loc.category)}</p>
            <p style="margin:0;font-size:12px;line-height:1.45;color:#374151;">${esc(loc.description)}</p>
            ${directions}
          </div>`,
          { maxWidth: 260 }
        );
      });

      // ── Live "you are here" position — Rodrigues only ──
      // Rodrigues bounding box (with a small margin)
      const RODRIGUES_BOUNDS = { minLat: -19.78, maxLat: -19.61, minLng: 63.33, maxLng: 63.50 };
      let youMarker: ReturnType<typeof L.circleMarker> | null = null;

      const LocateControl = L.Control.extend({
        options: { position: "topleft" as const },
        onAdd: function () {
          const btn = L.DomUtil.create("button", "");
          btn.innerHTML = "📍";
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
            btn.innerHTML = "⏳";
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                btn.innerHTML = "📍";
                const { latitude: lat, longitude: lng } = pos.coords;
                const inRodrigues =
                  lat >= RODRIGUES_BOUNDS.minLat && lat <= RODRIGUES_BOUNDS.maxLat &&
                  lng >= RODRIGUES_BOUNDS.minLng && lng <= RODRIGUES_BOUNDS.maxLng;
                if (!inRodrigues) {
                  L.popup()
                    .setLatLng([-19.7024, 63.4105])
                    .setContent('<div style="font-family:sans-serif;font-size:12px;max-width:200px;">📍 Live location only works while you are on Rodrigues Island.</div>')
                    .openOn(map);
                  return;
                }
                if (youMarker) youMarker.remove();
                youMarker = L.circleMarker([lat, lng], {
                  radius: 8, fillColor: "#2563EB", color: "#fff", weight: 3, fillOpacity: 1,
                }).addTo(map);
                youMarker.bindPopup('<div style="font-family:sans-serif;font-size:12px;font-weight:700;">You are here 🛵</div>').openPopup();
                map.setView([lat, lng], 14);
              },
              () => { btn.innerHTML = "📍"; },
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
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-2xl overflow-hidden"
      style={{ minHeight: 420 }}
    />
  );
}
