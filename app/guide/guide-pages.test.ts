import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_CONTENT,
  type MapLocation,
  type RecommendedPlace,
  type RideRoute,
  type SiteContent,
} from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";

// ── THE GUIDE PAGES, THE MAP, AND THE LINKS BETWEEN THEM (architecture review 2026-09-30) ──
//
// Items 3, 4, 6, 7 and 8, asserted on the rendered pages rather than on their
// source: every "On the map" link on a guide lands on a row /map renders, every
// "Read in the guide" link on /map lands on an entry a guide renders, the place
// nodes in the structured data name only anchors that exist, the breadcrumbs go
// through /guide, and /guide/rodrigues hands each section on to the page that
// owns its subject.

const state = vi.hoisted(() => ({ content: null as unknown }));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => state.content,
}));
vi.mock("@/lib/places/popular-server", () => ({ rankIslandPlaces: async () => [] }));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({
  default: (p: { src: string; alt: string }) => createElement("img", { src: p.src, alt: p.alt }),
}));

const nodes = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .flatMap((d) => d["@graph"] ?? [d]);
const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hrefs = (html: string, prefix: string) =>
  [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((h) => h.startsWith(prefix));

const loc = (over: Partial<MapLocation> & Pick<MapLocation, "id" | "name">): MapLocation => ({
  description: "",
  category: "beach",
  lat: -19.72,
  lng: 63.45,
  image: `https://cdn.example/${over.id}.jpg`,
  ...over,
});

const PLACES: MapLocation[] = [
  loc({ id: "loc-1786897115499", name: "Trou d'Argent", description: "A cove between cliffs, reached on foot." }),
  loc({ id: "loc-1784120584012", name: "Pointe Coton Beach", story: "A long white beach on the east coast." }),
  // Only the admin placeholder: on no guide, but on the map.
  loc({ id: "loc-1784582153608", name: "Anse Raffin Beach", description: "Add a description." }),
  loc({ id: "loc-1784122891862", name: "Mont Limon Viewpoint", category: "viewpoint", story: "The highest point." }),
  loc({ id: "loc-1783535711857", name: "Marie Reine de Rodrigues", category: "landmark", description: "A statue above the bay." }),
  loc({ id: "gas-port-mathurin", name: "Petrol Station — Port Mathurin", category: "gas", description: "Fuel." }),
];
const SHOP = loc({ id: "loc-1784584377346", name: "Kot Pive", category: "shop", description: "Local crafts." });

function content(extra: MapLocation[] = []): SiteContent {
  return {
    ...DEFAULT_CONTENT,
    mapLocations: [...PLACES, ...extra],
    rideRoutes: [
      { id: "hike-1", name: "Ridge walk", description: "Up the spine.", kind: "hike", difficulty: "Easy" } as RideRoute,
      { id: "ride-1", name: "East coast ride", description: "Coast road.", kind: "ride", difficulty: "Easy" } as RideRoute,
    ],
    recommended: {
      ...DEFAULT_CONTENT.recommended,
      items: [{ id: "rec-1", category: "activity", name: "Balade en mer", description: "", image: "/x.jpg" } as RecommendedPlace],
    },
  };
}

beforeEach(() => {
  state.content = content([SHOP]);
});

const PAGES = {
  "/guide": () => import("@/app/guide/page"),
  "/guide/rodrigues": () => import("@/app/guide/rodrigues/page"),
  "/guide/beaches": () => import("@/app/guide/beaches/page"),
  "/guide/viewpoints": () => import("@/app/guide/viewpoints/page"),
  "/guide/hiking": () => import("@/app/guide/hiking/page"),
  "/guide/routes": () => import("@/app/guide/routes/page"),
  "/guide/ile-aux-cocos": () => import("@/app/guide/ile-aux-cocos/page"),
  "/guide/rodriguan-food": () => import("@/app/guide/rodriguan-food/page"),
  "/guide/shops": () => import("@/app/guide/shops/page"),
  "/map": () => import("@/app/map/page"),
};
async function render(path: keyof typeof PAGES): Promise<string> {
  const { default: Page } = await PAGES[path]();
  return renderToStaticMarkup((await Page()) as ReactElement);
}

describe("item 3 — the guides and the map point at each other, and land", () => {
  it("every 'On the map' link on a guide opens a row /map renders", async () => {
    const map = ids(await render("/map"));
    for (const guide of ["/guide/beaches", "/guide/viewpoints", "/guide/shops"] as const) {
      const links = hrefs(await render(guide), "/map#");
      expect(links.length, guide).toBeGreaterThan(0);
      for (const l of links) expect(map.has(l.slice("/map#".length)), `${guide} → ${l}`).toBe(true);
    }
  });

  it("every 'Read in the guide' link on /map opens an entry that guide renders", async () => {
    const map = await render("/map");
    const links = hrefs(map, "/guide/");
    // Beaches, viewpoints, the landmark and the shop — not the placeholder
    // beach, not the petrol station.
    expect(links).toHaveLength(5);
    for (const l of links) {
      const [path, anchor] = l.split("#") as [keyof typeof PAGES, string];
      expect(anchor, l).toBeTruthy();
      expect(ids(await render(path)).has(anchor), l).toBe(true);
    }
    expect(map).toContain('href="/guide/beaches#trou-d-argent"');
    // A landmark reads about itself on the viewpoints guide, never the bare /map.
    expect(map).toContain('href="/guide/viewpoints#marie-reine-de-rodrigues"');
  });

  it("keeps the old #loc-… targets alive for links written before anchors", async () => {
    const beaches = ids(await render("/guide/beaches"));
    expect(beaches.has("trou-d-argent")).toBe(true);
    expect(beaches.has("loc-1786897115499")).toBe(true);
  });
});

describe("item 4 — place nodes carry @id and url, and only anchors that exist", () => {
  for (const guide of ["/guide/beaches", "/guide/viewpoints", "/guide/shops"] as const) {
    it(guide, async () => {
      const html = await render(guide);
      const onPage = ids(html);
      const graph = nodes(html);
      const places = graph.filter((n) => ["Beach", "TouristAttraction", "LandmarksOrHistoricalBuildings", "Store"].includes(n["@type"]));
      expect(places.length).toBeGreaterThan(0);
      for (const p of places) {
        expect(p["@id"]).toBe(p.url);
        const [base, anchor] = String(p.url).split("#");
        expect(base).toBe(`${SITE_URL}${guide}`);
        expect(onPage.has(anchor), p.url).toBe(true);
      }
      const list = graph.find((n) => n["@type"] === "ItemList");
      expect(list.itemListElement.map((e: { url: string }) => e.url)).toEqual(places.map((p) => p.url));
    });
  }
});

describe("item 6 — every guide's breadcrumb goes Home › Island guide (/guide) › itself", () => {
  const children = [
    "/guide/rodrigues",
    "/guide/beaches",
    "/guide/viewpoints",
    "/guide/hiking",
    "/guide/routes",
    "/guide/ile-aux-cocos",
    "/guide/rodriguan-food",
    "/guide/shops",
  ] as const;
  for (const path of children) {
    it(path, async () => {
      const html = await render(path);
      const crumbs = nodes(html).find((n) => n["@type"] === "BreadcrumbList").itemListElement;
      expect(crumbs[0]).toMatchObject({ name: "Home", item: SITE_URL });
      expect(crumbs[1]).toMatchObject({ name: "Island guide", item: `${SITE_URL}/guide` });
      expect(crumbs[2].item).toBe(`${SITE_URL}${path}`);
      expect(crumbs).toHaveLength(3);
      // The visible link agrees with it.
      expect(html).toContain('href="/guide"');
    });
  }

  it("/guide itself is Home › Island guide", async () => {
    const crumbs = nodes(await render("/guide")).find((n) => n["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((c: { name: string }) => c.name)).toEqual(["Home", "Island guide"]);
  });
});

describe("item 7 — /guide/rodrigues hands each section on", () => {
  /** The HTML of one knowledge section, by its id. */
  const section = (html: string, id: string) => {
    const at = html.indexOf(`<section id="${id}"`);
    expect(at, id).toBeGreaterThan(-1);
    return html.slice(at, html.indexOf("</section>", at));
  };

  it("getting there → transfers and the getting-around post", async () => {
    const s = section(await render("/guide/rodrigues"), "getThere");
    expect(s).toContain('href="/transfers"');
    expect(s).toContain('href="/blog/how-to-get-around-rodrigues"');
  });

  /** Cars switched on or off, with one car whose price is `price`. The seed has them off. */
  const withCars = (c: SiteContent, enabled: boolean, price = "Rs 1899"): SiteContent => ({
    ...c,
    vehicleCategories: c.vehicleCategories.map((v) => (v.id === "car" ? { ...v, enabled } : v)),
    fleet: [...c.fleet, { ...c.fleet[0], id: "swift", name: "Suzuki Swift", category: "car", price }],
  });
  const scootersOff = (c: SiteContent): SiteContent => ({
    ...c,
    vehicleCategories: c.vehicleCategories.map((v) => (v.id === "scooter" ? { ...v, enabled: false } : v)),
  });
  const header = (html: string) => html.slice(0, html.indexOf("</header>"));

  it("getting around → scooter and car rental, while both can be booked", async () => {
    state.content = withCars(content([SHOP]), true);
    const s = section(await render("/guide/rodrigues"), "gettingAround");
    expect(s).toContain('href="/browse/scooter"');
    expect(s).toContain('href="/browse/car"');
    // In the prose's order, "a scooter or a car", whatever order the owner keeps.
    expect(s.indexOf('href="/browse/scooter"')).toBeLessThan(s.indexOf('href="/browse/car"'));
    const c = withCars(content([SHOP]), true);
    state.content = { ...c, vehicleCategories: [...c.vehicleCategories].reverse() };
    const r = section(await render("/guide/rodrigues"), "gettingAround");
    expect(r.indexOf('href="/browse/scooter"')).toBeLessThan(r.indexOf('href="/browse/car"'));
  });

  it("a paused category is not linked: Cars switched off (the 2026-09-09 pause)", async () => {
    state.content = withCars(content([SHOP]), false);
    const html = await render("/guide/rodrigues");
    expect(section(html, "gettingAround")).toContain('href="/browse/scooter"');
    expect(html).not.toContain('href="/browse/car"');
  });

  it("Cars switched on with no priced car is not linked either", async () => {
    state.content = withCars(content([SHOP]), true, "Ask us");
    const html = await render("/guide/rodrigues");
    expect(section(html, "gettingAround")).toContain('href="/browse/scooter"');
    expect(html).not.toContain('href="/browse/car"');
  });

  it("the hero button follows the same gate", async () => {
    // Scooters paused, cars bookable: the first button rents a car.
    state.content = scootersOff(withCars(content([SHOP]), true));
    let html = await render("/guide/rodrigues");
    expect(header(html)).toContain('href="/browse/car"');
    expect(html).not.toContain('href="/browse/scooter"');
    expect(header(html)).toContain("Rent a car");
    // Neither bookable: no rental button, and no fallback to the homepage grid.
    state.content = scootersOff(withCars(content([SHOP]), false));
    html = await render("/guide/rodrigues");
    expect(header(html)).not.toContain('href="/browse/');
    expect(header(html)).not.toContain('href="/#explore"');
    expect(header(html)).toContain('href="/trip-planner"');
    expect(section(html, "gettingAround")).not.toContain('href="/browse/');
  });

  it("Île aux Cocos, food, activities → the pages that own them", async () => {
    const html = await render("/guide/rodrigues");
    expect(section(html, "cocos")).toContain('href="/guide/ile-aux-cocos"');
    expect(section(html, "food")).toContain('href="/guide/rodriguan-food"');
    expect(section(html, "activities")).toContain('href="/experiences"');
  });

  it("a place section → that place's entry, only when the guide renders it", async () => {
    const html = await render("/guide/rodrigues");
    expect(section(html, "trouDArgent")).toContain('href="/guide/beaches#trou-d-argent"');
    expect(section(html, "montLimon")).toContain('href="/guide/viewpoints#mont-limon-viewpoint"');
    expect(section(html, "hiddenGems")).toContain('href="/guide/beaches"');
    // Nothing in the data is Caverne Patate: no link, rather than a guess.
    expect(section(html, "caves")).not.toContain('href="/guide/');
  });

  it("falls back to the guide, not a dead anchor, when the place is not written up", async () => {
    state.content = { ...content(), mapLocations: PLACES.filter((p) => p.name !== "Trou d'Argent") };
    expect(section(await render("/guide/rodrigues"), "trouDArgent")).toContain('href="/guide/beaches"');
  });

  it("culture → the shops guide only while it has a shop", async () => {
    expect(section(await render("/guide/rodrigues"), "culture")).toContain('href="/guide/shops"');
    state.content = content();
    expect(section(await render("/guide/rodrigues"), "culture")).not.toContain('href="/guide/shops"');
  });

  it("the first button rents a scooter, not the homepage grid", async () => {
    const html = await render("/guide/rodrigues");
    expect(header(html)).toContain('href="/browse/scooter"');
    expect(header(html)).not.toContain('href="/#explore"');
  });

  it("/guide/shops links the marketplace, without promising online shopping", async () => {
    const html = await render("/guide/shops");
    const link = html.match(/<a[^>]*href="\/shop"[^>]*>([\s\S]*?)<\/a>/);
    expect(link, "a /shop link").not.toBeNull();
    // /shop can be in its launch state with no products; the label must not
    // say a basket is waiting there.
    expect(link![1]).toContain("The island marketplace");
    expect(link![1].toLowerCase()).not.toContain("shop online");
  });
});

describe("item 8 — the theme guides' headings never skip a level", () => {
  for (const guide of ["/guide/beaches", "/guide/viewpoints", "/guide/shops"] as const) {
    it(guide, async () => {
      const levels = [...(await render(guide)).matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
      expect(levels[0]).toBe(1);
      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i] - levels[i - 1], `h${levels[i - 1]} → h${levels[i]} at #${i}`).toBeLessThanOrEqual(1);
      }
      // The cards' h3s are there, and now sit under an h2.
      expect(levels).toContain(3);
    });
  }
});
