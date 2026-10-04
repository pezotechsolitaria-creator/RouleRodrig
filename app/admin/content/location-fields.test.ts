import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MapLocation, RecommendedPlace } from "@/lib/defaults";
import { MIN_LONG_READ_CHARS, passesLocationGate } from "@/lib/guide/location-page-gate";
import {
  enablePagePatch,
  listingOptions,
  pageChecklist,
  slugInput,
  slugProblem,
  staleListingIds,
  suggestSlug,
  toggleListing,
} from "./location-fields";
import LocationPageFields from "./LocationPageFields";

// ── THE ISLAND GUIDE EDITOR'S NEW FIELDS (architecture review 2026-09-30,
// item 2) ───────────────────────────────────────────────────────────────────
//
// The checklist must never tick a condition the page gate refuses, so every
// assertion about it is checked against lib/guide/location-page-gate.ts's own
// passesLocationGate() on the same place. Nothing here sets a threshold.

const para = (lang: string) =>
  `${lang} paragraph about the lagoon, the reef and the walk down from the road, written by the owner. `.repeat(3);

function place(over: Partial<MapLocation> = {}): MapLocation {
  return {
    id: "loc-1",
    name: "Trou d'Argent",
    description: "A small cove between two cliffs, reached on foot along the coast path.",
    category: "beach",
    lat: -19.742,
    lng: 63.479,
    ...over,
  };
}

/** A place with everything a page needs, measured by the gate itself. */
function ready(over: Partial<MapLocation> = {}): MapLocation {
  const long = Array.from({ length: 6 }, (_, i) => `${i + 1}. ${para("English")}`).join("\n");
  const longFr = Array.from({ length: 6 }, (_, i) => `${i + 1}. ${para("Français")}`).join("\n");
  return place({
    slug: "trou-dargent",
    images: ["/a.jpg", "/b.jpg", "/c.jpg"],
    longRead: long,
    longReadFr: longFr,
    ...over,
  });
}

describe("the slug", () => {
  it("is suggested from the name with the guide's own fold", () => {
    expect(suggestSlug("Trou d'Argent", [])).toBe("trou-d-argent");
    expect(suggestSlug("Île aux Cocos", [])).toBe("ile-aux-cocos");
  });

  it("never suggests one another place already holds", () => {
    const other = place({ id: "loc-2", slug: "trou-d-argent" });
    expect(suggestSlug("Trou d'Argent", [other])).toBe("trou-d-argent-2");
  });

  it("is shaped as it is typed, and a stray trailing hyphen is named, not repaired", () => {
    expect(slugInput("Port Mathurin")).toBe("port-mathurin");
    expect(slugInput("Pointe-Coton-")).toBe("pointe-coton-");
    expect(slugProblem(place({ slug: "pointe-coton-" }), [])).toMatch(/lower-case words/);
  });

  it("names a clash with another place, and with an existing guide page", () => {
    expect(slugProblem(place({ slug: "cove" }), [place({ id: "loc-2", slug: "cove" })])).toMatch(/Another place/);
    expect(slugProblem(place({ slug: "beaches" }), [])).toMatch(/already a guide page/);
  });
});

describe("switching the page on", () => {
  it("fills and locks the suggested slug when none was typed", () => {
    expect(enablePagePatch(place(), [])).toEqual({ patch: { pageEnabled: true, slug: "trou-d-argent" } });
  });

  it("refuses a slug that another place holds, instead of locking a clash", () => {
    const r = enablePagePatch(place({ slug: "cove" }), [place({ id: "loc-2", slug: "cove" })]);
    expect(r).toEqual({ refused: expect.stringMatching(/Another place/) });
  });

  it("refuses a nameless, slugless place — there is no address to lock", () => {
    expect(enablePagePatch(place({ name: "" }), [])).toEqual({ refused: expect.stringMatching(/web address/) });
  });
});

