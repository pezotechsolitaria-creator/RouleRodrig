import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HowOrdering from "./[slug]/HowOrdering";

// ── "HOW ORDERING WORKS", ONLY WHEN IT SAYS SOMETHING, AND AFTER THE PANEL ──
//
// SEO audit 2026-09-29 C15, three review findings on the card it added:
//   1. a walk-up dish whose kitchen options could not be read rendered the
//      heading over an empty list;
//   2. the French-page link's label is French on the English page and carried
//      no lang, so a screen reader read it with English rules;
//   3. on a phone the card sat between the dish and "Add to order".
// Each renders the real component or the real dish page.

const lang = vi.hoisted(() => ({ current: "en" as "en" | "fr" | "cr" }));
vi.mock("@/context/LanguageContext", async (orig) => {
  const actual = await orig<typeof import("@/context/LanguageContext")>();
  return { ...actual, useLanguage: () => ({ ...actual.useLanguage(), language: lang.current }) };
});

const db = vi.hoisted(() => ({
  dish: null as Record<string, unknown> | null,
  options: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: () => ({ maybeSingle: async () => db.options }),
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
// A marker where the order panel renders, so its place in the markup shows.
vi.mock("@/components/food/DishOrderPanel", async () => {
  const { createElement: h } = await import("react");
  return { default: () => h("div", { id: "order-panel" }) };
});
vi.mock("@/components/food/FoodCartBar", () => ({ default: () => null }));
vi.mock("@/components/food/FoodCard", () => ({ default: () => null }));

beforeEach(() => {
  lang.current = "en";
});

const render = (props: Parameters<typeof HowOrdering>[0]) =>
  renderToStaticMarkup(createElement(HowOrdering, props));

const NOTHING = { pickup: false, cash: false, transfer: false, delivery: false };

describe("an empty card is no card", () => {
  it("renders nothing for a walk-up kitchen whose options could not be read", () => {
    expect(render({ notice: 0, kitchen: "K", terms: null })).toBe("");
  });

  it("renders nothing when the kitchen's options offer nothing the card can say", () => {
    expect(render({ notice: 0, kitchen: "K", terms: NOTHING })).toBe("");
    // Cash alone says "when you collect", so without collection it is no line.
    expect(render({ notice: 0, kitchen: "K", terms: { ...NOTHING, cash: true } })).toBe("");
  });

  it("still renders when any one line is true", () => {
    expect(render({ notice: 24, kitchen: "K", terms: null })).toContain("How ordering works");
    expect(render({ notice: 0, kitchen: "K", terms: { ...NOTHING, transfer: true } })).toContain(
      "by bank transfer",
    );
    expect(render({ notice: 0, kitchen: "K", terms: { ...NOTHING, delivery: true } })).toContain(
      "How ordering works",
    );
  });
});

describe("the French page link says its label's language", () => {
  const frLink = (html: string) => html.match(/<a[^>]*href="\/fr\/manger-a-rodrigues"[^>]*>/)?.[0] ?? "";
  const props = { notice: 24, kitchen: "Chez Banane", terms: null };

  it("is lang=fr on the English page, whose label is French", () => {
    const a = frLink(render(props));
    expect(a).toContain('hrefLang="fr"');
    expect(a).toContain('lang="fr"');
  });

  it("is lang=fr in French, and carries none under the Kreol label", () => {
    lang.current = "fr";
    expect(frLink(render(props))).toContain('lang="fr"');
    lang.current = "cr";
    expect(frLink(render(props))).not.toMatch(/\blang="/);
  });
});

describe("on the dish page", () => {
  const LOBSTER = {
    id: "d1",
    slug: "grilled-lobster-package",
    name: "Flame-Grilled Lobster Package",
    descriptor: null,
    price: 250000,
    currency: "MUR",
    imageUrl: null,
    prepMin: null,
    prepMax: null,
    spiceLevel: 0,
    dietary: [],
    serves: null,
    variantCount: 1,
    kitchenId: "k-banane",
    kitchenName: "Chez Banane",
    kitchenOpen: false,
    kitchenHalalCertified: false,
    kitchenHalalCertifier: null,
    orderable: true,
    minNoticeHours: 24,
    description: null,
    allergens: null,
    images: [],
    related: [],
    pickupHint: null,
    kitchenAddress: "Rivière Banane",
    kitchenLat: null,
    kitchenLng: null,
    kitchenWhatsapp: null,
  };
  const page = async () => {
    const { default: DishPage } = await import("./[slug]/page");
    return renderToStaticMarkup(
      (await DishPage({ params: Promise.resolve({ slug: LOBSTER.slug }) })) as ReactElement,
    );
  };

  it("puts the order panel before the how-to card, so a phone reaches 'Add to order' first", async () => {
    db.dish = { ...LOBSTER };
    db.options = {
      data: { accepts_cash: true, accepts_bank_transfer: false, offers_pickup: true, offers_rr_delivery: false },
      error: null,
    };
    const html = await page();
    const panel = html.indexOf('id="order-panel"');
    const how = html.indexOf("How ordering works");
    expect(panel).toBeGreaterThan(-1);
    expect(how).toBeGreaterThan(panel);
    // …and on desktop the card is placed back under the dish, beside the
    // sticky panel that spans both rows.
    expect(html).toMatch(/class="[^"]*lg:col-start-1 lg:row-start-2[^"]*"[^>]*><section/);
    expect(html).toMatch(/class="[^"]*lg:row-span-2[^"]*"><div class="lg:sticky/);
  });

  it("has no how-to card for a walk-up dish when the kitchen's options could not be read", async () => {
    db.dish = { ...LOBSTER, minNoticeHours: 0 };
    db.options = { data: null, error: { message: "boom" } };
    const html = await page();
    expect(html).not.toContain("How ordering works");
    expect(html).toContain('id="order-panel"');
  });
});
