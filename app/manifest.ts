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
    background_color: "#050505",
    theme_color: "#050505",
    orientation: "portrait",
    lang: "en",
    dir: "ltr",
    categories: ["travel", "lifestyle", "navigation"],
    // "any" and "maskable" are DIFFERENT files, and must be.
    //
    // Declaring one image as both asks for two incompatible things. An "any"
    // icon should fill its square; a "maskable" icon is cropped by the launcher
    // to whatever shape it likes — usually a circle covering the central 80% —
    // so it needs the artwork inset with background bleeding to the edges.
    // Pointing both purposes at the same tight file is what cropped the end of
    // the wordmark off the home-screen icon.
    //
    // Both sets are generated from one source by scripts/generate-icons.mjs.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
