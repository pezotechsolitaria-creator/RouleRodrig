import { describe, it, expect } from "vitest";
import { toWinAnsi } from "./receipt-pdf";

// ── THE RECEIPT THAT SAID "Rs 25?883" ───────────────────────────────────────
//
// A real customer receipt came back with question marks where the typography
// should have been. The encoder mapped every codepoint above 0xFF to "?" on
// the reasoning that PDF strings are Latin-1 — but the font declares
// WinAnsiEncoding, which fills 0x80–0x9F with exactly those characters.
//
// These assertions are about BYTES, because that is what ends up in the file
// and what the offset table at the end of the generator counts.
describe("toWinAnsi", () => {
  const bytes = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it("keeps the en-dash a dash, not a question mark", () => {
    // "3 Sept – 19 Sept" on the receipt that was reported.
    expect(bytes(toWinAnsi("3 Sept \u2013 19 Sept"))).toContain(0x96);
    expect(toWinAnsi("3 Sept \u2013 19 Sept")).not.toContain("?");
  });

  it("keeps a French thousands separator a space, not a question mark", () => {
    // Rs 25 883, grouped with U+202F by French-locale formatting. WinAnsi has
    // no narrow space, so it becomes a no-break space — still unbreakable,
    // which is the whole point of the character.
    const out = toWinAnsi("Rs 25\u202F883");
    expect(out).not.toContain("?");
    expect(bytes(out)).toContain(0xa0);
  });

  it("maps the rest of the typography a receipt actually meets", () => {
    expect(bytes(toWinAnsi("\u2014"))).toEqual([0x97]); // em-dash
    expect(bytes(toWinAnsi("\u2019"))).toEqual([0x92]); // right single quote
    expect(bytes(toWinAnsi("\u201C\u201D"))).toEqual([0x93, 0x94]);
    expect(bytes(toWinAnsi("\u2026"))).toEqual([0x85]); // ellipsis
    expect(bytes(toWinAnsi("\u20AC"))).toEqual([0x80]); // euro
  });

  it("leaves accented Rodriguan names exactly as they are", () => {
    // The reason the original function existed. These must not regress.
    for (const name of ["Éloïse", "Perrine", "Ançois", "Rodrigues"]) {
      expect(toWinAnsi(name)).toBe(name);
    }
  });

  it("still refuses what the encoding genuinely does not have", () => {
    // An emoji has no WinAnsi byte. "?" is correct here — the alternative is
    // corrupting the byte stream and producing a file no reader will open.
    expect(toWinAnsi("🛵")).toBe("?");
  });

  it("never emits a byte above 0xFF, whatever it is given", () => {
    // One char must equal one byte: the PDF's cross-reference table counts
    // string lengths, so a multi-byte char would shift every later offset and
    // produce a file that opens as blank or damaged.
    const nasty = "Rs 25\u202F883 — “Éloïse” 🛵 … ‹ok›";
    for (const b of bytes(toWinAnsi(nasty))) {
      expect(b).toBeLessThanOrEqual(0xff);
    }
  });
});
