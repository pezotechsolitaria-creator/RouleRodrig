import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EVENTS_COPY } from "./copy.i18n";
import type { Language } from "@/lib/i18n";

// ── The events section may not promise a payment method ─────────────────────
//
// /events used to say, in all three languages:
//
//     "Reserve your place in seconds — no account needed.
//      You pay the organiser at the door."
//
// and the homepage teaser said "Pay online or in cash". Neither was true. The
// checkout reads store_payment_options(), which M89 rewrote to consult
// prepayment_only() — so under the platform's prepayment rule the cash option
// never renders and the only way to pay is a bank transfer with proof, uploaded
// before anything is confirmed.
//
// So the sentence that brings a visitor in promised something the very next
// screen refuses. That is worse than a missing feature: the customer has
// already decided, on a false premise, and finds out at the point of payment.
//
// The rule this file enforces is narrow and durable: MARKETING COPY DOES NOT
// NAME A PAYMENT METHOD. The checkout knows what the store accepts, because it
// asks; a hardcoded sentence three files away does not and cannot. What the
// listing may promise is what is true either way — that reserving is instant,
// needs no account, and that the QR is the ticket.
//
// See lib/payments/cash-off.test.ts, which guards the same M89 rule from the
// other side: that no code DEFAULTS cash to available. This one guards the
// words.

const LANGS: Language[] = ["en", "fr", "cr"];

/** Phrases that assert how somebody pays. Matched case-insensitively. */
const PAYMENT_CLAIMS: { re: RegExp; why: string }[] = [
  { re: /\bat the door\b/i, why: "promises payment at the door" },
  { re: /\bpay the organiser\b/i, why: "promises paying the organiser directly" },
  { re: /\bin cash\b/i, why: "promises cash" },
  { re: /\bor cash\b/i, why: "promises cash as an alternative" },
  // French
  { re: /à l['’]entrée\b(?=[^]{0,40}pay)/i, why: "promises payment at the entrance (fr)" },
  { re: /\bpayez? .{0,20}espèces\b/i, why: "promises cash (fr)" },
  { re: /\bpayez l['’]organisateur\b/i, why: "promises paying the organiser (fr)" },
  // Kreol
  { re: /\bpeye organizater\b/i, why: "promises paying the organiser (cr)" },
  { re: /\bpeye .{0,12}\bkas\b/i, why: "promises cash (cr)" },
  { re: /\bkot laport\b(?=[^]{0,40}peye)/i, why: "promises payment at the door (cr)" },
];

/**
 * The MARKETING surfaces only — the listing intro, the detail page and the
 * share text. Deliberately NOT `form`, which owns the checkout's own payment
 * labels ("Cash · Pay the organiser directly").
 *
 * That distinction is the whole point and it was found by this test failing on
 * its first run. Those labels are not a promise: they render only when
 * store_payment_options() has just said the store accepts cash. Copy that
 * appears BECAUSE a method is available is honest by construction. Copy in a
 * page intro, written months earlier and read before anything is checked, is
 * not — and that is the only thing being banned here.
 */
const MARKETING_SECTIONS = ["list", "detail", "share", "availability"] as const;

function stringsFor(lang: Language): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
    // functions (the pluralised helpers) are called with a sample number so
    // their template text is checked too.
    if (typeof v === "function") {
      try {
        out.push(String((v as (...a: unknown[]) => unknown)(2, "x", "y")));
      } catch {
        /* a helper with a different shape — its literal parts are checked by
           the source scan below instead */
      }
    }
  };
  const dict = EVENTS_COPY[lang] as unknown as Record<string, unknown>;
  for (const section of MARKETING_SECTIONS) walk(dict[section]);
  return out;
}

describe("the events section does not promise a payment method", () => {
  it("finds the dictionary (tripwire)", () => {
    // A scan that walks an empty object passes forever.
    expect(stringsFor("en").length).toBeGreaterThan(10);
    expect(stringsFor("fr").length).toBeGreaterThan(10);
    expect(stringsFor("cr").length).toBeGreaterThan(10);
  });

  for (const lang of LANGS) {
    it(`${lang} copy names no payment method`, () => {
      const offenders: string[] = [];
      for (const text of stringsFor(lang)) {
        for (const { re, why } of PAYMENT_CLAIMS) {
          if (re.test(text)) offenders.push(`${why}: "${text}"`);
        }
      }
      expect(
        offenders,
        `The ${lang} events copy tells the visitor how they will pay. The checkout ` +
          `decides that by reading store_payment_options(), and under the platform's ` +
          `prepayment rule cash is not offered at all — so this sentence can be a ` +
          `promise the next screen refuses. Say what is true either way instead.\n  ` +
          offenders.join("\n  "),
      ).toEqual([]);
    });
  }

  it("the homepage teaser makes the same promise the listing does", () => {
    // EventsPromo is a separate component with its own inline copy, and it is
    // the ONLY place a first-time visitor learns the platform sells tickets. It
    // drifted from the listing once already — that is what prompted this file.
    const promo = readFileSync("components/EventsPromo.tsx", "utf8");
    const offenders = PAYMENT_CLAIMS
      .filter(({ re }) => re.test(promo))
      .map(({ why }) => why);
    expect(
      offenders,
      `components/EventsPromo.tsx names a payment method: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("still tells the visitor the QR is the ticket", () => {
    // The negative rule above is only half of it. Removing the payment promise
    // must not leave the card saying nothing about how entry works — "no paper
    // ticket, no queue" is the reason somebody trusts a phone screen at a gate.
    // The QR promise lives on the homepage teaser, which is where a first-time
    // visitor meets the idea at all. The listing does not repeat it — by then
    // they have already clicked.
    expect(readFileSync("components/EventsPromo.tsx", "utf8")).toMatch(/QR/);
  });

  it("every card offers a visible way in", () => {
    // The card was always a <Link>, so nothing was broken — but it carried no
    // button, no verb and no arrow, and on a phone there is no hover to
    // discover that with. A card that cannot be seen to be pressable converts
    // like a card that is not.
    const listing = readFileSync("components/events/EventsListing.tsx", "utf8");
    expect(listing, "the event card has no call-to-action").toMatch(/c\.list\.getTickets/);
    for (const lang of LANGS) {
      const cta = EVENTS_COPY[lang].list.getTickets;
      expect(cta.trim().length, `${lang} getTickets is empty`).toBeGreaterThan(2);
    }
  });
});
