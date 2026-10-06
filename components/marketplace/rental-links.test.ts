import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type FleetItem, type SiteContent } from "@/lib/defaults";
import { categoryName, fromPerDay, rentalQuestion, RENTAL_COPY } from "./rentals-copy";

// ── THE RENTALS AND /deliver, REACHABLE FROM THE HUBS PEOPLE ACTUALLY USE ───
//
// Architecture review 2026-09-30, items 3 and 4. /shop (the URL the site calls
// "Marketplace"), /more, /order and /explore linked no rental page, and /more
// and /order did not link /deliver. Each page is rendered for real here, with
// the database, the content row and unrelated chrome replaced, and the output
// is read: where the links go, which figures they print, which categories they
// leave out, and — on /shop — that the product markup still lists products
// only.

type Result = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  content: null as unknown,
  contentFails: false,
  home: null as unknown,
  products: [] as unknown[],
}));

vi.mock("@/lib/content", () => ({
  getContent: async () => {
    if (db.contentFails) throw new Error("site_content read failed");
    return db.content;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async (): Promise<Result> => ({
      data: { monetization_model: "commission", default_commission_rate: 0.1 },
      error: null,
    });
    return { from: () => q, rpc: async () => ({ data: [], error: null }) };
  },
}));
vi.mock("@/lib/marketplace/catalog", () => ({
  getMarketplaceHome: async () => db.home,
  browseProducts: async () => ({
    total: db.products.length,
    limit: 48,
    offset: 0,
    deliveryFeeFrom: null,
    priceMin: null,
    priceMax: null,
    categories: [],
    sellers: [],
    products: db.products,
  }),
  productsByIds: async () => [],
}));
// Chrome with router, analytics or storage hooks; none of it is under test.
vi.mock("@/components/shop/MarketHeader", () => ({ default: () => null }));
vi.mock("@/components/shop/CategoryStrip", () => ({ default: () => null }));
vi.mock("@/components/shop/HomeAnalytics", () => ({ default: () => null }));
vi.mock("@/components/shop/MarketProductCard", () => ({
  default: ({ product }: { product: { slug: string } }) =>
    createElement("div", { "data-product": product.slug }),
}));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/TourismOffice", () => ({ default: () => null }));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/app/order/OrderHubBaskets", () => ({ default: () => null }));
vi.mock("@/components/ExploreClient", () => ({ default: () => null }));

const base = DEFAULT_CONTENT.fleet[0];
const veh = (over: Partial<FleetItem>): FleetItem => ({ ...base, units: 1, ...over }) as FleetItem;

function liveContent(carsOn = true): SiteContent {
  return {
    ...DEFAULT_CONTENT,
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true },
      { id: "car", label: "Cars", enabled: carsOn },
    ],
    fleet: [
      veh({ id: "avenis", name: "Suzuki Avenis", price: "Rs 699", category: "scooter" }),
      veh({ id: "swift", name: "Suzuki Swift", price: "Rs 1899", category: "car" }),
    ],
  };
}

const product = (slug: string) => ({
  id: slug,
  slug,
  storeSlug: "miel",
  name: `Product ${slug}`,
  offersRrDelivery: false,
});

beforeEach(() => {
  db.content = liveContent();
  db.contentFails = false;
  db.home = {
    productCount: 0,
    storeCount: 0,
    sellingStoreCount: 0,
    openStoreCount: 0,
    deliveryFeeFrom: null,
    categories: [],
    sellers: [],
    bestsellerIds: [],
  };
  db.products = [];
});

