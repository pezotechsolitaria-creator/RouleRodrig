import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HowOrdering from "./[slug]/HowOrdering";
import RestaurantsIntro from "./RestaurantsIntro";
import { FOOD_COPY, type KitchenLine } from "@/lib/food/copy.i18n";

// ── THE FOOD PAGES SAY HOW TO ORDER, AND WHERE TO EAT ───────────────────────
//
// SEO audit 2026-09-29:
//   C15  the dish pages (ranking for dish names) told a crawler "closed right
//        now" about a kitchen that only takes orders a day ahead, and never
//        said how to pay;
//   C21  "restaurants in rodrigues" landed on /food, where no heading said
//        "restaurant", and the food guide never said where to eat.
//
// Every test renders the real component or page to markup — what a crawler
// receives — with data shaped like the live Chez Banane rows (read-only
// SELECT, 29 Sep 2026: 24 h notice, cash on collection, no delivery).

const plain = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// ── the dish page's reads ─────────────────────────────────────────────────
const db = vi.hoisted(() => ({
  dish: null as Record<string, unknown> | null,
  options: {
    data: { accepts_cash: true, accepts_bank_transfer: false, offers_pickup: true, offers_rr_delivery: false },
    error: null,
  } as { data: unknown; error: unknown },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (name: string) => {
      if (name !== "store_payment_options") throw new Error(`unexpected rpc: ${name}`);
      return { maybeSingle: async () => db.options };
    },
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { delivery_enabled: true }, error: null }) };
      return q;
    },
  }),
}));
vi.mock("@/lib/food/queries", () => ({ getFoodItem: async () => db.dish }));
vi.mock("@/lib/food/ready-now", () => ({ anyWalkUpServingNow: async () => false }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/components/food/DishOrderPanel", () => ({ default: () => null }));
vi.mock("@/components/food/FoodCartBar", () => ({ default: () => null }));
vi.mock("@/components/food/FoodCard", () => ({ default: () => null }));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/lib/content", () => ({
  getContent: async () => ({ contact: { email: "bookings@roulerodrig.com" } }),
}));

const LOBSTER = {
  id: "d1",
  slug: "grilled-lobster-package",
  name: "Flame-Grilled Lobster Package",
  descriptor: null,
  descriptorFr: null,
  descriptorCr: null,
  price: 250000,
  currency: "MUR",
  imageUrl: null,
  prepMin: null,
  prepMax: null,
  spiceLevel: 0,
  dietary: ["seafood"],
  mealTimes: [],
  isSignature: false,
  serves: null,
  stock: 10,
  variantId: "v1",
  variantCount: 1,
  kitchenId: "k-banane",
  kitchenName: "Chez Banane",
  kitchenOpen: false,
  kitchenHalalCertified: false,
  kitchenHalalCertifier: null,
  categories: [],
  orderable: true,
  reason: null,
  minNoticeHours: 24,
  readyNow: false,
  description: null,
  allergens: null,
  images: [],
  variants: [],
  related: [],
  pickupHint: null,
  kitchenAddress: "Rivière Banane",
  kitchenLat: null,
  kitchenLng: null,
  kitchenSlug: "chez-banane",
  kitchenWhatsapp: null,
  kitchenPhone: null,
};

const CASH_PICKUP = { pickup: true, cash: true, transfer: false, delivery: false };

describe("How ordering works (C15)", () => {
  const render = (props: Parameters<typeof HowOrdering>[0]) =>
    renderToStaticMarkup(createElement(HowOrdering, props));

  it("states the notice, the collection with a code, and cash — from the kitchen's own terms", () => {
    const html = render({ notice: 24, kitchen: "Chez Banane, Rivière Banane", terms: CASH_PICKUP });
    const t = plain(html);
    expect(t).toContain("How ordering works");
    expect(t).toContain("Order at least 24 hours ahead");
    expect(t).toContain("Collect it from Chez Banane, Rivière Banane");
    expect(t).toContain("you get a code to show at the kitchen");
    expect(t).toContain("You pay the kitchen, not the site, in cash when you collect.");
    // Nothing the kitchen does not offer.
    expect(t).not.toMatch(/bank transfer|Delivery/);
  });

  it("links the food guide and its French page", () => {
    const html = render({ notice: 24, kitchen: "Chez Banane", terms: CASH_PICKUP });
    expect(html).toContain('href="/guide/rodriguan-food"');
    expect(html).toMatch(/href="\/fr\/manger-a-rodrigues"[^>]*hrefLang="fr"|hrefLang="fr"[^>]*href="\/fr\/manger-a-rodrigues"/);
  });

  it("says nothing about payment when the kitchen's options could not be read", () => {
    const t = plain(render({ notice: 24, kitchen: "Chez Banane", terms: null }));
    expect(t).toContain("Order at least 24 hours ahead");
    expect(t).not.toMatch(/You pay|Collect it/);
  });

  it("mentions delivery only where the kitchen and the platform both offer it", () => {
    const t = plain(render({ notice: 0, kitchen: "K", terms: { ...CASH_PICKUP, delivery: true } }));
    expect(t).toContain(FOOD_COPY.en.dish.howDelivery);
    expect(t).not.toContain("hours ahead");
  });
});

