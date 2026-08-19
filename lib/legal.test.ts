import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  LEGAL, isMissing, missingFacts, legalIdentityComplete,
  resolveLegal, missingFactsFor, OWNER_REQUIRED,
  resolveTerms, missingClauses, TERMS_CLAUSES,
  resolveRefunds,
} from "./legal";

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

// ── THE ADMIN BLOCK MUST ACTUALLY REACH THE PUBLISHED PAGE (P1 #2) ──────────
//
// The trap this guards is specific and this codebase has hit it before:
// lib/defaults.ts is NOT what the live site reads. The site_content row in
// Supabase overrides it, so a fact "configured" only in code changes nothing a
// visitor can see. resolveLegal() is the single read path that makes an admin
// edit win, and these assert it behaves.

describe("resolveLegal", () => {
  it("publishes what the owner entered in admin, over the code default", () => {
    const r = resolveLegal({ legalName: "Roulé Rodrigues Ltd", brn: "C12345678" });
    expect(r.legalName).toBe("Roulé Rodrigues Ltd");
    expect(r.brn).toBe("C12345678");
    expect(isMissing(r.legalName)).toBe(false);
  });

  it("keeps a fact OUTSTANDING rather than blank when admin has not filled it", () => {
    // The failure mode being prevented: an empty admin field silently erasing
    // the "to be confirmed" row, so the notice page looks finished while the
    // BRN is still missing.
    const r = resolveLegal({ legalName: "Roulé Rodrigues Ltd" });
    expect(isMissing(r.brn)).toBe(true);
    expect(missingFactsFor({ legalName: "Roulé Rodrigues Ltd" })).toContain("brn");
  });

  it("treats whitespace and the marker itself as still outstanding", () => {
    expect(isMissing(resolveLegal({ brn: "   " }).brn)).toBe(true);
    expect(isMissing(resolveLegal({ brn: OWNER_REQUIRED }).brn)).toBe(true);
  });

  it("falls back to the confirmed trading address instead of going blank", () => {
    // tradingAddress is one we genuinely know, so an empty admin field must not
    // turn a correct published address into nothing.
    expect(resolveLegal({ tradingAddress: "" }).tradingAddress).toBe(LEGAL.tradingAddress);
    expect(resolveLegal(null).tradingAddress).toMatch(/Rodrigues/);
  });

  it("is complete once every required fact is supplied", () => {
    expect(
      missingFactsFor({
        legalName: "Roulé Rodrigues Ltd",
        brn: "C12345678",
        registeredAddress: "Port Mathurin, Rodrigues",
        publicationDirector: "A. Owner",
      }),
    ).toEqual([]);
  });

  it("never invents a value when given nothing at all", () => {
    // The one behaviour that must never regress: no default may quietly become
    // a plausible-looking BRN on a site that takes payments.
    const r = resolveLegal(undefined);
    expect(r.brn).toBe(OWNER_REQUIRED);
    expect(r.legalName).toBe(OWNER_REQUIRED);
    expect(missingFactsFor(undefined)).toEqual(missingFacts());
  });
});

describe("the certificate never becomes public", () => {
  it("stores a private-bucket PATH, and no page renders it as a URL", () => {
    // A registration certificate carries signatures and a company stamp. The
    // moment any published surface interpolates certificatePath into an <img>
    // or an href, it is one guessable URL away from being public.
    const notice = readFileSync(join(ROOT, "app/legal/notice/page.tsx"), "utf8");
    const privacySrc = readFileSync(join(ROOT, "app/legal/privacy/page.tsx"), "utf8");
    expect(notice).not.toMatch(/certificatePath/);
    expect(privacySrc).not.toMatch(/certificatePath/);

    // And it must not be routed through the PUBLIC upload endpoint.
    const cert = readFileSync(join(ROOT, "app/api/admin/legal/certificate/route.ts"), "utf8");
    expect(cert).toMatch(/legal-documents/);
    expect(cert).toMatch(/createSignedUrl/);
    expect(cert).not.toMatch(/getPublicUrl/);
  });
});

// ── THE TERMS MUST DESCRIBE THE PRODUCT THAT EXISTS (P1 #4) ────────────────
//
// Same discipline as the privacy tests above: prose has no type checker, so
// these assert that specific claims are present or absent. The terms spent
// months describing a scooter-rental site while the platform sold food,
// tickets, taxi journeys, delivery and experiences.

const terms = () => stripComments(readFileSync(join(ROOT, "app/legal/terms/page.tsx"), "utf8"));

