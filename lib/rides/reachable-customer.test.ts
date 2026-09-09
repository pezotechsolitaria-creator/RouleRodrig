import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { toE164, toE164National } from "@/lib/phone";

const read = (p: string) => readFileSync(p, "utf8");

// ── A CORRECT NUMBER THAT LOOKED WRONG ──────────────────────────────────────
//
// /api/rides stored `phone` exactly as typed. On 9 Sept a real customer entered
// "70587837" — how everyone on this island writes a mobile — and it went into
// the database raw. Every wa.me and tel: link built from it was dead, and on
// the dispatch screen it read as a WRONG NUMBER when it was perfectly correct
// and merely missing +230.
//
// The owner was about to email that customer to say their number was incorrect.
// It was ours that was incomplete.

describe("a local number becomes a dialable one", () => {
  it("the number from the real booking", () => {
    expect(toE164National("70587837")).toBe("+23070587837");
  });

  it("toE164 alone would have produced nonsense", () => {
    // It assumes the country code is already there: it strips punctuation,
    // bolts on a "+" and checks the shape. This is why a second function
    // exists rather than a tweak to that one.
    expect(toE164("70587837")).toBe("+70587837");
    expect(toE164National("70587837")).not.toBe(toE164("70587837"));
  });

  it("an already-international number is untouched", () => {
    expect(toE164National("+230 5836 3401")).toBe("+23058363401");
    expect(toE164National("+23058363401")).toBe("+23058363401");
  });

  it("a visitor's foreign number is NOT rewritten as Mauritian", () => {
    // A tourist booking an airport transfer keeps their own country.
    expect(toE164National("+33612345678")).toBe("+33612345678");
    expect(toE164National("0033612345678")).toBe("+33612345678");
  });

  it("rubbish returns null rather than something unreachable", () => {
    expect(toE164National("")).toBeNull();
    expect(toE164National("12")).toBeNull();
    expect(toE164National("not a phone")).toBeNull();
    expect(toE164National(null)).toBeNull();
  });
});

describe("the booking route stores what a driver can ring", () => {
  const src = read("app/api/rides/route.ts");

  it("rejects at the schema what the form already rejects", () => {
    // The contract moved ON THE OWNER'S INSTRUCTION ("find a solution for it
    // to not reproduce"): an unparseable number no longer books with raw
    // keystrokes attached — the API refines on the SAME toE164National the
    // form's button is gated on, so the two cannot disagree and a direct
    // POST cannot store what the form would refuse. No booking is lost that
    // the shipped form could ever have submitted.
    expect(src).toMatch(/\.refine\(\(p\) => toE164National\(p\) !== null/);
  });

  it("stores only the normalised form, with no raw-keystroke fallback", () => {
    expect(src).toMatch(/p_customer_phone: toE164National\(v\.phone\),/);
    expect(src).not.toMatch(/p_customer_phone: toE164National\(v\.phone\) \?\? v\.phone/);
  });

  it("and the alert quotes the dialable form", () => {
    expect(src).toMatch(/toE164National\(v\.phone\) \?\? v\.phone\}`,/);
  });
});

describe("the dispatch desk can reach a customer another way", () => {
  it("the API returns the address", () => {
    // A phone that does not answer used to be the end of it: the desk had the
    // number and nothing else.
    expect(read("app/api/admin/rides/route.ts")).toContain("customer_email");
  });

  it("the card shows it as a mailto", () => {
    const src = read("app/admin/rides/RidesDesk.tsx");
    expect(src).toMatch(/customer_email: string \| null;/);
    expect(src).toMatch(/mailto:\$\{ride\.customer_email\}/);
  });

  it("and says so plainly when there is none", () => {
    // The field is optional on the form, so it is often null. A blank line
    // reads as a loading bug; "no email given" is itself the answer to "how
    // else can I reach this person".
    const src = read("app/admin/rides/RidesDesk.tsx");
    expect(src).toContain("No email given");
  });
});

describe("the form asks for a number a driver can ring", () => {
  const src = read("app/taxi/book/BookRide.tsx");

  it("the gate is a real number, not a length", () => {
    // `phone.trim().length > 4` accepted "705", "abc12" and anything else.
    expect(src).toMatch(/const canBook =\s*\n?\s*canContinue2 && name\.trim\(\)\.length > 1 && !!phoneE164;/);
    expect(src).not.toMatch(/name\.trim\(\)\.length > 1 && phone\.trim\(\)\.length > 4/);
  });

  it("it sends the completed number, not the raw text", () => {
    expect(src).toMatch(/phone: phoneE164 \?\? phone,/);
  });

  it("it does not argue on the second keystroke", () => {
    // An error while somebody is still typing their number reads as the form
    // fighting them.
    expect(src).toMatch(/phone\.trim\(\)\.length > 4 && !phoneE164/);
  });

  it("and it says what is wrong, in three languages", () => {
    expect(src).toContain("c.step3.phoneBad");
    const copy = read("lib/rides/copy.i18n.ts");
    expect(copy.match(/phoneBad:/g) ?? []).toHaveLength(3);
  });
});

describe("email stays optional, and says why it is worth giving", () => {
  it("nothing requires it", () => {
    // 44% of Rodriguans over 60 cannot read or write. Requiring an address
    // would block exactly the local customers this form exists to serve, and
    // somebody forced to type one types a@a.com.
    const src = read("app/taxi/book/BookRide.tsx");
    const gate = src.slice(src.indexOf("const canBook ="), src.indexOf("const canBook =") + 200);
    expect(gate).not.toContain("email");
  });

  it("but the field explains itself", () => {
    // "Optional" with no reason reads as "pointless", and this is the only
    // second way to reach somebody whose phone does not answer.
    const src = read("app/taxi/book/BookRide.tsx");
    expect(src).toContain("c.step3.emailHint");
    const copy = read("lib/rides/copy.i18n.ts");
    expect(copy.match(/emailHint:/g) ?? []).toHaveLength(3);
  });
});
