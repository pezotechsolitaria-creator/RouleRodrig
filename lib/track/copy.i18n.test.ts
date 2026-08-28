import { describe, it, expect } from "vitest";
import { TRACK_COPY } from "./copy.i18n";
import { ACTIVITY_KINDS, ACTIVITY_STAGES, activityLabel } from "@/lib/activity";
import { STATUS_LABEL } from "@/lib/orders/status";

const LANGS = ["en", "fr", "cr"] as const;

/** Every leaf path in an object, so a missing key is a failure with a name. */
function paths(v: unknown, prefix = ""): string[] {
  if (Array.isArray(v)) return [`${prefix}[]${v.length}`];
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => paths(x, prefix ? `${prefix}.${k}` : k));
  }
  return [`${prefix}:${typeof v}`];
}

describe("nobody tracking an order sees a missing translation", () => {
  it("gives all three languages exactly the same keys and types", () => {
    // The failure this guards is the one that actually ships: a key added to
    // English during a change and forgotten in the other two, which renders as
    // the word "undefined" on somebody's phone — on the screen they opened
    // because something had already gone quiet.
    const en = paths(TRACK_COPY.en).sort();
    for (const l of ["fr", "cr"] as const) {
      expect(paths(TRACK_COPY[l]).sort(), l).toEqual(en);
    }
  });

  it("leaves no string empty in any language", () => {
    for (const l of LANGS) {
      const walk = (v: unknown, at: string): void => {
        if (typeof v === "string") {
          expect(v.trim(), `${l}.${at}`).not.toBe("");
          return;
        }
        if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`));
        if (v && typeof v === "object") {
          Object.entries(v).forEach(([k, x]) => walk(x, `${at}.${k}`));
        }
      };
      walk(TRACK_COPY[l], "");
    }
  });

  it("names every kind of thing this box can find", () => {
    // /track is the one surface that covers all of them. A kind added to
    // lib/activity.ts without a word here would draw an empty eyebrow above
    // somebody's booking.
    for (const l of LANGS) {
      for (const kind of ACTIVITY_KINDS) {
        expect(TRACK_COPY[l].card.kind[kind], `${l}.${kind}`).toBeTruthy();
      }
    }
  });
});

describe("the reference is a format, not prose", () => {
  it("shows the same two reference shapes in every language", () => {
    // A customer copies the shape of what they were shown. Translating
    // "RR-A1B2C3" — or letting it drift by a character — sends them looking
    // for a reference that does not exist, and the lookup is two-factor, so
    // there is no second chance to guess.
    for (const l of LANGS) {
      const p = TRACK_COPY[l].form.refPlaceholder;
      expect(p, `${l} lost the booking reference shape`).toContain("RR-A1B2C3");
      expect(p, `${l} lost the order number shape`).toContain("RR260811-D9220F");
    }
  });
});

describe("the reservation clock still says what is left", () => {
  it("keeps the remaining time inside the sentence, in every language", () => {
    // holdRemaining() supplies "2 days" / "under an hour". A translation that
    // dropped the interpolation would leave a deadline with no urgency
    // attached, which is the exact omission this card was added to fix.
    for (const l of LANGS) {
      const said = TRACK_COPY[l].card.hold.reservedAfter("2 days");
      expect(said, l).toContain("2 days");
      // The sentence continues one the screen has already begun and bolded.
      expect(TRACK_COPY[l].card.hold.reservedBefore.endsWith(" "), l).toBe(true);
    }
  });

  it("tells an expired reservation it was not charged, in every language", () => {
    // The one fact that stops a lapsed order becoming a support call.
    const noCharge = { en: /charged/i, fr: /débité/i, cr: /debite/i };
    for (const l of LANGS) {
      expect(TRACK_COPY[l].card.hold.expired, l).toMatch(noCharge[l]);
    }
  });
});

// ── THE BADGE, AND WHY THESE ASSERTIONS EXIST ───────────────────────────────
//
// The badge word used to arrive from the server as finished English. Moving it
// into the dictionary creates the one risk worth testing: a SECOND vocabulary
// that slowly stops agreeing with the first. So the English side is pinned to
// the server's own labels, and the other two are pinned to being complete.
describe("the status badge", () => {

  it("has a word for every stage a vehicle or a place can be in", () => {
    for (const lang of LANGS) {
      for (const stage of ACTIVITY_STAGES) {
        expect(TRACK_COPY[lang].card.status.vehicle[stage], `vehicle/${stage}/${lang}`)
          .toBeTruthy();
        expect(TRACK_COPY[lang].card.status.place[stage], `place/${stage}/${lang}`)
          .toBeTruthy();
      }
    }
  });

  it("has a word for every order status, in all three languages", () => {
    for (const lang of LANGS) {
      for (const status of Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]) {
        expect(TRACK_COPY[lang].card.status.order[status], `order/${status}/${lang}`)
          .toBeTruthy();
      }
    }
  });

  it("says EXACTLY what the server said, in English", () => {
    // The guarantee that this change did not quietly reword the English screen,
    // and the tripwire if lib/activity.ts or lib/orders/status.ts ever changes
    // a word without this file following.
    for (const stage of ACTIVITY_STAGES) {
      expect(TRACK_COPY.en.card.status.vehicle[stage], `vehicle/${stage}`)
        .toBe(activityLabel("vehicle", stage));
      expect(TRACK_COPY.en.card.status.place[stage], `place/${stage}`)
        .toBe(activityLabel("place", stage));
    }
    for (const [status, label] of Object.entries(STATUS_LABEL)) {
      expect(
        TRACK_COPY.en.card.status.order[status as keyof typeof STATUS_LABEL],
        `order/${status}`,
      ).toBe(label);
    }
  });

  it("keeps Preparing and Ready apart, which stage alone cannot", () => {
    // Both are stage "active". Collapsing them would answer the only question
    // somebody waiting on food is actually asking.
    for (const lang of LANGS) {
      const o = TRACK_COPY[lang].card.status.order;
      expect(o.preparing, lang).not.toBe(o.ready_for_pickup);
    }
  });

  it("translates — the badge is not English in French or Kreol", () => {
    for (const lang of ["fr", "cr"] as const) {
      expect(TRACK_COPY[lang].card.status.vehicle.pending, lang)
        .not.toBe(TRACK_COPY.en.card.status.vehicle.pending);
      expect(TRACK_COPY[lang].card.status.order.ready_for_pickup, lang)
        .not.toBe(TRACK_COPY.en.card.status.order.ready_for_pickup);
    }
  });
});
