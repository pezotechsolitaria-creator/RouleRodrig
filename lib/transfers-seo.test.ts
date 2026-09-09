import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const TRANSFERS = read("app", "transfers", "page.tsx");
const BROWSE = read("app", "browse", "[category]", "page.tsx");
const TAXI = read("app", "taxi", "page.tsx");
const FARES = read("lib", "rides", "fares.ts");
const COPY = read("lib", "rides", "copy.i18n.ts");
const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");

// ── THE PRICE THAT WAS NOWHERE ──────────────────────────────────────────────
//
// ride_pricing has held flat_fare = 180000 for `airport` and 120000 for
// `ferry` since 2026-08-13 — Rs 1,800 and Rs 1,200. quote_ride() returns those
// unchanged, so they are what a customer is actually charged.
//
// They appeared in NO indexable HTML anywhere on the site. /transfers, the page
// that owns "airport transfer Rodrigues", rendered 771 characters with no
// price, no structured data, an <h1> of "Airport transfer" and two inbound
// links. The one question a visitor arrives with was unanswered.
describe("the airport transfer page states its price", () => {
  it("reads the fare rather than hardcoding it", () => {
    // A literal here would drift the moment the owner edits it in /admin.
    expect(TRANSFERS).toContain("readFlatFares");
    expect(strip(TRANSFERS)).not.toMatch(/1,?800/);
  });

  it("renders nothing about price when the fare could not be read", () => {
    // An invented fare is worse than a missing one. Local dev has no
    // service-role key, so this path is real, not theoretical.
    expect(TRANSFERS).toContain("{airport ? (");
    expect(FARES).toContain("return NO_FARES;");
  });

  it("treats 0 as unset, not as free", () => {
    expect(FARES).toMatch(/fare > 0/);
  });

  it("groups the fare the way the rest of the site writes money", () => {
    // It shipped as "Rs 1800" next to a site that writes "Rs 1,499".
    expect(TRANSFERS).toContain('Number(whole).toLocaleString("en-US")');
  });

  it("does not open the ride_pricing table to the public to do it", () => {
    // ride_pricing has RLS on, no policies and no anon grant. The fix is the
    // privileged client, NOT a grant — this project has already shipped one
    // bug of that shape (store_payment_settings).
    expect(FARES).toContain("hasServiceRole()");
    expect(FARES).toContain("getPrivileged()");
  });
});

describe("the airport transfer page carries structured data", () => {
  it("emits a Service", () => {
    // It had none at all, while /taxi beside it carries three graphs.
    expect(TRANSFERS).toMatch(/"@type": "Service"/);
    expect(TRANSFERS).toMatch(/serviceType: "Airport transfer"/);
  });

  it("prices the Offer only when the fare is known", () => {
    expect(TRANSFERS).toMatch(/fares\.airport != null/);
    expect(TRANSFERS).toMatch(/"@type": "Offer"/);
    expect(TRANSFERS).toMatch(/priceCurrency: "MUR"/);
  });

  it("points the provider at the one business entity", () => {
    expect(TRANSFERS).toMatch(/provider: \{ "@id": `\$\{SITE_URL\}\/#business` \}/);
  });
});

describe("the airport transfer page can be found", () => {
  it("gets the taxi hub's airport link", () => {
    // It had two inbound links, and its most natural parent sent airport
    // traffic straight past it to the bare form.
    expect(TAXI).toContain('href="/transfers"');
    expect(strip(TAXI)).not.toContain('href="/taxi/book?service=airport"');
  });

  it("has a heading that names the island", () => {
    // Was "Airport transfer" — 16 characters, reusing the form's service chip.
    expect(COPY).toContain("Airport transfers in Rodrigues");
    expect(COPY).toContain("Transfert aéroport à Rodrigues");
    expect(COPY).toContain("Transfer erport Rodrig");
  });

  it("keeps the short label on the form's service chip", () => {
    expect(COPY).toMatch(/label: "Airport transfer"/);
  });

  it("spells the brand the way BRAND.md requires", () => {
    expect(TRANSFERS).not.toMatch(/Roulé Rodrigues/);
  });
});

// ── FAQ MARKUP FOR CONTENT NOBODY CAN SEE ───────────────────────────────────
//
// Verified live on 2026-09-09: /browse/stays, /browse/tours and
// /browse/activities each published an eight-question FAQPage about SCOOTER
// RENTAL — "What is the minimum age to rent?", "Do I need a driving licence?",
// "Is insurance included?" — and all eight were absent from those pages' text.
//
// Google requires FAQ markup to describe content the visitor can read. It was
// also telling Google that a page about guest houses is about driving licences.
describe("the rental FAQ is only claimed where it is shown", () => {
  it("is opt-in", () => {
    expect(BROWSE).toMatch(/withFaq = false/);
    expect(BROWSE).toContain("...(withFaq && conditionItems.length");
  });

  it("is claimed by the branch that renders it visibly", () => {
    // <RentalConditions conditions={conditionItems}> lives in the vehicle
    // branch, and only there.
    expect(BROWSE).toMatch(/items\.map\(\(i\) => \(\{ name: i\.name \}\)\),\s*\n\s*\/\/[^\n]*\n\s*true,/);
    expect(BROWSE).toContain("conditions={conditionItems}");
  });
});
