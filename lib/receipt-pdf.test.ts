import { describe, it, expect } from "vitest";
import { buildReceiptPdf, receiptFilename } from "./receipt-pdf";
import type { ReceiptData } from "./receipt";

const FIXED_DATE = new Date("2026-08-11T10:00:00Z");

function sample(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    ref: "RR-A1B2C3",
    heading: "Deposit receipt",
    customer: "Marie Perrine",
    itemLabel: "Vehicle",
    item: "Scooter 125cc",
    rows: [
      { label: "Dates", value: "12 Aug - 16 Aug (4 days)" },
      { label: "Estimated total", value: "Rs 4,800" },
      { label: "Deposit paid", value: "Rs 1,000", strong: true },
    ],
    note: "Your deposit is received and your booking is confirmed. The balance is settled at pickup.",
    ...overrides,
  };
}

function asString(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

describe("buildReceiptPdf — structural validity", () => {
  it("emits a PDF header and EOF marker", () => {
    const pdf = asString(buildReceiptPdf(sample(), FIXED_DATE));

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("writes xref offsets that actually point at their objects", () => {
    // This is the test that matters. A PDF with a wrong byte offset in the
    // cross-reference table is rejected outright by most readers, and the only
    // symptom is "the file won't open" — indistinguishable from a broken
    // download, which is the bug this whole change exists to fix.
    const bytes = buildReceiptPdf(sample(), FIXED_DATE);
    const pdf = asString(bytes);

    // "\nxref\n", not "xref\n" — the latter also matches inside "startxref".
    const xrefIndex = pdf.lastIndexOf("\nxref\n") + 1;
    expect(xrefIndex).toBeGreaterThan(0);

    const startxref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(startxref).toBe(xrefIndex);

    // Entries look like "0000000123 00000 n ", after the free-list head.
    const entries = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(6);

    entries.forEach((offset, i) => {
      expect(pdf.startsWith(`${i + 1} 0 obj`, offset)).toBe(true);
    });
  });

  it("declares a stream Length matching the real content length", () => {
    const pdf = asString(buildReceiptPdf(sample(), FIXED_DATE));

    const declared = Number(pdf.match(/<<\/Length (\d+)>>/)![1]);
    const stream = pdf.match(/stream\n([\s\S]*?)\nendstream/)![1];

    expect(stream.length).toBe(declared);
  });

  it("is one byte per character, so offsets stay correct", () => {
    const bytes = buildReceiptPdf(sample({ customer: "Éloïse Ançois" }), FIXED_DATE);

    expect(bytes.every((b) => b <= 0xff)).toBe(true);
  });
});

describe("buildReceiptPdf — content", () => {
  it("includes the customer, item, reference and rows", () => {
    const pdf = asString(buildReceiptPdf(sample(), FIXED_DATE));

    expect(pdf).toContain("Marie Perrine");
    expect(pdf).toContain("Scooter 125cc");
    expect(pdf).toContain("RR-A1B2C3");
    expect(pdf).toContain("Rs 4,800");
    expect(pdf).toContain("Rs 1,000");
    expect(pdf).toContain("DEPOSIT RECEIPT");
  });

  it("keeps accented names readable rather than corrupting the byte stream", () => {
    const pdf = asString(buildReceiptPdf(sample({ customer: "Éloïse" }), FIXED_DATE));

    // Latin-1: É is 0xC9, ï is 0xEF.
    expect(pdf).toContain("Éloïse");
  });

  it("replaces characters outside Latin-1 instead of producing an unopenable file", () => {
    const pdf = asString(buildReceiptPdf(sample({ item: "Scooter 🌴 125cc" }), FIXED_DATE));

    expect(pdf).toContain("Scooter ? 125cc");
  });

  it("escapes parentheses and backslashes, which terminate a PDF string", () => {
    const pdf = asString(
      buildReceiptPdf(sample({ customer: "Marie (Mimi) \\ Perrine" }), FIXED_DATE),
    );

    expect(pdf).toContain("Marie \\(Mimi\\) \\\\ Perrine");
  });

  it("survives an empty rows list and a missing note", () => {
    const pdf = asString(buildReceiptPdf(sample({ rows: [], note: undefined }), FIXED_DATE));

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Marie Perrine");
  });

  it("wraps a long note instead of running off the page", () => {
    const long = "word ".repeat(120).trim();
    const pdf = asString(buildReceiptPdf(sample({ note: long }), FIXED_DATE));

    // Each wrapped line becomes its own text-showing operator.
    const textOps = pdf.match(/\(word( word)*\) Tj/g) ?? [];
    expect(textOps.length).toBeGreaterThan(1);
  });
});

describe("receiptFilename", () => {
  it("produces a recognisable .pdf name", () => {
    expect(receiptFilename("RR-A1B2C3")).toBe("RR-A1B2C3.pdf");
  });

  it("strips anything that would be illegal in a filename, dots included", () => {
    // Dots go too: a ".." surviving into a download filename is a path-traversal
    // shape, and a receipt reference never legitimately contains one.
    expect(receiptFilename("RR/../A1 B2")).toBe("RRA1B2.pdf");
  });

  it("falls back rather than producing a nameless file", () => {
    expect(receiptFilename("///")).toBe("receipt.pdf");
  });
});
