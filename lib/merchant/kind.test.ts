import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIND_VOCAB, MERCHANT_KINDS, vocabFor, type MerchantKind } from "./kind";
import { HOME_BLOCKS } from "@/components/merchant/home/blocks";

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
    // A service is not delivered or collected. Whether they travel is
    // trade_providers.mobile — a fact about the trade, not a fulfilment method.
    expect(KIND_VOCAB.service.hasFulfilmentChoice).toBe(false);
  });

  it("does not report stock for a business that sells time", () => {
    // A car wash with every Saturday slot taken is not out of stock, it is
    // fully booked. "12 low stock items" is the same wrong sentence a kitchen
    // was being shown before M81.
    expect(KIND_VOCAB.service.hasStock).toBe(false);
    expect(HOME_BLOCKS.service).not.toContain("Stock");
  });

  it("resolves through vocabFor for every kind", () => {
    for (const k of MERCHANT_KINDS) expect(vocabFor(k)).toBe(KIND_VOCAB[k]);
  });

  // The guarantee a boolean cannot give: adding a member breaks the build until
  // every Record is filled. This documents it for the next reader.
  it("is exhaustive by type, so a new kind cannot be silently defaulted", () => {
    const seen: Record<MerchantKind, boolean> = {
      shop: true,
      kitchen: true,
      events: true,
      service: true,
    };
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

  it("asks food_kitchens, events and trade_providers, which are the authorities", () => {
    expect(src).toContain('.from("food_kitchens").select("store_id").in("store_id", ids)');
    expect(src).toContain('.from("events").select("store_id").in("store_id", ids)');
    expect(src).toContain('.from("trade_providers").select("store_id").in("store_id", ids)');
  });

  it("resolves kind in a fixed precedence, whatever the formatting", () => {
    // A kitchen that also sells tickets is a kitchen: it cooks every day and
    // runs an event occasionally, so the daily job wins the console. A trade
    // sits below both — a kitchen that also details cars is primarily feeding
    // people.
    //
    // Asserted as an ORDER rather than as one literal line: the original
    // matched the exact single-line ternary, so adding a fourth kind broke a
    // test about precedence purely by reformatting it.
    const k = src.indexOf('kitchens.has(id)');
    const e = src.indexOf('events.has(id)');
    const t = src.indexOf('trades.has(id)');
    expect(k, "kitchens.has(id) not found").toBeGreaterThan(-1);
    expect(e).toBeGreaterThan(k);
    expect(t).toBeGreaterThan(e);
    // And "shop" remains the fallback, never a positive branch.
    expect(src).toMatch(/:\s*"shop"\)/);
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
    join(process.cwd(), "lib", "merchant", "nav-links.ts"),
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
    // The PROPS live on the component; only the link tables moved.
    const component = readFileSync(
      join(process.cwd(), "components", "merchant", "MerchantNav.tsx"),
      "utf8",
    );
    expect(component).toContain('kind = "shop"');
    expect(component).not.toContain("isKitchen: boolean");
  });
});
