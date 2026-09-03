import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── IT SAID WHAT WAS WRONG AND LEFT YOU LOOKING FOR IT (M163) ───────────────
//
// The form always listed what was missing, then scrolled to its own first
// line. On a phone the offending field is usually a screenful below that, so
// the customer read "Enter your phone number", found themselves staring at the
// vehicle picker, and had to hunt for the box.
//
// Worse, only the vehicle and the dates ever turned red. A missing name, a bad
// phone number or — the commonest failure of all — an empty email produced a
// message at the top and a field that looked perfectly fine.

const SRC = readFileSync(
  join(__dirname, "..", "components", "BookingSection.tsx"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("a failed submit takes the customer to the box", () => {
  it("remembers which field failed first, not just the message", () => {
    expect(SRC).toMatch(/let firstFieldId: string \| null = null;/);
    expect(SRC).toMatch(/if \(!firstFieldId && id\) firstFieldId = id;/);
  });

  it("scrolls to that field and focuses it", () => {
    expect(SRC).toMatch(/document\.getElementById\(firstFieldId\)/);
    expect(SRC).toMatch(/scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
    expect(SRC).toMatch(/\.focus\(\{ preventScroll: true \}\)/);
  });

  it("centres it rather than aligning to the top", () => {
    // A sticky header would otherwise cover the very field it just jumped to.
    expect(SRC).not.toMatch(/getElementById\(firstFieldId\)[\s\S]{0,300}block: "start"/);
  });

  it("still falls back to the form top when no field can be named", () => {
    expect(SRC).toMatch(/formTopRef\.current\?\.scrollIntoView/);
  });

  it("checks the fields in the order they appear on the page", () => {
    // "First error" must be the one highest up, or the customer is sent
    // backwards past fields they already filled.
    const order = ["bk-vehicle", "bk-dates-label", "bk-name", "bk-email", "bk-phone", "bk-agree"];
    const at = order.map((id) => SRC.indexOf(`"${id}");`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe("the failing box looks failed", () => {
  it("tracks every required field, not only the vehicle and the dates", () => {
    for (const f of ["name", "email", "phone"]) {
      expect(SRC).toMatch(new RegExp(`fieldErr\.${f}`));
    }
  });

  it("reddens an EMPTY email, which is the commonest way to fail", () => {
    // emailInvalid alone only fires once something wrong has been typed.
    expect(SRC).toMatch(/emailInvalid \|\| fieldErr\.email/);
  });

  it("marks them invalid for a screen reader too", () => {
    expect(SRC).toMatch(/aria-invalid=\{fieldErr\.name/);
    expect(SRC).toMatch(/aria-invalid=\{emailInvalid \|\| fieldErr\.email/);
  });

  it("clears the mark as soon as the customer types", () => {
    // Leaving a field red while it is being corrected is its own small insult.
    for (const f of ["name", "email", "phone"]) {
      expect(SRC).toContain("setFieldErr((p) => ({ ...p, " + f + ": false }))");
    }
  });

  it("gives the terms checkbox an id so it can be reached like the rest", () => {
    expect(SRC).toContain('id="bk-agree"');
  });
});
