import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type RecommendedPlace, type SiteContent } from "@/lib/defaults";

// ── THE SITEWIDE LINKS, THE FRENCH HUB AND THE GETTING-AROUND POST ─────────
// SEO audit 2026-09-29:
//   C3  the footer, the one element on every page, linked three noindex pages
//       and no money page and no French page;
//   C1  the /fr hub typed "Dès Rs 1 499" for a car that costs more;
//   C2  the hub said "Prix fixes annoncés à l'avance" of every taxi;
//   C5  the how-to-get-around post said "No official fare table" and never
//       linked /transfers.
// Rendered from the real components and pages; content faked where read.

const state = vi.hoisted(() => ({ content: null as unknown }));

vi.mock("@/lib/content", async () => {
  const { DEFAULT_CONTENT } = await import("@/lib/defaults");
  return { getContent: async () => state.content ?? DEFAULT_CONTENT };
});
vi.mock("next/link", () => ({
  default: ({ href, children, className, hrefLang }: Record<string, unknown>) =>
    createElement("a", { href, className, hrefLang }, children as never),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
for (const m of [
  "@/components/Navbar",
  "@/components/PageLanguage",
  "@/components/BackLink",
  "@/components/ScrollProgress",
  "@/components/AskTiRouleButton",
]) {
  vi.doMock(m, () => ({ default: () => null }));
}

import Footer from "@/components/Footer";
import { FOOTER_EN_LINKS, FOOTER_FR_LINKS, FR_PAGES, GUIDE_PAGES } from "@/lib/nav/hubs";
import { showsSiteFooter } from "@/lib/nav-scope";
import { BLOG_POSTS } from "@/lib/blog";

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("the footer links the money pages and the French ones (C3)", () => {
  const html = renderToStaticMarkup(createElement(Footer, {}));
  const navOf = (label: string) => {
    const at = html.indexOf(`aria-label="${label}"`);
    return html.slice(at, html.indexOf("</nav>", at));
  };

  it("has an English row of the six money pages, in the audit's order", () => {
    const row = navOf("Rent, stay and explore");
    const hrefs = [...row.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([
      "/browse/scooter",
      "/browse/car",
      "/transfers",
      "/browse/stays",
      "/experiences",
      "/guide/rodrigues",
    ]);
    expect(html).toMatch(/aria-label="Rent, stay and explore"[^>]*lang="en"/);
  });

  it("has a French row, marked French, of pages the /fr hub lists", () => {
    const row = navOf("En français");
    expect(html).toMatch(/aria-label="En français"[^>]*lang="fr"/);
    expect(text(row)).toContain("En français :");
    for (const l of FOOTER_FR_LINKS) {
      expect(row).toContain(`href="${l.href}"`);
      expect(FR_PAGES.some((p) => p.href === l.href)).toBe(true);
    }
    expect(FOOTER_FR_LINKS.map((l) => l.label)).toEqual([
      "Location scooter",
      "Location voiture",
      "Hébergement",
      "Que faire",
      "Guide de Rodrigues",
    ]);
    expect((row.match(/hrefLang="fr"/g) ?? []).length).toBe(FOOTER_FR_LINKS.length);
  });

  it("puts both rows above the working-with-us row", () => {
    expect(html.indexOf('aria-label="En français"')).toBeLessThan(html.indexOf('href="/kitchen"'));
    expect(html.indexOf('aria-label="Rent, stay and explore"')).toBeLessThan(html.indexOf('aria-label="En français"'));
  });

  it("gives every new link a 44px target", () => {
    for (const l of [...FOOTER_EN_LINKS, ...FOOTER_FR_LINKS]) {
      expect(html).toMatch(new RegExp(`<a href="${l.href}" class="[^"]*min-h-11`));
    }
  });

  it("leaves the flow pages without a footer, as before", () => {
    expect(showsSiteFooter("/transfers")).toBe(false);
    expect(showsSiteFooter("/taxi/book")).toBe(false);
    expect(showsSiteFooter("/browse/car")).toBe(true);
  });
});

describe("the hubs type no price (C1, C2)", () => {
  it("holds no Rs figure in any blurb", () => {
    for (const p of [...GUIDE_PAGES, ...FR_PAGES]) {
      expect(p.blurb, p.href).not.toMatch(/Rs\s?\d/);
      if (p.priced) expect(p.priced.blurb("§"), p.href).not.toMatch(/\d/);
    }
  });

  it("describes the taxi page with the two-part rule, not 'fixed prices' for every ride", () => {
    const taxi = FR_PAGES.find((p) => p.href === "/fr/taxi-rodrigues")!;
    expect(taxi.blurb).not.toMatch(/Prix fixes annoncés/);
    expect(taxi.blurb).toContain("tarif fixe par zone");
    expect(taxi.blurb).toContain("prix confirmé avant");
  });
});

describe("the /fr hub prints the live 'dès' figure, or none (C1)", () => {
  const fr = (n: number) => `Rs ${n.toLocaleString("fr-FR")}`;
  const render = async (content: SiteContent) => {
    state.content = content;
    const { default: FrHub } = await import("@/app/fr/page");
    return text(renderToStaticMarkup(await FrHub())).replace(/\s+/g, " ");
  };
  const fold = (s: string) => s.replace(/\s+/g, " ");

  it("reads the scooter, car and stay figures from the content", async () => {
    const base = DEFAULT_CONTENT.fleet[0];
    const t = await render({
      ...DEFAULT_CONTENT,
      fleet: [
        { ...base, id: "s", category: "scooter", price: "From Rs 747(free delivery)" },
        { ...base, id: "c", category: "car", price: "Rs 1848" },
      ],
      recommended: {
        ...DEFAULT_CONTENT.recommended,
        items: [{ id: "h", category: "hotel", name: "Lodge", image: "/x.jpg", description: "", priceNote: "Rs 1,313 per night" } as RecommendedPlace],
      },
    });
    expect(t).toContain(fold(`Dès ${fr(747)} par jour, casque et assistance compris.`));
    expect(t).toContain(fold(`Dès ${fr(1848)} par jour, livrée où vous êtes.`));
    expect(t).toContain(fold(`Où dormir, dès ${fr(1313)} la nuit.`));
    expect(t).not.toContain("1 499");
  });

  it("prints the price-free blurb when there is nothing sellable to measure", async () => {
    const t = await render({ ...DEFAULT_CONTENT, fleet: [], recommended: { ...DEFAULT_CONTENT.recommended, items: [] } });
    expect(t).toContain("Casque et assistance compris.");
    expect(t).toContain("Livrée où vous êtes.");
    expect(t).not.toMatch(/Dès Rs|dès Rs/);
  });
});

describe("the how-to-get-around post tells the fare truth and links /transfers (C5)", () => {
  const post = BLOG_POSTS.find((p) => p.slug === "how-to-get-around-rodrigues")!;

  it("says airport transfers have zone fares, in the table and the taxi paragraphs", () => {
    const taxiRow = post.sections.flatMap((s) => s.table?.rows ?? []).find((r) => r[0] === "Taxi")!;
    expect(taxiRow.join(" ")).toContain("fixed fares by zone");
    expect(taxiRow.join(" ")).not.toMatch(/^No official fare table/);
    const body = post.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(body).toContain("airport transfers on this site have fixed fares by zone");
    expect(body).toContain("For every other ride we deliberately print no price list");
    // A static post cannot read the price sheet: it names the page that does
    // and prints no taxi or transfer figure of its own.
    const taxis = post.sections.find((s) => s.heading.startsWith("Taxis"))!;
    expect(taxis.paragraphs.join(" ")).not.toMatch(/Rs\s?\d/);
    expect(taxiRow.join(" ")).not.toMatch(/Rs\s?\d/);
  });

  it("was re-dated when its body changed", () => {
    expect(post.updated > post.published).toBe(true);
  });

  it("renders the /transfers link on the page", async () => {
    const { default: BlogPost } = await import("@/app/blog/[slug]/page");
    const html = renderToStaticMarkup(await BlogPost({ params: Promise.resolve({ slug: post.slug }) }));
    expect(html).toMatch(/<a href="\/transfers"[^>]*>[\s\S]*?Airport transfer prices, by zone/);
  });
});
