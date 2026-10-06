import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";
import { fillPriceTokens, priceTokenValues, withPriceTokens } from "./price-tokens";

// ── FAQ prices that keep themselves current (6 Oct 2026) ────────────────────
//
// "{scooter_1_day}" in an answer reads "Rs 1,699" on the site, and the next
// figure the owner sets in /admin the moment he saves it.

const veh = (id: string, category: string, price: string) =>
  ({ ...DEFAULT_CONTENT.fleet[0], id, category, price }) as SiteContent["fleet"][number];

const content = (o: { list?: object; carsOn?: boolean } = {}): SiteContent =>
  ({
    ...DEFAULT_CONTENT,
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true, ...(o.list ? { dayRates: o.list } : {}) },
      { id: "car", label: "Cars", enabled: o.carsOn ?? true },
    ],
    fleet: [
      veh("s1", "scooter", "Rs 799"),
      veh("c1", "car", "Rs 2,599"),
      veh("c2", "car", "Rs 1,899"),
      veh("draft", "car", "From Rs 0"),
    ],
    faq: {
      ...DEFAULT_CONTENT.faq,
      items: [
        {
          id: "faq-price",
          question: "How much?",
          answer: "Scooters cost {scooter_1_day} for one day, {scooter_2_days} for two, and {scooter_per_day} a day from three. Cars from {car_from}.",
          answerFr: "Un scooter coûte {scooter_1_day} pour une journée.",
          answerCr: "Enn skooter kout {scooter_1_day} pou enn zour.",
        },
        { id: "plain", question: "Plain?", answer: "No prices here." },
      ],
    },
  }) as unknown as SiteContent;

describe("priceTokenValues", () => {
  it("reads the published scooter list and the cheapest priced car", () => {
    expect(priceTokenValues(content())).toEqual({
      scooter_1_day: 1699,
      scooter_2_days: 1798,
      scooter_per_day: 799,
      car_from: 1899,
    });
  });

  it("follows the list the owner set in /admin", () => {
    const v = priceTokenValues(content({ list: { oneDay: 1500, twoDays: 850, threePlus: 750 } }));
    expect([v.scooter_1_day, v.scooter_2_days, v.scooter_per_day]).toEqual([1500, 1700, 750]);
  });

  it("names no car price while cars are switched off", () => {
    expect(priceTokenValues(content({ carsOn: false })).car_from).toBeNull();
  });
});

describe("fillPriceTokens", () => {
  const v = { scooter_1_day: 1699, scooter_2_days: 1798, scooter_per_day: 799, car_from: null };

  it("writes Rs figures, grouped the way each language reads them", () => {
    expect(fillPriceTokens("{scooter_1_day} / {scooter_2_days}", v, "en")).toBe("Rs 1,699 / Rs 1,798");
    expect(fillPriceTokens("{scooter_1_day}", v, "fr")).toBe("Rs 1 699");
    expect(fillPriceTokens("{scooter_1_day}", v, "cr")).toBe("Rs 1,699");
  });

  it("never prints a placeholder or a made-up figure for an unknown price", () => {
    expect(fillPriceTokens("Cars from {car_from}.", v)).toBe("Cars from Rs —.");
  });

  it("leaves other braces and plain text alone", () => {
    expect(fillPriceTokens("{not_a_token} and text", v)).toBe("{not_a_token} and text");
    expect(fillPriceTokens("", v)).toBe("");
  });
});

describe("withPriceTokens", () => {
  it("fills every language of every answer", () => {
    const [q] = withPriceTokens(content()).faq.items;
    expect(q.answer).toBe(
      "Scooters cost Rs 1,699 for one day, Rs 1,798 for two, and Rs 799 a day from three. Cars from Rs 1,899.",
    );
    expect(q.answerFr).toBe("Un scooter coûte Rs 1 699 pour une journée.");
    expect(q.answerCr).toBe("Enn skooter kout Rs 1,699 pou enn zour.");
  });

  it("hands back the same object when there is nothing to fill", () => {
    const c = { ...content(), faq: { ...DEFAULT_CONTENT.faq, items: [{ id: "x", question: "q", answer: "a" }] } } as SiteContent;
    expect(withPriceTokens(c)).toBe(c);
  });

  it("runs on the public read, after the cache, and never on the admin read", () => {
    const src = readFileSync(join(process.cwd(), "lib", "content.ts"), "utf8");
    expect(src).toContain("return withPriceTokens(withCodeMigrations(withoutHidden(await readPublicContentAt(version))));");
    expect(src).toContain("return withPriceTokens(withoutHidden((await getContentWithStatus()).content));");
    // getContentWithStatus() itself — what /admin edits — stays raw, so the
    // owner keeps the placeholder he typed.
    expect(src).toContain("export const getContentWithStatus = cache(readContentUncached);");
    const at = src.indexOf("async function readContentUncached");
    expect(at).toBeGreaterThan(0);
    const end = src.indexOf("export const getContentWithStatus", at);
    expect(src.slice(at, end)).not.toContain("withPriceTokens");
  });
});
