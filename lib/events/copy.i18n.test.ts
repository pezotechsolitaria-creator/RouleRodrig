import { describe, it, expect } from "vitest";
import { EVENTS_COPY, availabilityCopy, countdownCopy } from "./copy.i18n";
import { availabilityLabel, countdownLabel } from "./format";

const LANGS = ["en", "fr", "cr"] as const;

/** Every leaf path in an object, so a missing key is a failure with a name. */
function paths(v: unknown, prefix = ""): string[] {
  if (Array.isArray(v)) return [`${prefix}[]${v.length}`];
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => paths(x, prefix ? `${prefix}.${k}` : k));
  }
  return [`${prefix}:${typeof v}`];
}

describe("nobody sees a missing translation", () => {
  it("gives all three languages exactly the same keys and types", () => {
    // The failure this guards is the one that actually ships: a key added to
    // English during a change and forgotten in the other two, which renders as
    // the word "undefined" on somebody's phone.
    const en = paths(EVENTS_COPY.en).sort();
    for (const l of ["fr", "cr"] as const) {
      expect(paths(EVENTS_COPY[l]).sort(), l).toEqual(en);
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
      walk(EVENTS_COPY[l], "");
    }
  });

  it("keeps the interpolating strings interpolating in every language", () => {
    for (const l of LANGS) {
      const c = EVENTS_COPY[l];
      // The organiser's own words — the event name, the package name — travel
      // through these. A language that dropped the placeholder would render a
      // button that no longer says what it reserves.
      expect(c.back.toEvent("Fête de la Mer"), l).toContain("Fête de la Mer");
      expect(c.picker.reserveCta("VIP"), l).toContain("VIP");
      expect(c.picker.startFresh("VIP"), l).toContain("VIP");
      expect(c.picker.keep("Sega Night"), l).toContain("Sega Night");
      expect(c.picker.detailsAria("VIP"), l).toContain("VIP");
      expect(c.detail.doors("18:00", "19:30"), l).toContain("18:00");
      expect(c.detail.doors("18:00", "19:30"), l).toContain("19:30");
      expect(c.availability.remaining(143), l).toContain("143");
      expect(c.picker.maxPerOrder(4), l).toContain("4");
      expect(c.picker.minPerOrder(2), l).toContain("2");
      expect(c.form.reserve(3), l).toContain("3");
      expect(c.countdown.inDays(3), l).toContain("3");
    }
  });
});

describe("availabilityCopy speaks for format.ts without deciding for it", () => {
  it("returns the tone format.ts chose, at every threshold", () => {
    // The tone is what colours the line and what the pages branch on. If this
    // ever drifted, a sold-out event could read grey and an event with 300
    // seats left could read red.
    const cases: [number, number][] = [
      [0, 100], [1, 100], [3, 100], [5, 100], [6, 100],
      [15, 100], [20, 100], [21, 100], [20, 5000], [143, 500],
    ];
    for (const [remaining, capacity] of cases) {
      const expected = availabilityLabel(remaining, capacity).tone;
      for (const l of LANGS) {
        expect(availabilityCopy(l, remaining, capacity).tone, `${l} ${remaining}/${capacity}`)
          .toBe(expected);
      }
    }
  });

  it("says in English exactly what format.ts says", () => {
    // English is the reference text. If the two ever disagree, one of them is
    // the wording nobody meant to ship.
    const cases: [number, number][] = [
      [0, 100], [1, 100], [4, 100], [12, 200], [15, 5000], [143, 500],
    ];
    for (const [remaining, capacity] of cases) {
      expect(availabilityCopy("en", remaining, capacity).text, `${remaining}/${capacity}`)
        .toBe(availabilityLabel(remaining, capacity).text);
    }
  });

  it("never says the same thing two ways inside one language", () => {
    // 6 tickets left out of 100 is "low" by proportion, not by count, and must
    // not borrow the "Last 6 tickets" wording that belongs to five or fewer.
    expect(availabilityCopy("en", 6, 100).text).toBe("Only 6 left");
    expect(availabilityCopy("en", 5, 100).text).toBe("Last 5 tickets");
  });
});

describe("countdownCopy", () => {
  const DAY = 86_400_000;
  const NOW = Date.parse("2026-03-01T08:00:00.000Z");

  it("shows a badge exactly when format.ts does", () => {
    for (const offset of [-DAY, 0, 60_000, DAY, 3 * DAY, 14 * DAY, 15 * DAY, 40 * DAY]) {
      const iso = new Date(NOW + offset).toISOString();
      const shown = countdownLabel(iso, NOW) !== null;
      for (const l of LANGS) {
        expect(countdownCopy(l, iso, NOW) !== null, `${l} ${offset}`).toBe(shown);
      }
    }
  });

  it("says in English exactly what format.ts says", () => {
    for (const offset of [60_000, DAY + 1000, 3 * DAY, 13 * DAY]) {
      const iso = new Date(NOW + offset).toISOString();
      expect(countdownCopy("en", iso, NOW)).toBe(countdownLabel(iso, NOW));
    }
  });

  it("reads the same clock twice, so today cannot become tomorrow mid-render", () => {
    // The whole reason `now` is a parameter: the server decides the day and the
    // client renders it, and both have to be looking at the same instant.
    const iso = new Date(NOW + 2 * DAY).toISOString();
    expect(countdownCopy("fr", iso, NOW)).toBe("Dans 2 jours");
    expect(countdownCopy("cr", iso, NOW)).toBe("Dan 2 zour");
  });
});
