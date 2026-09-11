import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { toE164National } from "@/lib/phone";

// ── "VIOLATES CHECK CONSTRAINT taxi_drivers_phone_check" ────────────────────
//
// What the owner saw on his phone on 11 Sept 2026 when he edited a driver and
// pressed Save. M119 put E.164 on the column and nothing on the way in ever
// enforced it, so pick() handed the typed text straight to Postgres and the
// owner was shown the constraint name.
//
// The number was not wrong. Ours was: nobody in Rodrigues writes +23058066022.

/** The column's own rule, copied from M119. The test of a fix is this regex. */
const COLUMN = /^\+[1-9][0-9]{6,15}$/;

describe("the way people actually write a number here", () => {
  it("accepts every spelling of one Mauritian mobile", () => {
    for (const typed of [
      "+23058066022",
      "+230 5806 6022",
      "5806 6022",
      "58066022",
      "5806-6022",
      "  +230 5806 6022  ",
      "(230) 5806 6022",
    ]) {
      const out = toE164National(typed);
      expect(out, `"${typed}" was rejected`).toBe("+23058066022");
      expect(COLUMN.test(out as string), `"${typed}" would still fail the column`).toBe(true);
    }
  });

  it("does not turn a foreign number into a Mauritian one", () => {
    // A Réunion driver, and a French visitor dialling the keypad way.
    expect(toE164National("+262 692 12 34 56")).toBe("+262692123456");
    expect(toE164National("0033 6 12 34 56 78")).toBe("+33612345678");
  });

  it("refuses what is genuinely not a number, so it never reaches the column", () => {
    for (const junk of ["", "   ", "Mr Sam", "12345", "abc"]) {
      expect(toE164National(junk)).toBeNull();
    }
  });
});

describe("the route stops it before Postgres does", () => {
  const src = readFileSync("app/api/admin/taxi/route.ts", "utf8");

  it("normalises on the way in, on both write paths", () => {
    // The API is what the constraint guards. Fixing only the form would leave
    // the next screen that posts here free to 500 in the same way.
    expect(src).toContain("normaliseContacts");
    expect(src).toContain("toE164National");
    // insert and update both.
    expect(src.match(/normaliseContacts\(row\)/g) ?? []).toHaveLength(2);
  });

  it("treats a cleared WhatsApp box as null, not as empty text", () => {
    // The opposite trap: that constraint is `null or matches`, and "" is
    // neither — so emptying the field was its own 500.
    expect(src).toContain("out.whatsapp = null;");
  });

  it("answers 400 with a sentence, never a constraint name", () => {
    // A 500 tells the owner the platform broke. It had read exactly what he
    // typed; the request was wrong, not the server.
    expect(src).toContain("readableDbError");
    // One deliberate exception: RR090 is the rotate function refusing in
    // words a person can read. Every other path is a log line, not a reply.
    const leaks = src.split("\n").filter((l) => /error:\s*error\.message/.test(l));
    expect(leaks).toHaveLength(1);
    expect(src).toContain('if (error.code === "RR090")');
    // The reply must not carry our schema onto his phone. Every branch of the
    // translator answers in words, and the phone/WhatsApp branches reuse the
    // one sentence that also tells him how to write it.
    const fn = src.slice(
      src.indexOf("function readableDbError"),
      src.indexOf("export async function GET"),
    );
    expect(fn).toContain("NOT_A_NUMBER");
    expect(fn).not.toContain("constraint");
    expect(src).toContain("does not look like a phone number");
    expect(src).toContain("Write it as 5806 6022");
  });

  it("keeps saying what the number is for when it is missing", () => {
    expect(src).toContain("it is how a ride reaches them");
  });
});
