import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHEET } from "@/test/transfer-sheet.fixture";
import {
  money,
  moneyFr,
  portMathurin,
  timeSentences,
  timeSentencesFr,
  transferFaq,
  zoneFaresSentence,
  zoneFaresSentenceFr,
} from "./transfers-faq";

// ── ONE SET OF WORDS FOR THE AIRPORT PRICE LIST (SEO audit 2026-09-29 C2) ───
//
// /transfers, /taxi, /fr/taxi-rodrigues, /llms.txt and /llms-full.txt all say
// the zone fares now, through this module. SHEET's numbers are deliberately
// not the live ones (see test/transfer-sheet.fixture.ts).

const SRC = readFileSync(join(process.cwd(), "lib", "transfers-faq.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("every number comes from the sheet", () => {
  it("types no fare, zone line or band hour", () => {
    expect(CODE).not.toMatch(/Rs\s?\d/);
    expect(CODE).not.toMatch(/\b(7|15) km\b/);
    expect(CODE).not.toMatch(/(17|21|22):00|04:59/);
  });

  it("prints the sheet's three fares with their zone lines", () => {
    expect(zoneFaresSentence(SHEET)).toBe(
      "Rs 1,111 up to 6 km, Rs 1,444 over 6 and under 13 km, and Rs 1,777 for 13 km and over",
    );
    const fr = zoneFaresSentenceFr(SHEET);
    expect(fr).toContain(`${moneyFr(111100)} jusqu'à 6 km`);
    expect(fr).toContain(`${moneyFr(177700)} à partir de 13 km`);
  });

  it("groups money the way the rest of the site writes it", () => {
    expect(money(111100)).toBe("Rs 1,111");
    expect(money(111150)).toBe("Rs 1,111.50");
    // French grouping is fr-FR's own (a narrow no-break space), as on every /fr page.
    expect(moneyFr(111100)).toBe(`Rs ${(1111).toLocaleString("fr-FR")}`);
  });

  it("finds Port Mathurin in the sheet, never in a list of its own", () => {
    expect(portMathurin(SHEET)?.zone).toBe(3);
    expect(portMathurin(null)).toBeNull();
    expect(portMathurin({ ...SHEET, places: [] })).toBeNull();
  });
});

describe("the evening and night bands, as the engine applies them (M221)", () => {
  it("states the evening surcharge and the hand-priced night, in both languages", () => {
    expect(timeSentences(SHEET)).toEqual([
      "Evening transfers (17:00–21:59) add Rs 321 per trip, included in the fare you are shown.",
      "Night transfers (22:00–04:59) are priced by hand: the fare is agreed with you, not fixed in advance.",
    ]);
    const fr = timeSentencesFr(SHEET);
    expect(fr[0]).toContain("du soir (17:00–21:59)");
    expect(fr[0]).toContain(moneyFr(32100));
    expect(fr[1]).toContain("de nuit (22:00–04:59)");
    expect(fr[1]).toContain("le prix est convenu avec vous");
  });

  it("advertises no band that is switched off", () => {
    const off = { ...SHEET, nightMode: "none" as const, eveningMode: "none" as const };
    expect(timeSentences(off)).toEqual([]);
    expect(timeSentencesFr(off)).toEqual([]);
  });
});

describe("the /transfers FAQ", () => {
  it("asks the price questions only when the sheet was read", () => {
    const none = transferFaq({ airport: null, ferry: null });
    expect(none.map((f) => f.q)).toEqual([
      "Can I book an airport transfer before I arrive in Rodrigues?",
      "Will the driver meet me at arrivals?",
      "What is the airport in Rodrigues called?",
      "Can I book the return trip to the airport as well?",
    ]);
    expect(none.map((f) => f.a).join(" ")).not.toMatch(/Rs\s?\d/);
  });

  it("answers the Port Mathurin query from the sheet's own zone and distance", () => {
    const faq = transferFaq({ airport: SHEET, ferry: 99900 });
    const pm = faq.find((f) => f.q.includes("Port Mathurin"));
    expect(pm?.a).toBe(
      "Rs 1,777 one way. Port Mathurin is 18.2 km from Plaine Corail by road, which puts it in Zone 3. Booked as a return package, it is Rs 1,666 each way.",
    );
    expect(faq[0].a).toContain("The ferry terminal at Port Mathurin is Rs 999.");
    expect(faq.map((f) => f.q)).toContain("What about evening and night arrivals?");
  });

  it("describes the fare as fixed, not metered", () => {
    const first = transferFaq({ airport: SHEET, ferry: null })[0].a;
    expect(first).toMatch(/rather than a meter/);
  });
});
