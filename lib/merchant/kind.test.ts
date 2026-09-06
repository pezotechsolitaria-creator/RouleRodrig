import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIND_VOCAB, MERCHANT_KINDS, vocabFor, type MerchantKind } from "./kind";

// ── "MERCHANT" IS NOT ONE THING ─────────────────────────────────────────────
//
// The platform owner's own login reaches a marketplace shop, a food kitchen and
// three event box offices. Before M172 all five were labelled "shop", because
// kind was assigned by whichever query found the store rather than by what the
// store actually is.

describe("the kind vocabulary", () => {
  it("has an entry for every kind, with nothing blank", () => {
    for (const kind of MERCHANT_KINDS) {
      const v = KIND_VOCAB[kind];
      expect(v, `no vocab for "${kind}"`).toBeDefined();
      expect(v.badge.trim()).not.toBe("");
      expect(v.noun.trim()).not.toBe("");
      expect(v.catalogue.label.trim()).not.toBe("");
      expect(v.catalogue.href.startsWith("/merchant/")).toBe(true);
    }
  });

  it("lists no kind twice", () => {
    expect(new Set(MERCHANT_KINDS).size).toBe(MERCHANT_KINDS.length);
  });

  it("gives every kind a DIFFERENT word for slot three", () => {
    // If two kinds share a label the tab is not carrying information and the
    // whole exercise is decoration.
    const labels = MERCHANT_KINDS.map((k) => KIND_VOCAB[k].catalogue.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("does not claim a box office chooses a fulfilment method", () => {
    // A merchant with all three fulfilment booleans off is currently shown a
    // red "no fulfillment method" error — a failure state describing a business
    // operating perfectly normally.
    expect(KIND_VOCAB.events.hasFulfilmentChoice).toBe(false);
    expect(KIND_VOCAB.shop.hasFulfilmentChoice).toBe(true);
    expect(KIND_VOCAB.kitchen.hasFulfilmentChoice).toBe(true);
  });

  it("resolves through vocabFor for every kind", () => {
    for (const k of MERCHANT_KINDS) expect(vocabFor(k)).toBe(KIND_VOCAB[k]);
  });

  // The guarantee a boolean cannot give: adding a member breaks the build until
  // every Record is filled. This documents it for the next reader.
  it("is exhaustive by type, so a new kind cannot be silently defaulted", () => {
    const seen: Record<MerchantKind, boolean> = { shop: true, kitchen: true, events: true };
    expect(Object.keys(seen).sort()).toEqual([...MERCHANT_KINDS].sort());
  });
});

describe("kind is derived positively, not by absence", () => {
  const src = readFileSync(join(process.cwd(), "lib", "merchant", "context.ts"), "utf8");

  it("never stamps a kind on the branch that merely found the store", () => {
    // THE BUG. `out.push({ id, name, kind: "shop" })` inside the merchant_staff
    // loop meant anything reached that way was permanently a shop, and the
    // kitchen branch was deduped against it so shop won every tie.
    expect(src).not.toMatch(/kind:\s*"shop"\s*\}\s*\)/);
  });

  it("asks food_kitchens and events, which are the authorities", () => {
    expect(src).toContain('.from("food_kitchens").select("store_id").in("store_id", ids)');
    expect(src).toContain('.from("events").select("store_id").in("store_id", ids)');
  });

  it("treats a store that is both a kitchen and an event as a kitchen", () => {
    expect(src).toContain('kitchens.has(id) ? "kitchen" : events.has(id) ? "events" : "shop"');
  });

  it("caches the resolver, which the layout calls three times a request", () => {
    expect(src).toContain("export const getAccessibleStores = cache(_getAccessibleStores)");
  });

  it("carries kind on the dashboard's store, not only in the layout", () => {
    expect(src).toContain("kind: kindOf(stores, row.id)");
  });
});

describe("the nav slot count no longer depends on kind", () => {
  const nav = readFileSync(
    join(process.cwd(), "components", "merchant", "MerchantNav.tsx"),
    "utf8",
  );

  it("reads slot three from the vocabulary instead of splicing a tab in", () => {
    // The splice gave kitchens EIGHT destinations where a shop had seven, which
    // at 375px put six of the eight cells under the 44px touch minimum.
    expect(nav).toContain("v.catalogue.href");
    expect(nav).toContain("v.catalogue.label");
    expect(nav).not.toContain("out.splice(3, 0,");
  });

  it("takes a kind, not a boolean", () => {
    expect(nav).toContain("kind = \"shop\"");
    expect(nav).not.toContain("isKitchen: boolean");
  });
});
