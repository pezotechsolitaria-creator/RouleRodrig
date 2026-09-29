import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import translations from "../i18n";

// ── A CASH REQUEST IS A REQUEST (M220, M222) ────────────────────────────────
//
// The customer can SAY they would like to pay in person; the owner decides
// (admin_confirm_in_person, M220), and since M222 the database refuses it
// outright when the customer has declared a transfer. The copy a cash request
// reads used to promise the outcome anyway: "we'll confirm your booking and
// how to pay in person", "nothing is charged online", "Total, to pay in
// person". The day the owner answered "pay the deposit", every one of those
// had been a promise the site broke.
//
// Every line shown BEFORE the owner answers now names both outcomes and says
// nothing is charged until then — in all three languages.

const LANGS = ["en", "fr", "cr"] as const;

function requestLines(lang: (typeof LANGS)[number]) {
  const b = translations[lang].booking;
  const m = translations[lang].manageBooking;
  const p = translations[lang].placeBooking;
  return {
    "booking.payChoiceInPersonHint": b.payChoiceInPersonHint,
    "booking.successDescInPerson": b.successDescInPerson,
    "booking.checkingStep3InPerson": b.checkingStep3InPerson,
    "manageBooking.askedInPersonBody": m.askedInPersonBody,
    "placeBooking.inPersonNote": p.inPersonNote,
    "placeBooking.successInPerson": p.successInPerson,
    "placeBooking.step3InPerson": p.step3InPerson,
  } as Record<string, string>;
}

// The phrasings that promised the outcome, in each language.
// ("You asked to pay in person" is fine: that is what they did.)
const PROMISES = [
  /confirm your booking|how to pay in person|nothing is charged online|total, to pay in person/i,
  /confirmons votre réservation|comment payer sur place|débité en ligne|total, à payer sur place/i,
  /konfirm ou rezervasion|kouma pou pey lor plas|debite lor internet|total, pou pey lor plas/i,
];
// …and the other outcome, which each line must now name.
const ONLINE = /online|en ligne|lor internet/i;

describe("words shown while a cash request waits for the owner", () => {
  for (const lang of LANGS) {
    describe(lang, () => {
      for (const [key, text] of Object.entries(requestLines(lang))) {
        it(`${key} asks, it does not promise`, () => {
          expect(text.trim().length).toBeGreaterThan(0);
          for (const promise of PROMISES) expect(text).not.toMatch(promise);
          // Paying online stays a possible answer, said out loud.
          expect(text).toMatch(ONLINE);
        });
      }

      it("placeBooking.totalInPerson labels the price, not how it will be paid", () => {
        const label = translations[lang].placeBooking.totalInPerson;
        expect(label.trim().length).toBeGreaterThan(0);
        for (const promise of PROMISES) expect(label).not.toMatch(promise);
      });
    });
  }

  it("says so in English, exactly", () => {
    expect(translations.en.booking.checkingStep3InPerson).toBe(
      "We tell you whether you can pay in person or need to pay online. Nothing is charged until then.",
    );
    expect(translations.en.manageBooking.askedInPersonBody).toBe(
      "You asked to pay in person. We'll tell you whether you can, or whether you need to pay online. Nothing is charged until then.",
    );
    expect(translations.en.placeBooking.step3InPerson).toBe(
      "If it's free, we tell you whether you can pay in person or need to pay online. If it isn't, we suggest something else — and you've paid nothing.",
    );
  });

  it("the request receipt (English-only PDF) asks too", () => {
    const src = readFileSync(join(__dirname, "..", "..", "components", "BookingSection.tsx"), "utf8");
    expect(src).not.toContain("we will confirm your booking and how to pay");
    expect(src).toContain(
      "You asked to pay in person — we will tell you whether you can, or whether you need to pay online. Nothing is charged until then.",
    );
  });

  it("leaves the words for a booking the owner DID confirm in person alone", () => {
    // Those describe a decision already made, so they may say it plainly.
    expect(translations.en.manageBooking.inPersonTitle).toBe("Confirmed — you pay in person");
  });
});
