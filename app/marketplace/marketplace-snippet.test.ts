import { describe, it, expect, vi, beforeEach } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT } from "@/lib/defaults";

// ── THE HUB'S SNIPPET OFFERED SHOPS OVER AN EMPTY SHELF (C16/T4) ────────────
//
// SEO audit 2026-09-29. /shop sends `noindex, follow` while sitemap_stores()
// lists no shop, and /marketplace's description still opened "Buy from local
// shops". The clause is now gated on the same read, both ways: gone while the
// shelf is KNOWN to be empty, back by itself with the first shop, and kept when
// the read fails (unknown is not empty — lib/listing-gates.ts). These drive the
// real generateMetadata() and the real page with only the database replaced.

const db = vi.hoisted(() => ({
  stores: { data: [] as unknown, error: null as unknown },
  calls: 0,
}));

vi.mock("@/lib/supabase/anon", () => ({
  createAnonClient: () => ({
    rpc: async (name: string) => {
      if (name !== "sitemap_stores") throw new Error(`unexpected rpc: ${name}`);
      db.calls += 1;
      return db.stores;
    },
  }),
}));
vi.mock("@/lib/content", () => ({ getContent: async () => DEFAULT_CONTENT }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));

beforeEach(() => {
  db.stores = { data: [], error: null };
  db.calls = 0;
});

const meta = async () => {
  const { generateMetadata } = await import("./page");
  const m = await generateMetadata();
  return { description: String(m.description), og: String(m.openGraph?.description) };
};

describe("/marketplace's description", () => {
  it("drops the shops clause while sitemap_stores() lists no shop", async () => {
    const { description, og } = await meta();
    expect(db.calls).toBeGreaterThan(0);
    expect(description).toBe(
      "Have something delivered anywhere on Rodrigues. One place for everything Roule Rodrigues can get done for you.",
    );
    expect(og).toBe(description);
    expect(description).not.toMatch(/shops|car wash/i);
  });

  it("says it again by itself the day a shop is listed", async () => {
    db.stores = { data: [{ slug: "miel-rodrigues", updated_at: null }], error: null };
    expect((await meta()).description).toMatch(/^Buy from local shops, or have something delivered/);
  });

  it("keeps it when the read fails — unknown is not empty", async () => {
    db.stores = { data: null, error: { message: "timeout" } };
    expect((await meta()).description).toMatch(/^Buy from local shops/);
  });

  it("puts the same sentence under the h1 as in the snippet", async () => {
    const { default: Page } = await import("./page");
    const empty = renderToStaticMarkup((await Page()) as ReactElement);
    expect(empty).toContain("Have something delivered anywhere on Rodrigues.");
    expect(empty).not.toContain("Buy from local shops");

    db.stores = { data: [{ slug: "miel-rodrigues", updated_at: null }], error: null };
    const listed = renderToStaticMarkup((await Page()) as ReactElement);
    expect(listed).toContain("Buy from local shops, or have something delivered anywhere on Rodrigues.");
  });
});
