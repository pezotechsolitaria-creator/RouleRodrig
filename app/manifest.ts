import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: "Roule Rodrigues",
    short_name: "Roule Rodrigues",
    description:
      "Your gateway to Rodrigues Island — scooters, stays, restaurants, routes and trip planning in one app.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait",
    lang: "en",
    dir: "ltr",
    categories: ["travel", "lifestyle", "navigation"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
