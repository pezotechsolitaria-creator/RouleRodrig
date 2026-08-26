import { describe, it, expect } from "vitest";
import {
  DELIVER_COPY,
  ITEM_CHOICES,
  columnsToItem,
  itemToColumns,
  type ItemChoice,
} from "./copy.i18n";
import { vehicleCanCarry } from "./vehicle";

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
    const en = paths(DELIVER_COPY.en).sort();
    for (const l of ["fr", "cr"] as const) {
      expect(paths(DELIVER_COPY[l]).sort(), l).toEqual(en);
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
      walk(DELIVER_COPY[l], "");
    }
  });

  it("keeps the interpolating strings interpolating in every language", () => {
    for (const l of LANGS) {
      const c = DELIVER_COPY[l];
      expect(c.progress(2, 3), l).toContain("2");
      expect(c.progress(2, 3), l).toContain("3");
      expect(c.what.fleet("car, van"), l).toContain("car, van");
      expect(c.where.useTyped("Baie Malgache"), l).toContain("Baie Malgache");
    }
  });

  it("marks the required contract with the asterisk it explains", () => {
    // The banner promises a symbol. If the banner and the glyph ever disagree,
    // the form is teaching a rule it does not follow.
    for (const l of LANGS) {
      expect(DELIVER_COPY[l].required.warning, l).toContain("*");
    }
  });
});

describe("one question, two columns", () => {
  it("round-trips every choice through the database shape", () => {
    for (const item of ITEM_CHOICES) {
      for (const heavy of [false, true]) {
        // largeAndHeavy only means anything under "large" — everywhere else it
        // is not asked, so it must come back false rather than leaking.
        const expectHeavy = item === "large" ? heavy : false;
        const cols = itemToColumns(item, heavy);
        const back = columnsToItem(cols.sizeClass, cols.cargoKind);
        expect(back.item, `${item}/${heavy}`).toBe(item);
        expect(back.largeAndHeavy, `${item}/${heavy}`).toBe(expectHeavy);
      }
    }
  });

  it("only the large choice sets the large size class", () => {
    for (const item of ITEM_CHOICES) {
      expect(itemToColumns(item).sizeClass, item).toBe(item === "large" ? "large" : "standard");
    }
  });

  it("keeps the fridge case answerable", () => {
    // A mattress is large and light; a fridge is large AND heavy. Collapsing
    // the two questions into five chips must not lose the second one, which is
    // the one that decides between a car and a van.
    expect(itemToColumns("large", false)).toEqual({ sizeClass: "large", cargoKind: "general" });
    expect(itemToColumns("large", true)).toEqual({ sizeClass: "large", cargoKind: "heavy" });
    expect(vehicleCanCarry("car", "large", "general")).toBe(true);
    expect(vehicleCanCarry("car", "large", "heavy")).toBe(false);
  });

  it("never produces a combination no vehicle can take", () => {
    // The chips are the only way to reach these columns, so if one of them can
    // strand a request the form itself is the bug.
    for (const item of ITEM_CHOICES) {
      for (const heavy of [false, true]) {
        const { sizeClass, cargoKind } = itemToColumns(item, heavy);
        const fleet = ["foot", "bicycle", "scooter", "car", "van", "pickup", "lorry"].filter((v) =>
          vehicleCanCarry(v, sizeClass, cargoKind),
        );
        expect(fleet.length, `${item}/${heavy}`).toBeGreaterThan(0);
      }
    }
  });

  it("treats an unknown stored value as an ordinary parcel", () => {
    // A draft written before a chip was renamed must open as something, not as
    // nothing.
    expect(columnsToItem("standard", "spaceship").item).toBe("general");
    expect(columnsToItem("", "").item).toBe("general");
  });

  it("labels and helps every choice in every language", () => {
    for (const l of LANGS) {
      for (const item of ITEM_CHOICES) {
        const entry = DELIVER_COPY[l].what.item[item as ItemChoice];
        expect(entry.label, `${l}.${item}`).toBeTruthy();
        expect(entry.help, `${l}.${item}`).toBeTruthy();
      }
    }
  });
});
