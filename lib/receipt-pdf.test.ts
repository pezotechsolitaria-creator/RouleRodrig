import { describe, it, expect } from "vitest";
import { toWinAnsi, buildReceiptPdf } from "./receipt-pdf";
import type { ReceiptData } from "./receipt";

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

// ── THE LINE THAT PRINTED THROUGH THE AMOUNT ────────────────────────────────
//
// Rows are drawn in two FIXED columns — the label at x=56, the value at x=330 —
// with no wrapping and, until the delivery adapter, no limit either. Nothing
// upstream enforced a length: a ride line already read "Taxi — Graviers beach
// to François Leguat tortoise reserve" at 56 characters, and a delivery line
// is built from two addresses the CUSTOMER typed, with no CHECK on either.
//
// The first document long enough to collide would have printed its amount
// through the middle of a place name, on a page somebody keeps.
describe("a long label cannot overprint the figure beside it", () => {
  const doc = (label: string, value = "Rs 5,997"): ReceiptData => ({
    ref: "RR-INV-2026-000001",
    heading: "Invoice",
    customer: "A Customer",
    itemLabel: "Delivery",
    item: "RR-868AE9",
    rows: [{ label, value }],
  });

  /** The drawn text of every row, as it reaches the page. */
  const drawn = (d: ReceiptData) =>
    Buffer.from(buildReceiptPdf(d)).toString("latin1");

  it("keeps a short label exactly as it was written", () => {
    expect(drawn(doc("Collect & deliver"))).toContain("Collect & deliver");
  });

  it("cuts a long one and says so with an ellipsis", () => {
    const long =
      "Do it for me — Camp du Roi, near the CEB office with the blue gate to Port Sud-Est";
    const out = drawn(doc(long));
    expect(out).not.toContain(long);
    // 0x85 is the WinAnsi ellipsis: the cut is visible, not silent.
    expect(out).toContain(String.fromCharCode(0x85));
  });

  it("still prints the figure in full when the label was cut", () => {
    // The whole point. Losing the end of an address is a nuisance; losing the
    // amount, or printing it through the address, is a broken document.
    const out = drawn(doc("Do it for me — " + "x".repeat(200), "Rs 1,234.56"));
    expect(out).toContain("Rs 1,234.56");
  });

  it("cuts a very long value too, so it cannot run off the page", () => {
    const out = drawn(doc("Delivery", "A".repeat(120)));
    expect(out).not.toContain("A".repeat(120));
    expect(out).toContain(String.fromCharCode(0x85));
  });
});
