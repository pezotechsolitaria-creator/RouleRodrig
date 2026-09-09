import { describe, it, expect } from "vitest";
import { absorbCountryCode, contactPhoneProblem, formatContactPhone, isValidContactPhone, isValidPhone, toE164 } from "./phone";

describe("absorbCountryCode", () => {
  it("takes a pasted +230 number out of the box and into the picker", () => {
    // THE reported case: the field showed "+23058363401" beside a picker
    // already reading "+230", so the country code appeared twice.
    expect(absorbCountryCode("+23058363401", "MU")).toEqual({ iso: "MU", national: "58363401" });
  });

  it("handles it written the way it is printed on a card", () => {
    expect(absorbCountryCode("+230 5836 3401", "MU")).toEqual({ iso: "MU", national: "58363401" });
    expect(absorbCountryCode("+230-5836-3401", "MU")).toEqual({ iso: "MU", national: "58363401" });
    expect(absorbCountryCode("(+230) 5836 3401", "MU")).toEqual({ iso: "MU", national: "58363401" });
  });

  it("handles the keypad form, 00 for +", () => {
    expect(absorbCountryCode("0023058363401", "MU")).toEqual({ iso: "MU", national: "58363401" });
  });

  it("switches the picker when the number is from somewhere else", () => {
    // A French visitor pasting their own number should end up on 🇫🇷, not have
    // it validated as a Mauritian one.
    expect(absorbCountryCode("+33612345678", "MU")).toEqual({ iso: "FR", national: "612345678" });
  });

  it("strips a leading country code typed without the plus", () => {
    // Only because what remains is a valid MU number.
    expect(absorbCountryCode("23058363401", "MU")).toEqual({ iso: "MU", national: "58363401" });
  });

  it("leaves an ordinary national number completely alone", () => {
    // The overwhelmingly common case: nothing to absorb, so the component must
    // not touch what the person is typing.
    expect(absorbCountryCode("58363401", "MU")).toBeNull();
    expect(absorbCountryCode("5836 3401", "MU")).toBeNull();
  });

  it("does not blank the box mid-keystroke", () => {
    // Typed one character at a time, the early states must all be no-ops —
    // otherwise the field fights the person using it.
    for (const partial of ["+", "+2", "+23", "+230", "+2305"]) {
      const out = absorbCountryCode(partial, "MU");
      // Either nothing to do, or something that still leaves digits behind.
      if (out) expect(out.national.length).toBeGreaterThan(0);
    }
  });

  it("refuses to mangle a local number that merely starts with the code", () => {
    // Without the validity check, a number opening "230…" would be silently
    // truncated. The remainder here is not a valid MU number, so it is left.
    expect(absorbCountryCode("2305836", "MU")).toBeNull();
  });

  it("handles empty and junk without throwing", () => {
    expect(absorbCountryCode("", "MU")).toBeNull();
    expect(absorbCountryCode("   ", "MU")).toBeNull();
    expect(absorbCountryCode("call me", "MU")).toBeNull();
    expect(absorbCountryCode("+", "MU")).toBeNull();
  });

  it("is idempotent — absorbing twice changes nothing the second time", () => {
    const first = absorbCountryCode("+23058363401", "MU")!;
    expect(absorbCountryCode(first.national, first.iso)).toBeNull();
  });
});

describe("isValidPhone (unchanged behaviour)", () => {
  it("still accepts a full international number", () => {
    expect(isValidPhone("+230 5836 3401")).toBe(true);
  });
  it("still rejects nothing and rubbish", () => {
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("12345")).toBe(false);
  });
});

