import { describe, it, expect, vi, beforeEach } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type FleetItem, type RecommendedPlace, type SiteContent } from "@/lib/defaults";

// ── /marketplace IS THE ROOT OF THE TREE, AND NO DOOR OPENS ON NOTHING ──────
//
// Architecture review 2026-09-30, items 1 and 2. These render the real page —
// the real gates, the real rentals rail, the real JSON-LD — with only the
// database and the content row replaced, and read what a visitor would get:
// which sections are drawn, where every door leads, which figures are printed,
// and that the structured data lists exactly the rental links on screen and
// claims no Product, Offer or rating the rental pages do not own.

type Result = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  rpc: {} as Record<string, Result>,
  tables: {} as Record<string, Result>,
  content: null as unknown,
}));

function fakeClient() {
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
    q.then = (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(db.tables[table] ?? { data: [], error: null }).then(ok, bad);
    return q;
  };
  return {
    from: builder,
    rpc: async (name: string) => db.rpc[name] ?? { data: null, error: { message: `no ${name}` } },
  };
}

vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => fakeClient() }));
vi.mock("@/lib/content", () => ({ getContent: async () => db.content }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));

const base = DEFAULT_CONTENT.fleet[0];
const veh = (over: Partial<FleetItem>): FleetItem => ({ ...base, units: 1, ...over }) as FleetItem;
const place = (over: Partial<RecommendedPlace>): RecommendedPlace =>
  ({ id: "p", category: "activity", name: "x", description: "", image: "/x.jpg", ...over }) as RecommendedPlace;

function liveContent(): SiteContent {
  return {
    ...DEFAULT_CONTENT,
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true },
      { id: "car", label: "Cars", enabled: true },
      { id: "kayak", label: "Kayaks", enabled: false },
    ],
    fleet: [
      veh({ id: "avenis", name: "Suzuki Avenis", price: "Rs 699", category: "scooter" }),
      veh({ id: "avenis-2", name: "Suzuki Avenis", price: "Rs 749", category: "scooter" }),
      veh({ id: "swift", name: "Suzuki Swift", price: "Rs 1899", category: "car" }),
      veh({ id: "veh-1", name: "NEW CARS", price: "", category: "car" }),
      veh({ id: "k1", name: "Kayak", price: "Rs 500", category: "kayak" }),
    ],
    recommended: {
      ...DEFAULT_CONTENT.recommended,
      enabled: true,
      items: [
        place({ id: "m1", name: "Island massage", serviceType: "massage" }),
        place({ id: "b1", name: "Lagoon & islets", serviceType: "boat" }),
      ],
    },
    foodConcierge: { ...DEFAULT_CONTENT.foodConcierge, enabled: true },
  };
}

const HOME = {
  productCount: 9,
  storeCount: 3,
  sellingStoreCount: 3,
  openStoreCount: 2,
  deliveryFeeFrom: null,
  categories: [
    { slug: "vehicle-care", name: "Vehicle Care", icon: null, count: 2 },
    { slug: "professional-services", name: "Professional Services", icon: null, count: 2 },
    { slug: "celebrations", name: "Celebrations", icon: null, count: 1 },
    { slug: "honey", name: "Honey", icon: null, count: 4 },
    { slug: "souvenirs", name: "Souvenirs", icon: null, count: 0 },
  ],
  sellers: [],
  bestsellerIds: [],
};

const WASH_LISTED = {
  trade_providers: {
    data: [{ store_id: "s1", trade: "Car wash and valeting", mobile: true, takes_online_bookings: true }],
    error: null,
  },
  marketplace_stores: {
    data: [{ id: "s1", name: "Shine", slug: "shine", tagline: null, address: null, phone: null, logo_url: null }],
    error: null,
  },
};

beforeEach(() => {
  db.content = liveContent();
  db.rpc = {
    sitemap_stores: { data: [], error: null },
    marketplace_home: { data: HOME, error: null },
  };
  db.tables = { ...WASH_LISTED };
});

