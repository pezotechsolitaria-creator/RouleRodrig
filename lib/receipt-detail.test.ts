import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReceiptPdf } from "./receipt-pdf";
import { RECEIPT_LOGO } from "./receipt-logo";

// ── THE RECEIPT SHOWED AN ANSWER AND NO SUM (M167) ──────────────────────────
//
// It said "Estimated total Rs 2,097" and stopped. A customer could not check
// the arithmetic, and could not see that delivery was free — the two things
// most likely to be argued about at pickup, on a booking whose price this site
// got wrong twice this week.
//
// It also carried no mark. The header had the wordmark and a gold rule, which
// is branding, but the icon everyone recognises was not on it.

const BOOKING = readFileSync(
  join(__dirname, "..", "components", "BookingSection.tsx"),
  "utf8",
);

const PDF = buildReceiptPdf({
  ref: "RR-380693",
  heading: "Booking receipt",
  customer: "Jean Paillard",
  itemLabel: "Vehicle",
  item: "AVENIS 125cc",
  rows: [
    { label: "3 days x Rs 699", value: "Rs 2,097" },
    { label: "Delivery", value: "Free" },
    { label: "Total", value: "Rs 2,097", strong: true },
  ],
});
const AS_TEXT = Buffer.from(PDF).toString("latin1");

describe("the PDF is still a valid PDF", () => {
  it("has the header, the image operator and a proper end", () => {
    expect(AS_TEXT.startsWith("%PDF-1.4")).toBe(true);
    expect(AS_TEXT).toContain("/Im1 Do");
    expect(AS_TEXT).toContain("/Filter/DCTDecode");
    expect(AS_TEXT.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("every xref offset points at the object it claims", () => {
    // The whole file is assembled as a string whose length IS the byte offset.
    // Embedding binary is exactly what could break that, so it is checked.
    const start = Number(/startxref\s+(\d+)/.exec(AS_TEXT)![1]);
    const table = AS_TEXT.slice(start).split("trailer")[0];
    const offsets = [...table.matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBe(7);
    offsets.forEach((off, i) => {
      expect(AS_TEXT.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });

  it("declares the image at the size the logo actually is", () => {
    expect(AS_TEXT).toContain(`/Width ${RECEIPT_LOGO.width}/Height ${RECEIPT_LOGO.height}`);
    expect(atob(RECEIPT_LOGO.base64).startsWith("\xFF\xD8\xFF")).toBe(true); // JPEG SOI
  });

  it("stays small enough to email", () => {
    expect(PDF.length).toBeLessThan(12_000);
  });
});

describe("the receipt shows the arithmetic", () => {
  it("prints days x rate as its own line", () => {
    expect(BOOKING).toContain("day${lastBooking.days !== 1 ? \"s\" : \"\"} x Rs ${lastBooking.rate.toLocaleString()}");
  });

  it("says Free rather than Rs 0", () => {
    // A zero line reads as an omission; the word reads as the offer it is.
    expect(BOOKING).toContain('lastBooking.delivery > 0 ? `Rs ${lastBooking.delivery.toLocaleString()}` : "Free"');
  });

  it("names the deposit percentage it charged", () => {
    expect(BOOKING).toContain("Deposit due${lastBooking.pct ? ` (${lastBooking.pct}%)` : \"\"}");
  });

  it("shows what is still owed at pickup", () => {
    expect(BOOKING).toContain('label: "Balance at pickup"');
  });

  it("carries the server-priced figures, not recomputed ones", () => {
    // Every line comes off the same breakdown the booking was created from.
    for (const f of ["rental: breakdown?.rental", "delivery: breakdown?.delivery", "balance: breakdown?.balance"]) {
      expect(BOOKING).toContain(f);
    }
  });
});
