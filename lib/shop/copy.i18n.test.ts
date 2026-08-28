import { describe, it, expect } from "vitest";
import { SHOP_COPY, UNCATEGORISED } from "./copy.i18n";
import { PRODUCT_SORTS } from "@/lib/marketplace/types";
import { WEEKDAYS } from "@/lib/schedule";

// The same guard lib/delivery/copy.i18n.test.ts runs, for the same reason: the
// failure that actually ships is a key added to English during a change and
// forgotten in the other two, which renders as the word "undefined" on
// somebody's phone in Port Mathurin.

const LANGS = ["en", "fr", "cr"] as const;

/** Every leaf path in an object, so a missing key is a failure with a name. */
function paths(v: unknown, prefix = ""): string[] {
  if (Array.isArray(v)) return [`${prefix}[]${v.length}`];
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => paths(x, prefix ? `${prefix}.${k}` : k));
  }
  return [`${prefix}:${typeof v}`];
}

describe("nobody sees a missing translation", () => {
  it("gives all three languages exactly the same keys and types", () => {
    const en = paths(SHOP_COPY.en).sort();
    for (const l of ["fr", "cr"] as const) {
      expect(paths(SHOP_COPY[l]).sort(), l).toEqual(en);
    }
  });

  it("leaves no string empty in any language", () => {
    for (const l of LANGS) {
      const walk = (v: unknown, at: string): void => {
        if (typeof v === "string") {
          expect(v.trim(), `${l}.${at}`).not.toBe("");
          return;
        }
        if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`));
        if (v && typeof v === "object") {
          Object.entries(v).forEach(([k, x]) => walk(x, `${at}.${k}`));
        }
      };
      walk(SHOP_COPY[l], "");
    }
  });

  it("keeps the interpolating strings interpolating in every language", () => {
    for (const l of LANGS) {
      const c = SHOP_COPY[l];
      expect(c.header.backTo("X"), l).toContain("X");
      expect(c.counts.products(4), l).toContain("4");
      expect(c.counts.items(4), l).toContain("4");
      expect(c.counts.reviews(4), l).toContain("4");
      expect(c.home.deliveryFrom("120"), l).toContain("120");
      expect(c.home.openStore("Chez Marie"), l).toContain("Chez Marie");
      // The seller pitch is generated prose from lib/marketplace/fees.ts. If it
      // ever stopped being interpolated the page would promise nothing about
      // money at all.
      expect(c.home.sellHere("PITCH"), l).toContain("PITCH");
      expect(c.home.launch.sellerBody("PITCH"), l).toContain("PITCH");
      expect(c.listing.page(2, 7), l).toContain("2");
      expect(c.listing.page(2, 7), l).toContain("7");
      expect(c.listing.nothingFor("dimiel"), l).toContain("dimiel");
      expect(c.filters.under("500.00"), l).toContain("500.00");
      expect(c.product.payDirect("Chez Marie"), l).toContain("Chez Marie");
      expect(c.buy.addedToast(2, "Dimiel"), l).toContain("Dimiel");
      expect(c.buy.addedToast(2, "Dimiel"), l).toContain("2");
      expect(c.buy.alreadyInBasket(3, "Chez Marie"), l).toContain("Chez Marie");
      expect(c.gallery.photo(2, 5), l).toContain("2");
      expect(c.rating.outOfFive("4.5"), l).toContain("4.5");
    }
  });

  it("labels every sort the RPC accepts", () => {
    // SORT_LABEL's keys are wire format — the only strings browse_products
    // takes. A chip with no label renders as an empty pill you cannot read.
    for (const l of LANGS) {
      for (const s of PRODUCT_SORTS) {
        expect(SHOP_COPY[l].sort[s], `${l}.${s}`).toBeTruthy();
      }
    }
  });

  it("names all seven days, in the database's Sunday-zero order", () => {
    // StoreHoursCard indexes this with the DB's weekday number, exactly as it
    // used to index lib/schedule's WEEKDAYS. A short array would render
    // "undefined" against Saturday's hours.
    for (const l of LANGS) {
      expect(SHOP_COPY[l].hours.weekdays, l).toHaveLength(WEEKDAYS.length);
    }
    expect(SHOP_COPY.en.hours.weekdays).toEqual([...WEEKDAYS]);
  });

  it("keeps the uncategorised sentinel out of the translations", () => {
    // UNCATEGORISED is a grouping key and an anchor seed (#cat-more), not copy.
    // If it ever drifted, the storefront's jump rail would scroll to nothing.
    expect(UNCATEGORISED).toBe("More");
    expect(SHOP_COPY.fr.store.moreSection).not.toBe(UNCATEGORISED);
    expect(SHOP_COPY.cr.store.moreSection).not.toBe(UNCATEGORISED);
  });
});
