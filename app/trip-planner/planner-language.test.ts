import { describe, it, expect, vi } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { translations } from "@/lib/i18n";

// ── /trip-planner SAYS WHICH LANGUAGE EACH PART IS IN (C22/T19 review) ──────
//
// SEO audit 2026-09-29 C22 added a server-rendered English sentence under the
// planner form with a French link in it, and T19 gave the h1 "Rodrigues".
// Two review findings: the French link carried no lang, and the sentence
// around it — fixed English — carried none either while <html lang> follows
// the reader's chosen language; and the French h1 "Planificateur Rodrigues"
// was the English word order. This renders the real page.

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => DEFAULT_CONTENT,
}));

describe("the itinerary links under the form", async () => {
  const { default: Page } = await import("./page");
  const html = renderToStaticMarkup((await Page()) as ReactElement);

  it("marks the fixed English sentence as English", () => {
    const p = html.match(/<p[^>]*>Not sure how many days\?/)?.[0] ?? "";
    expect(p).toContain('lang="en"');
  });

  it("marks the French link as French, link and label both", () => {
    const a = html.match(/<a[^>]*href="\/fr\/itineraire-rodrigues"[^>]*>/)?.[0] ?? "";
    expect(a).toContain('hrefLang="fr"');
    expect(a).toContain('lang="fr"');
  });
});

describe("the French h1", () => {
  it("is French word order, in the site's own term for the planner", () => {
    expect(translations.fr.planner.title).toBe("Planificateur de séjour à Rodrigues");
    expect(translations.fr.planner.title).toContain(translations.fr.common.aiTripPlanner);
  });
});
