import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type MapLocation, type RecommendedPlace, type RideRoute, type SiteContent } from "@/lib/defaults";
import { FR_PAGES, GUIDE_PAGES } from "@/lib/nav/hubs";
import { guideHubLinks, hikesOnGuide, hubCount } from "./hub";

// ── THE HUB'S NUMBER IS THE PAGE'S NUMBER (architecture review 2026-09-30, item 5) ──
//
// /guide said "The 5 best hikes" beside a page showing 2, in its visible list
// and in its ItemList; /fr said "Onze guides" over twelve, and "Les 19 plus
// belles plages" was typed on the day it was true. Asserted here by rendering
// BOTH pages on the same content and comparing the hub's title with the H1 the
// page actually prints — not by re-deriving the count in the test, which would
// agree with a shared bug.

const state = vi.hoisted(() => ({ content: null as unknown }));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => state.content,
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("next/image", () => ({
  default: (p: { src: string; alt: string }) => createElement("img", { src: p.src, alt: p.alt }),
}));

const plain = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const h1 = (html: string) => plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
/** The title a hub card for `href` shows. */
const cardTitle = (html: string, href: string) =>
  plain(
    html.match(new RegExp(`href="${href}"[\\s\\S]*?<span class="block font-syne[^"]*">([\\s\\S]*?)</span>`))?.[1] ??
      "",
  );
const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

const loc = (i: number, over: Partial<MapLocation>): MapLocation => ({
  id: `loc-${i}`,
  name: `Place ${i}`,
  description: "",
  category: "beach",
  lat: -19.7,
  lng: 63.4,
  ...over,
});
const hike = (i: number, over: Partial<RideRoute> = {}): RideRoute =>
  ({
    id: `hike-${i}`,
    name: `Trail ${i}`,
    description: "A walk along the ridge.",
    distance: "",
    duration: "",
    difficulty: "Easy",
    stops: "",
    mapsUrl: "",
    kind: "hike",
    ...over,
  }) as RideRoute;

function content(opts: { beaches: number; frBeaches: number; hikes: number; shop?: boolean }): SiteContent {
  const map: MapLocation[] = [];
  for (let i = 0; i < opts.beaches; i++) {
    map.push(loc(i, { description: `Beach ${i} has soft sand.`, ...(i < opts.frBeaches ? { descriptionFr: `Plage ${i}.` } : {}) }));
  }
  // Written in French only, and one with only the admin placeholder: the EN and
  // FR counts differ, so a hub reading the wrong list is caught.
  map.push(loc(90, { description: "Add a description.", descriptionFr: "Une plage sans texte anglais." }));
  map.push(loc(91, { category: "viewpoint", description: "A view." }));
  if (opts.shop) map.push(loc(92, { category: "shop", name: "Kot Pive" }));
  return {
    ...DEFAULT_CONTENT,
    mapLocations: map,
    rideRoutes: [
      ...Array.from({ length: opts.hikes }, (_, i) => hike(i)),
      hike(50, { description: "" }), // not written up: not on the page, not counted
      hike(51, { kind: "ride" }),
    ],
    recommended: {
      ...DEFAULT_CONTENT.recommended,
      items: [{ id: "rec-1", category: "activity", name: "Balade en mer", description: "", image: "/x.jpg" } as RecommendedPlace],
    },
  };
}

const PAGES = {
  guide: () => import("@/app/guide/page"),
  "guide/beaches": () => import("@/app/guide/beaches/page"),
  "guide/hiking": () => import("@/app/guide/hiking/page"),
  fr: () => import("@/app/fr/page"),
  "fr/plages-rodrigues": () => import("@/app/fr/plages-rodrigues/page"),
};

async function render(path: keyof typeof PAGES): Promise<string> {
  const { default: Page } = await PAGES[path]();
  return renderToStaticMarkup((await Page()) as ReactElement);
}

