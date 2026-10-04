import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MetadataRoute } from "next";
import {
  DEFAULT_CONTENT,
  type FleetItem,
  type MapLocation,
  type RecommendedPlace,
  type SiteContent,
} from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";
import { MIN_LONG_READ_CHARS, locationGateRefusals, longReadChars } from "@/lib/guide/location-page-gate";

// ── /guide/<slug> SHIPS DARK, AND IS PROVEN LIT (architecture review 2026-09-30, item 2) ──
//
// On 30 Sep 2026 no place carries the fields the gate needs, so the route
// serves nothing but 404s in production. That makes it the kind of code that
// rots unseen, so it is driven here with a fixture that passes and several
// that do not: the real page, the real metadata, the real sitemap, the real
// /guide hub, beaches guide and /map — with only the content read replaced.

const state = vi.hoisted(() => ({ content: null as unknown }));

type Result = { data?: unknown; error?: unknown; count?: number | null };
function fakeClient() {
  const builder = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "not", "is", "gt", "gte", "lte", "neq"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(ok, bad);
    return q;
  };
  return {
    from: builder,
    rpc: () => {
      const r = Promise.resolve({ data: [], error: null });
      return Object.assign(r, { maybeSingle: () => r });
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  };
}

vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => fakeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("@/lib/events/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/events/queries")>()),
  listPublicEvents: async () => [],
}));
vi.mock("@/lib/food/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/food/queries")>()),
  listFoodSlugs: async () => [],
}));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => state.content,
}));
vi.mock("@/lib/site-data", async (orig) => ({
  ...(await orig<typeof import("@/lib/site-data")>()),
  getFleetView: async () => ({ content: state.content, fleet: [], recentBookings: {} }),
}));
vi.mock("@/lib/places/popular-server", () => ({ rankIslandPlaces: async () => [] }));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
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
const nodes = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .flatMap((d) => d["@graph"] ?? [d]);

/** Sixteen different paragraphs of the owner's long read — over the gate in both languages. */
const longRead = (lang: "en" | "fr") =>
  Array.from({ length: 16 }, (_, i) =>
    lang === "en"
      ? `Paragraph ${i + 1}: the path down to the cove leaves from the road above and takes a while on foot.`
      : `Paragraphe ${i + 1} : le sentier vers la crique part de la route au-dessus et se fait à pied.`,
  ).join("\n");

const TROU: MapLocation = {
  id: "loc-trou",
  name: "Trou d'Argent",
  description: "A cove between cliffs, reached only on foot.",
  category: "beach",
  lat: -19.7389,
  lng: 63.4967,
  image: "https://cdn.example/trou-1.jpg",
  images: ["https://cdn.example/trou-1.jpg", "https://cdn.example/trou-2.jpg", "https://cdn.example/trou-3.jpg", "https://cdn.example/trou-4.jpg"],
  slug: "trou-d-argent",
  area: "Saint-François",
  pageEnabled: true,
  longRead: longRead("en"),
  longReadFr: longRead("fr"),
  relatedListingIds: ["rec-walk", "veh-avenis", "rec-gone", "veh-draft"],
};
/** Asked for a page, but its French long read is short: it stays a section. */
const THIN: MapLocation = {
  ...TROU,
  id: "loc-coton",
  name: "Pointe Coton Beach",
  slug: "pointe-coton",
  longReadFr: "Trop court.",
};
/** Asked for a slug a static guide already answers. */
const SHADOWED: MapLocation = { ...TROU, id: "loc-shadow", name: "Beaches everywhere", slug: "beaches" };

const WALK = {
  id: "rec-walk",
  category: "activity",
  name: "Coastal walk with Jo",
  description: "",
  image: "/walk.jpg",
} as RecommendedPlace;
const AVENIS = { id: "veh-avenis", name: "Suzuki Avenis", category: "scooter", price: "699", image: "/a.jpg" } as FleetItem;
const DRAFT = { id: "veh-draft", name: "New car", category: "scooter", price: "", image: "/d.jpg" } as FleetItem;

function content(places: MapLocation[] = [TROU, THIN, SHADOWED]): SiteContent {
  return {
    ...DEFAULT_CONTENT,
    mapLocations: places,
    fleet: [AVENIS, DRAFT],
    recommended: { ...DEFAULT_CONTENT.recommended, items: [WALK] },
    contact: { ...DEFAULT_CONTENT.contact, email: "bookings@roulerodrig.com" },
  };
}

beforeEach(() => {
  state.content = content();
});

