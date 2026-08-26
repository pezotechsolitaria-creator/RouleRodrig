import { describe, it, expect } from "vitest";
import { RIDES_COPY } from "./copy.i18n";
import { RIDE_SERVICES, RIDE_STATUSES, RIDE_SERVICE_META } from "./model";

const LANGS = ["en", "fr", "cr"] as const;

/** Every leaf path in an object, so a missing key fails with a name. */
function paths(v: unknown, prefix = ""): string[] {
  if (typeof v === "function") return [`${prefix}:fn`];
  if (Array.isArray(v)) return [`${prefix}[]${v.length}`];
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) =>
      paths(x, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [`${prefix}:${typeof v}`];
}

describe("nobody sees a missing translation", () => {
  it("gives all three languages exactly the same keys and types", () => {
    // TypeScript already enforces this through `const FR: RidesCopy`, but the
    // failure it cannot catch is a key present in all three and EMPTY in two.
    const en = paths(RIDES_COPY.en).sort();
    for (const l of ["fr", "cr"] as const) {
      expect(paths(RIDES_COPY[l]).sort(), l).toEqual(en);
    }
  });

  it("has no blank strings", () => {
    const blanks: string[] = [];
    const walk = (v: unknown, p: string) => {
      if (typeof v === "string") {
        if (!v.trim()) blanks.push(p);
        return;
      }
      if (v && typeof v === "object" && typeof v !== "function") {
        for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
      }
    };
    for (const l of LANGS) walk(RIDES_COPY[l], l);
    expect(blanks).toEqual([]);
  });
});

describe("it covers what the screens actually render", () => {
  it("names every service the booking flow can offer", () => {
    // A service added to the union and not here renders as `undefined` on the
    // chooser — the first screen of the flow.
    for (const s of RIDE_SERVICES) {
      for (const l of LANGS) {
        expect(RIDES_COPY[l].book.services[s]?.label, `${l}.${s}`).toBeTruthy();
        expect(RIDES_COPY[l].book.services[s]?.blurb, `${l}.${s}`).toBeTruthy();
      }
    }
  });

  it("names every status the tracking screen can show", () => {
    for (const s of RIDE_STATUSES) {
      for (const l of LANGS) {
        expect(RIDES_COPY[l].track.status[s], `${l}.${s}`).toBeTruthy();
      }
    }
  });

  it("keeps the English in step with model.ts, which the driver still reads", () => {
    // model.ts is NOT translated: the admin desk, the driver's WhatsApp offer
    // and the confirmation mail all read it, and translating it in place would
    // have sent a Kreol customer's job offer to a French-reading driver in
    // Kreol. The two therefore have to be kept in step by hand, and this is
    // what notices when they drift.
    for (const s of RIDE_SERVICES) {
      expect(RIDES_COPY.en.book.services[s].label, s).toBe(
        RIDE_SERVICE_META[s].label,
      );
      expect(RIDES_COPY.en.book.services[s].blurb, s).toBe(
        RIDE_SERVICE_META[s].blurb,
      );
    }
  });
});

describe("the customer is never shown the platform's own vocabulary", () => {
  it("keeps dispatch words out of all three languages", () => {
    // model.ts already guards this for English. The guarantee was worth nothing
    // in the other two until now: "no driver found" is exactly the sentence a
    // customer must not read, in any language.
    const forbidden = [
      /dispatch/i,
      /radius/i,
      /rayon/i,
      /r[ée]partition/i,
      /no driver found/i,
      /aucun chauffeur trouv/i,
      /pa finn trouv (okenn )?sofer/i,
      /stage \d/i,
      /[ée]tape \d/i,
      /failed/i,
      /[ée]chec/i,
    ];
    for (const l of LANGS) {
      for (const [status, text] of Object.entries(RIDES_COPY[l].track.status)) {
        for (const bad of forbidden) {
          expect(
            bad.test(String(text)),
            `${l}.${status} says "${text}" — that is the platform's word, not the customer's`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("the interpolated strings", () => {
  it("puts the number in, in every language", () => {
    for (const l of LANGS) {
      const c = RIDES_COPY[l].book;
      expect(c.price.distance(12)).toContain("12");
      expect(c.price.duration(25)).toContain("25");
      expect(c.summary.route("A", "B")).toContain("A");
      expect(c.summary.route("A", "B")).toContain("B");
      expect(c.summary.dayHire("A")).toContain("A");
      expect(c.summary.passengers(3)).toContain("3");
    }
  });

  it("says one person in the singular where the language marks it", () => {
    expect(RIDES_COPY.en.book.summary.passengers(1)).toBe("1 person");
    expect(RIDES_COPY.fr.book.summary.passengers(1)).toBe("1 personne");
    expect(RIDES_COPY.en.book.summary.passengers(4)).toBe("4 people");
    expect(RIDES_COPY.fr.book.summary.passengers(4)).toBe("4 personnes");
    // Kreol does not mark it. One form is correct for every count, and that is
    // a fact about the language rather than a translation left undone.
    expect(RIDES_COPY.cr.book.summary.passengers(1)).toBe("1 dimounn");
    expect(RIDES_COPY.cr.book.summary.passengers(4)).toBe("4 dimounn");
  });
});
