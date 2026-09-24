import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RIDES_COPY } from "./rides/copy.i18n";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

// ── THE STRINGS WERE WRITTEN. NOTHING RENDERED THEM. ────────────────────────
//
// lib/rides/copy.i18n.ts carries c.done.body, c.done.keepReference,
// c.summary.route/dayHire/passengers in English, French and Kreol, and
// copy.i18n.test.ts asserts all three are correct. That test was green while
// BookRide.tsx rendered English literals two lines below the translated
// heading — so a French customer completed a fully translated three-step
// wizard and met English on the one screen that matters, the one carrying
// their reference.
//
// A test that only checks the dictionary cannot see that. These check the
// screen.

describe("the ride screens render the copy that exists for them", () => {
  const SRC = read("app", "taxi", "book", "BookRide.tsx");

  it("uses the confirmation strings instead of repeating them in English", () => {
    for (const key of ["c.done.body", "c.done.keepReference"]) {
      expect(SRC, key).toContain(key);
    }
    // The literals that used to sit where those now are.
    expect(SRC).not.toContain("No need to call anyone");
    expect(SRC).not.toContain("Keep this reference");
  });

  it("uses the summary builders instead of formatting in English", () => {
    expect(SRC).toContain("c.summary.route(");
    expect(SRC).toContain("c.summary.dayHire(");
    expect(SRC).toContain("c.summary.passengers(");
    expect(SRC).not.toContain("driver for the day`");
    expect(SRC).not.toContain('? "person" : "people"');
  });

  it("asks for the price in the visitor's language", () => {
    expect(SRC).toContain("c.price.confirmWithYou");
    expect(SRC).not.toContain("We'll confirm the price with you.");
  });

  it("dates the summary in the visitor's locale, not always en-GB", () => {
    expect(SRC).toContain("const dateLocale = language === \"en\" ? \"en-GB\" : \"fr-FR\"");
    expect(SRC).toContain("islandWhenLabel(when, dateLocale)");
  });

  it("every string it now reads exists in all three languages", () => {
    // The other half: a screen can only render what the dictionary has.
    for (const lang of ["en", "fr", "cr"] as const) {
      const b = RIDES_COPY[lang].book;
      expect(b.done.body.length, lang).toBeGreaterThan(10);
      expect(b.done.keepReference.length, lang).toBeGreaterThan(10);
      expect(b.price.confirmWithYou.length, lang).toBeGreaterThan(5);
      expect(b.summary.route("A", "B"), lang).toContain("A");
      expect(b.summary.dayHire("A"), lang).toContain("A");
      expect(b.summary.passengers(1), lang).toMatch(/1/);
      expect(b.summary.passengers(4), lang).toMatch(/4/);
    }
  });

  it("the three languages are genuinely different, not English copied", () => {
    // A "translation" that is the English string is how a dictionary looks
    // full and reads empty.
    const en = RIDES_COPY.en.book;
    expect(RIDES_COPY.fr.book.done.body).not.toBe(en.done.body);
    expect(RIDES_COPY.cr.book.done.body).not.toBe(en.done.body);
    expect(RIDES_COPY.fr.book.price.confirmWithYou).not.toBe(en.price.confirmWithYou);
  });
});

describe("the food fulfilment switch speaks the visitor's language", () => {
  const SRC = read("components", "food", "FulfillmentBar.tsx");

  it("reads its labels from the dictionary", () => {
    for (const key of [
      "t.common.chipPickup", "t.common.chipDelivered", "t.common.deliveryPaused",
      "t.common.weBringItToYou", "t.common.shareLocationAtCheckout",
    ]) {
      expect(SRC, key).toContain(key);
    }
  });

  it("no longer hardcodes the only place the delivery fee appears", () => {
    // "We bring it to you — from Rs 150 depending on the area" was the one
    // statement of the fee before checkout, and it was English-only.
    expect(SRC).not.toContain("We bring it to you\n");
    expect(SRC).not.toContain("delivery is paused.<");
    // Checked as an IMPORT, not as a substring: the comment above the fix
    // names the function, and a test that greps prose fails on its own
    // explanation.
    expect(SRC).not.toContain('from "@/lib/shop/plain-words"');
  });
});

describe("the French pages declare their language before any JavaScript", () => {
  it("wraps them in a server-rendered lang", () => {
    const SRC = read("app", "fr", "layout.tsx");
    expect(SRC).toContain('lang="fr"');
    // A wrapper, deliberately: only the root layout renders <html>, and
    // reaching for the request headers there would opt every page into
    // dynamic rendering to win one attribute. Asserted as an import, because
    // the file's own comment explains that choice in prose.
    expect(SRC).not.toContain('from "next/headers"');
  });
});
