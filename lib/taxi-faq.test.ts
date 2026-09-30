import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHEET } from "@/test/transfer-sheet.fixture";
import { moneyFr } from "./transfers-faq";
import { taxiFaq, taxiFaqHeading, taxiFaqLd, taxiPriceAnswer, taxiServiceLd, TRANSFERS_LINK } from "./taxi-faq";

// ── /taxi ANSWERED NONE OF THE QUESTIONS IT EXISTS TO ANSWER (M149) ─────────
//
// Fetched as Googlebot: 1,109 characters under an h1 reading "Taxi &
// Transport". What a taxi costs on Rodrigues, whether you can get one from the
// airport, whether you must book ahead — the product answers all three and the
// page said none of them, which is also why an answer engine had nothing to
// quote.

const EN = taxiFaq("en");
const FR = taxiFaq("fr");
const CR = taxiFaq("cr");

describe("the answers exist in both languages", () => {
  it("asks and answers five questions in English and French", () => {
    expect(EN).toHaveLength(5);
    expect(FR).toHaveLength(5);
    for (const list of [EN, FR]) {
      for (const f of list) {
        expect(f.question.length).toBeGreaterThan(15);
        expect(f.answer.length).toBeGreaterThan(60);
      }
    }
  });

  it("falls Kreol back to FRENCH, not English", () => {
    // A Rodriguan who has switched to Kreol reads French far more readily than
    // English, and the two are close. Placeholder until real Kreol wording.
    expect(CR).toEqual(FR);
    expect(CR).not.toEqual(EN);
  });

  it("heads the section in the reader's language", () => {
    expect(taxiFaqHeading("en")).toMatch(/Rodrigues/);
    expect(taxiFaqHeading("fr")).toMatch(/questions fréquentes/);
    expect(taxiFaqHeading("cr")).toBe(taxiFaqHeading("fr"));
  });
});

describe("the answers match what the product actually does", () => {
  const en = EN.map((f) => `${f.question} ${f.answer}`).join(" ").toLowerCase();

  it("quotes the real fare rule rather than inventing a price", () => {
    // lib/i18n.ts fareNote: every driver sets their own fare, and Roule
    // Rodrigues never takes payment for a ride. A number here would be a quote
    // the platform cannot honour.
    expect(en).toContain("own fare");
    expect(en).toContain("no charge until you accept");
    expect(en).not.toMatch(/\bRs ?\d/);
  });

  it("describes the airport flow that BookRide actually enforces", () => {
    // needsFlightRef makes the flight number required for arrivals, and
    // DriverHome renders job.flightRef — so both halves of this are true.
    expect(en).toContain("flight number");
    expect(en).toContain("plaine corail");
  });

  it("repeats the disclaimer rather than contradicting it", () => {
    expect(en).toContain("not a transport operator");
  });

  it("spells the brand unaccented, in both languages (C17)", () => {
    for (const list of [taxiFaq("en", SHEET), taxiFaq("fr", SHEET)]) {
      expect(JSON.stringify(list)).not.toContain("Roulé Rodrigues");
    }
  });
});

