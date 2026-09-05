import { describe, it, expect } from "vitest";
import { vocabFor, domainFromFlags, SHOP_VOCAB, FOOD_VOCAB, EVENT_VOCAB } from "./vocabulary";

// These guard the specific failure the owner reported: a food customer being
// offered "Continue shopping" into the shop directory. Every assertion here is
// about a customer ending up on the WRONG page, which is the whole reason the
// vocabulary exists.

describe("domainFromFlags", () => {
  it("reads a kitchen as food", () => {
    expect(domainFromFlags({ isFood: true })).toBe("food");
  });

  it("reads an event store as events", () => {
    expect(domainFromFlags({ isEvent: true })).toBe("events");
  });

  it("falls back to shop when neither flag is set", () => {
    expect(domainFromFlags({})).toBe("shop");
    expect(domainFromFlags({ isFood: false, isEvent: false })).toBe("shop");
  });

  it("survives nulls from the wire", () => {
    // lookup_order() returns SQL nulls, not undefined, and a null must not be
    // read as "true" by a truthiness slip.
    expect(domainFromFlags({ isFood: null, isEvent: null })).toBe("shop");
  });

  it("prefers food when both somehow arrive", () => {
    // A store cannot be both, but if data ever said so the answer must be
    // deterministic rather than dependent on property order.
    expect(domainFromFlags({ isFood: true, isEvent: true })).toBe("food");
  });
});

describe("vocabFor", () => {
  it("never sends a food customer to the shop directory", () => {
    expect(vocabFor("food").browseHref).toBe("/food");
    expect(vocabFor("food").browseLabel).not.toMatch(/shop/i);
    expect(vocabFor("food").browseEmptyLabel).not.toMatch(/shop/i);
  });

  it("never sends a ticket holder to the shop directory", () => {
    // Events are off the website (2026-08-29): /events redirects home, so the
    // events-cart "continue browsing" goes home directly rather than through a
    // redirect. The original point of this test still holds — never the shop.
    expect(vocabFor("events").browseHref).toBe("/");
    expect(vocabFor("events").browseLabel).not.toMatch(/shop/i);
  });

  it("leaves the marketplace exactly as it was", () => {
    expect(vocabFor("shop")).toEqual(SHOP_VOCAB);
    expect(vocabFor("shop").browseHref).toBe("/shop");
  });

  it("falls back to shop for an unknown or missing domain", () => {
    expect(vocabFor(null)).toEqual(SHOP_VOCAB);
    expect(vocabFor(undefined)).toEqual(SHOP_VOCAB);
  });

  it("names the seller correctly for each domain", () => {
    expect(vocabFor("food").seller).toBe("kitchen");
    expect(vocabFor("events").seller).toBe("organiser");
    expect(vocabFor("shop").seller).toBe("shop");
  });

  it("does not promise a ticket holder something to collect", () => {
    // A ticket is scanned at the gate; "collect from the shop" would be a
    // straightforwardly false instruction.
    expect(EVENT_VOCAB.pickupHint).toMatch(/gate/i);
    expect(EVENT_VOCAB.pickupHint).not.toMatch(/collect from/i);
  });

  it("gives every domain a complete vocabulary", () => {
    // A missing key renders as `undefined` in the UI rather than failing, which
    // is the kind of hole that ships.
    for (const v of [SHOP_VOCAB, FOOD_VOCAB, EVENT_VOCAB]) {
      for (const [key, value] of Object.entries(v)) {
        expect(value, `${v.seller}.${key}`).toBeTruthy();
      }
    }
  });
});
