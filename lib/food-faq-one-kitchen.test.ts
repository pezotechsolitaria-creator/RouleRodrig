import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { foodFaq } from "./food-faq";
import { buildLlmsFullTxt, unreadLlmsData } from "./llms-txt";

// ── ONE KITCHEN, NOT "ISLAND KITCHENS" (SEO audit 2026-09-29 C8, line 5) ────
//
// llms.txt stopped saying "island kitchens" — Chez Banane is the only kitchen —
// but the first food FAQ answer said it in both languages, and /llms-full.txt
// publishes every food answer that carries no Rs figure. So the claim C8
// removed came straight back, in the file answer engines read with our name
// on it. This builds that file from the real FAQ with a one-kitchen catalog.

const ONE_KITCHEN = {
  ...unreadLlmsData("https://roulerodrig.com"),
  food: {
    kitchens: [{ name: "Chez Banane", address: "Rivière Banane", minNoticeHours: 24 }],
    dishPrices: [100000, 250000],
    deliveryEnabled: false,
  },
};

const PLURAL = /island kitchens|cuisines de l.île/i;

describe("the food answers claim no kitchens plural", () => {
  it("in /llms-full.txt, English and French", () => {
    const full = buildLlmsFullTxt(ONE_KITCHEN);
    // The answer is still there — only the plural went.
    expect(full).toContain("Yes. Dishes are listed with their price, and you order on the site");
    expect(full).toContain("Oui. Les plats sont proposés avec leur prix, et vous commandez sur le site");
    expect(full).not.toMatch(PLURAL);
  });

  it("in the FAQ /food renders and marks up", () => {
    for (const f of [...foodFaq("en"), ...foodFaq("fr")]) expect(f.answer).not.toMatch(PLURAL);
  });

  it("in the same answer on /fr/manger-a-rodrigues", () => {
    const page = readFileSync(join(__dirname, "..", "app", "fr", "manger-a-rodrigues", "page.tsx"), "utf8");
    const answer = page.match(/a: "Oui\. Les plats[^"]*"/)?.[0] ?? "";
    expect(answer).toContain("Les plats sont proposés avec leur prix");
    expect(answer).not.toMatch(PLURAL);
  });
});
