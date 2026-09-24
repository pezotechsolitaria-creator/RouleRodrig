import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { experiencesFaq, experiencesFaqHeading, FALLBACK_RANGE } from "./experiences-faq";
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

  it("quotes the range it is GIVEN, rather than a figure from last time", () => {
    // It used to hardcode "from around Rs 700 ... to Rs 2,000 for the Ile aux
    // Cocos excursion" while the card grid directly above showed a Rs 2,500
    // sunrise hike and Ile aux Cocos at Rs 1,999 — the page contradicting
    // itself in the one paragraph a price-shopping visitor reads, and the same
    // text emitted as FAQPage schema.
    const quoted = experiencesFaq("en", { min: 850, max: 3200 })
      .map((f) => f.answer).join(" ");
    expect(quoted).toContain("Rs 850");
    expect(quoted).toContain("Rs 3,200");
    expect(quoted).not.toContain("Rs 2,000");
  });

  it("does the same in French", () => {
    const quoted = experiencesFaq("fr", { min: 850, max: 3200 })
      .map((f) => f.answer).join(" ");
    expect(quoted).toContain("Rs 850");
    expect(quoted).toContain("Rs 3,200");
  });

  it("falls back to a real pair when the caller has nothing to measure", () => {
    // Better a figure from the last check than an empty sentence — and the
    // caller that matters passes the live range.
    expect(FALLBACK_RANGE.min).toBeLessThan(FALLBACK_RANGE.max);
    expect(en).toContain("Rs 700");
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
    expect(src).toMatch(/experiencesFaq\(language, priceRange\)\.map\(/);
    expect(src).toMatch(/\{f\.question\}/);
    expect(src).toMatch(/\{f\.answer\}/);
  });

  it("marks up the English list, which is what a crawler renders", () => {
    // The schema is built from the SAME range as the visible text, or the two
    // can disagree about the price of the same page.
    expect(src).toMatch(/faqPageLd\(`\$\{SITE_URL\}\/experiences`, experiencesFaq\("en", priceRange\)\)/);
  });

  it("puts the FAQ under the grid, not above it", () => {
    expect(src.indexOf("experiencesFaq(language, priceRange).map(")).toBeGreaterThan(
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

describe("the hub links every vertical, not only the ones with listings", () => {
  const src = readFileSync(
    join(__dirname, "..", "components", "experiences", "ExperiencesHub.tsx"),
    "utf8",
  );
  const verticals = readFileSync(join(__dirname, "experiences.ts"), "utf8");

  it("renders a link for each entry in EXPERIENCES", () => {
    // It linked a vertical only when a LISTING pointed at it, so
    // /experiences/hiking and /experiences/chauffeur — the two with no
    // provider yet — were linked from nowhere on the site while sitting in the
    // sitemap. Search Console: "Discovered - currently not indexed" for both.
    expect(src).toContain("Object.values(EXPERIENCES).map");
    expect(src).toMatch(/href=\{`\/experiences\/\$\{x\.slug\}`\}/);
  });

  it("covers all five, so none can be an orphan", () => {
    const slugs = [...verticals.matchAll(/^\s{4}slug: "([a-z]+)"/gm)].map((m) => m[1]);
    expect(slugs.length).toBeGreaterThanOrEqual(5);
    for (const s of ["massage", "fishing", "boat", "hiking", "chauffeur"]) {
      expect(slugs).toContain(s);
    }
  });

  it("labels them in the reader's language", () => {
    expect(src).toContain("L(x.title, x.titleFr)");
  });
});
