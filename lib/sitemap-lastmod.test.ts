import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── A LASTMOD IS A CLAIM, AND IT WAS FALSE 34 TIMES (M148) ──────────────────
//
// Every one of the 67 URLs carried the same lastmod: the moment the sitemap
// was generated. Regenerated hourly, that told Google the entire site had
// changed, once an hour, forever.
//
// The damage is not confined to the pages that lied. Google evaluates whether
// a site's lastmod can be trusted and then applies that judgement to the whole
// file — so the genuinely accurate dates already on the shops, products and
// blog posts were being discounted along with the fabricated ones. Deleting
// the fake dates is what makes the real ones worth having.
//
// Asserted against the source because the value is produced at build time on
// Vercel and cannot be observed from a unit test.

const SRC = (() => {
  const s = readFileSync(join(__dirname, "..", "app", "sitemap.ts"), "utf8");
  // The prose above and in the file must never be what satisfies a test.
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
})();

describe("the sitemap never invents a modification date", () => {
  it("has no build-time timestamp masquerading as a lastmod", () => {
    expect(SRC).not.toMatch(/lastModified:\s*now\b/);
    expect(SRC).not.toMatch(/const now = new Date\(\)/);
  });

  it("does not fall back to a fabricated date when a row has none", () => {
    // These two blocks read a real updated_at and used to fall back to `now`.
    expect(SRC).not.toMatch(/updated_at\)\s*:\s*now/);
    expect(SRC).toMatch(/s\.updated_at\s*\?\s*new Date\(s\.updated_at\)\s*:\s*undefined/);
    expect(SRC).toMatch(/p\.updated_at\s*\?\s*new Date\(p\.updated_at\)\s*:\s*undefined/);
  });
});

describe("pages rendered from site_content carry that row's date", () => {
  it("reads site_content.updated_at, which getContent() does not select", () => {
    expect(SRC).toMatch(/from\("site_content"\)/);
    expect(SRC).toMatch(/select\("updated_at"\)/);
    expect(SRC).toMatch(/let contentAt: Date \| undefined/);
  });

  it("uses the cookieless client, or this static route turns dynamic", () => {
    // lib/supabase/server.ts reads cookies; that opts the route into dynamic
    // rendering, Next throws, and the catch ships a sitemap missing entries.
    const block = SRC.slice(SRC.indexOf("let contentAt"), SRC.indexOf("let contentAt") + 600);
    expect(block).toContain("@/lib/supabase/anon");
    expect(block).not.toContain("@/lib/supabase/server");
  });

  it("applies it to the pages that row actually renders, and not to others", () => {
    const uses = SRC.match(/lastModified: contentAt/g) ?? [];
    // Homepage, browse categories, vehicle pages, /guide/shops, /experiences,
    // /experiences/[type], /map, /taxi.
    expect(uses.length).toBe(8);
  });

  it("survives a database failure without a date rather than with a wrong one", () => {
    expect(SRC).toMatch(/catch\s*\{[\s\S]{0,120}\}/);
    expect(SRC).toMatch(/if \(data\?\.updated_at\) contentAt = new Date\(data\.updated_at\)/);
  });
});

describe("the dates that were already real are still real", () => {
  it("keeps the per-post blog date", () => {
    expect(SRC).toMatch(/lastModified: new Date\(p\.updated\)/);
  });
});
