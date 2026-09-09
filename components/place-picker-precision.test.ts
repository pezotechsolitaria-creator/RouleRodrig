import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const PICKER = read("components", "PlacePicker.tsx");

/** The file with every comment removed, so an assertion about the CODE cannot
 *  be satisfied — or broken — by prose that merely mentions the same words. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CODE = code(PICKER);

// ── A POINT BEATS A PLACE NAME ──────────────────────────────────────────────
//
// The picker opened on six village chips. They were not inaccurate — they read
// from the same gazetteer as the search, so tapping "Mont Lubin" and typing it
// gave the identical coordinate. The objection is what the coordinate MEANS:
// Port Mathurin's row is the middle of a town of five thousand people, so a
// driver handed it telephones to ask where, every time.
describe("the common-places shortcut is gone", () => {
  it("is not rendered, imported or exported anywhere", () => {
    expect(CODE).not.toContain("commonPlaces");
    expect(code(read("lib", "rides", "places.ts"))).not.toContain(
      "COMMON_PLACE_IDS",
    );
  });

  it("takes its heading out of all three languages with it", () => {
    // A dead string left in a dictionary is how a deleted section comes back.
    for (const f of [
      ["lib", "rides", "copy.i18n.ts"],
      ["lib", "delivery", "copy.i18n.ts"],
    ]) {
      expect(code(read(...f))).not.toMatch(/\bnearby:/);
    }
    expect(CODE).not.toMatch(/\bnearby\b/);
  });

  it("keeps the gazetteer the search reads", () => {
    // Deleting the chips must not delete the 35 named places behind them:
    // typing is still how anybody reaches the airport or the ferry.
    const places = read("lib", "rides", "places.ts");
    expect(places).toContain("export function searchPlaces");
    expect(places).toContain("export const RIDE_PLACES");
    expect(CODE).toContain('searchPlaces } from "@/lib/rides/places"');
  });
});

describe("what the panel offers first", () => {
  const at = (needle: string) => CODE.indexOf(needle);

  it("puts both precise answers above the search box", () => {
    // "Use where I am now" is metres; a pin is a roof; a village name is
    // neither. The two that produce a point are now the front door.
    expect(at("copy.useMyLocation")).toBeGreaterThan(-1);
    expect(at("copy.pin.open")).toBeGreaterThan(-1);
    expect(at("copy.useMyLocation")).toBeLessThan(at("placeholder={placeholder}"));
    expect(at("copy.pin.open")).toBeLessThan(at("placeholder={placeholder}"));
  });

  it("still shows places this phone used before, above everything", () => {
    // The owner asked for these to stay: they are already exact points, and
    // after one order the commonest answer is a single tap.
    expect(at("copy.recent")).toBeGreaterThan(-1);
    expect(at("copy.recent")).toBeLessThan(at("copy.useMyLocation"));
  });

  it("gives the two precise options the panel's only accent border", () => {
    // They were plain grey rows under the chips. Primary means visibly primary.
    const accents = CODE.match(/border-yellow\/60 bg-yellow\/\[0\.07\]/g) ?? [];
    expect(accents).toHaveLength(2);
  });
});

describe("a name we do not know", () => {
  it("goes to the map instead of through with no coordinate", () => {
    // This branch used to build { id: "custom", lat: null, lng: null } on the
    // spot — the vaguest answer the form can produce, and the one that ends in
    // the driver phoning. It now opens the pin sheet with the words carried in.
    const branch = CODE.slice(CODE.indexOf("q.trim().length > 2"));
    expect(branch.slice(0, 200)).toContain("setPinning(true)");
  });

  it("still lets the words through when the map is backed out of", () => {
    // PinOnMap's own failure message says "go back and type the place name
    // instead". If cancelling discarded the typing, that advice would be a
    // loop with no exit on a phone whose map chunk never arrived.
    expect(CODE).toContain("function cancelPin()");
    expect(CODE).toMatch(
      /function cancelPin\(\)[\s\S]{0,320}id: "custom"[\s\S]{0,120}lat: null/,
    );
    expect(CODE).toContain("onCancel={cancelPin}");
  });

  it("labels that button as going to the map, in every language", () => {
    // It used to describe ACCEPTING the text. It now opens a map, and three
    // dictionaries plus the English fallback have to agree. Matched on the
    // useTyped line only: "we'll confirm the price" is still the right words
    // on the chauffeur-day and price-on-request screens, which are not this.
    const useTyped = (src: string) =>
      [...src.matchAll(/useTyped:[\s\S]{0,120}?`([^`]*)`/g)].map((m) => m[1]);
    const lines = [
      ...useTyped(read("lib", "rides", "copy.i18n.ts")),
      ...useTyped(read("lib", "delivery", "copy.i18n.ts")),
      ...useTyped(PICKER),
    ];
    // en + fr + cr, in both dictionaries, plus PlacePicker's own fallback.
    expect(lines).toHaveLength(7);
    for (const l of lines) {
      expect(l).toMatch(/\$\{q\}/);
      expect(l).toMatch(/map|carte|kart/i);
      expect(l).not.toMatch(/price|prix|pri /i);
    }
  });
});
