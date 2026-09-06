import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { primaryFor, secondaryFor } from "@/lib/merchant/nav-links";
import { MERCHANT_KINDS, KIND_VOCAB } from "@/lib/merchant/kind";

// ── FIVE SLOTS, AND THE SAME FIVE FOR EVERY KIND ────────────────────────────
//
// The dock shipped SEVEN destinations, and EIGHT once a kitchen's Menu tab was
// spliced in. At 375px that puts six of a kitchen's eight cells under the 44px
// touch minimum — the floor the file's own comment claims to clear, because it
// measures min-h-[56px], the height, not the width.

const nav = readFileSync(join(process.cwd(), "lib", "merchant", "nav-links.ts"), "utf8");

describe("the dock", () => {
  it("has exactly five slots for every kind", () => {
    // Counted from what primaryFor RETURNS, not from how many `href:` literals
    // the source happens to contain. A trade substitutes its Diary for Orders
    // the way a kitchen substitutes its Menu for Products, so the source now
    // holds six literals and still builds five cells — and the number that
    // matters is the one a thumb meets at 375px.
    for (const kind of MERCHANT_KINDS) {
      expect(primaryFor(kind).map((l) => l.href), kind).toHaveLength(5);
    }
  });

  it("keeps Home first and More last, whatever the middle says", () => {
    // What muscle memory actually depends on when somebody switches between
    // two of their own businesses: the ends do not move.
    for (const kind of MERCHANT_KINDS) {
      const hrefs = primaryFor(kind).map((l) => l.href);
      expect(hrefs[0], kind).toBe("/merchant");
      expect(hrefs[4], kind).toBe("/merchant/more");
    }
  });

  it("fills slot three from the vocabulary rather than splicing a tab in", () => {
    expect(nav).toContain("v.catalogue.href");
    expect(nav).not.toContain("splice(3, 0,");
  });

  it("ends on More, which is where everything demoted lives", () => {
    expect(nav).toContain('href: "/merchant/more"');
  });
});

describe("secondaryFor — what More shows", () => {
  it("reaches the pickup desk, which no merchant screen linked to before", () => {
    for (const kind of MERCHANT_KINDS) {
      const hrefs = secondaryFor(kind, false).map((l) => l.href);
      expect(hrefs, `${kind} cannot reach pickup`).toContain("/merchant/pickup");
    }
  });

  it("keeps Products reachable for a kitchen, whose slot three is its Menu", () => {
    // The regression that would be silent: a kitchen's catalogue disappearing
    // because the Menu took its place in the dock.
    const hrefs = secondaryFor("kitchen", false).map((l) => l.href);
    expect(hrefs).toContain("/merchant/products");
  });

  it("does not list a shop's catalogue twice", () => {
    // A shop's slot three IS /merchant/products, so repeating it in More would
    // be the same destination in two places.
    const hrefs = secondaryFor("shop", false).map((l) => l.href);
    expect(hrefs.filter((h) => h === "/merchant/products")).toHaveLength(0);
    expect(KIND_VOCAB.shop.catalogue.href).toBe("/merchant/products");
  });

  it("shows Plan only when a plan is charged", () => {
    expect(secondaryFor("shop", false).map((l) => l.href)).not.toContain("/merchant/subscription");
    expect(secondaryFor("shop", true).map((l) => l.href)).toContain("/merchant/subscription");
  });

  it("never repeats a destination", () => {
    for (const kind of MERCHANT_KINDS) {
      const hrefs = secondaryFor(kind, true).map((l) => l.href);
      expect(new Set(hrefs).size, `${kind} repeats a link`).toBe(hrefs.length);
    }
  });

  it("never duplicates anything already in the dock", () => {
    // THIS KIND'S dock, not a hardcoded one. Orders is a dock slot for a shop
    // and a More row for a trade, and both are correct — what must never
    // happen is the same destination appearing twice for one business.
    for (const kind of MERCHANT_KINDS) {
      const dock = primaryFor(kind).map((l) => l.href);
      for (const l of secondaryFor(kind, true)) {
        expect(dock, `${l.href} is in both the dock and More`).not.toContain(l.href);
        expect(l.href, `${l.href} duplicates ${kind}'s catalogue tab`).not.toBe(
          KIND_VOCAB[kind].catalogue.href,
        );
      }
    }
  });
});

describe("/merchant/more is generated, not hand-written", () => {
  const page = readFileSync(
    join(process.cwd(), "app", "merchant", "(app)", "more", "page.tsx"),
    "utf8",
  );

  it("reads the same function the dock reads", () => {
    // The old home screen hand-copied six destinations into a tile grid beside
    // a seven-item dock, so the two could disagree about where a merchant could
    // go. One source is the fix.
    expect(page).toContain("secondaryFor(kind, billing.chargesSubscription)");
  });

  it("hardcodes no hrefs of its own", () => {
    expect(page).not.toMatch(/href="\/merchant\//);
  });
});
