import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";

// ── "WHERE TO GO" SPEAKS THE PAGE'S LANGUAGE (architecture review 2026-09-30,
// item 1 fix-up) ─────────────────────────────────────────────────────────────
//
// The block was English-only server text under notes that switch to French
// with the visitor, so /browse/stays in French ended on "Where to go" and "The
// beaches of Rodrigues". Rendered from the real category page with the
// visitor's language set the way the client sets it (useLanguage); the server
// HTML a crawler reads is the "en" render, pinned in commercial-links.test.ts.

const fx = vi.hoisted(() => ({ view: null as unknown, lang: "en" as "en" | "fr" | "cr" }));

vi.mock("@/context/LanguageContext", async (orig) => {
  const actual = await orig<typeof import("@/context/LanguageContext")>();
  return { ...actual, useLanguage: () => ({ ...actual.useLanguage(), language: fx.lang }) };
});
vi.mock("@/lib/site-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/site-data")>()),
  getFleetView: async () => fx.view,
}));
vi.mock("@/lib/rides/fares", () => ({
  readTransferFares: async () => ({ airport: null, ferry: null }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode; className?: string }) =>
    createElement("a", { href: p.href, className: p.className }, p.children),
}));
vi.mock("@/components/nav/LangLink", () => ({
  default: (p: { href: string; children?: ReactNode }) => createElement("a", { href: p.href }, p.children),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/BrowseTabs", () => ({ default: () => null }));
vi.mock("@/components/TrustBar", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
vi.mock("@/components/Fleet", () => ({
  default: (p: { title: string }) => createElement("section", null, createElement("h1", null, p.title)),
}));
vi.mock("@/components/BookingSection", () => ({
  default: () => createElement("form", { id: "booking" }),
}));
vi.mock("@/components/RecommendedPlaces", () => ({
  default: (p: { content: { items: { id: string; name: string }[] } }) =>
    createElement("ul", { id: "cards" }, p.content.items.map((i) => createElement("li", { key: i.id }, i.name))),
}));

const vehicle = (id: string, name: string, price: string, category: string) => ({
  id,
  name,
  price,
  category,
  badge: "",
  tagline: "",
  description: "",
  image: `/${id}.jpg`,
  unit: "/day",
  available: true,
  specs: [],
  included: [],
});

beforeEach(() => {
  fx.lang = "en";
  const content = {
    ...DEFAULT_CONTENT,
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true, deliveryFee: 0 },
      { id: "car", label: "Cars", enabled: true, deliveryFee: 0 },
    ],
    fleet: [vehicle("burgman", "BURGMAN 125cc", "Rs 777", "scooter"), vehicle("swift", "Suzuki Swift", "Rs 1,888", "car")],
    recommended: {
      ...DEFAULT_CONTENT.recommended,
      enabled: true,
      items: [{ id: "rec-lakaze", category: "hotel", name: "Lakaze Mama", priceNote: "Rs 1,000 per night", image: "/p.jpg", description: "" }],
    },
  } as unknown as SiteContent;
  fx.view = {
    content,
    fleet: content.fleet.map((f) => ({ ...f, soldOutToday: false })),
    ratings: {},
    recentBookings: {},
    reviews: [],
    businessWhatsApp: "+23058355588",
  };
});

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function render(category: string, lang: "en" | "fr" | "cr") {
  fx.lang = lang;
  const mod = await import("@/app/browse/[category]/page");
  return renderToStaticMarkup(
    (await mod.default({ params: Promise.resolve({ category }) })) as ReactElement,
  );
}

/** The block's heading, and each link's href and label, read off the page. */
function whereToGo(html: string) {
  const at = html.indexOf('<h2 class="font-bebas text-[11px] tracking-[0.3em] text-muted">');
  if (at < 0) return null;
  const block = html.slice(at, html.indexOf("</section>", at));
  return {
    heading: text(block.slice(0, block.indexOf("</h2>"))),
    links: [...block.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], label: text(m[2]) })),
  };
}

describe("the Where to go block follows the visitor's language", () => {
  it("/browse/stays in French: French heading, French labels, under French notes", async () => {
    const html = await render("stays", "fr");
    expect(whereToGo(html)).toEqual({
      heading: "Où aller",
      links: [
        { href: "/guide/rodrigues", label: "Le guide de l’île Rodrigues" },
        { href: "/guide/beaches", label: "Les plages de Rodrigues" },
      ],
    });
    // The notes just above it are French too — no switch back to English.
    expect(text(html)).toContain("Réserver directement auprès du propriétaire");
    expect(text(html)).not.toMatch(/Where to go|The beaches of Rodrigues|The Rodrigues island guide/);
  });

  it("/browse/scooter in French names all four guides in French", async () => {
    expect(whereToGo(await render("scooter", "fr"))).toEqual({
      heading: "Où aller",
      links: [
        { href: "/guide/routes", label: "Itinéraires en scooter autour de l’île" },
        { href: "/guide/beaches", label: "Les plages qui valent le trajet" },
        { href: "/guide/viewpoints", label: "Points de vue et sites" },
        { href: "/map", label: "La carte de l’île" },
      ],
    });
  });

  it("the server render stays English, word for word", async () => {
    expect(whereToGo(await render("car", "en"))).toEqual({
      heading: "Where to go",
      links: [
        { href: "/guide/routes", label: "Routes around the island" },
        { href: "/guide/beaches", label: "Beaches worth the drive" },
        { href: "/guide/viewpoints", label: "Viewpoints and landmarks" },
        { href: "/map", label: "The island map" },
      ],
    });
  });

  for (const category of ["scooter", "car", "stays"]) {
    it(`/browse/${category}: the same links in every language, each label translated, no count`, async () => {
      const en = whereToGo(await render(category, "en"))!;
      for (const lang of ["fr", "cr"] as const) {
        const other = whereToGo(await render(category, lang))!;
        // Same hrefs, same order: the first client render matches the server's.
        expect(other.links.map((l) => l.href)).toEqual(en.links.map((l) => l.href));
        expect(other.heading).not.toBe(en.heading);
        other.links.forEach((l, i) => {
          expect(l.label).not.toBe(en.links[i].label);
          expect(l.label).not.toMatch(/\d/);
        });
      }
    });
  }
});
