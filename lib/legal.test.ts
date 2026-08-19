import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { LEGAL, isMissing, missingFacts, legalIdentityComplete } from "./legal";

// ── THE POLICY MUST NOT DRIFT AWAY FROM THE PRODUCT ─────────────────────────
//
// The privacy policy was written when this was a scooter-rental site. The site
// then grew delivery tracking and identified analytics, and the policy stayed
// where it was — so it went on publishing two statements that had become
// false. Nothing failed, because prose has no type checker.
//
// These tests are that type checker. They do not judge the wording; they assert
// that a specific claim is not made while the code that contradicts it exists.

const ROOT = join(__dirname, "..");
// Only the PUBLISHED copy is judged, never the source commentary above it —
// the header of privacy/page.tsx quotes the old false sentence on purpose, as
// the record of what went wrong, and that must not read as a live claim.
const stripComments = (src: string) =>
  src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const privacy = () =>
  stripComments(readFileSync(join(ROOT, "app/legal/privacy/page.tsx"), "utf8"));

describe("published legal identity", () => {
  it("names a trading address and hosting providers we have actually confirmed", () => {
    expect(LEGAL.tradingName).toBe("Roulé Rodrigues");
    expect(LEGAL.tradingAddress).toMatch(/Rodrigues/);
    expect(LEGAL.host.name.length).toBeGreaterThan(0);
    expect(LEGAL.dataHost.name.length).toBeGreaterThan(0);
  });

  it("reports every fact still owed by the owner instead of inventing one", () => {
    // This test does NOT require the facts to be present — it requires that
    // whatever is absent is reported as absent. If the owner fills them in,
    // missingFacts() empties and legalIdentityComplete() flips to true.
    for (const fact of missingFacts()) {
      expect(isMissing(LEGAL[fact as keyof typeof LEGAL] as string)).toBe(true);
    }
    expect(legalIdentityComplete()).toBe(missingFacts().length === 0);
  });

  it("never lets a raw OWNER_REQUIRED token reach a customer-facing string", () => {
    // The token is a marker for the render layer, not copy. The notice page
    // must branch on isMissing() rather than printing it.
    const notice = readFileSync(join(ROOT, "app/legal/notice/page.tsx"), "utf8");
    expect(notice).toMatch(/isMissing/);
    expect(notice).not.toMatch(/>\s*OWNER_REQUIRED\s*</);
  });
});

describe("the mandatory notices exist and are reachable", () => {
  const pages = ["notice", "privacy", "terms", "refunds", "disclaimer"];

  it.each(pages)("/legal/%s is a real route", (slug) => {
    expect(existsSync(join(ROOT, "app/legal", slug, "page.tsx"))).toBe(true);
  });

  it("the footer links to every one of them", () => {
    const footer = readFileSync(join(ROOT, "components/Footer.tsx"), "utf8");
    for (const slug of pages) {
      expect(footer, `footer is missing /legal/${slug}`).toMatch(`/legal/${slug}`);
    }
  });

  it("offers the legal notice label in all three site languages", () => {
    const i18n = readFileSync(join(ROOT, "lib/i18n.ts"), "utf8");
    expect(i18n.match(/^\s*notice:\s+"/gm)?.length).toBe(3);
  });
});

describe("the privacy policy matches what the code actually does", () => {
  it("does not deny tracking location while driver positions are recorded", () => {
    const recordsPositions = existsSync(join(ROOT, "app/api/tracking/ping/route.ts"));
    expect(recordsPositions).toBe(true); // guard: if this moves, update the test

    const text = privacy();
    // The exact sentence that was live and false.
    expect(text).not.toMatch(/we do not track your live location/i);
    // And it must positively disclose the driver case.
    expect(text).toMatch(/driver/i);
    expect(text).toMatch(/position|location/i);
  });

  it("does not call the analytics anonymous while it identifies signed-in users", () => {
    const pwa = readFileSync(join(ROOT, "components/PWARegister.tsx"), "utf8");
    const identifies = /posthog\.identify\(/.test(pwa);
    expect(identifies).toBe(true); // guard: if identify() is removed, revisit

    const text = privacy();
    expect(text).not.toMatch(/anonymous analytics/i);
    expect(text).toMatch(/not anonymous/i);
  });

  it("discloses each service that collects personal data", () => {
    const text = privacy().toLowerCase();
    for (const topic of ["booking", "deliver", "transfer slip", "assistant", "whatsapp", "notification"]) {
      expect(text, `privacy policy never mentions "${topic}"`).toContain(topic);
    }
  });

  it("gives a working contact and a complaint route", () => {
    const text = privacy();
    expect(text).toMatch(/CONTACT_EMAIL|content\.contact\.email/);
    expect(text).toMatch(/Data Protection Office of Mauritius/);
  });

  it("says data leaves Mauritius, because it does", () => {
    expect(privacy()).toMatch(/outside Mauritius/i);
  });
});