describe("strict E.164", () => {
  it("strips the spaces PhoneInput puts in", () => {
    // The exact shape formatInternational() produces, which the delivery
    // endpoint and its table both reject.
    expect(toE164("+230 5712 3456")).toBe("+23057123456");
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
  });

  it("survives however a person punctuates a number", () => {
    expect(toE164("+230-5712-3456")).toBe("+23057123456");
    expect(toE164("+230 (5712) 3456")).toBe("+23057123456");
    expect(toE164("  +230 5712 3456  ")).toBe("+23057123456");
    // A non-breaking space, which some mobile keyboards insert.
    expect(toE164("+230 5712 3456")).toBe("+23057123456");
  });

  it("adds the plus when somebody omits it", () => {
    expect(toE164("230 5712 3456")).toBe("+23057123456");
  });

  it("keeps an already-clean number untouched", () => {
    expect(toE164("+23057123456")).toBe("+23057123456");
  });

  it("returns null rather than something the server will reject", () => {
    // The caller needs to tell "empty" from "wrong"; both mean do not send.
    expect(toE164("")).toBeNull();
    expect(toE164("   ")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164("+0123456789")).toBeNull();   // E.164 has no leading zero
    expect(toE164("+123")).toBeNull();          // too short
    expect(toE164("+12345678901234567")).toBeNull(); // too long
    expect(toE164("not a phone")).toBeNull();
  });

  it("produces something the delivery endpoint's own regex accepts", () => {
    // The two must agree, or this helper is decorative.
    const SERVER = /^\+[1-9][0-9]{6,15}$/;
    for (const typed of ["+230 5712 3456", "230-5712-3456", "+44 7700 900123"]) {
      const out = toE164(typed);
      expect(out, typed).not.toBeNull();
      expect(SERVER.test(out as string), typed).toBe(true);
    }
  });
});

describe("contactPhoneProblem — trust the library, not a guessed prefix", () => {
  it("accepts THE number this rule once wrongly rejected", () => {
    // "70587837" arrived on a real taxi booking. The first version of this
    // rule rejected it ("a Mauritian mobile starts with 5") — and the owner
    // then confirmed the number was REAL: Mauritius has mobile ranges beyond
    // the 5-prefix, and libphonenumber knew. Pinned so the wrong rule can
    // never quietly return.
    expect(contactPhoneProblem("70587837")).toBeNull();
    expect(contactPhoneProblem("+230 7058 7837")).toBeNull();
    expect(isValidContactPhone("70587837")).toBe(true);
  });

  it("accepts the classic 5-prefix mobiles too, however written", () => {
    for (const n of ["57698834", "+230 5769 8834", "+2305769-8834", "00230 5769 8834"]) {
      expect(contactPhoneProblem(n), n).toBeNull();
    }
  });

  it("treats a number with no country code as Mauritian", () => {
    expect(contactPhoneProblem("58363401")).toBeNull();
    // Not a shape Mauritius allocates at all — the library's own knowledge.
    expect(contactPhoneProblem("48363401")).toBe("invalid");
  });

  it("still lets the tourists book", () => {
    expect(contactPhoneProblem("+262 692 12 34 56")).toBeNull();
    expect(contactPhoneProblem("+33 6 12 34 56 78")).toBeNull();
    expect(contactPhoneProblem("+44 7911 123456")).toBeNull();
  });

  it("keeps empty and invalid apart, so a form can speak precisely", () => {
    expect(contactPhoneProblem("")).toBe("empty");
    expect(contactPhoneProblem("   ")).toBe("empty");
    expect(contactPhoneProblem("5123")).toBe("invalid");
    expect(contactPhoneProblem("not a number")).toBe("invalid");
  });
});

describe("formatContactPhone — one canonical shape into the database", () => {
  it("stores keystrokes as international format", () => {
    expect(formatContactPhone("70587837")).toBe("+230 7058 7837");
    expect(formatContactPhone("+23057698834")).toBe("+230 5769 8834");
    expect(formatContactPhone("00230 5769 8834")).toBe("+230 5769 8834");
  });
  it("formats a tourist's number by their own country", () => {
    expect(formatContactPhone("+33612345678")).toBe("+33 6 12 34 56 78");
  });
  it("refuses to format garbage", () => {
    expect(formatContactPhone("5123")).toBeNull();
    expect(formatContactPhone("")).toBeNull();
  });
});
