import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { payLineKey, cannotBePaid } from "./pay-line";
import { SHOP_COPY } from "@/lib/shop/copy.i18n";

// ── "PAY {SHOP} DIRECT BY BANK TRANSFER" — ONLY WHEN IT IS TRUE ─────────────
//
// The product page printed that sentence for every shop, including shops with
// no bank account and no cash. On 23 Sept 2026 "Rodrigues Repairs (TEST)"
// promised a bank transfer on its product page while store_payment_options()
// returned cash=false, bank=false — and its checkout then said the shop
// "cannot take orders".

describe("the sentence follows what the shop can actually take", () => {
  it("both methods", () => {
    expect(payLineKey({ cash: true, bank: true })).toBe("product.payBankOrCash");
  });
  it("bank transfer only — the old sentence, now only where it is true", () => {
    expect(payLineKey({ cash: false, bank: true })).toBe("product.payDirect");
  });
  it("cash only", () => {
    expect(payLineKey({ cash: true, bank: false })).toBe("product.payCash");
  });
  it("neither — says so, instead of promising a transfer", () => {
    expect(payLineKey({ cash: false, bank: false })).toBe("product.payNone");
  });
  it("unknown names NO method, rather than guessing one", () => {
    expect(payLineKey(null)).toBe("product.payAtCheckout");
  });
});

describe("the dead end is only declared when it is known", () => {
  it("neither method → cannot be paid", () => {
    expect(cannotBePaid({ cash: false, bank: false })).toBe(true);
  });
  it("an unreadable answer is not evidence of a dead end", () => {
    expect(cannotBePaid(null)).toBe(false);
  });
  it("any one method → can be paid", () => {
    expect(cannotBePaid({ cash: true, bank: false })).toBe(false);
    expect(cannotBePaid({ cash: false, bank: true })).toBe(false);
  });
});

describe("every sentence exists in all three languages, naming the shop", () => {
  const keys = ["payBankOrCash", "payDirect", "payCash", "payNone", "payAtCheckout"] as const;
  for (const lang of ["en", "fr", "cr"] as const) {
    it(lang, () => {
      for (const k of keys) {
        const line = SHOP_COPY[lang].product[k]("Chez Marie");
        expect(line, `${lang}.${k}`).toContain("Chez Marie");
      }
    });
  }

  it("only the bank-transfer sentences mention a bank transfer", () => {
    // The whole point: payCash and payNone must never slip the promise back in.
    expect(SHOP_COPY.en.product.payCash("X")).not.toMatch(/transfer/i);
    expect(SHOP_COPY.en.product.payNone("X")).not.toMatch(/by bank transfer/i);
    expect(SHOP_COPY.fr.product.payCash("X")).not.toMatch(/virement/i);
    expect(SHOP_COPY.cr.product.payCash("X")).not.toMatch(/vireman/i);
  });
});

describe("the product page uses the real answer", () => {
  const page = readFileSync("app/shop/[storeSlug]/[productSlug]/page.tsx", "utf8");
  const catalog = readFileSync("lib/marketplace/catalog.ts", "utf8");

  it("no longer hard-codes the bank-transfer sentence", () => {
    expect(page).not.toContain('k="product.payDirect"');
    expect(page).toContain("<TName k={payLineKey(payment)} v={p.store.name} />");
  });

  it("reads store_payment_options — the same answer checkout uses", () => {
    expect(catalog).toContain('supabase.rpc("store_payment_options"');
    // Booleans only. store_payment_settings holds bank ACCOUNTS and must never
    // be read from a public page (see its RLS note).
    expect(catalog).not.toMatch(/from\(["']store_payment_settings["']\)/);
  });

  it("does not add a round trip: read in parallel with the related products", () => {
    expect(page).toMatch(/Promise\.all\(\[\s*relatedProducts\([\s\S]*?getStorePaymentOptions\(supabase, p\.store\.id\)/);
  });

  it("lights the help pill when the shop cannot be paid", () => {
    expect(page).toContain("emphasis={!p.store.acceptingOrders || unpayable}");
  });

  it("returns null on failure so the page names no method", () => {
    expect(catalog).toMatch(/store_payment_options failed[\s\S]{0,60}return null/);
  });

  it("treats NO ROWS as unknown, not as 'cannot be paid'", () => {
    // store_payment_options() answers only for visible shops (or staff/admin):
    // as anon it returns ZERO rows for a hidden shop — verified 23 Sept 2026
    // on a draft test shop, while the visible Chez Banane returned one row
    // (cash=f, bank=f). Zero rows must mean "unknown" → null, never "neither".
    expect(catalog).toContain("Array.isArray(data) ? data[0] : data");
    expect(catalog).toMatch(/if \(!row\) return null;/);
  });
});
