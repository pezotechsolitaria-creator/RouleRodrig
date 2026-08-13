import { describe, it, expect } from "vitest";
import {
  readFilters, listingHref, hasActiveFilters, activeFilterCount, EMPTY_FILTERS,
} from "./urls";

describe("readFilters", () => {
  it("reads a full query string", () => {
    const f = readFilters({
      q: "honey", category: "Honey", fulfillment: "pickup", seller: "Miel-Rodrigues",
      max: "50000", stock: "1", open: "1", sort: "price_asc", page: "3",
    });
    expect(f).toEqual({
      q: "honey", category: "honey", fulfillment: "pickup", seller: "miel-rodrigues",
      maxPrice: 50000, inStock: true, openNow: true, sort: "price_asc", page: 3,
    });
  });

  it("refuses a sort or fulfilment it does not know", () => {
    const f = readFilters({ sort: "cheapest_lol", fulfillment: "teleport" });
    expect(f.sort).toBe("recommended");
    expect(f.fulfillment).toBe("");
  });

  it("drops a nonsense price ceiling rather than quietly changing it", () => {
    expect(readFilters({ max: "-500" }).maxPrice).toBeNull();
    expect(readFilters({ max: "abc" }).maxPrice).toBeNull();
    expect(readFilters({ max: "999999999999" }).maxPrice).toBeNull();
    expect(readFilters({ max: "0" }).maxPrice).toBeNull();
  });

  it("clamps the page to something a human could have asked for", () => {
    expect(readFilters({ page: "0" }).page).toBe(1);
    expect(readFilters({ page: "-4" }).page).toBe(1);
    expect(readFilters({ page: "9999" }).page).toBe(50);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(readFilters({ q: ["honey", "chilli"] }).q).toBe("honey");
  });

  it("caps a pasted essay in the search box", () => {
    expect(readFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("listingHref", () => {
  it("keeps every other filter when one changes", () => {
    const f = { ...EMPTY_FILTERS, q: "honey", inStock: true, fulfillment: "pickup" };
    expect(listingHref("/shop/search", f, { category: "honey" })).toBe(
      "/shop/search?q=honey&category=honey&fulfillment=pickup&stock=1",
    );
  });

  it("resets the page whenever a FILTER changes", () => {
    const f = { ...EMPTY_FILTERS, page: 4 };
    expect(listingHref("/shop/search", f, { inStock: true })).toBe("/shop/search?stock=1");
  });

  it("keeps the page when paginating", () => {
    const f = { ...EMPTY_FILTERS, q: "honey", page: 2 };
    expect(listingHref("/shop/search", f, { page: 3 })).toBe("/shop/search?q=honey&page=3");
  });

  it("omits the default sort so a plain URL stays plain", () => {
    expect(listingHref("/shop/search", EMPTY_FILTERS)).toBe("/shop/search");
    expect(listingHref("/shop/search", { ...EMPTY_FILTERS, sort: "newest" })).toBe("/shop/search?sort=newest");
  });

  it("never repeats the category in the query on a category PAGE", () => {
    const f = { ...EMPTY_FILTERS, category: "honey", inStock: true };
    expect(listingHref("/shop/c/honey", f)).toBe("/shop/c/honey?stock=1");
  });

  it("clears a filter when it is overridden with an empty value", () => {
    const f = { ...EMPTY_FILTERS, category: "honey", q: "x" };
    expect(listingHref("/shop/search", f, { category: "" })).toBe("/shop/search?q=x");
  });
});

describe("filter counting", () => {
  it("does not count the free-text query as a filter chip", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: "honey" })).toBe(0);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: "honey" })).toBe(true);
  });

  it("counts each narrowing control once", () => {
    const f = { ...EMPTY_FILTERS, category: "honey", inStock: true, maxPrice: 5000, fulfillment: "pickup" };
    expect(activeFilterCount(f)).toBe(4);
  });

  it("ignores the category on a page that IS that category", () => {
    const f = { ...EMPTY_FILTERS, category: "honey", inStock: true };
    expect(activeFilterCount(f, true)).toBe(1);
    expect(hasActiveFilters(f, true)).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, category: "honey" }, true)).toBe(false);
  });
});
