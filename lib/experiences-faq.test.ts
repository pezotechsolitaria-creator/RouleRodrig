import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { experiencesFaq, experiencesFaqHeading } from "./experiences-faq";
import { faqPageLd } from "./schema";

// ── /experiences HAD STRUCTURE AND NOTHING TO SAY (M151) ────────────────────
//
// Breadcrumb, ItemList, reciprocal hreflang — all correct, wrapped around
// 1,683 characters that answered none of what a trip planner types. "What is
// there to do on Rodrigues" is the query the page exists for.

const EN = experiencesFaq("en");
const FR = experiencesFaq("fr");

describe("the hub answers the question it exists for", () => {
  it("asks and answers five questions in both languages", () => {
    expect(EN).toHaveLength(5);
    expect(FR).toHaveLength(5);
    for (const f of [...EN, ...FR]) {
      expect(f.answer.length).toBeGreaterThan(80);
    }
  });

  it("falls Kreol back to French, matching lib/taxi-faq", () => {
    expect(experiencesFaq("cr")).toEqual(FR);
    expect(experiencesFaqHeading("cr")).toBe(experiencesFaqHeading("fr"));
  });

  it("leads with what there actually is to do", () => {
    expect(EN[0].question.toLowerCase()).toContain("what is there to do");
  });
});

describe("every claim traces to a live listing", () => {
  const en = EN.map((f) => `${f.question} ${f.answer}`).join(" ");

  it("names only excursions that exist", () => {
    for (const real of ["Île aux Cocos", "Rivière Banane", "fishing", "massage"]) {
      expect(en).toContain(real);
    }
  });

  it("invents nothing the site does not offer", () => {
    // The same failure llms.txt shipped: an activity nobody can book.
    for (const fake of ["kitesurf", "diving school", "quad", "helicopter", "jet ski"]) {
      expect(en.toLowerCase()).not.toContain(fake);
    }
  });

  it("quotes the real price floor and ceiling", () => {
    // Balade en mer and Peche Traditionelle are Rs 700 per person; Ile aux
    // Cocos is Rs 2,000. Both are stated, so neither is a number nobody honours.
    expect(en).toContain("Rs 700");
    expect(en).toContain("Rs 2,000");
  });

  it("describes the availability-first flow the API actually implements", () => {
    // place-bookings creates a request, the owner confirms availability, and
    // only an approved booking gets a payment deadline. Saying "pay now" here
    // would describe a flow that does not exist.
    const booking = EN.find((f) => /pay straight away/i.test(f.question));
    expect(booking).toBeDefined();
    expect(booking!.answer).toMatch(/^No\./);
    expect(booking!.answer.toLowerCase()).toContain("availability is confirmed");
  });

  it("does not claim Roulé Rodrigues runs the trips", () => {
    expect(en).toContain("Independent Rodriguan skippers");
  });
});

describe("the hub renders what it marks up", () => {
  const src = readFileSync(
    join(__dirname, "..", "components", "experiences", "ExperiencesHub.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("renders the questions visibly, which Google's FAQ rule requires", () => {
    expect(src).toMatch(/experiencesFaq\(language\)\.map\(/);
    expect(src).toMatch(/\{f\.question\}/);
    expect(src).toMatch(/\{f\.answer\}/);
  });

  it("marks up the English list, which is what a crawler renders", () => {
    expect(src).toMatch(/faqPageLd\(`\$\{SITE_URL\}\/experiences`, experiencesFaq\("en"\)\)/);
  });

  it("puts the FAQ under the grid, not above it", () => {
    expect(src.indexOf("experiencesFaq(language).map(")).toBeGreaterThan(
      src.indexOf("shown.map("),
    );
  });
});

describe("the shared builder produces valid FAQPage", () => {
  it("mirrors the array it is given", () => {
    const ld = faqPageLd("https://x.test/experiences", EN) as {
      "@type": string;
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q) => q.name)).toEqual(EN.map((f) => f.question));
    expect(ld.mainEntity[4].acceptedAnswer.text).toBe(EN[4].answer);
  });
});