beforeEach(() => {
  state.content = content({ beaches: 3, frBeaches: 2, hikes: 2 });
});

describe("the /guide hub counts what each page shows", () => {
  it("titles the beaches card with the beaches page's own H1", async () => {
    const [hub, page] = await Promise.all([render("guide"), render("guide/beaches")]);
    expect(h1(page)).toBe("The 3 best beaches in Rodrigues");
    expect(cardTitle(hub, "/guide/beaches")).toBe(h1(page));
  });

  it("titles the hiking card with the hiking page's own H1 — not the 5 it used to type", async () => {
    const [hub, page] = await Promise.all([render("guide"), render("guide/hiking")]);
    expect(h1(page)).toBe("The 2 best hikes in Rodrigues");
    expect(cardTitle(hub, "/guide/hiking")).toBe(h1(page));
  });

  it("agrees with the page when there are no hikes written up at all", async () => {
    state.content = content({ beaches: 3, frBeaches: 2, hikes: 0 });
    const [hub, page] = await Promise.all([render("guide"), render("guide/hiking")]);
    expect(cardTitle(hub, "/guide/hiking")).toBe(h1(page));
  });

  it("publishes the same titles in its ItemList as on the page", async () => {
    const hub = await render("guide");
    const list = jsonLd(hub)
      .flatMap((d) => d["@graph"] ?? [d])
      .find((n: { "@type": string }) => n["@type"] === "ItemList");
    const names = list.itemListElement.map((e: { name: string }) => e.name);
    expect(names).toContain("The 3 best beaches in Rodrigues");
    expect(names).toContain("The 2 best hikes in Rodrigues");
    expect(names.join(" ")).not.toMatch(/\b5 best hikes|\b20 best beaches/);
  });

  it("names no count in its own sentence", async () => {
    expect(plain(await render("guide"))).not.toMatch(/\bEight guides\b/);
  });
});

describe("/guide/shops is listed only while it has a shop to show", () => {
  it("drops the card when no shop is pinned — the page 404s then", async () => {
    const hub = await render("guide");
    expect(hub).not.toContain('href="/guide/shops"');
    expect(guideHubLinks(state.content as SiteContent).some((g) => g.href === "/guide/shops")).toBe(false);
  });

  it("lists it once a shop is pinned", async () => {
    state.content = content({ beaches: 3, frBeaches: 2, hikes: 2, shop: true });
    expect(await render("guide")).toContain('href="/guide/shops"');
  });
});

describe("the /fr hub counts the French beaches the French page shows", () => {
  it("titles the plages card with /fr/plages-rodrigues's own H1", async () => {
    const [hub, page] = await Promise.all([render("fr"), render("fr/plages-rodrigues")]);
    // Three French-written beaches: two of the EN ones plus the FR-only one.
    expect(h1(page)).toBe("Les 3 plus belles plages de Rodrigues");
    expect(cardTitle(hub, "/fr/plages-rodrigues")).toBe(h1(page));
  });

  it("no longer says 'Onze', or any number, about its own list", async () => {
    const hub = plain(await render("fr"));
    expect(hub).not.toMatch(/\bOnze\b/);
    expect(hub).not.toMatch(/\b\d+ guides\b/);
  });
});

describe("the hub list types no number", () => {
  it("leads no static title with a count — the counts come from the pages", () => {
    // "3, 5 ou 7 jours" is the itinerary's subject, not a count of anything on
    // the hub; the shape that drifted was "The 20 …" / "Les 19 …".
    for (const p of [...GUIDE_PAGES, ...FR_PAGES]) expect(p.title, p.href).not.toMatch(/^(The|Les) \d+ /);
  });

  it("counts from the same filters the pages use", () => {
    const c = state.content as SiteContent;
    expect(hubCount(c, "beaches")).toBe(3);
    expect(hubCount(c, "plages")).toBe(3);
    expect(hubCount(c, "hikes")).toBe(hikesOnGuide(c.rideRoutes).length);
  });
});
