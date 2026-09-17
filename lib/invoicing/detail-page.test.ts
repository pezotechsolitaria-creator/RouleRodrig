import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (...p: string[]) => strip(readFileSync(join(process.cwd(), ...p), "utf8"));

const VIEW = read("app", "admin", "invoices", "[id]", "InvoiceDetailView.tsx");
const PAGE = read("app", "admin", "invoices", "[id]", "page.tsx");
const ROUTE = read("app", "api", "admin", "invoices", "[id]", "route.ts");
const DOC = read("lib", "invoicing", "document.ts");

// ── THE DOCUMENT COSTS NOTHING TO PRODUCE ───────────────────────────────────
//
// The download is the point of the whole system: the moment a customer is
// handed something they can keep. It is generated in the browser by the
// renderer already in the repo. Anything that pulls in a PDF library — or a
// headless browser on a serverless function — turns a free download into a
// cold start and tens of megabytes of bundle, for the same page of A4.
const PDF_LIBRARIES = /\b(jspdf|pdfkit|puppeteer|playwright|html2canvas|@react-pdf|pdf-lib)\b/i;

describe("the PDF is built from what is on screen", () => {
  it("maps the invoice with invoiceToReceipt and hands it to downloadReceipt", () => {
    expect(VIEW).toContain("downloadReceipt(invoiceToReceipt(inv, lines))");
  });

  it("pulls in no PDF library, here or in the mapper", () => {
    expect(VIEW).not.toMatch(PDF_LIBRARIES);
    expect(DOC).not.toMatch(PDF_LIBRARIES);
  });

  it("prints the lines the customer is being charged for, not one lump figure", () => {
    // moneyRows() alone would print a total with nothing behind it.
    expect(DOC).toContain("l.description");
    expect(DOC).toContain("...detail");
  });
});

// ── A BALANCE IS NEVER READ FROM A CACHE ────────────────────────────────────
describe("the figures come from the database, every time", () => {
  it("fetches with no-store", () => {
    expect(VIEW).toContain('cache: "no-store"');
  });

  it("refetches after a payment instead of patching local state", () => {
    // The dialog's response is a courtesy; the page reloads the row that the
    // trigger actually wrote.
    expect(VIEW).toContain("void load()");
  });

  it("does no money arithmetic of its own", () => {
    expect(VIEW).not.toMatch(/[*/]\s*100\b/);
    expect(VIEW).toContain("money(inv.totalCents)");
    expect(VIEW).toContain("money(inv.paidCents)");
  });
});

// ── THE 100x TRIPWIRE, ON THE ONE SCREEN SOMEBODY WOULD CHECK ───────────────
//
// bookings hold rupees, orders hold cents, and the same field name carries
// both. Four live bugs came from that. The invoice records which unit its
// source column held; this page shows it, so a suspect figure can be traced
// without opening the database.
describe("the provenance is on the page", () => {
  it("names the source column, the raw figure and its unit", () => {
    expect(VIEW).toContain("inv.sourceAmountRaw");
    expect(VIEW).toContain("inv.sourceAmountUnit");
    expect(VIEW).toContain("money(inv.sourceTotalCents)");
  });

  it("is carried by the API, not recomputed in the browser", () => {
    expect(ROUTE).toContain("sourceAmountUnit: r.source_amount_unit");
    expect(ROUTE).toContain("sourceTotalCents: r.source_total_cents");
  });
});

// ── AN OVERPAYMENT IS NOT A NEGATIVE BALANCE ────────────────────────────────
describe("money owed back is described, not signed", () => {
  it("says Owed back rather than printing a minus", () => {
    expect(VIEW).toContain("Owed back");
    expect(VIEW).toContain("Math.abs(inv.balanceCents)");
  });
});

describe("the route and the page hold their contracts", () => {
  it("awaits params, as Next 16 requires", () => {
    expect(PAGE).toContain("Promise<{ id: string }>");
    expect(PAGE).toContain("await params");
    expect(ROUTE).toContain("await params");
  });

  it("is admin-guarded before it touches the ledger", () => {
    expect(ROUTE).toContain("guardAdminApi(req");
    expect(ROUTE.indexOf("guardAdminApi")).toBeLessThan(ROUTE.indexOf('from("invoices")'));
  });

  it("returns the lines in position order and the payments in arrival order", () => {
    expect(ROUTE).toContain('.order("position")');
    expect(ROUTE).toContain('.order("received_at")');
  });

  it("converts the numeric qty PostgREST sends as a string", () => {
    expect(ROUTE).toContain("qty: Number(l.qty)");
  });

  it("404s a missing invoice instead of rendering an empty document", () => {
    expect(ROUTE).toContain("No such invoice.");
    expect(ROUTE).toContain("status: 404");
  });
});