async function render(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderToStaticMarkup((await Page()) as ReactElement);
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const ids = (html: string) => [...html.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);

function jsonLd(html: string): { "@graph": Record<string, unknown>[] } {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(m, "the page carries JSON-LD").not.toBeNull();
  return JSON.parse(m![1]);
}

describe("the tree, everything stocked", () => {
  it("draws the five branches in order, each with a jump link", async () => {
    const html = await render();
    expect(ids(html)).toEqual(["products", "services", "rentals", "essentials", "requests"]);
    for (const id of ids(html)) expect(hrefs(html)).toContain(`#${id}`);
  });

  it("points every door at a page that already exists", async () => {
    const h = hrefs(await render());
    for (const href of [
      "/shop",
      "/shop/c/celebrations",
      "/shop/c/honey",
      "/shop/c/vehicle-care",
      "/shop/c/professional-services",
      "/experiences/massage",
      "/marketplace/wash",
      "/browse/scooter",
      "/browse/car",
      "/browse/scooter/suzuki-avenis",
      "/browse/car/suzuki-swift",
      "/experiences/boat",
      "/esim",
      "/transfers",
      "/map",
      "/emergency",
      "/deliver",
      "/food/concierge",
      "/list-your-scooter",
    ]) {
      expect(h, href).toContain(href);
    }
  });

  it("never opens a door on an empty or switched-off room", async () => {
    const h = hrefs(await render());
    // No hiking guide, no fishing trip listed; kayaks off; souvenirs empty;
    // the unpriced template car is a draft.
    for (const href of [
      "/experiences/hiking",
      "/experiences/fishing",
      "/browse/kayak",
      "/shop/c/souvenirs",
      "/browse/car/new-cars",
    ]) {
      expect(h, href).not.toContain(href);
    }
  });

  it("prints the fleet's own figures, and no other", async () => {
    const html = await render();
    expect(html).toContain("From Rs 699/day");
    expect(html).toContain("From Rs 1,899/day");
    expect(html).toContain("Rs 699/day");
    // Every rupee figure on the page is one of the fleet's.
    const figures = [...html.matchAll(/Rs ([\d,]+)/g)].map((m) => m[1]);
    expect(new Set(figures)).toEqual(new Set(["699", "1,899"]));
  });

  it("names boats for what they are: a skipper's trip, not a rental", async () => {
    const html = await render();
    expect(html).toMatch(/On the water, with a skipper:/);
    expect(html).toContain("boat trips");
  });

  it("lists in JSON-LD exactly the rental links on screen, and claims no offer", async () => {
    const html = await render();
    const graph = jsonLd(html)["@graph"];
    const types = graph.map((n) => n["@type"]);
    expect(types).toEqual(["BreadcrumbList", "ItemList"]);
    const list = graph[1] as { itemListElement: { url: string }[] };
    const urls = list.itemListElement.map((i) => i.url.replace(/^https?:\/\/[^/]+/, ""));
    expect(urls).toEqual([
      "/browse/scooter",
      "/browse/car",
      "/browse/scooter/suzuki-avenis",
      "/browse/car/suzuki-swift",
    ]);
    for (const u of urls) expect(hrefs(html)).toContain(u);
    expect(JSON.stringify(graph)).not.toMatch(/"(Product|Offer|AggregateOffer|AggregateRating|SearchAction)"/);
  });
});

describe("empty rooms close their doors", () => {
  it("drops Products entirely while /shop would show its launch state", async () => {
    db.rpc.marketplace_home = {
      data: { ...HOME, productCount: 0, categories: [] },
      error: null,
    };
    const html = await render();
    expect(ids(html)).not.toContain("products");
    expect(hrefs(html)).not.toContain("/shop");
    expect(hrefs(html)).not.toContain("#products");
    // The shelf doors went with their shelves; massage still has a provider.
    expect(hrefs(html)).not.toContain("/shop/c/vehicle-care");
    expect(hrefs(html)).toContain("/experiences/massage");
  });

  it("drops the car-wash businesses line while that page lists nobody", async () => {
    db.tables = { trade_providers: { data: [], error: null } };
    expect(hrefs(await render())).not.toContain("/marketplace/wash");
  });

  it("drops the food concierge while the owner has it switched off", async () => {
    const c = liveContent();
    c.foodConcierge = { ...c.foodConcierge, enabled: false };
    db.content = c;
    expect(hrefs(await render())).not.toContain("/food/concierge");
  });

  it("draws no Rentals section, and no jump to one, when nothing can be rented", async () => {
    const c = liveContent();
    c.vehicleCategories = c.vehicleCategories.map((v) => ({ ...v, enabled: false }));
    db.content = c;
    const html = await render();
    expect(ids(html)).not.toContain("rentals");
    expect(hrefs(html)).not.toContain("#rentals");
    expect(html).not.toContain("ItemList");
  });
});

describe("a failed read keeps the doors — unknown is not empty", () => {
  it("keeps the shop and shelf doors and the wash line when every read fails", async () => {
    db.rpc = {};
    db.tables = { trade_providers: { data: null, error: { message: "timeout" } } };
    const h = hrefs(await render());
    for (const href of ["/shop", "/shop/c/vehicle-care", "/shop/c/professional-services", "/marketplace/wash"]) {
      expect(h, href).toContain(href);
    }
  });
});

describe("/rentals lands on something (middleware GUESSED)", () => {
  it("the #rentals anchor it points at is on the page", async () => {
    expect(await render()).toMatch(/<section[^>]*\bid="rentals"/);
  });
});
