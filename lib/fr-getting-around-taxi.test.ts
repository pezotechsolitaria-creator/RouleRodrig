import { describe, it, expect, vi, beforeEach } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { SHEET } from "@/test/transfer-sheet.fixture";
import { taxiPriceAnswer, TRANSFERS_LINK } from "./taxi-faq";

// ── THE FRENCH TWIN STILL SAID THERE WAS NO PRICE LIST (C2/C5) ──────────────
//
// SEO audit 2026-09-29 C2: one two-part taxi price answer everywhere — airport
// transfers at the zone fares, every other ride agreed with the driver. The
// English /blog/how-to-get-around-rodrigues and /fr/taxi-rodrigues gave it;
// their hreflang twin /fr/se-deplacer-a-rodrigues still said "nous n'en avons
// pas de fiable" in its callout and answered "Combien coûte un taxi ?" in its
// FAQPage the opposite way to /fr/taxi-rodrigues, and never linked /transfers
// (C5). This renders the real page with the price sheet faked both ways.

const fares = vi.hoisted(() => ({ airport: null as unknown }));

vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => DEFAULT_CONTENT,
}));
vi.mock("@/lib/site-data", async (orig) => ({
  ...(await orig<typeof import("@/lib/site-data")>()),
  getFleetView: async () => ({ content: DEFAULT_CONTENT, fleet: [], recentBookings: {}, businessWhatsApp: null }),
}));
vi.mock("@/lib/rides/fares", () => ({
  readTransferFares: async () => ({ airport: fares.airport, ferry: null }),
}));

beforeEach(() => {
  fares.airport = SHEET;
});

const render = async () => {
  const { default: Page } = await import("@/app/fr/se-deplacer-a-rodrigues/page");
  return renderToStaticMarkup((await Page()) as ReactElement);
};

const plain = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** The FAQPage answer for the taxi price question, as published. */
const ldTaxiAnswer = (html: string): string => {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "{}";
  const graph = (JSON.parse(json)["@graph"] ?? []) as { "@type": string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[];
  const faq = graph.find((n) => n["@type"] === "FAQPage");
  return faq?.mainEntity?.find((q) => q.name.startsWith("Combien coûte un taxi"))?.acceptedAnswer.text ?? "";
};

describe("/fr/se-deplacer-a-rodrigues gives the two-part taxi answer", () => {
  it("answers the price question exactly as /fr/taxi-rodrigues does, zone fares from the sheet", async () => {
    const html = await render();
    const answer = ldTaxiAnswer(html);
    expect(answer).toBe(taxiPriceAnswer("fr", SHEET));
    // The sheet's own figure (Rs 1 111, deliberately not a live fare), so the
    // number can only have come from the sheet.
    expect(answer).toMatch(/Rs 1[\s  ]111/);
    expect(plain(html)).toContain(answer.slice(0, 60));
  });

  it("prints no fare when the sheet cannot be read, and names the page instead", async () => {
    fares.airport = null;
    const html = await render();
    expect(ldTaxiAnswer(html)).toBe(taxiPriceAnswer("fr", null));
    expect(ldTaxiAnswer(html)).not.toMatch(/Rs\s?\d/);
  });

  it("no longer says it has no reliable price list, and the table row has both parts", async () => {
    const t = plain(await render());
    expect(t).not.toContain("n'en avons pas de fiable");
    expect(t).toContain("transfert aéroport réservé ici : tarif fixe par zone ; autre course : prix à convenir avant de monter");
    expect(t).toContain("La seule exception sur ce site, c'est l'aéroport");
    // Still true, and still said: there is no official taxi tariff.
    expect(t).toContain("Aucun tarif officiel n'est publié pour les taxis à Rodrigues");
  });

  it("links /transfers (C5), under the answer and under the callout", async () => {
    const html = await render();
    const links = html.match(/<a[^>]*href="\/transfers"[^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const a of links) expect(plain(a)).toContain(TRANSFERS_LINK.fr.label);
  });
});