describe("published terms of service", () => {
  it("covers every vertical the platform actually sells", () => {
    const t = terms();
    for (const vertical of [
      "Vehicle rentals",
      "Food orders",
      "Marketplace orders",
      "Event tickets",
      "Taxi and private hire",
      "Delivery",
      "Experiences",
    ]) {
      expect(t).toContain(vertical);
    }
  });

  it("keeps Mauritius as the governing law", () => {
    const t = terms();
    expect(t).toContain("Republic of Mauritius");
    expect(t).toContain("governed by the laws");
    expect(t).toContain("Mauritian courts have jurisdiction");
  });

  it("does NOT cap liability at commission alone", () => {
    // The bug being pinned: the old cap was "limited to the commission we
    // earned on that booking". The platform is subscription-funded, so that
    // figure is zero on most transactions — a total exclusion by accident.
    const t = terms();
    expect(t).not.toMatch(/limited to the commission we earned/i);
    expect(t).toMatch(/greater of/i);
  });

  it("keeps the carve-outs that no term may lawfully exclude", () => {
    const t = terms();
    expect(t).toMatch(/death or personal injury/i);
    expect(t).toMatch(/fraud/i);
    // And it must not claim consumer rights away.
    expect(t).toMatch(/consumer law/i);
  });

  it("says who holds the customer's money, because that decides who refunds", () => {
    const t = terms();
    expect(t).toMatch(/never receives or holds that money/i);
  });

  it("discloses the reservation clock it now shows at checkout", () => {
    expect(terms()).toMatch(/reserves stock for a limited period/i);
  });
});

describe("resolveTerms", () => {
  it("never invents a commercial rule", () => {
    // The rule that matters most on this whole page: a plausible-sounding term
    // published on a document customers agree to is a term the business is
    // bound by. Blank must stay blank.
    const r = resolveTerms(undefined);
    for (const key of TERMS_CLAUSES) expect(r[key]).toBe(OWNER_REQUIRED);
    expect(missingClauses(undefined)).toEqual([...TERMS_CLAUSES]);
  });

  it("publishes what the owner decided", () => {
    const r = resolveTerms({ complaintWindow: "48 hours" });
    expect(r.complaintWindow).toBe("48 hours");
    expect(missingClauses({ complaintWindow: "48 hours" })).not.toContain("complaintWindow");
  });

  it("treats whitespace as still undecided", () => {
    expect(isMissing(resolveTerms({ vehicleMinAge: "   " }).vehicleMinAge)).toBe(true);
  });
});

// ── THE REFUND POLICY MUST NEVER UNPUBLISH ITSELF ──────────────────────────
//
// resolveRefunds falls back the OPPOSITE way to resolveTerms, and that is the
// whole risk of making this page editable: these tiers are a live consumer
// policy, so an empty admin field must keep publishing them. A blank
// cancellation ladder does not read as "unset" to a customer — it reads as
// "there is no cancellation charge".

const refundsPage = () => stripComments(readFileSync(join(ROOT, "app/legal/refunds/page.tsx"), "utf8"));

describe("resolveRefunds", () => {
  it("publishes the live policy when admin has never touched it", () => {
    const r = resolveRefunds(undefined);
    expect(r.vehicleCancellationTiers.length).toBeGreaterThan(0);
    expect(r.securityDeposit).not.toBe("");
    expect(r.lateReturnCharge).not.toBe("");
    expect(r.damageRule).not.toBe("");
  });

  it("never leaves the cancellation ladder empty", () => {
    // Blank, absent and an all-empty array must all keep the published ladder.
    for (const input of [{}, { vehicleCancellationTiers: [] }, { vehicleCancellationTiers: [{ window: "", outcome: "" }] }]) {
      expect(resolveRefunds(input).vehicleCancellationTiers.length).toBeGreaterThan(0);
    }
  });

  it("takes the owner's ladder when they supply a usable one", () => {
    const r = resolveRefunds({
      vehicleCancellationTiers: [
        { window: "More than 7 days", outcome: "full refund" },
        { window: "Inside 7 days", outcome: "no refund" },
      ],
    });
    expect(r.vehicleCancellationTiers).toHaveLength(2);
    expect(r.vehicleCancellationTiers[0].outcome).toBe("full refund");
  });

  it("drops half-written rows rather than publishing an unreadable rule", () => {
    const r = resolveRefunds({
      vehicleCancellationTiers: [
        { window: "More than 7 days", outcome: "full refund" },
        { window: "Inside 7 days", outcome: "   " },
      ],
    });
    expect(r.vehicleCancellationTiers).toHaveLength(1);
  });

  it("restores the published wording when a text field is cleared", () => {
    const cleared = resolveRefunds({ securityDeposit: "   " });
    expect(cleared.securityDeposit).toBe(resolveRefunds(undefined).securityDeposit);
  });
});

describe("published refund policy", () => {
  it("keeps the platform's own promises out of the owner's hands", () => {
    const p = refundsPage();
    // If WE cancel, the customer is made whole. That is not a dial.
    expect(p).toContain("you receive a 100% refund");
    // And the M89/M90 mechanism stays described by code, not editable prose.
    expect(p).toContain("never receives or holds that money");
    expect(p).toMatch(/chase them every other day/);
  });

  it("still states who holds the money before anything else", () => {
    expect(refundsPage()).toContain("1. Who holds your money");
  });
});