describe("the dish page (C15)", async () => {
  const { default: DishPage } = await import("./[slug]/page");
  const render = async () =>
    plain(
      renderToStaticMarkup(
        (await DishPage({ params: Promise.resolve({ slug: "grilled-lobster-package" }) })) as ReactElement,
      ),
    );

  it("does not say 'closed right now' about a kitchen that takes notice", async () => {
    db.dish = { ...LOBSTER };
    const t = await render();
    expect(t).toContain("Prepared by Chez Banane");
    expect(t).not.toContain("closed right now");
  });

  it("still says it for a walk-up kitchen that is closed", async () => {
    db.dish = { ...LOBSTER, minNoticeHours: 0 };
    expect(await render()).toContain("closed right now");
  });

  it("server-renders how to order and pay, from store_payment_options()", async () => {
    db.dish = { ...LOBSTER };
    db.options = {
      data: { accepts_cash: true, accepts_bank_transfer: false, offers_pickup: true, offers_rr_delivery: false },
      error: null,
    };
    const t = await render();
    expect(t).toContain("Order at least 24 hours ahead");
    expect(t).toContain("Collect it from Chez Banane, Rivière Banane");
    expect(t).toContain("in cash when you collect");
  });

  it("fails closed — no payment sentence — when that read fails", async () => {
    db.dish = { ...LOBSTER };
    db.options = { data: null, error: { message: "boom" } };
    const t = await render();
    expect(t).toContain("How ordering works");
    expect(t).not.toContain("You pay the kitchen");
  });
});

describe("Restaurants and local food in Rodrigues (C21)", () => {
  const banane: KitchenLine = { name: "Chez Banane", place: "Rivière Banane", dishes: 2, notice: 24, cash: true };

  it("is a heading with the kitchen named from the data, and the concierge under it", () => {
    const html = renderToStaticMarkup(
      createElement(
        RestaurantsIntro,
        { kitchens: [banane] },
        createElement("a", { href: "/food/concierge" }, "Ask the concierge"),
      ),
    );
    expect(html).toMatch(/<h2[^>]*>Restaurants and local food in Rodrigues<\/h2>/);
    const t = plain(html);
    expect(t).toContain(
      "The dishes here are cooked by Chez Banane, Rivière Banane — order at least 24 hours ahead, and you pay the kitchen in cash when you collect.",
    );
    expect(html).toContain('href="/food/concierge"');
  });

  it("claims no notice and no cash the data does not state", () => {
    const t = plain(
      renderToStaticMarkup(
        createElement(RestaurantsIntro, { kitchens: [{ ...banane, notice: 0, cash: false, place: null }] }),
      ),
    );
    expect(t).toContain("The dishes here are cooked by Chez Banane.");
  });

  it("names nobody when there is no kitchen, and keeps the heading", () => {
    const t = plain(renderToStaticMarkup(createElement(RestaurantsIntro, { kitchens: [] })));
    expect(t.trim()).toBe("Restaurants and local food in Rodrigues");
  });

  it("has the heading in French and Kreol too", () => {
    expect(FOOD_COPY.fr.restaurants.title).toBe("Restaurants et cuisine locale à Rodrigues");
    expect(FOOD_COPY.cr.restaurants.one(banane)).toContain("Chez Banane");
  });
});

describe("the food guide says where to eat it (C21)", async () => {
  const { default: Guide } = await import("@/app/guide/rodriguan-food/page");
  const html = renderToStaticMarkup((await Guide()) as ReactElement);

  it("has a 'Where to eat it' heading linking /food and the concierge", () => {
    expect(html).toMatch(/<h2[^>]*>\s*Where to eat it\s*<\/h2>/);
    const section = html.slice(html.indexOf("Where to eat it"));
    const next = section.indexOf("<h2", 10);
    const body = next > 0 ? section.slice(0, next) : section;
    expect(body).toContain('href="/food"');
    expect(body).toContain('href="/food/concierge"');
    expect(plain(body)).toContain("restaurant");
  });
});
