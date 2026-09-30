import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE_URL } from "@/lib/site";

// ── THE PAGES THAT STATE A TAXI OR TRANSFER PRICE (SEO audit 2026-09-29) ────
//
// C2: taxi pricing was described three contradictory ways — "no fixed price
// list" on /taxi and /fr/taxi-rodrigues, zone fares on /transfers, "the fare
// shown before you book" on /about. C5: /transfers, the most citable price
// page, had two links out and three in. T9: the taxi schema named an accented,
// anonymous Organization as provider.
//
// These render the real server pages, with the price sheet faked (numbers
// deliberately not the live ones) and the client-only chrome stubbed out.

const state = vi.hoisted(() => ({ noFares: false }));

vi.mock("@/lib/rides/fares", async () => {
  const { SHEET } = await import("@/test/transfer-sheet.fixture");
  return {
    readTransferFares: async () =>
      state.noFares ? { airport: null, ferry: null } : { airport: SHEET, ferry: 99900 },
  };
});
vi.mock("@/lib/site-data", async (importOriginal) => {
  const { DEFAULT_CONTENT } = await import("@/lib/defaults");
  return {
    ...(await importOriginal<typeof import("@/lib/site-data")>()),
    getFleetView: async () => ({ content: DEFAULT_CONTENT, businessWhatsApp: "+23058355588" }),
  };
});
vi.mock("@/lib/content", async () => {
  const { DEFAULT_CONTENT } = await import("@/lib/defaults");
  return { getContent: async () => DEFAULT_CONTENT };
});
vi.mock("next/link", () => ({
  default: ({ href, children, className, hrefLang }: Record<string, unknown>) =>
    createElement("a", { href, className, hrefLang }, children as never),
}));
vi.mock("@/components/nav/LangLink", () => ({
  default: ({ href, children, className }: Record<string, unknown>) =>
    createElement("a", { href, className }, children as never),
}));
for (const m of [
  "@/components/Navbar",
  "@/components/PageLanguage",
  "@/components/AppPageHeader",
  "@/components/BackLink",
  "@/app/taxi/book/BookRide",
  "@/app/taxi/book/BookingHeading",
]) {
  vi.doMock(m, () => ({ default: () => null }));
}

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

function nodes(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (m) => {
      const j = JSON.parse(m[1]) as Record<string, unknown>;
      return (j["@graph"] as Record<string, unknown>[] | undefined) ?? [j];
    },
  );
}

async function page(path: string): Promise<string> {
  const mod = (await import(path)) as { default: () => Promise<React.ReactElement> };
  return renderToStaticMarkup(await mod.default());
}

beforeEach(() => {
  state.noFares = false;
});

describe("/transfers leads somewhere now (C5)", () => {
  it("has a Related line under its FAQ, below the booking flow", async () => {
    const html = await page("@/app/transfers/page");
    const related = html.slice(html.indexOf('aria-label="Related"'));
    expect(html.indexOf('aria-label="Related"')).toBeGreaterThan(html.indexOf("Airport transfers, answered"));
    for (const href of ["/taxi", "/browse/car", "/fr/taxi-rodrigues", "/blog/how-to-get-around-rodrigues"]) {
      expect(related).toContain(`href="${href}"`);
    }
    expect(related).toMatch(/<li lang="fr"><a href="\/fr\/taxi-rodrigues"[^>]*hrefLang="fr"/);
  });

  it("carries the #business node its provider points at (T9)", async () => {
    const all = nodes(await page("@/app/transfers/page"));
    const service = all.find((n) => n["@type"] === "Service");
    expect(service?.provider).toEqual({ "@id": `${SITE_URL}/#business` });
    const seller = all.find((n) => n["@id"] === `${SITE_URL}/#business`);
    expect(seller?.["@context"]).toBe("https://schema.org");
  });

  it("still renders its FAQ from the sheet through the shared module", async () => {
    const t = text(await page("@/app/transfers/page"));
    expect(t).toContain("Rs 1,777 one way. Port Mathurin is 18.2 km from Plaine Corail by road");
  });
});

describe("/fr/taxi-rodrigues gives the two-part answer (C2, C5, T9)", () => {
  it("prices airport transfers by zone from the sheet, and the rest by the driver", async () => {
    const t = text(await page("@/app/fr/taxi-rodrigues/page"));
    expect(t).not.toContain("il n'existe pas de grille de prix");
    expect(t).toContain("Cela dépend de la course.");
    expect(t).toContain("jusqu'à 6 km");
    expect(t).toContain("Pour toute autre course, chaque chauffeur fixe son propre tarif");
  });

  it("links /transfers from the airport answer", async () => {
    const html = await page("@/app/fr/taxi-rodrigues/page");
    expect(html).toMatch(/<a href="\/transfers"[^>]*>Tarifs des transferts aéroport, par zone/);
  });

  it("marks up the same answers, with the one business as provider", async () => {
    const html = await page("@/app/fr/taxi-rodrigues/page");
    const all = nodes(html);
    const faq = all.find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { acceptedAnswer: { text: string } }[];
    };
    // Both sides whitespace-folded: French grouping is a narrow no-break space.
    for (const q of faq.mainEntity) {
      expect(text(html)).toContain(q.acceptedAnswer.text.replace(/\s+/g, " "));
    }
    const service = all.find((n) => n["@type"] === "Service");
    expect(service?.provider).toEqual({ "@id": `${SITE_URL}/#business` });
    expect(all.some((n) => n["@id"] === `${SITE_URL}/#business` && n["@context"])).toBe(true);
    expect(JSON.stringify(all)).not.toMatch(/"name":"Roulé Rodrigues"/);
  });

  it("prints no fare when the sheet is unread, and still names the zone model", async () => {
    state.noFares = true;
    const t = text(await page("@/app/fr/taxi-rodrigues/page"));
    expect(t).not.toMatch(/Rs\s?\d/);
    expect(t).toContain("tarifs fixes par zone");
  });

  it("spells the brand unaccented (C17)", async () => {
    expect(text(await page("@/app/fr/taxi-rodrigues/page"))).not.toContain("Roulé Rodrigues");
  });
});

describe("/about splits taxis from airport transfers (C2, C5)", () => {
  it("has a card for each, each saying its own price rule", async () => {
    const html = await page("@/app/about/page");
    expect(html).toMatch(/<a href="\/taxi"[^>]*>[\s\S]*?Taxis[\s\S]*?price is confirmed with you before anything is agreed/);
    expect(html).toMatch(/<a href="\/transfers"[^>]*>[\s\S]*?Airport transfers[\s\S]*?Fixed fares by zone from Plaine Corail/);
    expect(text(html)).not.toContain("The fare shown before you book");
  });

  it("spells the brand unaccented, on the page and in its markup (C17)", async () => {
    const html = await page("@/app/about/page");
    expect(text(html)).not.toContain("Roulé Rodrigues");
    expect(nodes(html).find((n) => n["@type"] === "AboutPage")?.name).toBe("About Roule Rodrigues");
  });
});
