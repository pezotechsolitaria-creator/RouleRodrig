import { describe, it, expect } from "vitest";
import { CHECKOUT_COPY, sellerWords, type SellerWords } from "./copy.i18n";
import { CART_DOMAINS } from "@/lib/cart/domains";
import { vocabFor } from "@/lib/food/vocabulary";

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
    // The failure this guards is the one that actually ships: a key added to
    // English during a change and forgotten in the other two, which renders as
    // the word "undefined" on the checkout of a form that takes money.
    const en = paths(CHECKOUT_COPY.en).sort();
    for (const l of ["fr", "cr"] as const) {
      expect(paths(CHECKOUT_COPY[l]).sort(), l).toEqual(en);
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
      walk(CHECKOUT_COPY[l], "");
    }
  });

  it("keeps the interpolating strings interpolating in every language", () => {
    for (const l of LANGS) {
      const c = CHECKOUT_COPY[l];
      // A number dropped out of one of these is a customer told they will be
      // delivered "within hours" or asked to pay "Rs ".
      expect(c.form.zone.within(3), l).toContain("3");
      expect(c.form.location.shared("-19.7", "63.4"), l).toContain("-19.7");
      expect(c.form.location.shared("-19.7", "63.4"), l).toContain("63.4");
      expect(c.form.submit.placeWithTotal("450.00"), l).toContain("450.00");
      expect(c.form.payment.noLocalAccountBody("Chez Marie"), l).toContain("Chez Marie");
      expect(c.cart.count(3, 2), l).toContain("3");
      expect(c.cart.count(3, 2), l).toContain("2");
      expect(c.cart.lowStock(4), l).toContain("4");
      expect(c.cart.fewer("Honey"), l).toContain("Honey");
      expect(c.cart.more("Honey"), l).toContain("Honey");
      expect(c.cart.remove("Honey"), l).toContain("Honey");
    }
  });

  it("names the seller in every sentence that takes one, in every language", () => {
    // These are the sentences that read "Cette shop est fermée" if the seller
    // words are ever dropped from a language.
    for (const l of LANGS) {
      const c = CHECKOUT_COPY[l];
      for (const domain of CART_DOMAINS) {
        const s = sellerWords(l, domain);
        const sentences = [
          c.form.blocked.phone(s),
          c.form.blocked.payment(s),
          c.form.blocked.closed(s),
          c.form.blocked.quote(s),
          c.form.schedule.closedNow(s),
          c.form.fulfilment.closed(s),
          c.form.fulfilment.noRrDelivery(s),
          c.form.details.notesPlaceholder(s),
          c.form.payment.noBankDetails(s),
          c.form.payment.messageSeller(s),
          c.form.payment.expect.guestReceipt(s),
          c.form.payment.expect.receipt(s),
          c.form.payment.expect.guest(s),
          c.form.payment.expect.plain(s),
        ];
        for (const [i, sentence] of sentences.entries()) {
          const namesTheSeller = [s.the, s.theCap, s.thisCap, s.poss].some((f) =>
            sentence.includes(f),
          );
          expect(namesTheSeller, `${l}.${domain}[${i}] — ${sentence}`).toBe(true);
        }
      }
    }
  });

  it("gives the seller a distinct word for each kind of seller", () => {
    // A shop, a kitchen and a ticket organiser are three different things to a
    // reader. If two of them collapse to one word the vocabulary is doing
    // nothing and the sentences may as well say "the seller".
    for (const l of LANGS) {
      const forms = CART_DOMAINS.map((d) => sellerWords(l, d).the);
      expect(new Set(forms).size, l).toBe(CART_DOMAINS.length);
    }
  });
});

describe("the English says exactly what it said before extraction", () => {
  it("reproduces the seller nouns lib/food/vocabulary.ts supplies", () => {
    // The seller words are carried here because lib/food/vocabulary.ts is not
    // translated. English must still come out byte-identical, or this stopped
    // being a translation and became a rewrite.
    for (const domain of CART_DOMAINS) {
      const s: SellerWords = sellerWords("en", domain);
      const noun = vocabFor(domain).seller;
      expect(s.the, domain).toBe(`the ${noun}`);
      expect(s.theCap, domain).toBe(`The ${noun}`);
      expect(s.thisCap, domain).toBe(`This ${noun}`);
      expect(s.poss, domain).toBe(`the ${noun}'s`);
    }
  });

  it("reproduces the two SellerVocab sentences it took over", () => {
    // blockedReason and the notes field used to read these straight off
    // lib/food/vocabulary.ts. They moved so the surrounding sentences could be
    // translated with them; the English must not have moved with them.
    for (const domain of CART_DOMAINS) {
      const v = vocabFor(domain);
      const s = sellerWords("en", domain);
      expect(CHECKOUT_COPY.en.form.blocked.phone(s), domain).toBe(v.phoneReason);
      expect(CHECKOUT_COPY.en.form.details.notesPlaceholder(s), domain).toBe(
        v.notesPlaceholder,
      );
    }
  });

  it("keeps the pluralised cart header English", () => {
    expect(CHECKOUT_COPY.en.cart.count(1, 1)).toBe("1 item from 1 seller");
    expect(CHECKOUT_COPY.en.cart.count(2, 3)).toBe("2 items from 3 sellers");
  });
});
