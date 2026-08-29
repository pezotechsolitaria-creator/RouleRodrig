import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE FRENCH ARRIVAL PAGE (M154) ──────────────────────────────────────────
//
// Every section of this site had a French counterpart except the one a visitor
// needs first. They land at Plaine Corail and need a ride before they need a
// scooter, a room or a beach — and "taxi Rodrigues" / "transfert aeroport
// Rodrigues" reached an English page only.
//
// It is worth having because the French pages win when Google can find them:
// /fr/plages-rodrigues ranks 9 for "plage rodrigues" where the English
// /guide/beaches ranks 83 for the same query.

const SRC = readFileSync(
  join(__dirname, "..", "app", "fr", "taxi-rodrigues", "page.tsx"),
  "utf8",
);
/** Prose in comments must never be what satisfies a test. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("it never publishes a fare", () => {
  it("quotes no price, because no price is ours to quote", () => {
    // taxi_drivers.rate_from holds 1500 and M96 decided it must never reach a
    // customer surface: every driver charges differently, so a number here is
    // a quote Roule Rodrigues cannot honour. lib/i18n.ts says so on every
    // other taxi surface; a French page is not the place to make an exception.
    expect(CODE).not.toMatch(/Rs\s?\d/);
    expect(CODE).not.toMatch(/rate_from|rateFrom/);
  });

  it("says instead what is true — the price is agreed first", () => {
    expect(CODE).toContain("confirmé avant tout");
    expect(CODE).toContain("ne prend jamais de paiement");
  });
});

describe("it does not contradict its own English twin", () => {
  it("models a booking service, not a transport service", () => {
    // The site's published disclaimer says it is not a transport operator.
    expect(CODE).toContain('"@type": "Service"');
    expect(CODE).not.toMatch(/TaxiService|LimousineService/);
    expect(CODE).toContain('serviceType: "Réservation de taxi"');
  });

  it("claims no fleet, because there is one active driver", () => {
    // "nos chauffeurs" reads as many. The page describes the mechanism.
    expect(CODE).not.toMatch(/nos chauffeurs|notre flotte|nos véhicules/i);
  });
});

describe("it is paired, reachable and declared", () => {
  it("names its English twin, which names it back", () => {
    expect(CODE).toMatch(/["']en["']?\s*:\s*`\$\{SITE_URL\}\/taxi`/);
    const layout = readFileSync(
      join(__dirname, "..", "app", "taxi", "layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("/fr/taxi-rodrigues");
  });

  it("is linked from the English taxi page, not only annotated", () => {
    const page = readFileSync(
      join(__dirname, "..", "app", "taxi", "page.tsx"),
      "utf8",
    );
    expect(page).toContain('href="/fr/taxi-rodrigues"');
  });

  it("is in the sitemap and in llms.txt", () => {
    expect(
      readFileSync(join(__dirname, "..", "app", "sitemap.ts"), "utf8"),
    ).toContain("/fr/taxi-rodrigues");
    expect(
      readFileSync(join(__dirname, "..", "public", "llms.txt"), "utf8"),
    ).toContain("/fr/taxi-rodrigues");
  });
});

describe("it answers what an arriving visitor asks", () => {
  it("leads on the airport, which is the first problem they have", () => {
    expect(CODE).toContain("Plaine Corail");
    expect(CODE).toContain("numéro de vol");
  });

  it("carries a FAQPage marked as French", () => {
    expect(CODE).toContain('"@type": "FAQPage"');
    expect(CODE).toContain('inLanguage: "fr"');
    const questions = CODE.match(/^\s{4}q: "/gm) ?? [];
    expect(questions.length).toBeGreaterThanOrEqual(5);
  });

  it("says the drivers speak French, which is the reason to use this page", () => {
    // Verified against taxi_drivers.languages: Creole, English, French.
    expect(CODE).toContain("parlent créole et français");
  });
});
