import { describe, it, expect } from "vitest";
import { parseCommaList, parseLooseNumber } from "./draft-input";

// Reported as "the keyboard is locked". None of it was validation: the inputs
// re-rendered from the parse of the previous keystroke, so half-typed text was
// overwritten before the next character arrived. These lock the parsing half.

describe("parseCommaList", () => {
  it("keeps a trailing comma usable — the exact reported bug", () => {
    // "hat," must still yield ["hat"] for storage WITHOUT the caller rewriting
    // the visible text back to "hat", which is what deleted the comma.
    expect(parseCommaList("Bring a hat,")).toEqual(["Bring a hat"]);
    expect(parseCommaList("Bring a hat, ")).toEqual(["Bring a hat"]);
  });

  it("splits a finished list and trims each part", () => {
    expect(parseCommaList("Rods, bait , water")).toEqual(["Rods", "bait", "water"]);
  });

  it("drops empty segments from a double comma without losing the rest", () => {
    expect(parseCommaList("a,,b")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty field", () => {
    expect(parseCommaList("")).toEqual([]);
    expect(parseCommaList("   ")).toEqual([]);
  });
});

describe("parseLooseNumber", () => {
  it("returns null for a minus that is still being typed", () => {
    // THE coordinate bug: parseFloat("-") is NaN, and `|| 0` turned it into 0,
    // so the minus vanished. Rodrigues is at latitude -19.7 — every valid
    // latitude here starts with the character the field refused.
    expect(parseLooseNumber("-")).toBeNull();
  });

  it("returns null for a decimal point that is still being typed", () => {
    expect(parseLooseNumber("12.")).toBeNull();
    expect(parseLooseNumber(".")).toBeNull();
    expect(parseLooseNumber("-.")).toBeNull();
  });

  it("parses a real negative coordinate", () => {
    expect(parseLooseNumber("-19.6811")).toBe(-19.6811);
    expect(parseLooseNumber("63.4147")).toBe(63.4147);
  });

  it("parses ordinary numbers", () => {
    expect(parseLooseNumber("0")).toBe(0);
    expect(parseLooseNumber("700")).toBe(700);
    expect(parseLooseNumber(" 12.5 ")).toBe(12.5);
  });

  it("returns null for text that is not a number at all", () => {
    expect(parseLooseNumber("abc")).toBeNull();
    expect(parseLooseNumber("")).toBeNull();
  });
});