const page = () => import("@/app/guide/[place]/page");
const params = (place: string) => ({ params: Promise.resolve({ place }) });
async function renderPlace(slug: string): Promise<string> {
  const { default: Page } = await page();
  return renderToStaticMarkup((await Page(params(slug))) as ReactElement);
}

describe("a place that passes the gate gets a page", () => {
  it("renders its own words: H1, area, every long-read paragraph, its photos", async () => {
    const html = await renderPlace("trou-d-argent");
    expect(plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1])).toBe("Trou d'Argent");
    const text = plain(html);
    expect(text).toContain("Saint-François");
    for (const p of longRead("en").split("\n")) expect(text).toContain(p);
    // The French long read is for the French twin, not this English page.
    expect(text).not.toContain("Paragraphe 1");
    expect(html.match(/<img /g)).toHaveLength(4);
  });

  it("links its row on the map, its theme-guide entry and the hub", async () => {
    const html = await renderPlace("trou-d-argent");
    expect(html).toContain('href="/map#trou-d-argent"');
    expect(html).toContain('href="/guide/beaches#trou-d-argent"');
    expect(html).toContain('href="/guide"');
  });

  it("offers only the listings the owner linked that still resolve to a bookable page", async () => {
    const html = await renderPlace("trou-d-argent");
    const section = html.slice(html.indexOf("Book near here"), html.indexOf("More in the island guide"));
    expect(section).toContain('href="/experiences/coastal-walk-with-jo"');
    expect(section).toContain('href="/browse/scooter/suzuki-avenis"');
    // A deleted listing and an unpriced draft vehicle are skipped, not linked.
    expect(section).not.toContain("New car");
    expect(section.match(/<li>/g)).toHaveLength(2);
  });

  it("says nothing about booking when the owner linked nothing", async () => {
    state.content = content([{ ...TROU, relatedListingIds: [] }]);
    expect(plain(await renderPlace("trou-d-argent"))).not.toContain("Book near here");
  });

  it("describes the place, and only the place, in its structured data", async () => {
    const graph = nodes(await renderPlace("trou-d-argent"));
    const beach = graph.find((n) => n["@type"] === "Beach");
    expect(beach).toMatchObject({
      "@id": `${SITE_URL}/guide/trou-d-argent#place`,
      url: `${SITE_URL}/guide/trou-d-argent`,
      name: "Trou d'Argent",
      geo: { latitude: -19.7389, longitude: 63.4967 },
    });
    expect(beach.image).toHaveLength(4);
    expect(graph.some((n) => n["@type"] === "AggregateRating" || n.aggregateRating)).toBe(false);
    const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((c: { name: string; item: string }) => [c.name, c.item])).toEqual([
      ["Home", SITE_URL],
      ["Island guide", `${SITE_URL}/guide`],
      ["Trou d'Argent", `${SITE_URL}/guide/trou-d-argent`],
    ]);
  });

  it("is a TouristAttraction when it is not a beach", async () => {
    state.content = content([{ ...TROU, category: "viewpoint" }]);
    const graph = nodes(await renderPlace("trou-d-argent"));
    expect(graph.some((n) => n["@type"] === "TouristAttraction")).toBe(true);
    expect(graph.some((n) => n["@type"] === "Beach")).toBe(false);
  });

  it("titles and describes itself from its own name and long read, with a canonical", async () => {
    const { generateMetadata } = await page();
    const meta = await generateMetadata(params("trou-d-argent"));
    expect(meta.title).toBe("Trou d'Argent, Rodrigues | Roule Rodrigues");
    expect(String(meta.title).length).toBeLessThanOrEqual(60);
    expect(meta.description).toMatch(/^Paragraph 1: the path down to the cove/);
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/guide/trou-d-argent`);
    expect(meta.robots).toBeUndefined();
    expect((meta.openGraph?.images as string[]).length).toBeGreaterThan(0);
  });

  it("gives two passing places two different titles", async () => {
    const other: MapLocation = { ...TROU, id: "loc-2", name: "Anse Bouteille", slug: "anse-bouteille" };
    state.content = content([TROU, other]);
    const { generateMetadata } = await page();
    const a = (await generateMetadata(params("trou-d-argent"))).title;
    const b = (await generateMetadata(params("anse-bouteille"))).title;
    expect(a).not.toBe(b);
  });

  it("is prebuilt for passing places only", async () => {
    const { generateStaticParams } = await page();
    expect(await generateStaticParams()).toEqual([{ place: "trou-d-argent" }]);
  });
});

describe("everything else is a real 404", () => {
  const is404 = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

  it("a place that asked but is short in French", async () => {
    const { default: Page, generateMetadata } = await page();
    await expect(Page(params("pointe-coton"))).rejects.toMatchObject(is404);
    expect((await generateMetadata(params("pointe-coton"))).robots).toMatchObject({ index: false });
  });

  it("a place asking for a slug a static guide owns", async () => {
    const { default: Page } = await page();
    await expect(Page(params("beaches"))).rejects.toMatchObject(is404);
  });

  it("a slug no place has, and a slug made up from a name", async () => {
    const { default: Page } = await page();
    await expect(Page(params("port-mathurin"))).rejects.toMatchObject(is404);
    await expect(Page(params("pointe-coton-beach"))).rejects.toMatchObject(is404);
  });

  it("the whole seed content, which is what getContent() serves on a failed read — but that throws, not 404s", async () => {
    // A 404 during an outage would replace a live page in the ISR cache; an
    // error keeps the last good copy and tells a crawler to come back.
    state.content = { ...DEFAULT_CONTENT };
    const { default: Page } = await page();
    const err = await Page(params("trou-d-argent")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { digest?: string }).digest).toBeUndefined();
  });

  it("nothing can stream a 200 before the 404: no loading.tsx in the segment or above it", () => {
    for (const dir of ["app", "app/guide", "app/guide/[place]"]) {
      expect(existsSync(join(process.cwd(), dir, "loading.tsx")), dir).toBe(false);
    }
  });

  it("the fixtures are what they claim: one passes the gate, the others fail it for one reason", () => {
    expect(longReadChars(TROU.longReadFr)).toBeGreaterThan(MIN_LONG_READ_CHARS);
    expect(locationGateRefusals(TROU)).toEqual([]);
    expect(locationGateRefusals(THIN)).toEqual(["short-french"]);
    expect(locationGateRefusals(SHADOWED)).toEqual(["reserved-slug"]);
  });
});

describe("a passing place is reachable and listed", () => {
  it("is in the sitemap; the ones that 404 are not", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = ((await sitemap()) as MetadataRoute.Sitemap).map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/guide/trou-d-argent`);
    expect(urls).not.toContain(`${SITE_URL}/guide/pointe-coton`);
    expect(urls).not.toContain(`${SITE_URL}/guide/beaches-everywhere`);
  });

  it("is a card on the /guide hub, in its ItemList too", async () => {
    const { default: Hub } = await import("@/app/guide/page");
    const html = renderToStaticMarkup((await Hub()) as ReactElement);
    expect(html).toContain('href="/guide/trou-d-argent"');
    expect(html).not.toContain('href="/guide/pointe-coton"');
    const list = nodes(html).find((n) => n["@type"] === "ItemList");
    expect(list.itemListElement.map((e: { url: string }) => e.url)).toContain(`${SITE_URL}/guide/trou-d-argent`);
  });

  it("is linked from its entry on the beaches guide; a section-only place is not", async () => {
    const { default: Beaches } = await import("@/app/guide/beaches/page");
    const html = renderToStaticMarkup((await Beaches()) as ReactElement);
    const entry = (id: string) => {
      const at = html.indexOf(`<article id="${id}"`);
      expect(at, id).toBeGreaterThan(-1);
      return html.slice(at, html.indexOf("</article>", at));
    };
    expect(entry("trou-d-argent")).toContain('href="/guide/trou-d-argent"');
    // Its stored slug is its anchor even without a page; a slug is not a URL
    // until the gate passes.
    expect(entry("pointe-coton")).not.toContain('href="/guide/pointe-coton"');
    expect(entry("pointe-coton")).toContain('href="/map#pointe-coton"');
  });

  it("is where /map's \"Read in the guide\" goes for it", async () => {
    const { default: MapPage } = await import("@/app/map/page");
    const html = renderToStaticMarkup((await MapPage()) as ReactElement);
    const row = (id: string) => {
      const at = html.indexOf(`id="${id}"`);
      expect(at, id).toBeGreaterThan(-1);
      // The row's own class comes first; the NEXT one starts the next row.
      const next = html.indexOf('class="group flex', html.indexOf('class="group flex', at) + 1);
      return html.slice(at, next > at ? next : undefined);
    };
    expect(row("trou-d-argent")).toContain('href="/guide/trou-d-argent"');
    // No page of its own: its entry on the beaches guide.
    expect(row("pointe-coton")).toContain('href="/guide/beaches#pointe-coton"');
  });
});
