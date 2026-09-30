import { describe, it, expect, vi } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type RecommendedPlace } from "@/lib/defaults";
import { placeHref } from "@/lib/place-href";
import { ileAuxCocosBooking } from "./ile-aux-cocos-listing";

// ── THE ÎLE AUX COCOS GUIDES QUOTE THE LISTING (SEO audit 2026-09-29 C1, C12) ─
//
// Both guides said "Rs 2,000 per person" while the listing — the thing a
// customer books — said "Rs 1999/Person", and both "See the excursion" buttons
// opened the /browse/tours shelf instead of the excursion's own priced page.
// These render both guide pages against a listing shaped like the live row
// (read-only SELECT, 29 Sep 2026) and against no listing at all.

const COCOS = {
  id: "rec-cocos",
  category: "activity",
  name: "Île aux Cocos Excursion with Les Inséparables",
  description: "🏝️ Excursion à l'Île aux Coco – 1 999 Rs par personne",
  image: "/x.jpg",
  priceNote: "Rs 1999/Person ",
  bookable: true,
} as RecommendedPlace;

const OTHER = {
  id: "rec-balade",
  category: "activity",
  name: "Balade en mer",
  description: "",
  image: "/y.jpg",
  priceNote: "Rs 700 per person",
} as RecommendedPlace;

const state = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => ({
    ...DEFAULT_CONTENT,
    recommended: { ...DEFAULT_CONTENT.recommended, items: state.items },
  }),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));

const plain = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("finding the listing", () => {
  it("resolves Les Inséparables by the guide it belongs to, with its own price and page", () => {
    const b = ileAuxCocosBooking([OTHER, COCOS]);
    expect(b.name).toBe("Île aux Cocos Excursion with Les Inséparables");
    expect(b.price).toBe(1999);
    expect(b.perPerson).toBe(true);
    expect(b.href).toBe(placeHref(COCOS));
    expect(b.href).not.toBe("/browse/tours");
  });

  it("states no price and keeps the old shelf when the listing is gone", () => {
    expect(ileAuxCocosBooking([OTHER])).toEqual({
      name: null,
      href: "/browse/tours",
      price: null,
      perPerson: false,
    });
  });
});

describe("the English guide", () => {
  const render = async () => {
    const { default: Page } = await import("@/app/guide/ile-aux-cocos/page");
    return renderToStaticMarkup((await Page()) as ReactElement);
  };

  it("prints the listing's price and sends the button to the excursion's page", async () => {
    state.items = [OTHER, COCOS];
    const html = await render();
    const t = plain(html);
    expect(t).toContain(
      "The trip listed on Roule Rodrigues, Île aux Cocos Excursion with Les Inséparables, is Rs 1,999 per person.",
    );
    expect(t).not.toContain("2,000");
    expect(html).toContain(`href="${placeHref(COCOS)}"`);
    expect(html).not.toContain('href="/browse/tours"');
  });

  it("puts the same answer in the FAQPage it publishes", async () => {
    state.items = [COCOS];
    const html = await render();
    expect(html).toContain("is Rs 1,999 per person.");
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .join("");
    expect(ld).toContain("Rs 1,999 per person");
  });

  it("says no figure at all without a listing", async () => {
    state.items = [OTHER];
    const t = plain(await render());
    expect(t).not.toMatch(/Rs\s?[\d,]{3,}/);
    expect(t).toContain("Operators price it themselves");
  });
});

describe("the French guide", () => {
  const render = async () => {
    const { default: Page } = await import("@/app/fr/ile-aux-cocos/page");
    return renderToStaticMarkup((await Page()) as ReactElement);
  };

  it("prints the listing's price, French-formatted, and links the excursion", async () => {
    state.items = [COCOS];
    const html = await render();
    const t = plain(html);
    expect(t).toMatch(/à Rs 1\s999 par personne/u);
    expect(t).not.toMatch(/2\s000/u);
    expect(html).toContain(`href="${placeHref(COCOS)}"`);
  });

  it("keeps the description main shipped", async () => {
    const { metadata } = await import("@/app/fr/ile-aux-cocos/page");
    expect(metadata.description).toBe(
      "Excursion à l'île aux Cocos : réserve de noddis et de sternes à 4 km à l'ouest de Rodrigues. Départ de Pointe du Diable, accès sur autorisation.",
    );
  });
});
