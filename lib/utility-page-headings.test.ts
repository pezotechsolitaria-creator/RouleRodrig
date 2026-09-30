import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type MapLocation } from "@/lib/defaults";
import { translations } from "@/lib/i18n";
import { mapSummary } from "./map-summary";

// ── RANKING UTILITY PAGES WHOSE H1 NEVER SAID WHAT THEY ARE ────────────────
//
// SEO audit 2026-09-29 T19 with C10 (/map ranks for ~30 "Rodrigues map"
// queries under an H1 reading ISLAND GUIDE), C22 (/trip-planner: TRIP PLANNER,
// and no link to the written itineraries answering the same question) and the
// /taxi H1 (C23: "Taxi & Transport", no Rodrigues). The H1s are CSS-uppercased,
// so only the text node changed. These render the real components.

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => DEFAULT_CONTENT,
}));

const plain = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const h1 = (html: string) => plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").trim();

// The live chip counts the audit read: All (42) — Beach (20), Viewpoint (11),
// Landmark (6), Petrol (3), and two more in the other categories.
const at = (category: MapLocation["category"], n: number) =>
  Array.from({ length: n }, () => ({ category }));
const LIVE = [
  ...at("beach", 20),
  ...at("viewpoint", 11),
  ...at("landmark", 6),
  ...at("gas", 3),
  ...at("restaurant", 1),
  ...at("activity", 1),
];

describe("/map (C10)", () => {
  it("counts the sentence from the map itself, and leaves empty categories out", () => {
    expect(mapSummary(LIVE, "en")).toBe(
      "Map of Rodrigues Island with 42 places — 20 beaches, 11 viewpoints, 1 restaurant, 6 landmarks, 1 activity and 3 petrol stations — each with directions from where you are.",
    );
    expect(mapSummary(LIVE, "en")).not.toMatch(/\b0 /);
    expect(mapSummary([], "en")).toBeNull();
  });

  it("says it in French and Kreol, with the chips' own words", () => {
    expect(mapSummary(at("beach", 2), "fr")).toBe(
      "Carte de l'île Rodrigues avec 2 lieux — 2 plages — chacun avec l'itinéraire depuis votre position.",
    );
    expect(mapSummary(at("beach", 1), "cr")).toContain("1 laplaz");
  });

  it("renders the literal H1 and the sentence in the server HTML", async () => {
    const { default: MapSection } = await import("@/components/MapSection");
    const locations = [
      { ...DEFAULT_CONTENT.mapLocations[0], id: "a", category: "beach" },
      { ...DEFAULT_CONTENT.mapLocations[0], id: "b", category: "viewpoint" },
    ] as MapLocation[];
    const html = renderToStaticMarkup(createElement(MapSection, { locations }));
    expect(h1(html)).toBe("Rodrigues island map");
    expect(plain(html)).toContain("Map of Rodrigues Island with 2 places — 1 beach and 1 viewpoint —");
  });

  it("has the title in all three languages", () => {
    expect(translations.en.map.title).toBe("Rodrigues island map");
    expect(translations.fr.map.title).toBe("Carte de l'île Rodrigues");
    expect(translations.cr.map.title).toMatch(/Rodrig/);
  });
});

describe("/trip-planner (C22)", async () => {
  const { default: Page } = await import("@/app/trip-planner/page");
  const html = renderToStaticMarkup((await Page()) as ReactElement);

  it("is titled 'Rodrigues trip planner'", () => {
    expect(h1(html)).toBe("Rodrigues trip planner");
  });

  it("links the written itineraries, in the server HTML", () => {
    expect(plain(html)).toContain("Not sure how many days?");
    expect(html).toContain('href="/blog/how-many-days-in-rodrigues"');
    expect(html).toContain('href="/blog/rodrigues-itinerary"');
    expect(html).toMatch(/href="\/fr\/itineraire-rodrigues"/);
  });

  it("keeps Rodrigues in the French and Kreol titles", () => {
    expect(translations.fr.planner.title).toMatch(/Rodrigues/);
    expect(translations.cr.planner.title).toMatch(/Rodrig/);
  });
});

describe("/taxi", () => {
  it("names the island in its H1, in every language", () => {
    const title = (l: "en" | "fr" | "cr") => `${translations[l].taxi.title1} ${translations[l].taxi.title2}`;
    expect(title("en")).toBe("Taxis in Rodrigues");
    expect(title("fr")).toBe("Taxis à Rodrigues");
    expect(title("cr")).toMatch(/Rodrig/);
  });
});
