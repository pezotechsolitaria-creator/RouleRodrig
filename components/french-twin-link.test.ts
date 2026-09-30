import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import FrenchTwinLink from "./FrenchTwinLink";

// ── THE DOOR BACK TO ENGLISH (SEO audit 2026-09-29 C13) ─────────────────────
//
// Two French pages named their English twin in hreflang and linked neither.
// FrenchTwinLink now takes lang="en" for that direction; these render it, and
// the two pages, and read the anchor a crawler follows.

vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => DEFAULT_CONTENT,
}));
vi.mock("@/lib/site-data", async (orig) => ({
  ...(await orig<typeof import("@/lib/site-data")>()),
  getFleetView: async () => ({ content: DEFAULT_CONTENT, fleet: [], recentBookings: {}, businessWhatsApp: null }),
}));

const anchor = (html: string, href: string) =>
  html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>([^<]*)</a>`));

describe("FrenchTwinLink", () => {
  it("still defaults to a French twin, for the English pages", () => {
    const html = renderToStaticMarkup(
      createElement(FrenchTwinLink, { href: "/fr/plages-rodrigues", label: "Les plages — en français" }),
    );
    expect(html).toMatch(/hrefLang="fr"/);
    expect(html).toMatch(/lang="fr"/);
  });

  it("marks an English twin as English, link and label both", () => {
    const html = renderToStaticMarkup(
      createElement(FrenchTwinLink, { href: "/guide/beaches", label: "Read this page in English", lang: "en" }),
    );
    const a = html.match(/<a[^>]*>/)![0];
    expect(a).toContain('href="/guide/beaches"');
    expect(a).toContain('hrefLang="en"');
    expect(a).toContain('lang="en"');
  });
});

describe("the two French pages that had no door back", () => {
  it("/fr/se-deplacer-a-rodrigues links the blog post its hreflang names", async () => {
    const { default: Page } = await import("@/app/fr/se-deplacer-a-rodrigues/page");
    const html = renderToStaticMarkup((await Page()) as ReactElement);
    const a = anchor(html, "/blog/how-to-get-around-rodrigues");
    expect(a?.[1]).toBe("Read this page in English");
  });

  it("/fr/plages-rodrigues links /guide/beaches", async () => {
    const { default: Page } = await import("@/app/fr/plages-rodrigues/page");
    const html = renderToStaticMarkup((await Page()) as ReactElement);
    const a = anchor(html, "/guide/beaches");
    expect(a?.[1]).toBe("Read this page in English");
  });
});