async function page(path: string): Promise<string> {
  const mod = (await import(path)) as { default: () => Promise<ReactElement> | ReactElement };
  return renderToStaticMarkup(await mod.default());
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

describe("/shop says where the rentals are", () => {
  it("links each live rental category with its own figure, and the Rentals branch", async () => {
    const html = await page("@/app/shop/page");
    expect(hrefs(html)).toEqual(
      expect.arrayContaining(["/browse/scooter", "/browse/car", "/marketplace#rentals"]),
    );
    expect(html).toContain("Renting a scooter or a car?");
    expect(html).toContain("From Rs 799/day");
    expect(html).toContain("From Rs 1,899/day");
  });

  it("names only what can be rented: cars off, the question and the link go", async () => {
    db.content = liveContent(false);
    const html = await page("@/app/shop/page");
    expect(html).toContain("Renting a scooter?");
    expect(hrefs(html)).not.toContain("/browse/car");
  });

  it("sits after the shelf, and the product ItemList lists products only", async () => {
    db.home = { ...(db.home as object), productCount: 2 };
    db.products = [product("honey-jar"), product("piment")];
    const html = await page("@/app/shop/page");
    expect(html.indexOf("/browse/scooter")).toBeGreaterThan(html.lastIndexOf("data-product"));

    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(ld).not.toBeNull();
    const text = ld![1];
    expect(text).toContain("/shop/miel/honey-jar");
    expect(text).not.toMatch(/browse|marketplace#rentals|Scooters|Cars/);
  });

  it("drops the card, never the shelf, when the content read fails", async () => {
    db.contentFails = true;
    const html = await page("@/app/shop/page");
    expect(hrefs(html).some((x) => x.startsWith("/browse/"))).toBe(false);
    expect(html).toContain("/merchant/login");
  });
});

describe("/more links the rentals and /deliver", () => {
  it("has a row per live rental category, after Marketplace, and one for /deliver", async () => {
    const html = await page("@/app/more/page");
    const h = hrefs(html);
    expect(h).toEqual(expect.arrayContaining(["/browse/scooter", "/browse/car", "/deliver"]));
    expect(h.indexOf("/marketplace")).toBeLessThan(h.indexOf("/browse/scooter"));
    expect(html).toContain("Scooters for rent");
    expect(html).toContain("From Rs 799 a day");
    expect(html).toContain("From Rs 1,899 a day");
  });

  it("drops a category the owner switches off", async () => {
    db.content = liveContent(false);
    expect(hrefs(await page("@/app/more/page"))).not.toContain("/browse/car");
  });

  // Architecture review 2026-09-30, item 5. The /guide and /fr rows typed a
  // count ("all eight", "Onze") that their hubs no longer back: /fr lists
  // twelve, and /guide drops the shops guide or gains place pages live. The
  // rendered row text, not the source, is what a visitor reads.
  it("puts no count on the two guide-hub rows", async () => {
    const html = await page("@/app/more/page");
    const NUMBER =
      /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|deux|trois|quatre|cinq|sept|huit|neuf|dix|onze|douze)\b/i;
    for (const href of ["/guide", "/fr"]) {
      const rows = [...html.matchAll(new RegExp(`<a[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`, "g"))];
      expect(rows.length, href).toBeGreaterThan(0);
      for (const r of rows) expect(r[1].replace(/<[^>]+>/g, " "), href).not.toMatch(NUMBER);
    }
  });
});

describe("/order links the rentals and /deliver", () => {
  it("offers both below the three doors, in /deliver's own words", async () => {
    const html = await page("@/app/order/page");
    const h = hrefs(html);
    expect(h).toEqual(expect.arrayContaining(["/marketplace#rentals", "/deliver"]));
    expect(h.indexOf("/events")).toBeLessThan(h.indexOf("/marketplace#rentals"));
    expect(html).toContain("Drivers send their price — you choose.");
    expect(html).not.toMatch(/driver is (on the way|coming)/i);
  });

  it("names no category and no price of its own: the Rentals branch prints those", async () => {
    // /order reads no content, so anything it said about cars or a figure
    // would be typed — the drift lib/site-data.ts centralised the price to end.
    db.contentFails = true;
    const html = await page("@/app/order/page");
    expect(html).not.toMatch(/Rs \d|scooter|\bcars?\b/i);
    expect(hrefs(html)).toContain("/marketplace#rentals");
  });
});

describe("/explore links the rentals and /deliver", () => {
  it("adds them after the listing, outside the things-to-do ItemList", async () => {
    const html = await page("@/app/explore/page");
    expect(hrefs(html)).toEqual(
      expect.arrayContaining(["/browse/scooter", "/browse/car", "/deliver"]),
    );
    expect(html).toContain("Rentals and deliveries");
    expect(html).toContain("From Rs 799/day");
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    expect(ld).not.toMatch(/Scooters|browse\/scooter|deliver/);
  });
});

describe("the words, in the three languages", () => {
  it("asks only about what is for rent", () => {
    expect(rentalQuestion(["scooter", "car"], "fr")).toBe("Louer un scooter ou une voiture ?");
    expect(rentalQuestion(["car"], "cr")).toBe("Ou anvi loue enn loto?");
    expect(rentalQuestion(["scooter", "kayak"], "en")).toBe("Looking for a rental?");
  });

  it("groups the figure the way each language writes it", () => {
    expect(fromPerDay(1899, "en")).toBe("From Rs 1,899/day");
    expect(fromPerDay(1899, "fr")).toBe(`À partir de Rs ${(1899).toLocaleString("fr-FR")}/jour`);
    expect(fromPerDay(1899, "cr")).toBe("Apartir Rs 1,899 par zour");
  });

  it("translates the two category names the site already translates, and keeps the owner's otherwise", () => {
    expect(categoryName({ id: "car", label: "Cars" }, "fr")).toBe("Voitures");
    expect(categoryName({ id: "scooter", label: "Scooters" }, "cr")).toBe("Skooter");
    expect(categoryName({ id: "kayak", label: "Kayaks" }, "cr")).toBe("Kayaks");
  });

  it("has every string in every language", () => {
    const keys = Object.keys(RENTAL_COPY.en).sort();
    for (const lang of ["fr", "cr"] as const) {
      expect(Object.keys(RENTAL_COPY[lang]).sort()).toEqual(keys);
      for (const k of keys) expect(RENTAL_COPY[lang][k as keyof typeof RENTAL_COPY.en].trim()).not.toBe("");
    }
  });
});
