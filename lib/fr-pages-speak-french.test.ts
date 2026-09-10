import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FR = join(ROOT, "app", "fr");

const frRoutes = (dir: string, acc: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) frRoutes(p, acc);
    else if (e === "page.tsx") acc.push(p);
  }
  return acc;
};

// ── A FRENCH PAGE IN ENGLISH FURNITURE ─────────────────────────────────────
//
// PageLanguage set `<html lang="fr">` and nothing else, so every /fr page
// served hand-written French prose wrapped in English chrome — permanently,
// for any visitor who had not separately switched the whole site to French.
// The header, the nav, "Book Now" and the entire footer are client components
// reading LanguageContext, and the context only knew the VISITOR's preference.
//
// Measured live on 2026-09-10: all twelve /fr routes carried "EXPLORE THE
// ISLAND", "Island Map", "Book Now", "Sell with us", "Official visitor
// information and support", "Tag us in your Rodrigues adventures." and the
// footer tagline in English — every one of which has had a French translation
// in lib/i18n.ts the whole time. Nothing was missing; nothing had asked.
describe("every French route claims the French language", () => {
  const routes = frRoutes(FR);

  it("finds them all", () => {
    expect(routes.length).toBeGreaterThanOrEqual(12);
  });

  it("declares PageLanguage on each one", () => {
    // The /fr hub was the one that slipped: written in French throughout,
    // and the only route without this.
    const missing = routes
      .filter((p) => !readFileSync(p, "utf8").includes('<PageLanguage lang="fr" />'))
      .map((p) => p.slice(ROOT.length));
    expect(missing).toEqual([]);
  });
});

describe("PageLanguage actually changes the language", () => {
  // Comments stripped: these files EXPLAIN the old behaviour at length, and an
  // assertion that reads prose fails on its own documentation. That has now
  // happened four times in this repo — read the code.
  const strip = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = strip(
    readFileSync(join(ROOT, "components", "PageLanguage.tsx"), "utf8"),
  );
  const ctx = strip(
    readFileSync(join(ROOT, "context", "LanguageContext.tsx"), "utf8"),
  );

  it("claims the context, not only the html attribute", () => {
    // Setting document.documentElement.lang fixes what a screen reader and
    // Google read, and nothing a customer sees.
    expect(src).toContain("forceLanguage(lang)");
    expect(src).toContain("forceLanguage(null)");
  });

  it("releases the claim when the page unmounts", () => {
    // Otherwise navigating from a French page to the English site leaves the
    // whole app stuck in French.
    expect(src).toMatch(/return \(\) => forceLanguage\(null\)/);
  });

  it("does not overwrite the visitor's saved preference", () => {
    // The claim is per-route. Nothing here may write localStorage or a cookie.
    expect(src).not.toMatch(/localStorage|document\.cookie|setLanguage\(/);
  });

  it("lets an explicit switcher press win", () => {
    // A control that visibly does nothing is worse than either language.
    expect(ctx).toMatch(/function setLanguage[\s\S]{0,400}setForced\(null\)/);
  });

  it("has exactly one writer for the html lang attribute", () => {
    // Two writers fought over it before: PageLanguage set it, the provider
    // reset it, and the last render won by accident.
    expect(src).not.toContain("documentElement");
    expect(ctx).toContain("document.documentElement.lang = languageTag(language)");
    expect(ctx).not.toContain("langLocked");
  });
});
