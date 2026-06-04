"use client";

import { useEffect, useRef } from "react";
import type { MapLocation } from "@/lib/defaults";

const CATEGORY_COLOR: Record<string, string> = {
  beach:     "#3B82F6",
  viewpoint: "#F59E0B",
  restaurant:"#10B981",
  landmark:  "#8B5CF6",
  activity:  "#EF4444",
};

const CATEGORY_LABEL: Record<string, string> = {
  beach:     "Beach",
  viewpoint: "Viewpoint",
  restaurant:"Restaurant",
  landmark:  "Landmark",
  activity:  "Activity",
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

        marker.bindPopup(
          `<div style="font-family: sans-serif; min-width:160px;">
            <p style="font-weight:700;margin:0 0 4px;font-size:13px;">${loc.name}</p>
            <p style="margin:0 0 6px;font-size:11px;color:#6b7280;">${CATEGORY_LABEL[loc.category] ?? loc.category}</p>
            <p style="margin:0;font-size:12px;color:#374151;">${loc.description}</p>
          </div>`,
          { maxWidth: 240 }
        );
      });
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