// ── ONE PRICE ANSWER, IN TWO PARTS (SEO audit 2026-09-29 C2) ────────────────
// "Every driver sets their own fare, so there is no fixed price list" was
// false of an airport transfer, which has zone fares. The answer is now the
// zone fares read from the price sheet, then the driver's fare for any other
// ride. SHEET's numbers are not the live ones, so a remembered fare fails.
describe("the taxi price answer", () => {
  it("states the sheet's zone fares and Port Mathurin, then the driver's fare", () => {
    const a = taxiPriceAnswer("en", SHEET);
    expect(a).toContain("Rs 1,111 up to 6 km, Rs 1,444 over 6 and under 13 km, and Rs 1,777 for 13 km and over");
    expect(a).toContain("each extra passenger adds Rs 123");
    expect(a).toContain("Port Mathurin is Rs 1,777 one way.");
    expect(a).toContain("Night transfers (22:00–04:59) are priced by hand");
    expect(a).toContain("Every other ride: each driver sets their own fare");
    expect(a).toContain("Roule Rodrigues never takes payment for a ride");
    expect(a).not.toMatch(/no fixed price|pas de grille/);
  });

  it("says the same in French", () => {
    const a = taxiPriceAnswer("fr", SHEET);
    expect(a).toContain(`${moneyFr(111100)} jusqu'à 6 km`);
    expect(a).toContain(`Port Mathurin : ${moneyFr(177700)} l'aller simple.`);
    expect(a).toContain("Pour toute autre course, chaque chauffeur fixe son propre tarif");
    expect(a).toContain("ne prend jamais de paiement pour une course");
  });

  it("prints no figure without a sheet, and names the page that has them", () => {
    for (const l of ["en", "fr"] as const) {
      expect(taxiPriceAnswer(l, null)).not.toMatch(/Rs\s?\d/);
    }
    expect(taxiPriceAnswer("en", null)).toContain("airport transfers page");
  });

  it("is the first answer, and links /transfers in the reader's language", () => {
    expect(taxiFaq("en", SHEET)[0].answer).toBe(taxiPriceAnswer("en", SHEET));
    expect(taxiFaq("en", SHEET)[0].link).toEqual(TRANSFERS_LINK.en);
    expect(taxiFaq("fr", SHEET)[0].link).toEqual(TRANSFERS_LINK.fr);
    expect(TRANSFERS_LINK.en.href).toBe("/transfers");
  });

  it("keeps the FAQPage text to the answer; the link is not part of it", () => {
    const items = taxiFaq("en", SHEET);
    const ld = taxiFaqLd("https://x.test/taxi", items) as {
      mainEntity: { acceptedAnswer: { text: string } }[];
    };
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe(items[0].answer);
  });
});

describe("the structured data cannot outrun the page", () => {
  it("builds FAQPage from the same array that renders", () => {
    const ld = taxiFaqLd("https://x.test/taxi", EN) as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(ld.mainEntity).toHaveLength(EN.length);
    expect(ld.mainEntity.map((q) => q.name)).toEqual(EN.map((f) => f.question));
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe(EN[0].answer);
  });

  it("names the one business entity as provider, not a second Organization (T9)", () => {
    const ld = taxiServiceLd("https://x.test") as { provider: unknown };
    expect(ld.provider).toEqual({ "@id": "https://x.test/#business" });
  });

  it("does NOT claim Roule Rodrigues operates the transport", () => {
    // The page's own disclaimer says it is not a transport operator. Schema
    // that contradicts the visible page is a claim we would have to defend.
    const ld = taxiServiceLd("https://x.test") as Record<string, unknown>;
    expect(ld["@type"]).toBe("Service");
    expect(ld["@type"]).not.toBe("TaxiService");
    expect(JSON.stringify(ld)).not.toMatch(/TaxiService|LimousineService/);
    expect(ld.serviceType).toBe("Taxi booking");
  });

  it("ties the service to the island, which is the whole point for AI search", () => {
    const ld = taxiServiceLd("https://x.test") as {
      areaServed: { name: string; address: { addressCountry: string } };
    };
    expect(ld.areaServed.name).toContain("Rodrigues");
    expect(ld.areaServed.address.addressCountry).toBe("MU");
  });
});

describe("the page renders what it marks up", () => {
  // The directory moved into its own client component when /taxi became a
  // server page (SEO audit 2026-09-29 C23); app/taxi/taxi-page.test.ts renders
  // it and reads the HTML back.
  const src = readFileSync(join(__dirname, "..", "app", "taxi", "TaxiDirectory.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("renders the questions visibly, which Google's FAQ rule requires", () => {
    expect(src).toMatch(/faqItems\.map\(/);
    expect(src).toMatch(/\{f\.question\}/);
    expect(src).toMatch(/\{f\.answer\}/);
  });

  it("feeds the markup the same variable it renders", () => {
    expect(src).toMatch(/taxiFaqLd\(`\$\{SITE_URL\}\/taxi`, faqItems\)/);
    expect(src).toMatch(/const faqItems = taxiFaq\(language, airport\)/);
  });

  it("keeps the FAQ below the driver list, not above it", () => {
    // A 200-char subtitle was deleted from the top of this page after
    // measuring 114px of header on a page needing 607px of scrolling to reach
    // one driver. Prose belongs at the foot here.
    expect(src.indexOf("faqItems.map(")).toBeGreaterThan(src.indexOf("reviewsRate"));
  });
});