describe("the checklist is the gate, line for line", () => {
  it("ticks every line exactly when the gate lets the page through", () => {
    const p = ready({ pageEnabled: true });
    expect(passesLocationGate(p)).toBe(true);
    expect(pageChecklist(p).every((l) => l.ok)).toBe(true);
  });

  it("shows the live figures a place is short of, and the gate agrees it is short", () => {
    const p = place({ pageEnabled: true, slug: "trou-dargent", longRead: "Short.", images: ["/a.jpg"] });
    expect(passesLocationGate(p)).toBe(false);
    const lines = pageChecklist(p);
    const en = lines.find((l) => l.label.startsWith("English long read"))!;
    expect(en.ok).toBe(false);
    expect(en.label).toMatch(new RegExp(`of ${MIN_LONG_READ_CHARS.toLocaleString("en-US")} characters$`));
    expect(lines.find((l) => l.label.startsWith("Photos"))).toEqual({ ok: false, label: "Photos: 1 of 3" });
    expect(lines.find((l) => l.label.startsWith("Coordinates"))!.ok).toBe(true);
  });

  it("fails the coordinates line for a pin off the island", () => {
    const p = ready({ pageEnabled: true, lat: -20.16, lng: 57.5 });
    expect(passesLocationGate(p)).toBe(false);
    expect(pageChecklist(p).find((l) => l.label.startsWith("Coordinates"))!.ok).toBe(false);
  });

  it("does not count a restaurant as a location page", () => {
    const p = ready({ pageEnabled: true, category: "restaurant" });
    expect(passesLocationGate(p)).toBe(false);
    expect(pageChecklist(p)[1].ok).toBe(false);
  });
});

describe("book near here", () => {
  const listings = [
    { id: "r1", name: "Boat to Île aux Cocos", category: "activity" },
    { id: "r2", name: "Guesthouse in the village", category: "hotel", hidden: true },
    { id: "r3", name: "  ", category: "hotel" },
  ] as unknown as RecommendedPlace[];

  it("lists named listings, chosen first, hidden ones marked", () => {
    expect(listingOptions(listings, ["r2"])).toEqual([
      { id: "r2", name: "Guesthouse in the village", hidden: true, chosen: true },
      { id: "r1", name: "Boat to Île aux Cocos", hidden: false, chosen: false },
    ]);
  });

  it("toggles an id and leaves no empty array behind", () => {
    expect(toggleListing(undefined, "r1")).toEqual(["r1"]);
    expect(toggleListing(["r1"], "r1")).toBeUndefined();
  });

  it("finds ids whose listing was deleted, so they can be cleared", () => {
    expect(staleListingIds(listings, ["r1", "gone"])).toEqual(["gone"]);
  });
});

describe("the rendered fields", () => {
  const render = (p: MapLocation, others: MapLocation[] = []) =>
    renderToStaticMarkup(
      createElement(LocationPageFields, {
        place: p,
        others,
        listings: [{ id: "r1", name: "Boat to Île aux Cocos", category: "activity" } as unknown as RecommendedPlace],
        onChange: () => {},
      }),
    );

  it("locks the slug with the live-URL note once the page is switched on", () => {
    const html = render(ready({ pageEnabled: true }));
    expect(html).toContain("/guide/trou-dargent");
    expect(html).toContain("This is a live URL");
    expect(html).not.toMatch(/<input[^>]*id="slug-loc-1"/);
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(html).toContain("Live at /guide/trou-dargent once you save.");
  });

  it("leaves the slug editable, with the suggestion, while the page is off", () => {
    const html = render(place());
    expect(html).toMatch(/<input[^>]*id="slug-loc-1"/);
    expect(html).toContain("Use “trou-d-argent”");
    expect(html).toContain("Off. The list below shows what a page would still need.");
  });

  it("says a page asked for but short of the gate is not live", () => {
    const html = render(place({ pageEnabled: true, slug: "trou-dargent" }));
    expect(html).toContain("Asked for. The page appears only when every line below is ticked.");
    expect(html).not.toContain("Live at /guide/");
  });
});
