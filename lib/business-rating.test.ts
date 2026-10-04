import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";
import { fakeDb, type FakeDb } from "@/test/fake-supabase-tables";
import { shownRating } from "./business-rating";

// ── THE HOMEPAGE'S #business NODE (architecture review 2026-09-30, item 5 and
// its fix-up) ────────────────────────────────────────────────────────────────
//
// Rendered, with only the database and the chrome faked:
//   · the REAL getFleetView, so the marquee's real `.limit(12)` and its real
//     text-and-name filter decide which reviews the page gets;
//   · the REAL ReviewsContact, so "what the page shows" is what it prints.
// The aggregateRating must state exactly the average and count a visitor can
// read there — never the whole table's, which the page does not show.
//
// Plus the OfferCatalog entry that names the interactive map links /map.

const fx = vi.hoisted(() => ({ db: null as unknown as FakeDb, readFails: false }));

/** getFleetView's booking reads: answered empty, whatever the filter. */
function inert() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "in", "lte", "gte", "neq", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => {
    if (fx.readFails) throw new Error("no service role");
    return {
      from: (table: string) => (table === "product_reviews" ? fx.db.client.from(table) : inert()),
    };
  },
  hasServiceRole: () => true,
}));
vi.mock("@/lib/content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content")>()),
  getContent: async () => DEFAULT_CONTENT,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/food/queries", () => ({ foodCardImages: async () => [] }));
vi.mock("@/lib/events/queries", () => ({ listPublicEvents: async () => [] }));
// The app shell renders only the reviews slot it is handed: that slot is the
// real ReviewsContact, built by the page from the same `reviews`.
vi.mock("@/components/AppHome", () => ({
  default: (p: { reviews?: ReactNode }) => createElement("div", { id: "reviews" }, p.reviews),
}));
for (const m of ["@/components/Hero", "@/components/Footer", "@/components/Sponsors"]) {
  vi.doMock(m, () => ({ default: () => null }));
}

type Review = { id: string; name: string; rating: number; text: string; status: string; created_at: string };
const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`;
const r = (id: string, rating: number, day: number, o: Partial<Review> = {}): Review => ({
  id,
  name: `Guest ${id}`,
  rating,
  text: "Delivered on time, and the bike was spotless.",
  status: "approved",
  created_at: at(day),
  ...o,
});

// Sixteen rows, newest first:
//   · one PENDING 1-star (never counted);
//   · the twelve newest approved — nine 5s, two 3s, and one 1 with no name,
//     which the marquee drops (it cannot print a card without one);
//   · three older approved 1-stars, past the marquee's cap of twelve.
// The page therefore lists 11 reviews averaging 51 / 11 = 4.6. The whole
// approved set (55 / 15 = 3.7) is a rating no visitor can find on it.
function seed() {
  return [
    r("pending", 1, 28, { status: "pending" }),
    ...Array.from({ length: 9 }, (_, i) => r(`five${i}`, 5, 27 - i)),
    r("three0", 3, 18),
    r("three1", 3, 17),
    r("nameless", 1, 16, { name: "" }),
    r("old0", 1, 3),
    r("old1", 1, 2),
    r("old2", 1, 1),
  ];
}

beforeEach(() => {
  fx.db = fakeDb({ product_reviews: seed() });
  fx.readFails = false;
});

type Node = Record<string, unknown>;
async function home() {
  const { default: Home } = await import("@/app/page");
  const html = renderToStaticMarkup((await Home()) as ReactElement);
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)!;
  const graph = (JSON.parse(m[1]) as { "@graph": Node[] })["@graph"];
  const business = graph.find((n) => n["@type"] === "AutoRental")!;
  // What the reviews section prints: the pill ("4.6" then "/5") and one card
  // per review it lists.
  const pill = html.match(/<b[^>]*>(\d\.\d)<\/b>\s*<span[^>]*>\/5<\/span>/)?.[1] ?? null;
  const cards = (html.match(/data-rcard/g) ?? []).length;
  return { business, pill, cards };
}

describe("the business rating", () => {
  it("states exactly the average and the count the page shows", async () => {
    const { business, pill, cards } = await home();
    const rating = business.aggregateRating as Node;
    // The page itself, first: eleven cards, 4.6.
    expect(cards).toBe(11);
    expect(pill).toBe("4.6");
    // And the markup says the same — not 15 reviews, not 3.7.
    expect(rating.reviewCount).toBe(cards);
    expect((rating.ratingValue as number).toFixed(1)).toBe(pill);
    expect(rating).toMatchObject({ ratingValue: 4.6, reviewCount: 11, bestRating: 5, worstRating: 1 });
  });

  it("still agrees when every approved review fits on the page", async () => {
    fx.db = fakeDb({ product_reviews: [r("a", 5, 3), r("b", 4, 2), r("c", 4, 1)] });
    const { business, pill, cards } = await home();
    const rating = business.aggregateRating as Node;
    expect([cards, pill]).toEqual([3, "4.3"]);
    expect(rating).toMatchObject({ ratingValue: 4.3, reviewCount: 3 });
  });

  it("publishes no rating when the read fails, and the page shows none either", async () => {
    fx.readFails = true;
    const { business, pill, cards } = await home();
    expect(business.aggregateRating).toBeUndefined();
    expect([pill, cards]).toEqual([null, 0]);
  });

  it("publishes none when there is no approved review", async () => {
    fx.db = fakeDb({ product_reviews: [r("p", 5, 1, { status: "pending" })] });
    const { business, pill } = await home();
    expect(business.aggregateRating).toBeUndefined();
    expect(pill).toBeNull();
  });

  it("rounds the way the pill prints, so 4.35 is 4.3 in both", () => {
    // 7 × 5 + 13 × 4 = 87 over 20 = 4.35. (4.35).toFixed(1) is "4.3";
    // Math.round(43.5) / 10 would have published 4.4 beside it.
    const twenty = [...Array(7).fill({ rating: 5 }), ...Array(13).fill({ rating: 4 })];
    expect(shownRating(twenty)).toEqual({ ratingValue: 4.3, reviewCount: 20 });
    expect(shownRating([])).toBeNull();
  });
});

describe("the free tools in the OfferCatalog", () => {
  it("send the interactive map to /map", async () => {
    const catalog = (await home()).business.hasOfferCatalog as { itemListElement: Node[] };
    const services = catalog.itemListElement.map((o) => o.itemOffered as { name: string; url: string });
    const map = services.find((s) => /interactive island map/i.test(s.name));
    expect(map?.url).toBe(`${SITE_URL}/map`);
  });
});
