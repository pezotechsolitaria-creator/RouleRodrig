import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE PAGE THAT OWNS "AIRPORT TRANSFER RODRIGUES" HAD NO FAQ ──────────────
//
// A crawl of all 77 sitemap URLs found /transfers at 176 words with no FAQ at
// all, on the query every arriving visitor types — while /taxi beside it had
// carried FAQPage for weeks.
//
// Every answer added is a fact the page already establishes: the flat fare from
// ride_pricing, the meet-and-greet and flight reference the ride engine
// supports, and the airport's two names. Nothing was written to fill the block.
//
// Two properties matter more than the word count, and both are guarded here.

const SRC = readFileSync(join(process.cwd(), "app/transfers/page.tsx"), "utf8");

describe("the FAQ and its markup are one list", () => {
  it("builds the questions once", () => {
    expect(SRC).toMatch(/const airportFaq: \{ q: string; a: string \}\[\] = \[/);
  });

  it("renders that array visibly", () => {
    // Google requires the questions to be readable on the page carrying the
    // markup. Two separately maintained lists is how a site ends up publishing
    // a question nobody can see — which this project has already done once, on
    // /browse/stays and /browse/tours.
    expect(SRC).toMatch(/airportFaq\.map\(\(f\) => \(\s*\n?\s*<div key=\{f\.q\}>/);
  });

  it("feeds FAQPage from the same array", () => {
    expect(SRC).toMatch(/"@type": "FAQPage"/);
    expect(SRC).toMatch(/mainEntity: airportFaq\.map/);
  });
});

describe("it never quotes a fare it could not read", () => {
  it("gates the price question on the fare being present", () => {
    // `airport` is null when readFlatFares() fails — no service-role key
    // locally, or a bad read in production. The existing price CARD is already
    // gated the same way, with the note that an invented price is worse than
    // none. The FAQ has to hold the same line, because an answer is quoted far
    // more readily than a card.
    expect(SRC).toMatch(/\.\.\.\(airport\s*\n?\s*\? \[/);
  });

  it("puts the fare inside the conditional entry, not the static ones", () => {
    const gated = SRC.slice(SRC.indexOf("...(airport"), SRC.indexOf("q: \"Can I book an airport transfer"));
    expect(gated).toContain("How much is a transfer");
    expect(gated).toContain("${airport}");
  });

  it("keeps the questions that need no price unconditional", () => {
    // These four are true whether or not the fare read succeeded, so the page
    // is never left with an empty FAQ block.
    for (const q of [
      "Can I book an airport transfer before I arrive",
      "Will the driver meet me at arrivals",
      "What is the airport in Rodrigues called",
      "Can I book the return trip",
    ]) {
      expect(SRC).toContain(q);
    }
  });
});

describe("it says only what the ride engine supports", () => {
  it("names both airport names, because the operator uses both", () => {
    expect(SRC).toContain("Plaine Corail");
    expect(SRC).toContain("Sir Gaétan Duval");
    expect(SRC).toContain("RRG");
  });

  it("describes the fare as agreed, not metered", () => {
    // The whole point of the flat fare, and what /taxi says too: the price is
    // confirmed before booking rather than running on a meter.
    expect(SRC).toMatch(/rather than a meter/);
  });
});
