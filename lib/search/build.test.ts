import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SiteContent } from "@/lib/defaults";
import { buildDocs, clip, locationUrl, synonymGroups } from "./build";
import { STATIC_PAGES } from "./pages";
import { normalize } from "./normalize";

// ── The index can only point at things that exist ────────────────────────────

/** Is this path a route in app/? Static segments, or a [param] folder. */
function routeExists(path: string): boolean {
  const parts = path.split(/[?#]/)[0].split("/").filter(Boolean);
  let dir = join(process.cwd(), "app");
  for (const p of parts) {
    if (existsSync(join(dir, p))) dir = join(dir, p);
    else {
      const dyn = ["[category]", "[slug]", "[type]", "[vehicle]"].find((d) => existsSync(join(dir, d)));
      if (!dyn) return false;
      dir = join(dir, dyn);
    }
  }
  return existsSync(join(dir, "page.tsx"));
}

describe("static pages", () => {
  it.each(STATIC_PAGES.map((p) => [p.u]))("%s is a real route", (u) => {
    expect(routeExists(u)).toBe(true);
  });

  it("every page has a title and a line in all three languages", () => {
    for (const p of STATIC_PAGES) {
      for (const l of ["en", "fr", "cr"] as const) {
        expect(p.t[l].trim(), `${p.id} ${l}`).not.toBe("");
        expect(p.d[l].trim(), `${p.id} ${l}`).not.toBe("");
      }
    }
  });

  it("does not offer the closed eSIM store", () => {
    expect(STATIC_PAGES.some((p) => p.u.startsWith("/esim"))).toBe(false);
  });
});

const content = {
  fleet: [
    { id: "a", name: "AVENIS 125cc", category: "scooter", price: "From Rs 699(free delivery)", unit: "/ day", tagline: "Light", description: "", image: "", badge: "", available: true },
    { id: "b", name: "AVENIS 125cc", category: "scooter", price: "Rs 699", unit: "/ day", tagline: "Same page", description: "", image: "", badge: "", available: true },
    { id: "c", name: "Unpriced", category: "car", price: "", unit: "", tagline: "", description: "", image: "", badge: "", available: true },
  ],
  recommended: { items: [{ id: "rec-1", category: "hotel", name: "Les Mangliers", description: "Rooms by the lagoon", image: "", priceNote: "Rs 7000 per night" }] },
  mapLocations: [
    { id: "anse-ally", name: "Anse Ali Beach", description: "Sand", category: "beach", lat: 0, lng: 0 },
    { id: "pump", name: "Petrol Station — Port Mathurin", description: "Fuel", category: "gas", lat: 0, lng: 0 },
  ],
  rideRoutes: [],
  faq: { items: [{ id: "q1", question: "Do you take a deposit?", answer: "Yes." }] },
  usefulContacts: [
    { id: "pol", category: "emergency", label: "Police", number: "999" },
    { id: "amb", category: "emergency", label: "Ambulance", number: "114" },
  ],
} as unknown as SiteContent;

describe("the catalogue", () => {
  const docs = buildDocs(content, { events: [], dishes: [{ slug: "lobster", name: "Lobster", descriptor: null, descriptorFr: null, descriptorCr: null, kitchenName: "Chez Banane", price: 250000 }], synonyms: [] }, "en");
  const byId = (id: string) => docs.find((d) => d.id === id);

  it("one result per page: two fleet rows with one name are one entry", () => {
    expect(docs.filter((d) => d.u === "/browse/scooter/avenis-125cc")).toHaveLength(1);
  });

  it("an unpriced vehicle is not offered (it is not sellable)", () => {
    expect(byId("veh:c")).toBeUndefined();
  });

  it("vehicle prices are read, not copied", () => {
    expect(byId("veh:a")?.p).toBe("Rs 699 / day");
  });

  it("dish prices are cents (Rs 2,500 is 250000)", () => {
    expect(byId("dish:lobster")?.p).toBe("Rs 2500");
  });

  it("each emergency number has its own anchor, so none collapse", () => {
    expect(byId("contact:pol")?.u).toBe("/emergency#contact-pol");
    expect(byId("contact:amb")?.u).toBe("/emergency#contact-amb");
  });

  it("FAQ answers open their own question", () => {
    expect(byId("faq:q1")?.u).toBe("/faq#faq-q-q1");
  });

  it("places link where their card links", () => {
    expect(byId("place:rec-1")?.u).toBe("/browse/stays?place=rec-1");
    expect(byId("place:rec-1")?.k).toBe("stay");
  });
});

describe("map places", () => {
  it("beaches and viewpoints open their guide section; the rest open the map on them", () => {
    expect(locationUrl({ id: "x", category: "beach" } as never)).toBe("/guide/beaches#x");
    expect(locationUrl({ id: "y", category: "viewpoint" } as never)).toBe("/guide/viewpoints#y");
    expect(locationUrl({ id: "z z", category: "gas" } as never)).toBe("/map?loc=z%20z");
  });
});

describe("helpers", () => {
  it("clip cuts on a word and marks it", () => {
    expect(clip("one two three four", 9)).toBe("one two…");
    expect(clip("short", 9)).toBe("short");
    expect(clip("   ", 9)).toBeUndefined();
  });

  it("synonym pairs and groups join into one group per idea", () => {
    const g = synonymGroups([{ term: "honey", alias: "Dimiel" }, { term: "miel", alias: "honey" }], [["octopus", "ourite"]]);
    expect(g.find((x) => x.includes("honey"))?.sort()).toEqual(["dimiel", "honey", "miel"]);
    expect(g.find((x) => x.includes("ourite"))?.sort()).toEqual(["octopus", "ourite"]);
  });

  it("normalize folds accents, apostrophes and case", () => {
    expect(normalize("Île-aux-Cocos")).toBe("ile aux cocos");
    expect(normalize("Trou d'Argent")).toBe("trou d argent");
  });
});
